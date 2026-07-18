import { HttpException, Injectable, ServiceUnavailableException } from '@nestjs/common';

import { AuditService } from '../auth/audit.service';
import { AuthRateLimitService } from '../auth/auth-rate-limit.service';
import type { AuthPrincipal } from '../auth/auth.types';
import { EnvironmentService } from '../config/environment.service';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { MetricsService } from '../observability/metrics.service';
import { operationalItemsSql, type OperationalQueueItemType } from './operational-read-model';

interface ExportCommand {
  readonly from: Date;
  readonly ipAddress: string;
  readonly limit: number;
  readonly organizationId: string;
  readonly principal: AuthPrincipal;
  readonly requiresAttention?: boolean | undefined;
  readonly status?: string | undefined;
  readonly to: Date;
  readonly type?: OperationalQueueItemType | undefined;
}

interface ExportRow {
  readonly attentionReason: string | null;
  readonly itemType: OperationalQueueItemType;
  readonly occurredAt: Date;
  readonly requiresAttention: boolean;
  readonly status: string;
}

@Injectable()
export class OperationalExportService {
  public constructor(
    private readonly audit: AuditService,
    private readonly environment: EnvironmentService,
    private readonly metrics: MetricsService,
    private readonly prisma: PrismaService,
    private readonly rateLimit: AuthRateLimitService,
  ) {}

  public async get(command: ExportCommand) {
    this.assertEnabled();
    try {
      const allowed = await this.rateLimit.consume(
        command.principal.userId,
        command.ipAddress,
        `operational-export:${command.organizationId}`,
      );
      if (!allowed) throw new HttpException('Operational export rate limit exceeded', 429);
      const filters: Prisma.Sql[] = [
        Prisma.sql`occurred_at >= ${command.from}`,
        Prisma.sql`occurred_at < ${command.to}`,
      ];
      if (command.type !== undefined) filters.push(Prisma.sql`item_type = ${command.type}`);
      if (command.status !== undefined) filters.push(Prisma.sql`status = ${command.status}`);
      if (command.requiresAttention !== undefined) {
        filters.push(Prisma.sql`requires_attention = ${command.requiresAttention}`);
      }
      const rows = await this.prisma.$queryRaw<ExportRow[]>(Prisma.sql`
        WITH operational_items AS (
          ${operationalItemsSql(command.organizationId)}
        )
        SELECT
          attention_reason AS "attentionReason",
          item_type AS "itemType",
          occurred_at AS "occurredAt",
          requires_attention AS "requiresAttention",
          status
        FROM operational_items
        WHERE ${Prisma.join(filters, ' AND ')}
        ORDER BY occurred_at DESC, sort_key DESC
        LIMIT ${command.limit + 1}
      `);
      const truncated = rows.length > command.limit;
      const page = rows.slice(0, command.limit);
      const result = {
        contractVersion: 'v1' as const,
        rows: page.map((row) => ({
          attentionReason: row.attentionReason,
          occurredAt: row.occurredAt,
          requiresAttention: row.requiresAttention,
          status: row.status,
          type: row.itemType,
        })),
        truncated,
        window: { from: command.from, to: command.to },
      };
      await this.record(command, 'operations.export.generated', 'SUCCESS', page.length, truncated);
      this.metrics.recordOperationalExport('success');
      return result;
    } catch (error) {
      this.metrics.recordOperationalExport('failure');
      await this.record(command, 'operations.export.failed', 'FAILURE', 0, false);
      throw error;
    }
  }

  private assertEnabled(): void {
    const operationalExport = this.environment.operationalExport;
    if (!operationalExport.enabled || operationalExport.killSwitch) {
      throw new ServiceUnavailableException('Operational export is disabled');
    }
  }

  private record(
    command: ExportCommand,
    action: string,
    outcome: 'FAILURE' | 'SUCCESS',
    rowCount: number,
    truncated: boolean,
  ): Promise<void> {
    return this.audit.record({
      action,
      actorUserId: command.principal.userId,
      metadata: {
        requiresAttention:
          command.requiresAttention === undefined ? 'all' : String(command.requiresAttention),
        rowCount,
        status: command.status ?? 'all',
        truncated,
        type: command.type ?? 'all',
        windowMinutes: Math.ceil((command.to.getTime() - command.from.getTime()) / 60_000),
      },
      organizationId: command.organizationId,
      outcome,
      resourceType: 'operational_export',
    });
  }
}
