import {
  ConflictException,
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
import { RequestContextService } from '../observability/request-context.service';
import {
  TransportRateResolutionError,
  TransportRateResolver,
  type TransportRateResolution,
} from './transport-rate-resolver';

export interface TransportRateRuleInput {
  readonly amountMinor: number;
  readonly city?: string | undefined;
  readonly department?: string | undefined;
  readonly priority: number;
  readonly ruleKey: string;
  readonly shopifyProductId?: string | undefined;
  readonly validFrom?: Date | undefined;
  readonly validTo?: Date | undefined;
}

interface CreatePolicyCommand {
  readonly currency: 'COP';
  readonly idempotencyKey: string;
  readonly organizationId: string;
  readonly principal: AuthPrincipal;
  readonly rules: readonly TransportRateRuleInput[];
  readonly storeId?: string | undefined;
}

interface PolicyCommand {
  readonly idempotencyKey: string;
  readonly organizationId: string;
  readonly policyId: string;
  readonly principal: AuthPrincipal;
}

interface OrderCommand {
  readonly orderId: string;
  readonly organizationId: string;
  readonly principal: AuthPrincipal;
}

interface ResolveOrderCommand extends OrderCommand {
  readonly idempotencyKey: string;
}

interface LockedIdempotencyRow {
  request_hash: string;
  response_snapshot_json: Prisma.JsonValue | null;
  status: 'completed' | 'failed' | 'processing';
}

export interface PolicyResult {
  readonly policyId: string;
  readonly ruleCount: number;
  readonly scope: 'global' | 'store';
  readonly status: 'active' | 'draft';
  readonly version: number;
}

export interface TransportRateResult {
  readonly amountMinor: number;
  readonly currency: 'COP';
  readonly decisionId: string | null;
  readonly orderId: string;
  readonly outcome: 'previewed' | 'replayed' | 'resolved';
  readonly policyId: string;
  readonly policyScope: 'global' | 'store';
  readonly policyVersion: number;
  readonly ruleId: string;
  readonly ruleKey: string;
}

const CREATE_SCOPE = 'transport-rate.policy.create';
const ACTIVATE_SCOPE = 'transport-rate.policy.activate';
const RESOLVE_SCOPE = 'transport-rate.order.resolve';

@Injectable()
export class TransportRateService {
  public constructor(
    private readonly audit: AuditService,
    private readonly environment: EnvironmentService,
    private readonly metrics: MetricsService,
    private readonly prisma: PrismaService,
    private readonly requestContext: RequestContextService,
    private readonly resolver: TransportRateResolver,
  ) {}

  public async createPolicy(command: CreatePolicyCommand): Promise<PolicyResult> {
    this.assertEnabled();
    const hash = requestHash({
      currency: command.currency,
      organizationId: command.organizationId,
      rules: command.rules.map((rule) => ({
        ...rule,
        validFrom: rule.validFrom?.toISOString(),
        validTo: rule.validTo?.toISOString(),
      })),
      storeId: command.storeId ?? null,
    });
    try {
      const { replayed, result } = await this.idempotent(
        CREATE_SCOPE,
        command.organizationId,
        command.idempotencyKey,
        hash,
        async (transaction) => {
          await transaction.$executeRaw`
            SELECT pg_advisory_xact_lock(
              hashtextextended(${'transport-rate.policy:' + command.organizationId + ':' + (command.storeId ?? 'global')}, 0)
            )
          `;
          if (command.storeId !== undefined) {
            const store = await transaction.store.findFirst({
              select: { id: true },
              where: { id: command.storeId, organizationId: command.organizationId },
            });
            if (store === null) throw new NotFoundException('Transport rate store not found');
          }
          const latest = await transaction.transportRatePolicy.aggregate({
            _max: { version: true },
            where: {
              organizationId: command.organizationId,
              storeId: command.storeId ?? null,
            },
          });
          const policy = await transaction.transportRatePolicy.create({
            data: {
              currency: command.currency,
              organizationId: command.organizationId,
              storeId: command.storeId ?? null,
              version: (latest._max.version ?? 0) + 1,
            },
          });
          await transaction.transportRateRule.createMany({
            data: command.rules.map((rule) => ({
              amount: BigInt(rule.amountMinor),
              city: this.normalizeSelector(rule.city) ?? null,
              department: this.normalizeSelector(rule.department) ?? null,
              organizationId: command.organizationId,
              policyId: policy.id,
              priority: rule.priority,
              ruleKey: rule.ruleKey,
              shopifyProductId: rule.shopifyProductId ?? null,
              validFrom: rule.validFrom ?? null,
              validTo: rule.validTo ?? null,
            })),
          });
          return {
            policyId: policy.id,
            ruleCount: command.rules.length,
            scope: policy.storeId === null ? 'global' : 'store',
            status: 'draft',
            version: policy.version,
          } satisfies PolicyResult;
        },
      );
      this.metrics.recordTransportRate('create_policy', replayed ? 'replayed' : 'success');
      await this.recordAudit(command, 'transport_rate.policy.created', result.policyId, {
        replayed,
        ruleCount: result.ruleCount,
        scope: result.scope,
        version: result.version,
      });
      return result;
    } catch (error) {
      await this.recordFailure(command, 'transport_rate.policy.create_failed');
      throw error;
    }
  }

  public async activatePolicy(command: PolicyCommand): Promise<PolicyResult> {
    this.assertEnabled();
    const hash = requestHash({
      organizationId: command.organizationId,
      policyId: command.policyId,
    });
    try {
      const { replayed, result } = await this.idempotent(
        ACTIVATE_SCOPE,
        command.organizationId,
        command.idempotencyKey,
        hash,
        async (transaction) => {
          const policyScope = await transaction.transportRatePolicy.findFirst({
            select: { storeId: true },
            where: { id: command.policyId, organizationId: command.organizationId },
          });
          if (policyScope === null) throw new NotFoundException('Transport rate policy not found');
          await transaction.$executeRaw`
            SELECT pg_advisory_xact_lock(
              hashtextextended(${'transport-rate.policy:' + command.organizationId + ':' + (policyScope.storeId ?? 'global')}, 0)
            )
          `;
          const policy = await transaction.transportRatePolicy.findFirst({
            include: { _count: { select: { rules: true } } },
            where: { id: command.policyId, organizationId: command.organizationId },
          });
          if (policy === null) throw new NotFoundException('Transport rate policy not found');
          if (!policy.active) {
            await transaction.transportRatePolicy.updateMany({
              data: { activatedAt: null, active: false },
              where: {
                active: true,
                organizationId: command.organizationId,
                storeId: policy.storeId,
              },
            });
            await transaction.transportRatePolicy.update({
              data: { activatedAt: new Date(), active: true },
              where: { id: policy.id },
            });
            await transaction.outboxEvent.create({
              data: {
                aggregateId: policy.id,
                aggregateType: 'transport_rate_policy',
                correlationId: this.requestContext.correlationId ?? 'internal',
                eventType: 'transport.rate_policy.activated.v1',
                eventVersion: 1,
                organizationId: command.organizationId,
                payloadJson: {
                  currency: policy.currency,
                  mode: 'simulation',
                  policyId: policy.id,
                  scope: policy.storeId === null ? 'global' : 'store',
                  storeId: policy.storeId,
                  version: policy.version,
                },
              },
            });
          }
          return {
            policyId: policy.id,
            ruleCount: policy._count.rules,
            scope: policy.storeId === null ? 'global' : 'store',
            status: 'active',
            version: policy.version,
          } satisfies PolicyResult;
        },
      );
      this.metrics.recordTransportRate('activate_policy', replayed ? 'replayed' : 'success');
      await this.recordAudit(command, 'transport_rate.policy.activated', result.policyId, {
        replayed,
        scope: result.scope,
        version: result.version,
      });
      return result;
    } catch (error) {
      await this.recordFailure(command, 'transport_rate.policy.activate_failed', command.policyId);
      throw error;
    }
  }

  public async preview(
    command: OrderCommand,
    evaluatedAt = new Date(),
  ): Promise<TransportRateResult> {
    this.assertEnabled();
    try {
      const order = await this.loadOrder(this.prisma, command.organizationId, command.orderId);
      const resolution = this.resolveOrder(order, evaluatedAt);
      const result = this.toResult(order.id, resolution, 'previewed', null);
      this.metrics.recordTransportRate('preview', 'success');
      await this.recordAudit(command, 'transport_rate.previewed', command.orderId, {
        policyId: result.policyId,
        ruleId: result.ruleId,
      });
      return result;
    } catch (error) {
      await this.recordFailure(command, 'transport_rate.preview_failed', command.orderId);
      throw error;
    }
  }

  public async resolve(command: ResolveOrderCommand): Promise<TransportRateResult> {
    this.assertEnabled();
    const hash = requestHash({ orderId: command.orderId, organizationId: command.organizationId });
    try {
      const { replayed, result } = await this.idempotent(
        RESOLVE_SCOPE,
        command.organizationId,
        command.idempotencyKey,
        hash,
        async (transaction) => {
          await transaction.$executeRaw`
            SELECT pg_advisory_xact_lock(
              hashtextextended(${'transport-rate.order:' + command.organizationId + ':' + command.orderId}, 0)
            )
          `;
          const order = await this.loadOrder(transaction, command.organizationId, command.orderId);
          if (order.transportChargeAmount > 0n) {
            const existing = await transaction.transportRateDecision.findFirst({
              include: { policy: true, rule: true },
              orderBy: { createdAt: 'desc' },
              where: { orderId: order.id, organizationId: command.organizationId },
            });
            if (existing === null) {
              throw new ConflictException('Transport charge exists without a rate decision');
            }
            return {
              amountMinor: Number(existing.amount),
              currency: 'COP',
              decisionId: existing.id,
              orderId: order.id,
              outcome: 'replayed',
              policyId: existing.policyId,
              policyScope: existing.policy.storeId === null ? 'global' : 'store',
              policyVersion: existing.policy.version,
              ruleId: existing.ruleId,
              ruleKey: existing.rule.ruleKey,
            } satisfies TransportRateResult;
          }
          const resolution = this.resolveOrder(order, new Date());
          const storedKey = `${command.organizationId}:${hashSensitive(command.idempotencyKey)}`;
          const decision = await transaction.transportRateDecision.create({
            data: {
              amount: resolution.amount,
              currency: resolution.currency,
              evaluatedAt: new Date(),
              idempotencyKey: storedKey,
              orderId: order.id,
              organizationId: command.organizationId,
              policyId: resolution.policyId,
              ruleId: resolution.ruleId,
              storeId: order.storeId,
            },
          });
          await transaction.order.update({
            data: {
              transportChargeAmount: resolution.amount,
              version: { increment: 1 },
            },
            where: { id: order.id },
          });
          await transaction.outboxEvent.create({
            data: {
              aggregateId: order.id,
              aggregateType: 'order',
              correlationId: this.requestContext.correlationId ?? 'internal',
              eventType: 'order.transport_rate.resolved.v1',
              eventVersion: 1,
              organizationId: command.organizationId,
              payloadJson: {
                amountMinor: Number(resolution.amount),
                currency: resolution.currency,
                decisionId: decision.id,
                mode: 'simulation',
                orderId: order.id,
                policyVersion: resolution.policyVersion,
                ruleKey: resolution.ruleKey,
                storeId: order.storeId,
              },
            },
          });
          return this.toResult(order.id, resolution, 'resolved', decision.id);
        },
      );
      const outcome = replayed ? 'replayed' : result.outcome;
      this.metrics.recordTransportRate('resolve', outcome);
      await this.recordAudit(command, 'transport_rate.resolved', command.orderId, {
        amountMinor: result.amountMinor,
        outcome,
        policyId: result.policyId,
        ruleId: result.ruleId,
      });
      return result;
    } catch (error) {
      await this.recordFailure(command, 'transport_rate.resolve_failed', command.orderId);
      throw error;
    }
  }

  private async idempotent<T>(
    scope: string,
    organizationId: string,
    idempotencyKey: string,
    hash: string,
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<{ readonly replayed: boolean; readonly result: T }> {
    const storedKey = `${organizationId}:${hashSensitive(idempotencyKey)}`;
    return this.withSerializableRetry(() =>
      this.prisma.$transaction(
        async (transaction) => {
          await transaction.$executeRaw`
            INSERT INTO idempotency_keys (scope, key, request_hash, expires_at)
            VALUES (${scope}, ${storedKey}, ${hash}, NOW() + INTERVAL '24 hours')
            ON CONFLICT (scope, key) DO NOTHING
          `;
          const [record] = await transaction.$queryRaw<LockedIdempotencyRow[]>`
            SELECT request_hash, response_snapshot_json, status
            FROM idempotency_keys
            WHERE scope = ${scope} AND key = ${storedKey}
            FOR UPDATE
          `;
          if (record === undefined) throw new Error('Idempotency record could not be locked');
          if (record.request_hash !== hash) {
            throw new ConflictException('Idempotency key was already used with another request');
          }
          if (record.status === 'completed' && record.response_snapshot_json !== null) {
            return { replayed: true, result: record.response_snapshot_json as unknown as T };
          }
          const result = await operation(transaction);
          await transaction.idempotencyKey.update({
            data: {
              responseSnapshotJson: result as unknown as Prisma.InputJsonValue,
              status: IdempotencyStatus.COMPLETED,
            },
            where: { scope_key: { key: storedKey, scope } },
          });
          return { replayed: false, result };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  private async loadOrder(
    client: Prisma.TransactionClient | PrismaService,
    organizationId: string,
    orderId: string,
  ) {
    const order = await client.order.findFirst({
      include: {
        items: { select: { shopifyProductId: true } },
        shippingAddress: { select: { city: true, department: true } },
        store: {
          include: {
            transportRatePolicies: {
              include: { rules: true },
              where: { active: true },
            },
          },
        },
      },
      where: { id: orderId, organizationId },
    });
    if (order === null) throw new NotFoundException('Transport rate order not found');
    if (order.paymentMode !== 'COD' || order.currentState !== 'PENDING_TRANSPORT_PAYMENT') {
      throw new ConflictException('Transport rate requires a COD order pending transport payment');
    }
    const globalPolicies = await client.transportRatePolicy.findMany({
      include: { rules: true },
      where: { active: true, organizationId, storeId: null },
    });
    return { ...order, activePolicies: [...globalPolicies, ...order.store.transportRatePolicies] };
  }

  private resolveOrder(
    order: Awaited<ReturnType<TransportRateService['loadOrder']>>,
    evaluatedAt: Date,
  ): TransportRateResolution {
    try {
      return this.resolver.resolve({
        city: order.shippingAddress?.city ?? null,
        currency: order.currency,
        department: order.shippingAddress?.department ?? null,
        evaluatedAt,
        policies: order.activePolicies.map((policy) => ({
          currency: policy.currency,
          id: policy.id,
          rules: policy.rules,
          scope: policy.storeId === null ? 'global' : 'store',
          version: policy.version,
        })),
        shopifyProductIds: order.items.flatMap(({ shopifyProductId }) =>
          shopifyProductId === null ? [] : [shopifyProductId],
        ),
      });
    } catch (error) {
      if (error instanceof TransportRateResolutionError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }

  private toResult(
    orderId: string,
    resolution: TransportRateResolution,
    outcome: TransportRateResult['outcome'],
    decisionId: string | null,
  ): TransportRateResult {
    return {
      amountMinor: Number(resolution.amount),
      currency: 'COP',
      decisionId,
      orderId,
      outcome,
      policyId: resolution.policyId,
      policyScope: resolution.policyScope,
      policyVersion: resolution.policyVersion,
      ruleId: resolution.ruleId,
      ruleKey: resolution.ruleKey,
    };
  }

  private normalizeSelector(value: string | undefined): string | undefined {
    return value?.normalize('NFKC').trim().toLocaleLowerCase('es-CO').replace(/\s+/gu, ' ');
  }

  private assertEnabled(): void {
    const controls = this.environment.transportRates;
    if (!controls.enabled || controls.killSwitch || !controls.simulationMode) {
      throw new ServiceUnavailableException('Transport rate simulation is disabled');
    }
  }

  private async recordAudit(
    command: { readonly organizationId: string; readonly principal: AuthPrincipal },
    action: string,
    resourceId: string,
    metadata: Prisma.InputJsonObject,
  ): Promise<void> {
    await this.audit.record({
      action,
      actorUserId: command.principal.userId,
      metadata: { ...metadata, mode: 'simulation' },
      organizationId: command.organizationId,
      outcome: 'SUCCESS',
      resourceId,
      resourceType: 'transport_rate',
    });
  }

  private async recordFailure(
    command: { readonly organizationId: string; readonly principal: AuthPrincipal },
    action: string,
    resourceId?: string,
  ): Promise<void> {
    this.metrics.recordTransportRate(action, 'failure');
    await this.audit.record({
      action,
      actorUserId: command.principal.userId,
      metadata: { mode: 'simulation' },
      organizationId: command.organizationId,
      outcome: 'FAILURE',
      resourceId,
      resourceType: 'transport_rate',
    });
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
    throw new Error('Serializable transport rate retry limit reached');
  }

  private isSerializationConflict(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
    if (error.code === 'P2002' || error.code === 'P2034') return true;
    const metadata = error.meta as {
      code?: string;
      driverAdapterError?: { originalCode?: string };
    };
    return (
      error.code === 'P2010' &&
      (metadata.code === '40001' ||
        metadata.driverAdapterError?.originalCode === '40001' ||
        error.message.includes('40001'))
    );
  }
}
