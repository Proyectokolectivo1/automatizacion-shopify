import { randomUUID } from 'node:crypto';

import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';

import { EnvironmentService } from '../config/environment.service';
import { PrismaService } from '../database/prisma.service';
import { MetricsService } from '../observability/metrics.service';

interface LockRow {
  readonly acquired: boolean;
}

interface PurgedRow {
  readonly organization_id: string;
}

export interface WhatsAppRetentionPurgeResult {
  readonly organizations: number;
  readonly purged: number;
  readonly skipped: boolean;
}

@Injectable()
export class WhatsAppRetentionPurgeService implements OnModuleDestroy, OnModuleInit {
  private running = false;
  private timer: NodeJS.Timeout | undefined;

  public constructor(
    private readonly environment: EnvironmentService,
    private readonly metrics: MetricsService,
    private readonly prisma: PrismaService,
  ) {}

  public onModuleInit(): void {
    const config = this.environment.whatsappRetentionPurge;
    if (!config.enabled || config.killSwitch) return;
    this.timer = setInterval(() => void this.runOnce(), config.pollIntervalMs);
    this.timer.unref();
  }

  public onModuleDestroy(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
  }

  public async runOnce(now = new Date()): Promise<WhatsAppRetentionPurgeResult> {
    const config = this.environment.whatsappRetentionPurge;
    if (!config.enabled || config.killSwitch || this.running) {
      this.metrics.recordWhatsAppRetentionPurge('skipped');
      return { organizations: 0, purged: 0, skipped: true };
    }
    if (!Number.isFinite(now.getTime())) throw new Error('Invalid WhatsApp retention purge time');
    this.running = true;
    try {
      const result = await this.prisma.$transaction(async (transaction) => {
        const [lock] = await transaction.$queryRaw<LockRow[]>`
          SELECT pg_try_advisory_xact_lock(hashtext('whatsapp-retention-purge-v1')) AS acquired
        `;
        if (lock?.acquired !== true) return { organizations: 0, purged: 0, skipped: true };
        const rows = await transaction.$queryRaw<PurgedRow[]>`
          WITH candidates AS (
            SELECT id
            FROM whatsapp_messages
            WHERE direction = 'inbound'
              AND retention_expires_at <= ${now}
              AND encrypted_body_json IS NOT NULL
            ORDER BY retention_expires_at, id
            FOR UPDATE SKIP LOCKED
            LIMIT ${config.batchSize}
          )
          UPDATE whatsapp_messages AS message
          SET encrypted_body_json = NULL,
              content_fingerprint = NULL,
              content_purged_at = ${now}
          FROM candidates
          WHERE message.id = candidates.id
          RETURNING message.organization_id::text
        `;
        const counts = new Map<string, number>();
        for (const row of rows) {
          counts.set(row.organization_id, (counts.get(row.organization_id) ?? 0) + 1);
        }
        for (const [organizationId, purgedCount] of counts) {
          await transaction.auditLog.create({
            data: {
              action: 'whatsapp.inbound_content.purged',
              correlationId: randomUUID(),
              metadataJson: { mode: 'simulation', purgedCount },
              organizationId,
              outcome: 'SUCCESS',
              resourceType: 'whatsapp_inbound_content_retention',
            },
          });
        }
        return { organizations: counts.size, purged: rows.length, skipped: false };
      });
      this.metrics.recordWhatsAppRetentionPurge(
        result.skipped ? 'skipped' : result.purged === 0 ? 'noop' : 'purged',
      );
      return result;
    } catch (error) {
      this.metrics.recordWhatsAppRetentionPurge('failure');
      throw error;
    } finally {
      this.running = false;
    }
  }
}
