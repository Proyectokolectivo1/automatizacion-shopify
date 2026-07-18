import { Injectable, ServiceUnavailableException } from '@nestjs/common';

import { AuditService } from '../auth/audit.service';
import type { AuthPrincipal } from '../auth/auth.types';
import { EnvironmentService } from '../config/environment.service';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { MetricsService } from '../observability/metrics.service';
import { operationalItemsSql, type OperationalQueueItemType } from './operational-read-model';

interface SummaryCommand {
  readonly from: Date;
  readonly organizationId: string;
  readonly principal: AuthPrincipal;
  readonly storeId?: string | undefined;
  readonly to: Date;
  readonly type?: OperationalQueueItemType | undefined;
}

interface SummaryRow {
  readonly attentionCount: bigint;
  readonly dimension: 'status' | 'total' | 'type';
  readonly dimensionKey: string | null;
  readonly totalCount: bigint;
}

@Injectable()
export class OperationalSummaryService {
  public constructor(
    private readonly audit: AuditService,
    private readonly environment: EnvironmentService,
    private readonly metrics: MetricsService,
    private readonly prisma: PrismaService,
  ) {}

  public async summarize(command: SummaryCommand) {
    this.assertEnabled();
    try {
      const filters: Prisma.Sql[] = [
        Prisma.sql`occurred_at >= ${command.from}`,
        Prisma.sql`occurred_at < ${command.to}`,
      ];
      if (command.storeId !== undefined) filters.push(Prisma.sql`store_id = ${command.storeId}`);
      if (command.type !== undefined) filters.push(Prisma.sql`item_type = ${command.type}`);
      const rows = await this.prisma.$queryRaw<SummaryRow[]>(Prisma.sql`
        WITH queue_items AS (${operationalItemsSql(command.organizationId)}),
        filtered_items AS (
          SELECT item_type, requires_attention, status
          FROM queue_items
          WHERE ${Prisma.join(filters, ' AND ')}
        )
        SELECT
          CASE
            WHEN GROUPING(item_type) = 0 THEN 'type'
            WHEN GROUPING(status) = 0 THEN 'status'
            ELSE 'total'
          END AS dimension,
          CASE
            WHEN GROUPING(item_type) = 0 THEN item_type
            WHEN GROUPING(status) = 0 THEN status
            ELSE NULL
          END AS "dimensionKey",
          COUNT(*) AS "totalCount",
          COUNT(*) FILTER (WHERE requires_attention) AS "attentionCount"
        FROM filtered_items
        GROUP BY GROUPING SETS ((), (item_type), (status))
        ORDER BY dimension, "dimensionKey"
      `);
      const total = rows.find(({ dimension }) => dimension === 'total');
      const mapBreakdown = (dimension: 'status' | 'type') =>
        rows
          .filter(
            (row): row is SummaryRow & { readonly dimensionKey: string } =>
              row.dimension === dimension && row.dimensionKey !== null,
          )
          .map((row) => ({
            requiresAttention: Number(row.attentionCount),
            [dimension]: row.dimensionKey,
            total: Number(row.totalCount),
          }));
      const result = {
        byStatus: mapBreakdown('status'),
        byType: mapBreakdown('type'),
        contractVersion: 'v1' as const,
        filters: { storeId: command.storeId ?? null, type: command.type ?? null },
        totals: {
          requiresAttention: Number(total?.attentionCount ?? 0n),
          total: Number(total?.totalCount ?? 0n),
        },
        window: { from: command.from, to: command.to },
      };
      await this.record(command, 'operations.summary.viewed', 'SUCCESS', result.totals.total);
      this.metrics.recordOperationalQueue('summary', 'success');
      return result;
    } catch (error) {
      this.metrics.recordOperationalQueue('summary', 'failure');
      await this.record(command, 'operations.summary.view_failed', 'FAILURE', 0);
      throw error;
    }
  }

  private assertEnabled(): void {
    const queue = this.environment.operationalQueue;
    if (!queue.enabled || queue.killSwitch) {
      throw new ServiceUnavailableException('Operational read model is disabled');
    }
  }

  private record(
    command: SummaryCommand,
    action: string,
    outcome: 'FAILURE' | 'SUCCESS',
    total: number,
  ): Promise<void> {
    return this.audit.record({
      action,
      actorUserId: command.principal.userId,
      metadata: {
        storeFiltered: command.storeId !== undefined,
        total,
        type: command.type ?? 'all',
        windowMinutes: Math.round((command.to.getTime() - command.from.getTime()) / 60_000),
      },
      organizationId: command.organizationId,
      outcome,
      resourceType: 'operational_summary',
    });
  }
}
