import { Inject, Injectable, ConflictException, ServiceUnavailableException } from '@nestjs/common';

import { AuditService } from '../auth/audit.service';
import type { AuthPrincipal } from '../auth/auth.types';
import { hashSensitive } from '../auth/token';
import { EnvironmentService } from '../config/environment.service';
import { PrismaService } from '../database/prisma.service';
import { IdempotencyStatus, Prisma } from '../generated/prisma/client';
import { requestHash } from '../foundation/request-hash';
import { MetricsService } from '../observability/metrics.service';
import { RequestContextService } from '../observability/request-context.service';
import { WOMPI_PROVIDER, type WompiProvider } from './wompi-provider';

interface CreatePaymentIntentCommand {
  readonly idempotencyKey: string;
  readonly orderId: string;
  readonly organizationId: string;
  readonly principal: AuthPrincipal;
}

interface LockedIdempotencyRow {
  request_hash: string;
  response_snapshot_json: Prisma.JsonValue | null;
  status: 'completed' | 'failed' | 'processing';
}

export interface PaymentIntentResult {
  readonly amountMinor: number;
  readonly attemptNumber: number;
  readonly checkoutUrl: string;
  readonly currency: 'COP';
  readonly expiresAt: string;
  readonly externalReference: string;
  readonly intentId: string;
  readonly mode: 'simulation';
  readonly orderId: string;
  readonly outcome: 'created' | 'replayed';
  readonly provider: 'wompi';
  readonly status: 'pending';
}

const CREATE_SCOPE = 'wompi.payment-intent.create';

@Injectable()
export class PaymentIntentService {
  public constructor(
    private readonly audit: AuditService,
    private readonly environment: EnvironmentService,
    private readonly metrics: MetricsService,
    private readonly prisma: PrismaService,
    private readonly requestContext: RequestContextService,
    @Inject(WOMPI_PROVIDER) private readonly wompi: WompiProvider,
  ) {}

  public async create(command: CreatePaymentIntentCommand): Promise<PaymentIntentResult> {
    this.assertEnabled();
    const hash = requestHash({ orderId: command.orderId, organizationId: command.organizationId });
    try {
      const { replayed, result } = await this.idempotent(command, hash, async (transaction) => {
        await transaction.$executeRaw`
          SELECT pg_advisory_xact_lock(
            hashtextextended(${'wompi.payment-intent:' + command.organizationId + ':' + command.orderId}, 0)
          )
        `;
        const order = await transaction.order.findFirst({
          include: { transportRateDecisions: { select: { amount: true } } },
          where: { id: command.orderId, organizationId: command.organizationId },
        });
        if (order === null) throw new ConflictException('Payment intent order is unavailable');
        if (
          order.paymentMode !== 'COD' ||
          order.currentState !== 'PENDING_TRANSPORT_PAYMENT' ||
          order.currency !== 'COP' ||
          order.transportChargeAmount <= 0n ||
          !order.transportRateDecisions.some(({ amount }) => amount === order.transportChargeAmount)
        ) {
          throw new ConflictException('Payment intent requires a resolved COD transport charge');
        }
        const now = new Date();
        const existing = await transaction.paymentIntent.findFirst({
          orderBy: { createdAt: 'desc' },
          where: { orderId: order.id, organizationId: command.organizationId, status: 'PENDING' },
        });
        if (existing !== null) {
          if (existing.expiresAt <= now) {
            throw new ConflictException('Payment intent expiration handling is pending');
          }
          return this.toResult(existing, 'replayed');
        }
        const attemptNumber = 1;
        const externalReference = `cod-${order.id.replaceAll('-', '')}-${attemptNumber}`;
        const expiresAt = new Date(
          now.getTime() + this.environment.wompi.paymentLinkTtlMinutes * 60_000,
        );
        const hostedCheckout = await this.wompi.createHostedCheckout({
          amountMinor: Number(order.transportChargeAmount),
          currency: 'COP',
          expiresAt,
          reference: externalReference,
        });
        if (hostedCheckout.mode !== 'simulation') {
          throw new ServiceUnavailableException('Unexpected Wompi provider mode');
        }
        const storedKey = `${command.organizationId}:${hashSensitive(command.idempotencyKey)}`;
        const intent = await transaction.paymentIntent.create({
          data: {
            abandonmentAction: this.environment.paymentExpiration.defaultAction,
            amount: order.transportChargeAmount,
            attemptNumber,
            checkoutUrl: hostedCheckout.checkoutUrl,
            currency: 'COP',
            expiresAt,
            externalReference,
            idempotencyKey: storedKey,
            orderId: order.id,
            organizationId: command.organizationId,
            provider: 'WOMPI',
            providerCheckoutId: hostedCheckout.providerCheckoutId,
            storeId: order.storeId,
          },
        });
        await transaction.paymentReminder.createMany({
          data: [
            {
              organizationId: command.organizationId,
              paymentIntentId: intent.id,
              scheduledAt: new Date(intent.createdAt.getTime() + 8 * 60 * 60 * 1_000),
              sequence: 1,
              storeId: order.storeId,
            },
            {
              organizationId: command.organizationId,
              paymentIntentId: intent.id,
              scheduledAt: new Date(intent.createdAt.getTime() + 16 * 60 * 60 * 1_000),
              sequence: 2,
              storeId: order.storeId,
            },
          ],
        });
        await transaction.outboxEvent.create({
          data: {
            aggregateId: intent.id,
            aggregateType: 'payment_intent',
            correlationId: this.requestContext.correlationId ?? 'internal',
            eventType: 'payment.intent.created.v1',
            eventVersion: 1,
            organizationId: command.organizationId,
            payloadJson: {
              amountMinor: Number(intent.amount),
              currency: intent.currency,
              expiresAt: intent.expiresAt.toISOString(),
              fixtureVersion: hostedCheckout.fixtureVersion,
              mode: 'simulation',
              orderId: order.id,
              paymentIntentId: intent.id,
              provider: 'wompi',
              storeId: order.storeId,
            },
          },
        });
        return this.toResult(intent, 'created');
      });
      const outcome = replayed ? 'replayed' : result.outcome;
      this.metrics.recordPaymentIntent('create', outcome);
      await this.audit.record({
        action: 'payment_intent.created',
        actorUserId: command.principal.userId,
        metadata: {
          amountMinor: result.amountMinor,
          mode: 'simulation',
          outcome,
          provider: 'wompi',
        },
        organizationId: command.organizationId,
        outcome: 'SUCCESS',
        resourceId: result.intentId,
        resourceType: 'payment_intent',
      });
      return result;
    } catch (error) {
      this.metrics.recordPaymentIntent('create', 'failure');
      await this.audit.record({
        action: 'payment_intent.create_failed',
        actorUserId: command.principal.userId,
        metadata: { mode: 'simulation', provider: 'wompi' },
        organizationId: command.organizationId,
        outcome: 'FAILURE',
        resourceId: command.orderId,
        resourceType: 'payment_intent',
      });
      throw error;
    }
  }

  private async idempotent<T>(
    command: CreatePaymentIntentCommand,
    hash: string,
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<{ readonly replayed: boolean; readonly result: T }> {
    const storedKey = `${command.organizationId}:${hashSensitive(command.idempotencyKey)}`;
    return this.withSerializableRetry(() =>
      this.prisma.$transaction(
        async (transaction) => {
          await transaction.$executeRaw`
            INSERT INTO idempotency_keys (scope, key, request_hash, expires_at)
            VALUES (${CREATE_SCOPE}, ${storedKey}, ${hash}, NOW() + INTERVAL '24 hours')
            ON CONFLICT (scope, key) DO NOTHING
          `;
          const [record] = await transaction.$queryRaw<LockedIdempotencyRow[]>`
            SELECT request_hash, response_snapshot_json, status
            FROM idempotency_keys
            WHERE scope = ${CREATE_SCOPE} AND key = ${storedKey}
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
            where: { scope_key: { key: storedKey, scope: CREATE_SCOPE } },
          });
          return { replayed: false, result };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  private toResult(
    intent: {
      amount: bigint;
      attemptNumber: number;
      checkoutUrl: string;
      currency: string;
      expiresAt: Date;
      externalReference: string;
      id: string;
      orderId: string;
    },
    outcome: PaymentIntentResult['outcome'],
  ): PaymentIntentResult {
    return {
      amountMinor: Number(intent.amount),
      attemptNumber: intent.attemptNumber,
      checkoutUrl: intent.checkoutUrl,
      currency: 'COP',
      expiresAt: intent.expiresAt.toISOString(),
      externalReference: intent.externalReference,
      intentId: intent.id,
      mode: 'simulation',
      orderId: intent.orderId,
      outcome,
      provider: 'wompi',
      status: 'pending',
    };
  }

  private assertEnabled(): void {
    const controls = this.environment.wompi;
    if (!controls.enabled || controls.killSwitch || !controls.simulationMode) {
      throw new ServiceUnavailableException('Wompi payment intent simulation is disabled');
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
    throw new Error('Serializable payment intent retry limit reached');
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
