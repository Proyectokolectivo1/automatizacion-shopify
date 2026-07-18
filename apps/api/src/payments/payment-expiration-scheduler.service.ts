import { randomUUID } from 'node:crypto';

import {
  Injectable,
  ServiceUnavailableException,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';

import { EnvironmentService } from '../config/environment.service';
import { PrismaService } from '../database/prisma.service';
import { MetricsService } from '../observability/metrics.service';

interface LockedPaymentIntent {
  abandonment_action: 'cancel' | 'mark';
  expires_at: Date;
  organization_id: string;
  order_id: string;
  order_state:
    | 'abandono_pago_transporte'
    | 'cancelled'
    | 'invalid_data'
    | 'manual_review'
    | 'pending_transport_payment'
    | 'ready_for_logistics'
    | 'ready_for_payment_classification'
    | 'received'
    | 'transport_payment_expired'
    | 'validating';
  payment_intent_id: string;
  store_id: string;
}

export interface PaymentExpirationBatchResult {
  readonly cancellationRequested: number;
  readonly expired: number;
  readonly marked: number;
  readonly skippedOrders: number;
}

@Injectable()
export class PaymentExpirationSchedulerService implements OnModuleDestroy, OnModuleInit {
  private timer?: NodeJS.Timeout;

  public constructor(
    private readonly environment: EnvironmentService,
    private readonly metrics: MetricsService,
    private readonly prisma: PrismaService,
  ) {}

  public onModuleInit(): void {
    const config = this.environment.paymentExpiration;
    if (!config.enabled || config.killSwitch || !config.simulationMode) return;
    this.timer = setInterval(
      () =>
        void this.processDue().catch(() =>
          this.metrics.recordPaymentIntent('expiration', 'failure'),
        ),
      config.pollIntervalMs,
    );
    this.timer.unref();
    void this.processDue().catch(() => this.metrics.recordPaymentIntent('expiration', 'failure'));
  }

  public onModuleDestroy(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
  }

  public async processDue(now = new Date()): Promise<PaymentExpirationBatchResult> {
    this.assertEnabled();
    if (!Number.isFinite(now.getTime())) throw new Error('Invalid payment expiration time');
    const result = await this.prisma.$transaction(async (transaction) => {
      const intents = await transaction.$queryRaw<LockedPaymentIntent[]>`
        SELECT intent.id AS payment_intent_id,
               intent.organization_id,
               intent.store_id,
               intent.order_id,
               intent.expires_at,
               intent.abandonment_action::text,
               customer_order.current_state::text AS order_state
        FROM payment_intents AS intent
        INNER JOIN orders AS customer_order
          ON customer_order.organization_id = intent.organization_id
         AND customer_order.store_id = intent.store_id
         AND customer_order.id = intent.order_id
        WHERE intent.status = 'pending' AND intent.expires_at <= ${now}
        ORDER BY intent.expires_at, intent.id
        FOR UPDATE OF intent, customer_order SKIP LOCKED
        LIMIT ${this.environment.paymentExpiration.batchSize}
      `;
      let cancellationRequested = 0;
      let marked = 0;
      let skippedOrders = 0;
      for (const intent of intents) {
        const correlationId = randomUUID();
        const triggerId = `payment-expiration:${intent.payment_intent_id}`;
        await transaction.paymentIntent.update({
          data: { expiredAt: now, status: 'EXPIRED' },
          where: { id: intent.payment_intent_id },
        });
        const cancelledReminders = await transaction.paymentReminder.updateMany({
          data: {
            cancellationReason: 'intent_expired',
            cancelledAt: now,
            status: 'CANCELLED',
          },
          where: { paymentIntentId: intent.payment_intent_id, status: 'SCHEDULED' },
        });
        const transitioned = intent.order_state === 'pending_transport_payment';
        if (transitioned) {
          const metadata = {
            abandonmentAction: intent.abandonment_action,
            actorType: 'system',
            correlationId,
            mode: 'simulation',
            paymentIntentId: intent.payment_intent_id,
          };
          await transaction.orderStateHistory.createMany({
            data: [
              {
                fromState: 'PENDING_TRANSPORT_PAYMENT',
                metadataJson: metadata,
                orderId: intent.order_id,
                organizationId: intent.organization_id,
                reason: 'transport_payment_expired_after_24_hours',
                storeId: intent.store_id,
                toState: 'TRANSPORT_PAYMENT_EXPIRED',
                triggerId,
                triggerType: 'payment_expiration',
              },
              {
                fromState: 'TRANSPORT_PAYMENT_EXPIRED',
                metadataJson: metadata,
                orderId: intent.order_id,
                organizationId: intent.organization_id,
                reason: 'transport_payment_abandonment_registered',
                storeId: intent.store_id,
                toState: 'ABANDONO_PAGO_TRANSPORTE',
                triggerId,
                triggerType: 'payment_expiration',
              },
            ],
          });
          await transaction.order.update({
            data: { currentState: 'ABANDONO_PAGO_TRANSPORTE', version: { increment: 1 } },
            where: { id: intent.order_id },
          });
          await transaction.outboxEvent.create({
            data: {
              aggregateId: intent.order_id,
              aggregateType: 'order',
              causationId: intent.payment_intent_id,
              correlationId,
              eventType: 'shopify.order.abandonment-action.requested.v1',
              eventVersion: 1,
              organizationId: intent.organization_id,
              payloadJson: {
                action: intent.abandonment_action,
                mode: 'simulation',
                orderId: intent.order_id,
                paymentIntentId: intent.payment_intent_id,
                storeId: intent.store_id,
              },
            },
          });
          if (intent.abandonment_action === 'cancel') cancellationRequested += 1;
          else marked += 1;
        } else {
          skippedOrders += 1;
        }
        await transaction.outboxEvent.create({
          data: {
            aggregateId: intent.payment_intent_id,
            aggregateType: 'payment_intent',
            causationId: triggerId,
            correlationId,
            eventType: 'payment.intent.expired.v1',
            eventVersion: 1,
            organizationId: intent.organization_id,
            payloadJson: {
              abandonmentAction: intent.abandonment_action,
              expiredAt: now.toISOString(),
              mode: 'simulation',
              orderId: intent.order_id,
              paymentIntentId: intent.payment_intent_id,
              remindersCancelled: cancelledReminders.count,
              storeId: intent.store_id,
            },
          },
        });
        await transaction.auditLog.create({
          data: {
            action: 'payment_intent.expired',
            correlationId,
            metadataJson: {
              abandonmentAction: intent.abandonment_action,
              mode: 'simulation',
              orderTransitioned: transitioned,
              remindersCancelled: cancelledReminders.count,
            },
            organizationId: intent.organization_id,
            outcome: 'SUCCESS',
            resourceId: intent.payment_intent_id,
            resourceType: 'payment_intent',
          },
        });
      }
      return { cancellationRequested, expired: intents.length, marked, skippedOrders };
    });
    for (let index = 0; index < result.expired; index += 1) {
      this.metrics.recordPaymentIntent('expiration', 'expired');
    }
    for (let index = 0; index < result.marked; index += 1) {
      this.metrics.recordPaymentIntent('expiration', 'marked');
    }
    for (let index = 0; index < result.cancellationRequested; index += 1) {
      this.metrics.recordPaymentIntent('expiration', 'cancellation_requested');
    }
    for (let index = 0; index < result.skippedOrders; index += 1) {
      this.metrics.recordPaymentIntent('expiration', 'order_state_skipped');
    }
    return result;
  }

  private assertEnabled(): void {
    const config = this.environment.paymentExpiration;
    if (!config.enabled || config.killSwitch || !config.simulationMode) {
      throw new ServiceUnavailableException('Payment expiration simulation is disabled');
    }
  }
}
