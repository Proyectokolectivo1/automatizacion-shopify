import { Injectable, ServiceUnavailableException } from '@nestjs/common';

import { AuditService } from '../auth/audit.service';
import type { AuthPrincipal } from '../auth/auth.types';
import { EnvironmentService } from '../config/environment.service';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { MetricsService } from '../observability/metrics.service';

interface FinanceOverviewCommand {
  readonly from: Date;
  readonly organizationId: string;
  readonly principal: AuthPrincipal;
  readonly to: Date;
}

interface FinanceStatusRow {
  readonly amount_minor: bigint;
  readonly bucket: string;
  readonly count: bigint;
}

const paymentIntentStatuses = ['approved', 'declined', 'expired', 'pending'] as const;
type FinancePaymentIntentStatus = (typeof paymentIntentStatuses)[number];
const paymentIntentStatusSet = new Set<string>(paymentIntentStatuses);

export interface FinanceOverviewResult {
  readonly byStatus: ReadonlyArray<{
    readonly amountMinor: string;
    readonly count: number;
    readonly status: FinancePaymentIntentStatus;
  }>;
  readonly contractVersion: 'v1';
  readonly currency: 'COP';
  readonly mode: 'simulation';
  readonly provider: 'wompi';
  readonly totals: {
    readonly amountMinor: string;
    readonly count: number;
  };
  readonly window: {
    readonly from: string;
    readonly to: string;
  };
}

@Injectable()
export class FinanceOverviewService {
  public constructor(
    private readonly audit: AuditService,
    private readonly environment: EnvironmentService,
    private readonly metrics: MetricsService,
    private readonly prisma: PrismaService,
  ) {}

  public async summarize(command: FinanceOverviewCommand): Promise<FinanceOverviewResult> {
    this.assertEnabled();
    try {
      const rows = await this.prisma.$queryRaw<FinanceStatusRow[]>(Prisma.sql`
        WITH payment_intents AS (
          SELECT status::text AS status, amount
          FROM payment_intents
          WHERE organization_id = ${command.organizationId}::uuid
            AND provider = 'wompi'
            AND currency = 'COP'
            AND created_at >= ${command.from}
            AND created_at < ${command.to}
        )
        SELECT
          CASE WHEN GROUPING(status) = 1 THEN 'total' ELSE status END AS bucket,
          COUNT(*)::bigint AS count,
          COALESCE(SUM(amount), 0)::bigint AS amount_minor
        FROM payment_intents
        GROUP BY GROUPING SETS ((), (status))
        ORDER BY bucket
      `);
      const total = rows.find(({ bucket }) => bucket === 'total');
      const result = {
        byStatus: rows
          .filter(({ bucket }) => bucket !== 'total')
          .map(({ amount_minor, bucket, count }) => {
            if (!paymentIntentStatusSet.has(bucket)) {
              throw new ServiceUnavailableException('Finance overview is unavailable');
            }
            return {
              amountMinor: this.toAmount(amount_minor),
              count: this.toCount(count),
              status: bucket as FinancePaymentIntentStatus,
            };
          }),
        contractVersion: 'v1' as const,
        currency: 'COP' as const,
        mode: 'simulation' as const,
        provider: 'wompi' as const,
        totals: {
          amountMinor: this.toAmount(total?.amount_minor ?? 0n),
          count: this.toCount(total?.count ?? 0n),
        },
        window: { from: command.from.toISOString(), to: command.to.toISOString() },
      };
      await this.record(command, 'finance.overview.viewed', 'SUCCESS', result.totals.count);
      this.metrics.recordFinanceOverview('view', 'success');
      return result;
    } catch (error) {
      this.metrics.recordFinanceOverview('view', 'failure');
      await this.record(command, 'finance.overview.view_failed', 'FAILURE', 0);
      throw error;
    }
  }

  private assertEnabled(): void {
    const controls = this.environment.financeOverview;
    if (!controls.enabled || controls.killSwitch) {
      throw new ServiceUnavailableException('Finance overview is disabled');
    }
  }

  private toAmount(value: bigint): string {
    if (value < 0n) {
      throw new ServiceUnavailableException('Finance overview is unavailable');
    }
    return value.toString();
  }

  private toCount(value: bigint): number {
    const count = Number(value);
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new ServiceUnavailableException('Finance overview is unavailable');
    }
    return count;
  }

  private record(
    command: FinanceOverviewCommand,
    action: string,
    outcome: 'FAILURE' | 'SUCCESS',
    count: number,
  ): Promise<void> {
    return this.audit.record({
      action,
      actorUserId: command.principal.userId,
      metadata: {
        count,
        windowMinutes: Math.round((command.to.getTime() - command.from.getTime()) / 60_000),
      },
      organizationId: command.organizationId,
      outcome,
      resourceType: 'finance_overview',
    });
  }
}
