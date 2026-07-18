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

interface LockedReminder {
  expires_at: Date;
  organization_id: string;
  payment_intent_id: string;
  payment_intent_status: 'approved' | 'declined' | 'error' | 'expired' | 'pending' | 'voided';
  reminder_id: string;
  scheduled_at: Date;
  sequence: number;
  store_id: string;
}

export interface PaymentReminderBatchResult {
  readonly cancelled: number;
  readonly requested: number;
}

@Injectable()
export class PaymentReminderSchedulerService implements OnModuleDestroy, OnModuleInit {
  private timer?: NodeJS.Timeout;

  public constructor(
    private readonly environment: EnvironmentService,
    private readonly metrics: MetricsService,
    private readonly prisma: PrismaService,
  ) {}

  public onModuleInit(): void {
    const config = this.environment.paymentReminders;
    if (!config.enabled || config.killSwitch || !config.simulationMode) return;
    this.timer = setInterval(
      () =>
        void this.processDue().catch(() => this.metrics.recordPaymentIntent('reminder', 'failure')),
      config.pollIntervalMs,
    );
    this.timer.unref();
    void this.processDue().catch(() => this.metrics.recordPaymentIntent('reminder', 'failure'));
  }

  public onModuleDestroy(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
  }

  public async processDue(now = new Date()): Promise<PaymentReminderBatchResult> {
    this.assertEnabled();
    if (!Number.isFinite(now.getTime())) throw new Error('Invalid reminder processing time');
    const result = await this.prisma.$transaction(async (transaction) => {
      const reminders = await transaction.$queryRaw<LockedReminder[]>`
        SELECT reminder.id AS reminder_id,
               reminder.organization_id,
               reminder.store_id,
               reminder.payment_intent_id,
               reminder.sequence,
               reminder.scheduled_at,
               intent.status::text AS payment_intent_status,
               intent.expires_at
        FROM payment_reminders AS reminder
        INNER JOIN payment_intents AS intent ON intent.id = reminder.payment_intent_id
        WHERE reminder.status = 'scheduled' AND reminder.scheduled_at <= ${now}
        ORDER BY reminder.scheduled_at, reminder.id
        FOR UPDATE OF intent SKIP LOCKED
        LIMIT ${this.environment.paymentReminders.batchSize}
      `;
      let cancelled = 0;
      let requested = 0;
      for (const reminder of reminders) {
        if (reminder.payment_intent_status !== 'pending' || reminder.expires_at <= now) {
          const reason =
            reminder.payment_intent_status === 'pending' ? 'intent_expired' : 'intent_not_pending';
          await transaction.paymentReminder.update({
            data: { cancellationReason: reason, cancelledAt: now, status: 'CANCELLED' },
            where: { id: reminder.reminder_id },
          });
          await transaction.auditLog.create({
            data: {
              action: 'payment_reminder.cancelled',
              correlationId: randomUUID(),
              metadataJson: { mode: 'simulation', reason, sequence: reminder.sequence },
              organizationId: reminder.organization_id,
              outcome: 'SUCCESS',
              resourceId: reminder.reminder_id,
              resourceType: 'payment_reminder',
            },
          });
          cancelled += 1;
          continue;
        }
        await transaction.paymentReminder.update({
          data: { requestedAt: now, status: 'REQUESTED' },
          where: { id: reminder.reminder_id },
        });
        await transaction.outboxEvent.create({
          data: {
            aggregateId: reminder.reminder_id,
            aggregateType: 'payment_reminder',
            correlationId: randomUUID(),
            eventType: 'payment.reminder.requested.v1',
            eventVersion: 1,
            organizationId: reminder.organization_id,
            payloadJson: {
              mode: 'simulation',
              paymentIntentId: reminder.payment_intent_id,
              provider: 'wompi',
              reminderId: reminder.reminder_id,
              scheduledAt: reminder.scheduled_at.toISOString(),
              sequence: reminder.sequence,
              storeId: reminder.store_id,
            },
          },
        });
        await transaction.auditLog.create({
          data: {
            action: 'payment_reminder.requested',
            correlationId: randomUUID(),
            metadataJson: { mode: 'simulation', sequence: reminder.sequence },
            organizationId: reminder.organization_id,
            outcome: 'SUCCESS',
            resourceId: reminder.reminder_id,
            resourceType: 'payment_reminder',
          },
        });
        requested += 1;
      }
      return { cancelled, requested };
    });
    for (let index = 0; index < result.requested; index += 1) {
      this.metrics.recordPaymentIntent('reminder', 'requested');
    }
    for (let index = 0; index < result.cancelled; index += 1) {
      this.metrics.recordPaymentIntent('reminder', 'cancelled');
    }
    return result;
  }

  private assertEnabled(): void {
    const config = this.environment.paymentReminders;
    if (!config.enabled || config.killSwitch || !config.simulationMode) {
      throw new ServiceUnavailableException('Payment reminder simulation is disabled');
    }
  }
}
