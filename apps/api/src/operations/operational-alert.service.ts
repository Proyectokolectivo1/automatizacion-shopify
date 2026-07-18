import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { z } from 'zod';

import { AuditService } from '../auth/audit.service';
import type { AuthPrincipal } from '../auth/auth.types';
import { EnvironmentService } from '../config/environment.service';
import { PrismaService } from '../database/prisma.service';
import type { OperationalAlertStatus } from '../generated/prisma/client';
import { MetricsService } from '../observability/metrics.service';
import type { OperationalQueueItemType } from './operational-read-model';
import { OPERATIONAL_ALERT_RULES_V1 } from './operational-alert-rules';

interface ListAlertsCommand {
  readonly cursor?: string | undefined;
  readonly limit: number;
  readonly organizationId: string;
  readonly principal: AuthPrincipal;
  readonly status?: OperationalAlertStatus | undefined;
  readonly type?: OperationalQueueItemType | undefined;
}

interface ListRulesCommand {
  readonly organizationId: string;
  readonly principal: AuthPrincipal;
}

const cursorSchema = z
  .object({
    at: z.string().datetime({ offset: true }),
    id: z.string().uuid(),
  })
  .strict();

@Injectable()
export class OperationalAlertService {
  public constructor(
    private readonly audit: AuditService,
    private readonly environment: EnvironmentService,
    private readonly metrics: MetricsService,
    private readonly prisma: PrismaService,
  ) {}

  public async list(command: ListAlertsCommand) {
    try {
      this.assertEnabled();
      const cursor = command.cursor === undefined ? undefined : this.decodeCursor(command.cursor);
      const rows = await this.prisma.operationalAlert.findMany({
        orderBy: [{ lastDetectedAt: 'desc' }, { id: 'desc' }],
        select: {
          firstDetectedAt: true,
          id: true,
          itemType: true,
          lastDetectedAt: true,
          lastEvaluatedAt: true,
          observedCount: true,
          resolvedAt: true,
          ruleKey: true,
          ruleVersion: true,
          status: true,
          windowEndedAt: true,
          windowStartedAt: true,
        },
        take: command.limit + 1,
        where: {
          ...(cursor === undefined
            ? {}
            : {
                OR: [
                  { lastDetectedAt: { lt: cursor.at } },
                  { id: { lt: cursor.id }, lastDetectedAt: cursor.at },
                ],
              }),
          organizationId: command.organizationId,
          ...(command.status === undefined ? {} : { status: command.status }),
          ...(command.type === undefined ? {} : { itemType: command.type }),
        },
      });
      const hasMore = rows.length > command.limit;
      const page = rows.slice(0, command.limit);
      const last = page.at(-1);
      const result = {
        contractVersion: 'v1' as const,
        items: page.map((row) => ({
          alertId: row.id,
          firstDetectedAt: row.firstDetectedAt,
          lastDetectedAt: row.lastDetectedAt,
          lastEvaluatedAt: row.lastEvaluatedAt,
          observedCount: row.observedCount,
          resolvedAt: row.resolvedAt,
          rule: { key: row.ruleKey, version: row.ruleVersion },
          status: row.status.toLowerCase(),
          type: row.itemType,
          window: { from: row.windowStartedAt, to: row.windowEndedAt },
        })),
        nextCursor:
          hasMore && last !== undefined ? this.encodeCursor(last.lastDetectedAt, last.id) : null,
      };
      await this.record(command, 'operations.alerts.listed', 'SUCCESS', page.length);
      this.metrics.recordOperationalAlerts('list', 'success');
      return result;
    } catch (error) {
      this.metrics.recordOperationalAlerts('list', 'failure');
      await this.record(command, 'operations.alerts.list_failed', 'FAILURE', 0);
      throw error;
    }
  }

  public async listRules(command: ListRulesCommand) {
    try {
      this.assertEnabled();
      const result = {
        contractVersion: 'v1' as const,
        rules: OPERATIONAL_ALERT_RULES_V1.map((rule) => ({
          condition: rule.condition,
          key: rule.key,
          matchingStatuses: rule.matchingStatuses,
          type: rule.type,
          version: rule.version,
          window: { lookbackHours: this.environment.operationalAlerts.lookbackHours },
        })),
      };
      await this.record(command, 'operations.alerts.rules_viewed', 'SUCCESS', result.rules.length);
      this.metrics.recordOperationalAlerts('rules', 'success');
      return result;
    } catch (error) {
      this.metrics.recordOperationalAlerts('rules', 'failure');
      await this.record(command, 'operations.alerts.rules_view_failed', 'FAILURE', 0);
      throw error;
    }
  }

  private assertEnabled(): void {
    const alerts = this.environment.operationalAlerts;
    if (!alerts.enabled || alerts.killSwitch) {
      throw new ServiceUnavailableException('Operational alerts are disabled');
    }
  }

  private encodeCursor(at: Date, id: string): string {
    return Buffer.from(JSON.stringify({ at: at.toISOString(), id }), 'utf8').toString('base64url');
  }

  private decodeCursor(value: string): { at: Date; id: string } {
    try {
      const parsed = cursorSchema.parse(
        JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown,
      );
      return { at: new Date(parsed.at), id: parsed.id };
    } catch {
      throw new BadRequestException('Invalid cursor');
    }
  }

  private record(
    command: ListAlertsCommand | ListRulesCommand,
    action: string,
    outcome: 'FAILURE' | 'SUCCESS',
    itemCount: number,
  ): Promise<void> {
    return this.audit.record({
      action,
      actorUserId: command.principal.userId,
      metadata: {
        itemCount,
        status: 'status' in command ? (command.status ?? 'all') : 'all',
        type: 'type' in command ? (command.type ?? 'all') : 'all',
      },
      organizationId: command.organizationId,
      outcome,
      resourceType: 'operational_alert',
    });
  }
}
