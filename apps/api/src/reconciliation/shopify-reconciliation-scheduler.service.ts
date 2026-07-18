import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';

import { EnvironmentService } from '../config/environment.service';
import { PrismaService } from '../database/prisma.service';
import { MetricsService } from '../observability/metrics.service';
import { ShopifyReconciliationService } from './shopify-reconciliation.service';

interface DueScope {
  readonly organization_id: string;
  readonly store_id: string;
}

export interface ShopifyReconciliationBatchResult {
  readonly completed: number;
  readonly failed: number;
  readonly pages: number;
  readonly stores: number;
}

@Injectable()
export class ShopifyReconciliationSchedulerService implements OnModuleDestroy, OnModuleInit {
  private timer?: NodeJS.Timeout;

  public constructor(
    private readonly environment: EnvironmentService,
    private readonly metrics: MetricsService,
    private readonly prisma: PrismaService,
    private readonly reconciliation: ShopifyReconciliationService,
  ) {}

  public onModuleInit(): void {
    const controls = this.environment.shopifyReconciliation;
    if (!controls.enabled || controls.killSwitch) return;
    this.timer = setInterval(
      () =>
        void this.processDue().catch(() =>
          this.metrics.recordShopifyReconciliation('scheduler', 'failure'),
        ),
      controls.pollIntervalMs,
    );
    this.timer.unref();
    void this.processDue().catch(() =>
      this.metrics.recordShopifyReconciliation('scheduler', 'failure'),
    );
  }

  public onModuleDestroy(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
  }

  public async processDue(now = new Date()): Promise<ShopifyReconciliationBatchResult> {
    const controls = this.environment.shopifyReconciliation;
    if (!controls.enabled || controls.killSwitch) {
      throw new Error('Shopify reconciliation scheduler is disabled');
    }
    if (!Number.isFinite(now.getTime())) throw new Error('Invalid reconciliation processing time');
    const dueBefore = new Date(now.getTime() - controls.intervalHours * 3_600_000);
    const catchUpBefore = new Date(now.getTime() - controls.pollIntervalMs);
    const scopes = await this.prisma.$queryRaw<DueScope[]>`
      SELECT connection.organization_id, connection.store_id
      FROM integration_connections AS connection
      JOIN stores AS store
        ON store.id = connection.store_id
       AND store.organization_id = connection.organization_id
      LEFT JOIN reconciliation_checkpoints AS checkpoint
        ON checkpoint.store_id = connection.store_id
       AND checkpoint.provider = 'shopify'
      WHERE connection.provider = 'shopify'
        AND connection.status = 'active'
        AND store.status = 'active'
        AND (
          checkpoint.id IS NULL
          OR checkpoint.provider_cursor IS NOT NULL
          OR checkpoint.last_run_at <= ${dueBefore}
          OR checkpoint.window_ended_at <= ${catchUpBefore}
        )
      ORDER BY connection.organization_id, connection.store_id
      LIMIT ${controls.batchSize}
    `;
    const batch = { completed: 0, failed: 0, pages: 0, stores: scopes.length };
    for (const scope of scopes) {
      try {
        const result = await this.processStore(scope, now);
        batch.pages += result.pages;
        if (result.completed) batch.completed += 1;
        else batch.failed += 1;
      } catch {
        batch.failed += 1;
      }
    }
    this.metrics.recordShopifyReconciliation(
      'scheduler',
      batch.failed === 0 ? 'success' : 'partial_failure',
    );
    return batch;
  }

  private async processStore(
    scope: DueScope,
    now: Date,
  ): Promise<{ readonly completed: boolean; readonly pages: number }> {
    const controls = this.environment.shopifyReconciliation;
    const checkpoint = await this.prisma.reconciliationCheckpoint.findUnique({
      where: { storeId_provider: { provider: 'SHOPIFY', storeId: scope.store_id } },
    });
    const resuming =
      checkpoint?.providerCursor !== null && checkpoint?.providerCursor !== undefined;
    const windowStartedAt = resuming
      ? checkpoint.windowStartedAt
      : (checkpoint?.windowEndedAt ?? new Date(now.getTime() - controls.lookbackHours * 3_600_000));
    const maximumEnd = new Date(windowStartedAt.getTime() + controls.maxWindowHours * 3_600_000);
    const windowEndedAt = resuming
      ? checkpoint.windowEndedAt
      : new Date(Math.min(now.getTime(), maximumEnd.getTime()));
    let pages = 0;
    for (; pages < controls.maxPages; pages += 1) {
      const result = await this.reconciliation.runScheduled({
        organizationId: scope.organization_id,
        storeId: scope.store_id,
        windowEndedAt,
        windowStartedAt,
      });
      if (result.nextCursor === null) return { completed: true, pages: pages + 1 };
    }
    return { completed: false, pages };
  }
}
