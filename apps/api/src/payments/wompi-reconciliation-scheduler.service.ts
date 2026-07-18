import { createHash, randomUUID } from 'node:crypto';

import {
  Inject,
  Injectable,
  ServiceUnavailableException,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';

import { EnvironmentService } from '../config/environment.service';
import { PrismaService } from '../database/prisma.service';
import {
  PaymentIntentStatus,
  PaymentReconciliationIssueType,
  Prisma,
} from '../generated/prisma/client';
import { MetricsService } from '../observability/metrics.service';
import { WOMPI_PROVIDER, type WompiProvider } from './wompi-provider';

interface ReconciliationScope {
  organization_id: string;
  store_id: string;
}

interface ReconciliationSignal {
  acceptedEventStatus: PaymentIntentStatus | null;
  authoritativeStatus: PaymentIntentStatus | null;
  detail: Prisma.InputJsonObject;
  fingerprint: string;
  intentId: string;
  localStatus: PaymentIntentStatus;
  type: PaymentReconciliationIssueType;
}

export interface WompiReconciliationStoreResult {
  readonly differences: number;
  readonly failed: boolean;
  readonly opened: number;
  readonly resolved: number;
  readonly scanned: number;
  readonly skipped: boolean;
}

export interface WompiReconciliationBatchResult {
  readonly completed: number;
  readonly differences: number;
  readonly failed: number;
  readonly opened: number;
  readonly resolved: number;
  readonly scanned: number;
  readonly skipped: number;
}

@Injectable()
export class WompiReconciliationSchedulerService implements OnModuleDestroy, OnModuleInit {
  private timer?: NodeJS.Timeout;

  public constructor(
    private readonly environment: EnvironmentService,
    private readonly metrics: MetricsService,
    private readonly prisma: PrismaService,
    @Inject(WOMPI_PROVIDER) private readonly wompi: WompiProvider,
  ) {}

  public onModuleInit(): void {
    const config = this.environment.wompiReconciliation;
    if (!config.enabled || config.killSwitch || !config.simulationMode) return;
    this.timer = setInterval(
      () =>
        void this.processDue().catch(() =>
          this.metrics.recordWompiReconciliation('scheduler', 'failure'),
        ),
      config.pollIntervalMs,
    );
    this.timer.unref();
    void this.processDue().catch(() =>
      this.metrics.recordWompiReconciliation('scheduler', 'failure'),
    );
  }

  public onModuleDestroy(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
  }

  public async processDue(now = new Date()): Promise<WompiReconciliationBatchResult> {
    this.assertEnabled();
    if (!Number.isFinite(now.getTime())) throw new Error('Invalid reconciliation processing time');
    const scopes = await this.prisma.$queryRaw<ReconciliationScope[]>`
      SELECT DISTINCT intent.organization_id, intent.store_id
      FROM payment_intents AS intent
      LEFT JOIN payment_reconciliation_checkpoints AS checkpoint
        ON checkpoint.store_id = intent.store_id
       AND checkpoint.provider = 'wompi'
      WHERE intent.provider = 'wompi'
        AND (checkpoint.id IS NULL OR checkpoint.next_run_at <= ${now})
      ORDER BY intent.organization_id, intent.store_id
      LIMIT ${this.environment.wompiReconciliation.batchSize}
    `;
    const result = {
      completed: 0,
      differences: 0,
      failed: 0,
      opened: 0,
      resolved: 0,
      scanned: 0,
      skipped: 0,
    };
    for (const scope of scopes) {
      const current = await this.reconcileStore(scope.organization_id, scope.store_id, now);
      result.completed += current.failed || current.skipped ? 0 : 1;
      result.differences += current.differences;
      result.failed += current.failed ? 1 : 0;
      result.opened += current.opened;
      result.resolved += current.resolved;
      result.scanned += current.scanned;
      result.skipped += current.skipped ? 1 : 0;
    }
    this.metrics.recordWompiReconciliation(
      'batch',
      result.failed > 0 ? 'partial_failure' : 'success',
    );
    return result;
  }

  public async reconcileStore(
    organizationId: string,
    storeId: string,
    now: Date,
  ): Promise<WompiReconciliationStoreResult> {
    this.assertEnabled();
    if (!Number.isFinite(now.getTime())) throw new Error('Invalid reconciliation processing time');
    const scope: ReconciliationScope = {
      organization_id: organizationId,
      store_id: storeId,
    };
    return this.prisma.$transaction(
      async (transaction) => {
        await transaction.$executeRaw`
          SELECT pg_advisory_xact_lock(
            hashtextextended(${'wompi.reconciliation:' + scope.organization_id + ':' + scope.store_id}, 0)
          )
        `;
        const config = this.environment.wompiReconciliation;
        const checkpoint = await transaction.paymentReconciliationCheckpoint.findUnique({
          where: { storeId_provider: { provider: 'WOMPI', storeId: scope.store_id } },
        });
        if (checkpoint !== null && checkpoint.nextRunAt > now) return this.empty(true);
        const windowStartedAt =
          checkpoint?.windowEndedAt ??
          new Date(now.getTime() - config.lookbackHours * 60 * 60 * 1_000);
        const intents = await transaction.paymentIntent.findMany({
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: {
            amount: true,
            currency: true,
            externalReference: true,
            id: true,
            providerCheckoutId: true,
            status: true,
          },
          where: {
            createdAt: { lte: now },
            organizationId: scope.organization_id,
            provider: 'WOMPI',
            storeId: scope.store_id,
            OR: [
              { status: 'PENDING' },
              { updatedAt: { gte: windowStartedAt } },
              { reconciliationIssues: { some: { status: 'OPEN' } } },
            ],
          },
        });
        const signals: ReconciliationSignal[] = [];
        let scanned = 0;
        try {
          for (const intent of intents) {
            scanned += 1;
            const acceptedEvent = await transaction.paymentProviderEvent.findFirst({
              orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
              select: { providerStatus: true },
              where: { paymentIntentId: intent.id, provider: 'WOMPI', status: 'ACCEPTED' },
            });
            if (intent.providerCheckoutId === null) {
              signals.push(
                this.signal(
                  intent.id,
                  PaymentReconciliationIssueType.TRANSACTION_DATA_MISMATCH,
                  intent.status,
                  acceptedEvent?.providerStatus ?? null,
                  null,
                  { missingProviderTransactionId: true, mode: 'simulation', provider: 'wompi' },
                ),
              );
              continue;
            }
            const authoritative = await this.wompi.getTransaction(intent.providerCheckoutId);
            const authoritativeStatus = PaymentIntentStatus[authoritative.status];
            const financialMismatch =
              authoritative.id !== intent.providerCheckoutId ||
              authoritative.reference !== intent.externalReference ||
              BigInt(authoritative.amountMinor) !== intent.amount ||
              authoritative.currency !== intent.currency;
            if (financialMismatch) {
              signals.push(
                this.signal(
                  intent.id,
                  PaymentReconciliationIssueType.TRANSACTION_DATA_MISMATCH,
                  intent.status,
                  acceptedEvent?.providerStatus ?? null,
                  authoritativeStatus,
                  {
                    amountMatches: BigInt(authoritative.amountMinor) === intent.amount,
                    currencyMatches: authoritative.currency === intent.currency,
                    idMatches: authoritative.id === intent.providerCheckoutId,
                    mode: 'simulation',
                    provider: 'wompi',
                    referenceMatches: authoritative.reference === intent.externalReference,
                  },
                ),
              );
            }
            if (intent.status !== authoritativeStatus) {
              signals.push(
                this.signal(
                  intent.id,
                  PaymentReconciliationIssueType.INTENT_STATUS_MISMATCH,
                  intent.status,
                  acceptedEvent?.providerStatus ?? null,
                  authoritativeStatus,
                  { mode: 'simulation', provider: 'wompi' },
                ),
              );
            }
            if (acceptedEvent === null && authoritativeStatus !== PaymentIntentStatus.PENDING) {
              signals.push(
                this.signal(
                  intent.id,
                  PaymentReconciliationIssueType.MISSING_ACCEPTED_EVENT,
                  intent.status,
                  null,
                  authoritativeStatus,
                  { mode: 'simulation', provider: 'wompi' },
                ),
              );
            } else if (
              acceptedEvent !== null &&
              acceptedEvent.providerStatus !== authoritativeStatus
            ) {
              signals.push(
                this.signal(
                  intent.id,
                  PaymentReconciliationIssueType.EVENT_STATUS_MISMATCH,
                  intent.status,
                  acceptedEvent.providerStatus,
                  authoritativeStatus,
                  { mode: 'simulation', provider: 'wompi' },
                ),
              );
            }
          }
        } catch {
          return this.persistFailure(transaction, scope, checkpoint, windowStartedAt, now, scanned);
        }
        return this.persistSuccess(
          transaction,
          scope,
          checkpoint,
          windowStartedAt,
          now,
          scanned,
          intents.map(({ id }) => id),
          signals,
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 30_000 },
    );
  }

  private async persistFailure(
    transaction: Prisma.TransactionClient,
    scope: ReconciliationScope,
    checkpoint: { id: string; consecutiveFailures: number } | null,
    windowStartedAt: Date,
    now: Date,
    scanned: number,
  ): Promise<WompiReconciliationStoreResult> {
    const retryAt = new Date(now.getTime() + this.environment.wompiReconciliation.pollIntervalMs);
    const storedCheckpoint =
      checkpoint === null
        ? await transaction.paymentReconciliationCheckpoint.create({
            data: {
              consecutiveFailures: 1,
              lastFailureAt: now,
              lastRunAt: windowStartedAt,
              nextRunAt: retryAt,
              organizationId: scope.organization_id,
              provider: 'WOMPI',
              storeId: scope.store_id,
              windowEndedAt: windowStartedAt,
              windowStartedAt,
            },
          })
        : await transaction.paymentReconciliationCheckpoint.update({
            data: {
              consecutiveFailures: { increment: 1 },
              lastFailureAt: now,
              nextRunAt: retryAt,
            },
            where: { id: checkpoint.id },
          });
    const run = await transaction.paymentReconciliationRun.create({
      data: {
        checkpointId: storedCheckpoint.id,
        completedAt: now,
        differenceCount: 0,
        failureCode: 'provider_unavailable',
        newIssueCount: 0,
        organizationId: scope.organization_id,
        provider: 'WOMPI',
        reportJson: {
          failureCode: 'provider_unavailable',
          mode: 'simulation',
          provider: 'wompi',
          scannedCount: scanned,
        },
        resolvedCount: 0,
        scannedCount: scanned,
        startedAt: now,
        status: 'FAILED',
        storeId: scope.store_id,
        windowEndedAt: now,
        windowStartedAt,
      },
    });
    await transaction.auditLog.create({
      data: {
        action: 'wompi.reconciliation.failed',
        correlationId: randomUUID(),
        metadataJson: {
          failureCode: 'provider_unavailable',
          mode: 'simulation',
          scannedCount: scanned,
        },
        organizationId: scope.organization_id,
        outcome: 'FAILURE',
        resourceId: run.id,
        resourceType: 'payment_reconciliation_run',
      },
    });
    this.metrics.recordWompiReconciliation('store', 'provider_unavailable');
    return { ...this.empty(false), failed: true, scanned };
  }

  private async persistSuccess(
    transaction: Prisma.TransactionClient,
    scope: ReconciliationScope,
    checkpoint: { id: string } | null,
    windowStartedAt: Date,
    now: Date,
    scanned: number,
    scannedIntentIds: string[],
    signals: ReconciliationSignal[],
  ): Promise<WompiReconciliationStoreResult> {
    const runId = randomUUID();
    await transaction.paymentReconciliationRun.create({
      data: {
        completedAt: now,
        differenceCount: signals.length,
        id: runId,
        newIssueCount: 0,
        organizationId: scope.organization_id,
        provider: 'WOMPI',
        reportJson: { mode: 'simulation', provider: 'wompi', provisional: true },
        resolvedCount: 0,
        scannedCount: scanned,
        startedAt: now,
        status: 'COMPLETED',
        storeId: scope.store_id,
        windowEndedAt: now,
        windowStartedAt,
      },
    });
    const existing =
      scannedIntentIds.length === 0
        ? []
        : await transaction.paymentReconciliationIssue.findMany({
            where: { paymentIntentId: { in: scannedIntentIds } },
          });
    const activeFingerprints = new Set(signals.map(({ fingerprint }) => fingerprint));
    const resolvedIds = existing
      .filter(
        ({ fingerprint, status }) => status === 'OPEN' && !activeFingerprints.has(fingerprint),
      )
      .map(({ id }) => id);
    if (resolvedIds.length > 0) {
      await transaction.paymentReconciliationIssue.updateMany({
        data: { resolvedAt: now, status: 'RESOLVED' },
        where: { id: { in: resolvedIds }, organizationId: scope.organization_id },
      });
    }
    let opened = 0;
    for (const signal of signals) {
      const previous = existing.find(({ fingerprint }) => fingerprint === signal.fingerprint);
      if (previous === undefined || previous.status === 'RESOLVED') opened += 1;
      await transaction.paymentReconciliationIssue.upsert({
        create: {
          acceptedEventStatus: signal.acceptedEventStatus,
          authoritativeStatus: signal.authoritativeStatus,
          detailJson: signal.detail,
          fingerprint: signal.fingerprint,
          firstDetectedAt: now,
          issueType: signal.type,
          lastDetectedAt: now,
          lastDetectedRunId: runId,
          localStatus: signal.localStatus,
          organizationId: scope.organization_id,
          paymentIntentId: signal.intentId,
          provider: 'WOMPI',
          storeId: scope.store_id,
        },
        update: {
          acceptedEventStatus: signal.acceptedEventStatus,
          authoritativeStatus: signal.authoritativeStatus,
          detailJson: signal.detail,
          detectionCount: { increment: 1 },
          lastDetectedAt: now,
          lastDetectedRunId: runId,
          localStatus: signal.localStatus,
          resolvedAt: null,
          status: 'OPEN',
        },
        where: {
          storeId_fingerprint: { fingerprint: signal.fingerprint, storeId: scope.store_id },
        },
      });
    }
    const countsByType = Object.fromEntries(
      Object.values(PaymentReconciliationIssueType).map((type) => [
        type.toLowerCase(),
        signals.filter((signal) => signal.type === type).length,
      ]),
    );
    const nextRunAt = new Date(
      now.getTime() + this.environment.wompiReconciliation.intervalHours * 60 * 60 * 1_000,
    );
    const storedCheckpoint = await transaction.paymentReconciliationCheckpoint.upsert({
      create: {
        lastRunAt: now,
        nextRunAt,
        organizationId: scope.organization_id,
        provider: 'WOMPI',
        storeId: scope.store_id,
        windowEndedAt: now,
        windowStartedAt,
      },
      update: {
        consecutiveFailures: 0,
        lastFailureAt: null,
        lastRunAt: now,
        nextRunAt,
        windowEndedAt: now,
        windowStartedAt,
      },
      where: { storeId_provider: { provider: 'WOMPI', storeId: scope.store_id } },
    });
    const report = {
      countsByType,
      differenceCount: signals.length,
      mode: 'simulation',
      newIssueCount: opened,
      provider: 'wompi',
      resolvedCount: resolvedIds.length,
      scannedCount: scanned,
      windowEndedAt: now.toISOString(),
      windowStartedAt: windowStartedAt.toISOString(),
    };
    await transaction.paymentReconciliationRun.update({
      data: {
        checkpointId: storedCheckpoint.id,
        newIssueCount: opened,
        reportJson: report,
        resolvedCount: resolvedIds.length,
      },
      where: { id: runId },
    });
    if (signals.length > 0) {
      await transaction.outboxEvent.create({
        data: {
          aggregateId: runId,
          aggregateType: 'payment_reconciliation_run',
          correlationId: randomUUID(),
          eventType: 'payment.reconciliation.differences-detected.v1',
          eventVersion: 1,
          organizationId: scope.organization_id,
          payloadJson: {
            countsByType,
            differenceCount: signals.length,
            mode: 'simulation',
            newIssueCount: opened,
            provider: 'wompi',
            reconciliationRunId: runId,
            resolvedCount: resolvedIds.length,
            scannedCount: scanned,
            storeId: scope.store_id,
            windowEndedAt: now.toISOString(),
            windowStartedAt: windowStartedAt.toISOString(),
          },
        },
      });
    }
    await transaction.auditLog.create({
      data: {
        action: 'wompi.reconciliation.completed',
        correlationId: randomUUID(),
        metadataJson: {
          differenceCount: signals.length,
          mode: 'simulation',
          newIssueCount: opened,
          resolvedCount: resolvedIds.length,
          scannedCount: scanned,
        },
        organizationId: scope.organization_id,
        outcome: 'SUCCESS',
        resourceId: runId,
        resourceType: 'payment_reconciliation_run',
      },
    });
    this.metrics.recordWompiReconciliation(
      'store',
      signals.length === 0 ? 'consistent' : 'differences',
    );
    return {
      differences: signals.length,
      failed: false,
      opened,
      resolved: resolvedIds.length,
      scanned,
      skipped: false,
    };
  }

  private signal(
    intentId: string,
    type: PaymentReconciliationIssueType,
    localStatus: PaymentIntentStatus,
    acceptedEventStatus: PaymentIntentStatus | null,
    authoritativeStatus: PaymentIntentStatus | null,
    detail: Prisma.InputJsonObject,
  ): ReconciliationSignal {
    return {
      acceptedEventStatus,
      authoritativeStatus,
      detail,
      fingerprint: createHash('sha256').update(`${intentId}:${type}`).digest('hex'),
      intentId,
      localStatus,
      type,
    };
  }

  private empty(skipped: boolean): WompiReconciliationStoreResult {
    return { differences: 0, failed: false, opened: 0, resolved: 0, scanned: 0, skipped };
  }

  private assertEnabled(): void {
    const provider = this.environment.wompi;
    const reconciliation = this.environment.wompiReconciliation;
    if (
      !provider.enabled ||
      provider.killSwitch ||
      !provider.simulationMode ||
      !reconciliation.enabled ||
      reconciliation.killSwitch ||
      !reconciliation.simulationMode
    ) {
      throw new ServiceUnavailableException('Wompi reconciliation simulation is disabled');
    }
  }
}
