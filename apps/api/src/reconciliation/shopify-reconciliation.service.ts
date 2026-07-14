import { createHash, randomUUID } from 'node:crypto';

import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { AuditService } from '../auth/audit.service';
import type { AuthPrincipal } from '../auth/auth.types';
import { hashSensitive } from '../auth/token';
import { EnvironmentService } from '../config/environment.service';
import { PrismaService } from '../database/prisma.service';
import { IdempotencyStatus, Prisma } from '../generated/prisma/client';
import { requestHash } from '../foundation/request-hash';
import { MetricsService } from '../observability/metrics.service';
import { ShopifyCredentialCipher } from '../shopify/shopify-credential-cipher';
import { SHOPIFY_PROVIDER, type ShopifyProvider } from '../shopify/shopify-provider';

interface BaseCommand {
  readonly organizationId: string;
  readonly principal: AuthPrincipal;
}

export interface ReconciliationRunCommand extends BaseCommand {
  readonly storeId: string;
  readonly windowEndedAt: Date;
  readonly windowStartedAt: Date;
}

interface InspectCommand extends BaseCommand {
  readonly limit: number;
  readonly status?: 'OPEN' | 'REPROCESSING' | 'RESOLVED' | undefined;
}

interface ReprocessCommand extends BaseCommand {
  readonly idempotencyKey: string;
  readonly issueId: string;
}

interface Signal {
  readonly evidence: Prisma.InputJsonObject;
  readonly fingerprint: string;
  readonly issueType: 'FAILED_WEBHOOK' | 'MISSING_ORDER' | 'STUCK_ORDER';
  readonly orderId?: string | undefined;
  readonly providerResourceId?: string | undefined;
  readonly webhookEventId?: string | undefined;
}

interface LockedIdempotencyRow {
  request_hash: string;
  response_snapshot_json: Prisma.JsonValue | null;
  status: 'completed' | 'failed' | 'processing';
}

export interface ReconciliationReprocessResult {
  readonly deliveryVersion: number;
  readonly issueId: string;
  readonly outboxEventId: string;
  readonly status: 'reprocessing';
}

const REPROCESS_SCOPE = 'shopify.reconciliation.issue.reprocess';

@Injectable()
export class ShopifyReconciliationService {
  public constructor(
    private readonly audit: AuditService,
    private readonly cipher: ShopifyCredentialCipher,
    private readonly environment: EnvironmentService,
    private readonly metrics: MetricsService,
    private readonly prisma: PrismaService,
    @Inject(SHOPIFY_PROVIDER) private readonly provider: ShopifyProvider,
  ) {}

  public async run(command: ReconciliationRunCommand) {
    this.assertEnabled();
    this.assertWindow(command.windowStartedAt, command.windowEndedAt);
    try {
      const connection = await this.prisma.integrationConnection.findFirst({
        include: { store: true },
        where: {
          organizationId: command.organizationId,
          provider: 'SHOPIFY',
          status: 'ACTIVE',
          storeId: command.storeId,
        },
      });
      if (connection === null) throw new NotFoundException('Active Shopify store not found');
      const checkpoint = await this.prisma.reconciliationCheckpoint.findUnique({
        where: { storeId_provider: { provider: 'SHOPIFY', storeId: command.storeId } },
      });
      const listing = await this.provider.listOrders({
        accessToken: this.cipher.decrypt(
          connection.encryptedCredentialsJson,
          command.organizationId,
          command.storeId,
        ),
        ...(checkpoint?.providerCursor === null || checkpoint?.providerCursor === undefined
          ? {}
          : { cursor: checkpoint.providerCursor }),
        shopDomain: connection.store.shopifyShopDomain,
        updatedAfter: command.windowStartedAt,
        updatedBefore: command.windowEndedAt,
      });
      const providerIds = listing.orders.map(({ id }) => id);
      const [localOrders, failedWebhooks, stuckOrders, existingIssues] = await Promise.all([
        this.prisma.order.findMany({
          select: { shopifyOrderId: true },
          where: { shopifyOrderId: { in: providerIds }, storeId: command.storeId },
        }),
        this.prisma.webhookEvent.findMany({
          select: { errorCode: true, id: true, providerResourceId: true, status: true },
          where: {
            eventType: 'orders/create',
            organizationId: command.organizationId,
            receivedAt: { gte: command.windowStartedAt, lt: command.windowEndedAt },
            status: { in: ['DEAD_LETTER', 'FAILED'] },
            storeId: command.storeId,
          },
        }),
        this.prisma.order.findMany({
          select: { id: true, shopifyOrderId: true },
          where: {
            currentState: 'RECEIVED',
            organizationId: command.organizationId,
            sourceUpdatedAt: { gte: command.windowStartedAt, lt: command.windowEndedAt },
            storeId: command.storeId,
            updatedAt: {
              lte: new Date(
                Date.now() - this.environment.shopifyReconciliation.stuckAfterMinutes * 60_000,
              ),
            },
          },
        }),
        this.prisma.orderReconciliationIssue.findMany({
          where: {
            organizationId: command.organizationId,
            status: { in: ['OPEN', 'REPROCESSING'] },
            storeId: command.storeId,
          },
        }),
      ]);
      const localIds = new Set(localOrders.map(({ shopifyOrderId }) => shopifyOrderId));
      const signals: Signal[] = [
        ...listing.orders
          .filter(({ id }) => !localIds.has(id))
          .map(({ id, updatedAt }) =>
            this.signal('MISSING_ORDER', command.storeId, id, {
              fixtureVersion: listing.fixtureVersion,
              providerUpdatedAt: updatedAt.toISOString(),
            }),
          ),
        ...failedWebhooks.map((webhook) =>
          this.signal(
            'FAILED_WEBHOOK',
            command.storeId,
            webhook.id,
            {
              errorCode: webhook.errorCode ?? 'consumer_failure',
              webhookStatus: webhook.status.toLowerCase(),
            },
            {
              providerResourceId: webhook.providerResourceId ?? undefined,
              webhookEventId: webhook.id,
            },
          ),
        ),
        ...stuckOrders.map((order) =>
          this.signal(
            'STUCK_ORDER',
            command.storeId,
            order.id,
            { state: 'received' },
            {
              orderId: order.id,
              providerResourceId: order.shopifyOrderId,
            },
          ),
        ),
      ];
      const resolvedIds: string[] = [];
      for (const issue of existingIssues) {
        if (await this.isResolved(issue)) resolvedIds.push(issue.id);
      }

      await this.prisma.$transaction(async (transaction) => {
        await transaction.$executeRaw`
          SELECT pg_advisory_xact_lock(
            hashtextextended(${'shopify.reconciliation:' + command.organizationId + ':' + command.storeId}, 0)
          )
        `;
        if (resolvedIds.length > 0) {
          await transaction.orderReconciliationIssue.updateMany({
            data: { resolvedAt: new Date(), status: 'RESOLVED' },
            where: { id: { in: resolvedIds }, organizationId: command.organizationId },
          });
        }
        for (const signal of signals) {
          await transaction.orderReconciliationIssue.upsert({
            create: {
              evidenceJson: signal.evidence,
              fingerprint: signal.fingerprint,
              issueType: signal.issueType,
              ...(signal.orderId === undefined ? {} : { orderId: signal.orderId }),
              organizationId: command.organizationId,
              provider: 'SHOPIFY',
              ...(signal.providerResourceId === undefined
                ? {}
                : { providerResourceId: signal.providerResourceId }),
              storeId: command.storeId,
              ...(signal.webhookEventId === undefined
                ? {}
                : { webhookEventId: signal.webhookEventId }),
            },
            update: {
              detectionCount: { increment: 1 },
              evidenceJson: signal.evidence,
              lastDetectedAt: new Date(),
              reprocessStartedAt: null,
              resolvedAt: null,
              status: 'OPEN',
            },
            where: {
              storeId_fingerprint: { fingerprint: signal.fingerprint, storeId: command.storeId },
            },
          });
        }
        await transaction.reconciliationCheckpoint.upsert({
          create: {
            lastRunAt: new Date(),
            organizationId: command.organizationId,
            provider: 'SHOPIFY',
            providerCursor: listing.nextCursor,
            storeId: command.storeId,
            windowEndedAt: command.windowEndedAt,
            windowStartedAt: command.windowStartedAt,
          },
          update: {
            lastRunAt: new Date(),
            providerCursor: listing.nextCursor,
            windowEndedAt: command.windowEndedAt,
            windowStartedAt: command.windowStartedAt,
          },
          where: { storeId_provider: { provider: 'SHOPIFY', storeId: command.storeId } },
        });
      });
      const result = {
        detectedCount: signals.length,
        mode: 'simulation' as const,
        nextCursor: listing.nextCursor,
        resolvedCount: resolvedIds.length,
        storeId: command.storeId,
      };
      this.metrics.recordShopifyReconciliation('scan', 'success');
      await this.audit.record({
        action: 'shopify.reconciliation.completed',
        actorUserId: command.principal.userId,
        metadata: { detectedCount: signals.length, resolvedCount: resolvedIds.length },
        organizationId: command.organizationId,
        outcome: 'SUCCESS',
        resourceId: command.storeId,
        resourceType: 'store',
      });
      return result;
    } catch (error) {
      this.metrics.recordShopifyReconciliation('scan', 'failure');
      await this.audit.record({
        action: 'shopify.reconciliation.failed',
        actorUserId: command.principal.userId,
        organizationId: command.organizationId,
        outcome: 'FAILURE',
        resourceId: command.storeId,
        resourceType: 'store',
      });
      throw error;
    }
  }

  public async inspect(command: InspectCommand) {
    this.assertEnabled();
    const items = await this.prisma.orderReconciliationIssue.findMany({
      orderBy: [{ lastDetectedAt: 'desc' }, { id: 'desc' }],
      select: {
        detectionCount: true,
        firstDetectedAt: true,
        id: true,
        issueType: true,
        lastDetectedAt: true,
        orderId: true,
        providerResourceId: true,
        resolvedAt: true,
        status: true,
        storeId: true,
        webhookEventId: true,
      },
      take: command.limit,
      where: {
        organizationId: command.organizationId,
        ...(command.status === undefined ? {} : { status: command.status }),
      },
    });
    await this.audit.record({
      action: 'shopify.reconciliation.inspected',
      actorUserId: command.principal.userId,
      metadata: { itemCount: items.length, status: command.status ?? 'all' },
      organizationId: command.organizationId,
      outcome: 'SUCCESS',
      resourceType: 'reconciliation_issue',
    });
    return { items };
  }

  public async reprocess(command: ReprocessCommand): Promise<ReconciliationReprocessResult> {
    this.assertEnabled();
    const storedKey = `${command.organizationId}:${command.issueId}:${hashSensitive(command.idempotencyKey)}`;
    const hash = requestHash({ issueId: command.issueId, organizationId: command.organizationId });
    try {
      const transactionResult = await this.withSerializableRetry(() =>
        this.prisma.$transaction(
          async (transaction) => {
            await transaction.$executeRaw`
              INSERT INTO idempotency_keys (scope, key, request_hash, expires_at)
              VALUES (${REPROCESS_SCOPE}, ${storedKey}, ${hash}, NOW() + INTERVAL '24 hours')
              ON CONFLICT (scope, key) DO NOTHING
            `;
            const [record] = await transaction.$queryRaw<LockedIdempotencyRow[]>`
              SELECT request_hash, response_snapshot_json, status
              FROM idempotency_keys
              WHERE scope = ${REPROCESS_SCOPE} AND key = ${storedKey}
              FOR UPDATE
            `;
            if (record === undefined) throw new Error('Idempotency record could not be locked');
            if (record.request_hash !== hash) {
              throw new ConflictException('Idempotency key was already used with another request');
            }
            if (record.status === 'completed' && record.response_snapshot_json !== null) {
              return record.response_snapshot_json as unknown as ReconciliationReprocessResult;
            }
            await transaction.$executeRaw`
              SELECT pg_advisory_xact_lock(
                hashtextextended(${'shopify.reconciliation.issue:' + command.organizationId + ':' + command.issueId}, 0)
              )
            `;
            const issue = await transaction.orderReconciliationIssue.findFirst({
              where: { id: command.issueId, organizationId: command.organizationId },
            });
            if (issue === null) throw new NotFoundException('Reconciliation issue not found');
            if (issue.status !== 'OPEN') {
              throw new ConflictException('Only open reconciliation issues can be reprocessed');
            }
            const result =
              issue.issueType === 'MISSING_ORDER'
                ? await this.createRecoveryEvent(transaction, issue)
                : await this.requeueFailedEvent(transaction, issue);
            await transaction.orderReconciliationIssue.update({
              data: { reprocessStartedAt: new Date(), status: 'REPROCESSING' },
              where: { id: issue.id },
            });
            await transaction.idempotencyKey.update({
              data: { responseSnapshotJson: { ...result }, status: IdempotencyStatus.COMPLETED },
              where: { scope_key: { key: storedKey, scope: REPROCESS_SCOPE } },
            });
            return result;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        ),
      );
      this.metrics.recordShopifyReconciliation('reprocess', 'success');
      await this.audit.record({
        action: 'shopify.reconciliation.reprocessed',
        actorUserId: command.principal.userId,
        organizationId: command.organizationId,
        outcome: 'SUCCESS',
        resourceId: command.issueId,
        resourceType: 'reconciliation_issue',
      });
      return transactionResult;
    } catch (error) {
      this.metrics.recordShopifyReconciliation('reprocess', 'failure');
      await this.audit.record({
        action: 'shopify.reconciliation.reprocess_failed',
        actorUserId: command.principal.userId,
        organizationId: command.organizationId,
        outcome: 'FAILURE',
        resourceId: command.issueId,
        resourceType: 'reconciliation_issue',
      });
      throw error;
    }
  }

  private async createRecoveryEvent(
    transaction: Prisma.TransactionClient,
    issue: {
      detectionCount: number;
      id: string;
      organizationId: string;
      providerResourceId: string | null;
      storeId: string;
    },
  ): Promise<ReconciliationReprocessResult> {
    if (issue.providerResourceId === null) {
      throw new ConflictException('Missing order issue has no provider resource identifier');
    }
    const webhookId = randomUUID();
    const webhook = await transaction.webhookEvent.create({
      data: {
        apiVersion: 'simulation-v1',
        eventType: 'orders/create',
        externalEventId: `reconciliation:${issue.id}:${issue.detectionCount}`,
        headersRedactedJson: { generatedBy: 'reconciliation' },
        id: webhookId,
        organizationId: issue.organizationId,
        payloadHash: createHash('sha256').update(issue.id).digest('hex'),
        payloadRedactedJson: { synthetic: true },
        provider: 'SHOPIFY',
        providerResourceId: issue.providerResourceId,
        reconciliationGenerated: true,
        signatureValid: false,
        storeId: issue.storeId,
        triggeredAt: new Date(),
      },
    });
    const outbox = await transaction.outboxEvent.create({
      data: {
        aggregateId: webhook.id,
        aggregateType: 'webhook_event',
        correlationId: randomUUID(),
        eventType: 'shopify.webhook.received.v1',
        eventVersion: 1,
        organizationId: issue.organizationId,
        payloadJson: { mode: 'simulation', source: 'reconciliation' },
      },
    });
    return {
      deliveryVersion: outbox.deliveryVersion,
      issueId: issue.id,
      outboxEventId: outbox.id,
      status: 'reprocessing',
    };
  }

  private async requeueFailedEvent(
    transaction: Prisma.TransactionClient,
    issue: {
      id: string;
      issueType: 'FAILED_WEBHOOK' | 'MISSING_ORDER' | 'STUCK_ORDER';
      orderId: string | null;
      organizationId: string;
      webhookEventId: string | null;
    },
  ): Promise<ReconciliationReprocessResult> {
    const event = await transaction.outboxEvent.findFirst({
      orderBy: { createdAt: 'desc' },
      where: {
        aggregateId:
          issue.issueType === 'FAILED_WEBHOOK'
            ? (issue.webhookEventId ?? '')
            : (issue.orderId ?? ''),
        eventType:
          issue.issueType === 'FAILED_WEBHOOK'
            ? 'shopify.webhook.received.v1'
            : 'shopify.order.synchronized.v1',
        organizationId: issue.organizationId,
        status: { in: ['DEAD_LETTER', 'FAILED'] },
      },
    });
    if (event === null) throw new ConflictException('No failed outbox event can be reprocessed');
    const updated = await transaction.outboxEvent.update({
      data: {
        attemptCount: 0,
        availableAt: new Date(),
        deadLetteredAt: null,
        deliveryVersion: { increment: 1 },
        lastErrorJson: Prisma.DbNull,
        lockedAt: null,
        lockedBy: null,
        publishedAt: null,
        reprocessCount: { increment: 1 },
        status: 'PENDING',
      },
      where: { id: event.id },
    });
    return {
      deliveryVersion: updated.deliveryVersion,
      issueId: issue.id,
      outboxEventId: updated.id,
      status: 'reprocessing',
    };
  }

  private signal(
    issueType: Signal['issueType'],
    storeId: string,
    resourceId: string,
    evidence: Prisma.InputJsonObject,
    references: Pick<Signal, 'orderId' | 'providerResourceId' | 'webhookEventId'> = {},
  ): Signal {
    return {
      evidence,
      fingerprint: createHash('sha256')
        .update(`${storeId}:${issueType}:${resourceId}`)
        .digest('hex'),
      issueType,
      ...references,
      ...(issueType === 'MISSING_ORDER' ? { providerResourceId: resourceId } : {}),
    };
  }

  private async isResolved(issue: {
    issueType: 'FAILED_WEBHOOK' | 'MISSING_ORDER' | 'STUCK_ORDER';
    orderId: string | null;
    providerResourceId: string | null;
    storeId: string;
    webhookEventId: string | null;
  }): Promise<boolean> {
    if (issue.issueType === 'MISSING_ORDER' && issue.providerResourceId !== null) {
      return (
        (await this.prisma.order.count({
          where: { shopifyOrderId: issue.providerResourceId, storeId: issue.storeId },
        })) > 0
      );
    }
    if (issue.issueType === 'FAILED_WEBHOOK' && issue.webhookEventId !== null) {
      const webhook = await this.prisma.webhookEvent.findUnique({
        select: { status: true },
        where: { id: issue.webhookEventId },
      });
      return webhook?.status === 'PROCESSED';
    }
    if (issue.issueType === 'STUCK_ORDER' && issue.orderId !== null) {
      const order = await this.prisma.order.findUnique({
        select: { currentState: true },
        where: { id: issue.orderId },
      });
      return order !== null && order.currentState !== 'RECEIVED';
    }
    return false;
  }

  private assertEnabled(): void {
    const controls = this.environment.shopifyReconciliation;
    if (!controls.enabled || controls.killSwitch || !controls.simulationMode) {
      throw new ServiceUnavailableException('Shopify reconciliation simulation is disabled');
    }
  }

  private assertWindow(start: Date, end: Date): void {
    const duration = end.getTime() - start.getTime();
    const maximum = this.environment.shopifyReconciliation.maxWindowHours * 3_600_000;
    if (!Number.isFinite(duration) || duration <= 0 || duration > maximum) {
      throw new ConflictException(
        'Reconciliation window is invalid or exceeds the configured limit',
      );
    }
  }

  private async withSerializableRetry<T>(operation: () => Promise<T>): Promise<T> {
    for (let retry = 0; retry < 3; retry += 1) {
      try {
        return await operation();
      } catch (error) {
        if (!this.isSerializationConflict(error) || retry === 2) throw error;
        await new Promise((resolve) => setTimeout(resolve, 25 * (retry + 1)));
      }
    }
    throw new Error('Serializable reconciliation retry limit reached');
  }

  private isSerializationConflict(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
    if (error.code === 'P2002' || error.code === 'P2034') return true;
    const metadata = error.meta as
      { code?: string; driverAdapterError?: { cause?: { originalCode?: string } } } | undefined;
    return (
      error.code === 'P2010' &&
      (metadata?.code === '40001' ||
        metadata?.driverAdapterError?.cause?.originalCode === '40001' ||
        error.message.includes('40001'))
    );
  }
}
