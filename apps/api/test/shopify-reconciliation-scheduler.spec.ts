import { describe, expect, it, vi } from 'vitest';

import type { EnvironmentService } from '../src/config/environment.service';
import type { PrismaService } from '../src/database/prisma.service';
import type { MetricsService } from '../src/observability/metrics.service';
import { ShopifyReconciliationSchedulerService } from '../src/reconciliation/shopify-reconciliation-scheduler.service';
import type { ShopifyReconciliationService } from '../src/reconciliation/shopify-reconciliation.service';

describe('ShopifyReconciliationSchedulerService', () => {
  it('drains every cursor page using one stable window', async () => {
    const now = new Date('2026-07-18T12:00:00Z');
    const environment = {
      shopifyReconciliation: {
        batchSize: 10,
        enabled: true,
        intervalHours: 24,
        killSwitch: false,
        lookbackHours: 24,
        maxPages: 3,
        maxWindowHours: 24,
        pollIntervalMs: 60_000,
        simulationMode: false,
        stuckAfterMinutes: 15,
      },
    } as EnvironmentService;
    const prisma = {
      $queryRaw: vi
        .fn()
        .mockResolvedValue([{ organization_id: 'organization-1', store_id: 'store-1' }]),
      reconciliationCheckpoint: { findUnique: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const runScheduled = vi
      .fn()
      .mockResolvedValueOnce({ nextCursor: 'cursor-2' })
      .mockResolvedValueOnce({ nextCursor: null });
    const reconciliation = { runScheduled } as unknown as ShopifyReconciliationService;
    const recordShopifyReconciliation = vi.fn();
    const metrics = { recordShopifyReconciliation } as unknown as MetricsService;
    const scheduler = new ShopifyReconciliationSchedulerService(
      environment,
      metrics,
      prisma,
      reconciliation,
    );

    await expect(scheduler.processDue(now)).resolves.toEqual({
      completed: 1,
      failed: 0,
      pages: 2,
      stores: 1,
    });
    expect(runScheduled).toHaveBeenCalledTimes(2);
    expect(runScheduled.mock.calls[0]?.[0]).toEqual(runScheduled.mock.calls[1]?.[0]);
    expect(runScheduled.mock.calls[0]?.[0]).toMatchObject({
      organizationId: 'organization-1',
      storeId: 'store-1',
      windowEndedAt: now,
      windowStartedAt: new Date('2026-07-17T12:00:00Z'),
    });
    expect(recordShopifyReconciliation).toHaveBeenCalledWith('scheduler', 'success');
  });

  it('resumes the checkpoint window and stops at the page safety limit', async () => {
    const environment = {
      shopifyReconciliation: {
        batchSize: 1,
        enabled: true,
        intervalHours: 24,
        killSwitch: false,
        lookbackHours: 24,
        maxPages: 2,
        maxWindowHours: 24,
        pollIntervalMs: 60_000,
        simulationMode: true,
        stuckAfterMinutes: 15,
      },
    } as EnvironmentService;
    const checkpoint = {
      providerCursor: 'cursor-5',
      windowEndedAt: new Date('2026-07-18T10:00:00Z'),
      windowStartedAt: new Date('2026-07-18T09:00:00Z'),
    };
    const prisma = {
      $queryRaw: vi
        .fn()
        .mockResolvedValue([{ organization_id: 'organization-1', store_id: 'store-1' }]),
      reconciliationCheckpoint: { findUnique: vi.fn().mockResolvedValue(checkpoint) },
    } as unknown as PrismaService;
    const runScheduled = vi.fn().mockResolvedValue({ nextCursor: 'still-more' });
    const scheduler = new ShopifyReconciliationSchedulerService(
      environment,
      { recordShopifyReconciliation: vi.fn() } as unknown as MetricsService,
      prisma,
      { runScheduled } as unknown as ShopifyReconciliationService,
    );

    await expect(scheduler.processDue(new Date('2026-07-18T12:00:00Z'))).resolves.toMatchObject({
      completed: 0,
      failed: 1,
      pages: 2,
    });
    expect(runScheduled).toHaveBeenCalledTimes(2);
    expect(runScheduled.mock.calls[0]?.[0]).toMatchObject({
      windowEndedAt: checkpoint.windowEndedAt,
      windowStartedAt: checkpoint.windowStartedAt,
    });
  });
});
