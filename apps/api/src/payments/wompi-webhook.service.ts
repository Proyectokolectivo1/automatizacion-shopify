import { createHash, randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { z } from 'zod';

import { EnvironmentService } from '../config/environment.service';
import { PrismaService } from '../database/prisma.service';
import { OrderState, PaymentIntentStatus, Prisma } from '../generated/prisma/client';
import { MetricsService } from '../observability/metrics.service';
import { RequestContextService } from '../observability/request-context.service';
import fixture from './fixtures/wompi-event.v1.json';
import { verifyWompiEventChecksum } from './wompi-event-signature';
import { WOMPI_PROVIDER, type WompiProvider, type WompiTransactionStatus } from './wompi-provider';

const transactionStatus = z.enum(['PENDING', 'APPROVED', 'DECLINED', 'VOIDED', 'ERROR']);
const eventSchema = z
  .object({
    _fixture: z.object({ synthetic: z.literal(true), version: z.literal('v1') }).strict(),
    data: z
      .object({
        transaction: z
          .object({
            amount_in_cents: z.number().int().positive().safe(),
            currency: z.literal('COP'),
            id: z.string().trim().min(1).max(128),
            reference: z.string().trim().min(1).max(255),
            status: transactionStatus,
          })
          .strict(),
      })
      .strict(),
    event: z.literal('transaction.updated'),
    sent_at: z.string().datetime({ offset: true }),
    signature: z
      .object({
        checksum: z.string().regex(/^[a-f0-9]{64}$/u),
        properties: z
          .array(z.string().regex(/^[a-z][a-z0-9_.]{0,127}$/u))
          .min(1)
          .max(20),
      })
      .strict(),
    timestamp: z.number().int().positive().safe(),
  })
  .strict();

export interface WompiWebhookResult {
  readonly accepted: true;
  readonly duplicate: boolean;
  readonly eventId: string;
  readonly intentId: string;
  readonly mode: 'simulation';
  readonly status: Lowercase<WompiTransactionStatus>;
}

@Injectable()
export class WompiWebhookService {
  public constructor(
    private readonly environment: EnvironmentService,
    private readonly metrics: MetricsService,
    private readonly prisma: PrismaService,
    private readonly requestContext: RequestContextService,
    @Inject(WOMPI_PROVIDER) private readonly wompi: WompiProvider,
  ) {}

  public async receive(rawBody: Buffer): Promise<WompiWebhookResult> {
    this.assertEnabled();
    if (rawBody.length === 0) throw new BadRequestException('Webhook body is required');
    if (rawBody.length > this.environment.wompiWebhooks.maxBodyBytes) {
      this.metrics.recordPaymentIntent('webhook', 'body_too_large');
      throw new PayloadTooLargeException('Webhook body exceeds the configured limit');
    }
    const event = this.parse(rawBody);
    const transaction = event.data.transaction;
    const intent = await this.prisma.paymentIntent.findFirst({
      where: { provider: 'WOMPI', providerCheckoutId: transaction.id },
    });
    if (intent === null) {
      this.metrics.recordPaymentIntent('webhook', 'intent_not_found');
      throw new NotFoundException('Wompi webhook target not found');
    }
    const payloadHash = this.sha256(rawBody);
    const externalEventKey = this.sha256(
      Buffer.from(`${event.event}:${event.timestamp}:${transaction.id}`, 'utf8'),
    );
    const duplicate = await this.findReplay(externalEventKey, payloadHash);
    if (duplicate !== null) return duplicate;

    const sentAt = new Date(event.sent_at).getTime();
    const maxSkewMs = this.environment.wompiWebhooks.maxSkewSeconds * 1_000;
    const signatureValid = verifyWompiEventChecksum(
      { data: event.data, properties: event.signature.properties, timestamp: event.timestamp },
      event.signature.checksum,
      fixture.eventSecret,
    );
    if (Math.abs(Date.now() - sentAt) > maxSkewMs || Math.abs(sentAt - event.timestamp) > 1_000) {
      await this.persistRejected(
        intent,
        event,
        externalEventKey,
        payloadHash,
        signatureValid,
        'stale_event',
      );
      this.metrics.recordPaymentIntent('webhook', 'stale_event');
      throw new UnauthorizedException('Invalid Wompi webhook');
    }
    if (!signatureValid) {
      await this.persistRejected(
        intent,
        event,
        externalEventKey,
        payloadHash,
        false,
        'invalid_signature',
      );
      this.metrics.recordPaymentIntent('webhook', 'invalid_signature');
      throw new UnauthorizedException('Invalid Wompi webhook');
    }

    let authoritative;
    try {
      authoritative = await this.wompi.getTransaction(transaction.id);
    } catch {
      this.metrics.recordPaymentIntent('webhook', 'provider_unavailable');
      throw new ServiceUnavailableException('Wompi authoritative status is unavailable');
    }
    if (
      authoritative.id !== transaction.id ||
      authoritative.reference !== transaction.reference ||
      authoritative.amountMinor !== transaction.amount_in_cents ||
      authoritative.currency !== transaction.currency ||
      authoritative.status !== transaction.status ||
      authoritative.reference !== intent.externalReference ||
      BigInt(authoritative.amountMinor) !== intent.amount ||
      authoritative.currency !== intent.currency
    ) {
      await this.persistRejected(
        intent,
        event,
        externalEventKey,
        payloadHash,
        true,
        'provider_mismatch',
      );
      this.metrics.recordPaymentIntent('webhook', 'provider_mismatch');
      throw new ConflictException('Wompi event does not match authoritative transaction');
    }

    const result = await this.accept(intent, event, externalEventKey, payloadHash);
    this.metrics.recordPaymentIntent('webhook', result.duplicate ? 'duplicate' : 'accepted');
    return result;
  }

  private async accept(
    intent: { id: string; organizationId: string; status: PaymentIntentStatus; storeId: string },
    event: z.infer<typeof eventSchema>,
    externalEventKey: string,
    payloadHash: string,
  ): Promise<WompiWebhookResult> {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        await transaction.$executeRaw`
          SELECT id FROM payment_intents WHERE id = ${intent.id}::uuid FOR UPDATE
        `;
        await transaction.$executeRaw`
          SELECT pg_advisory_xact_lock(hashtextextended(${'wompi.webhook:' + intent.id}, 0))
        `;
        const current = await transaction.paymentIntent.findUniqueOrThrow({
          where: { id: intent.id },
        });
        const eventId = randomUUID();
        const nextStatus = this.toIntentStatus(event.data.transaction.status);
        await transaction.paymentProviderEvent.create({
          data: {
            eventType: event.event,
            externalEventKey,
            id: eventId,
            organizationId: intent.organizationId,
            payloadHash,
            payloadRedactedJson: this.redacted(event),
            paymentIntentId: intent.id,
            providerStatus: nextStatus,
            providerTransactionId: event.data.transaction.id,
            signatureValid: true,
            status: 'ACCEPTED',
            storeId: intent.storeId,
          },
        });
        if (current.status !== nextStatus) {
          const transitionedAt = new Date();
          if (current.status !== PaymentIntentStatus.PENDING) {
            await this.recordLateTerminalStatus(
              transaction,
              current,
              nextStatus,
              externalEventKey,
              transitionedAt,
            );
            return this.result(eventId, intent.id, event.data.transaction.status, false);
          }
          await transaction.paymentIntent.update({
            data: { status: nextStatus },
            where: { id: intent.id },
          });
          if (nextStatus !== PaymentIntentStatus.PENDING) {
            const cancelled = await transaction.paymentReminder.updateMany({
              data: {
                cancellationReason: 'intent_not_pending',
                cancelledAt: transitionedAt,
                status: 'CANCELLED',
              },
              where: { paymentIntentId: intent.id, status: 'SCHEDULED' },
            });
            if (cancelled.count > 0) {
              await transaction.auditLog.create({
                data: {
                  action: 'payment_reminders.cancelled',
                  correlationId: this.requestContext.correlationId ?? randomUUID(),
                  metadataJson: {
                    count: cancelled.count,
                    mode: 'simulation',
                    reason: 'intent_not_pending',
                  },
                  organizationId: intent.organizationId,
                  outcome: 'SUCCESS',
                  resourceId: intent.id,
                  resourceType: 'payment_intent',
                },
              });
            }
          }
          await transaction.outboxEvent.create({
            data: {
              aggregateId: intent.id,
              aggregateType: 'payment_intent',
              causationId: externalEventKey,
              correlationId: this.requestContext.correlationId ?? randomUUID(),
              eventType: 'payment.intent.status-updated.v1',
              eventVersion: 1,
              organizationId: intent.organizationId,
              payloadJson: {
                mode: 'simulation',
                paymentIntentId: intent.id,
                provider: 'wompi',
                status: event.data.transaction.status.toLowerCase(),
                storeId: intent.storeId,
              },
            },
          });
        }
        return this.result(eventId, intent.id, event.data.transaction.status, false);
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002')
        throw error;
      const replay = await this.findReplay(externalEventKey, payloadHash);
      if (replay === null) throw error;
      return replay;
    }
  }

  private async recordLateTerminalStatus(
    transaction: Prisma.TransactionClient,
    intent: {
      id: string;
      orderId: string;
      organizationId: string;
      status: PaymentIntentStatus;
      storeId: string;
    },
    observedStatus: PaymentIntentStatus,
    externalEventKey: string,
    observedAt: Date,
  ): Promise<void> {
    const correlationId = this.requestContext.correlationId ?? randomUUID();
    let manualReview = false;
    if (
      intent.status === PaymentIntentStatus.EXPIRED &&
      observedStatus === PaymentIntentStatus.APPROVED
    ) {
      const [order] = await transaction.$queryRaw<Array<{ current_state: string }>>`
        SELECT current_state::text
        FROM orders
        WHERE id = ${intent.orderId}::uuid
        FOR UPDATE
      `;
      if (
        order !== undefined &&
        [
          'abandono_pago_transporte',
          'pending_transport_payment',
          'transport_payment_expired',
        ].includes(order.current_state)
      ) {
        const fromState = this.toOrderState(order.current_state);
        await transaction.order.update({
          data: { currentState: 'MANUAL_REVIEW', version: { increment: 1 } },
          where: { id: intent.orderId },
        });
        await transaction.orderStateHistory.create({
          data: {
            fromState,
            metadataJson: {
              actorType: 'system',
              correlationId,
              currentPaymentStatus: intent.status.toLowerCase(),
              mode: 'simulation',
              observedPaymentStatus: observedStatus.toLowerCase(),
              paymentIntentId: intent.id,
            },
            orderId: intent.orderId,
            organizationId: intent.organizationId,
            reason: 'late_approved_payment_requires_manual_review',
            storeId: intent.storeId,
            toState: 'MANUAL_REVIEW',
            triggerId: externalEventKey,
            triggerType: 'wompi_provider_event',
          },
        });
        manualReview = true;
      }
    }
    await transaction.outboxEvent.create({
      data: {
        aggregateId: intent.id,
        aggregateType: 'payment_intent',
        causationId: externalEventKey,
        correlationId,
        eventType: 'payment.intent.late-status-observed.v1',
        eventVersion: 1,
        organizationId: intent.organizationId,
        payloadJson: {
          currentStatus: intent.status.toLowerCase(),
          manualReview,
          mode: 'simulation',
          observedAt: observedAt.toISOString(),
          observedStatus: observedStatus.toLowerCase(),
          orderId: intent.orderId,
          paymentIntentId: intent.id,
          provider: 'wompi',
          storeId: intent.storeId,
        },
      },
    });
    await transaction.auditLog.create({
      data: {
        action: 'payment_intent.late_status_observed',
        correlationId,
        metadataJson: {
          currentStatus: intent.status.toLowerCase(),
          manualReview,
          mode: 'simulation',
          observedStatus: observedStatus.toLowerCase(),
          provider: 'wompi',
        },
        organizationId: intent.organizationId,
        outcome: 'SUCCESS',
        resourceId: intent.id,
        resourceType: 'payment_intent',
      },
    });
  }

  private toOrderState(value: string): OrderState {
    if (value === 'abandono_pago_transporte') return OrderState.ABANDONO_PAGO_TRANSPORTE;
    if (value === 'pending_transport_payment') return OrderState.PENDING_TRANSPORT_PAYMENT;
    if (value === 'transport_payment_expired') return OrderState.TRANSPORT_PAYMENT_EXPIRED;
    throw new Error(`Unsupported order state: ${value}`);
  }

  private async persistRejected(
    intent: { id: string; organizationId: string; storeId: string },
    event: z.infer<typeof eventSchema>,
    externalEventKey: string,
    payloadHash: string,
    signatureValid: boolean,
    reason: string,
  ): Promise<void> {
    try {
      await this.prisma.paymentProviderEvent.create({
        data: {
          eventType: event.event,
          externalEventKey,
          organizationId: intent.organizationId,
          payloadHash,
          payloadRedactedJson: this.redacted(event),
          paymentIntentId: intent.id,
          providerStatus: this.toIntentStatus(event.data.transaction.status),
          providerTransactionId: event.data.transaction.id,
          rejectionReason: reason,
          signatureValid,
          status: 'REJECTED',
          storeId: intent.storeId,
        },
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002')
        throw error;
      const existing = await this.prisma.paymentProviderEvent.findUnique({
        where: { provider_externalEventKey: { externalEventKey, provider: 'WOMPI' } },
      });
      if (existing?.payloadHash !== payloadHash) {
        throw new ConflictException('Wompi event key was reused with another payload');
      }
    }
  }

  private async findReplay(
    externalEventKey: string,
    payloadHash: string,
  ): Promise<WompiWebhookResult | null> {
    const existing = await this.prisma.paymentProviderEvent.findUnique({
      where: { provider_externalEventKey: { externalEventKey, provider: 'WOMPI' } },
    });
    if (existing === null) return null;
    if (existing.payloadHash !== payloadHash) {
      throw new ConflictException('Wompi event key was reused with another payload');
    }
    if (existing.status !== 'ACCEPTED') {
      throw new ConflictException('Rejected Wompi event cannot be replayed');
    }
    return this.result(
      existing.id,
      existing.paymentIntentId,
      this.fromIntentStatus(existing.providerStatus),
      true,
    );
  }

  private parse(rawBody: Buffer): z.infer<typeof eventSchema> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody.toString('utf8')) as unknown;
    } catch {
      throw new BadRequestException('Invalid Wompi webhook JSON');
    }
    const result = eventSchema.safeParse(parsed);
    if (!result.success) {
      throw new BadRequestException('Only versioned synthetic Wompi fixtures are accepted');
    }
    return result.data;
  }

  private assertEnabled(): void {
    const provider = this.environment.wompi;
    const webhooks = this.environment.wompiWebhooks;
    if (
      !provider.enabled ||
      provider.killSwitch ||
      !provider.simulationMode ||
      !webhooks.enabled ||
      webhooks.killSwitch
    ) {
      throw new ServiceUnavailableException('Wompi webhook simulation is disabled');
    }
  }

  private redacted(event: z.infer<typeof eventSchema>): Prisma.InputJsonValue {
    return {
      fixtureVersion: event._fixture.version,
      status: event.data.transaction.status,
      synthetic: true,
      transactionIdHash: this.sha256(Buffer.from(event.data.transaction.id, 'utf8')),
    };
  }

  private result(
    eventId: string,
    intentId: string,
    status: WompiTransactionStatus,
    duplicate: boolean,
  ): WompiWebhookResult {
    return {
      accepted: true,
      duplicate,
      eventId,
      intentId,
      mode: 'simulation',
      status: status.toLowerCase() as Lowercase<WompiTransactionStatus>,
    };
  }

  private toIntentStatus(status: WompiTransactionStatus): PaymentIntentStatus {
    return PaymentIntentStatus[status];
  }

  private fromIntentStatus(status: PaymentIntentStatus): WompiTransactionStatus {
    if (status === PaymentIntentStatus.EXPIRED) throw new Error('Wompi does not report EXPIRED');
    return status;
  }

  private sha256(value: Buffer): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
