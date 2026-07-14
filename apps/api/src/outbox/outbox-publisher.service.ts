import { randomUUID } from 'node:crypto';

import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';

import { EnvironmentService } from '../config/environment.service';
import { PrismaService } from '../database/prisma.service';
import { MetricsService } from '../observability/metrics.service';
import { OutboxQueueService } from './outbox-queue.service';
import { outboxDeliveryId, type ClaimedOutboxEvent } from './outbox.types';

@Injectable()
export class OutboxPublisherService implements OnModuleDestroy, OnModuleInit {
  private readonly publisherId = randomUUID();
  private running = false;
  private timer?: NodeJS.Timeout;

  public constructor(
    private readonly environment: EnvironmentService,
    private readonly metrics: MetricsService,
    private readonly prisma: PrismaService,
    private readonly queue: OutboxQueueService,
  ) {}

  public onModuleInit(): void {
    const config = this.environment.outbox;
    if (!config.enabled || config.killSwitch) {
      return;
    }
    this.timer = setInterval(() => void this.publishBatch(), config.pollIntervalMs);
    this.timer.unref();
    void this.publishBatch();
  }

  public onModuleDestroy(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
    }
  }

  public async publishBatch(): Promise<number> {
    if (this.running || this.environment.outbox.killSwitch) {
      return 0;
    }
    this.running = true;
    try {
      const events = await this.claimBatch();
      for (const event of events) {
        await this.publish(event);
      }
      return events.length;
    } finally {
      this.running = false;
    }
  }

  private async claimBatch(): Promise<ClaimedOutboxEvent[]> {
    const config = this.environment.outbox;
    const events = await this.prisma.$queryRaw<ClaimedOutboxEvent[]>`
      WITH candidates AS (
        SELECT id
        FROM outbox_events
        WHERE organization_id IS NOT NULL AND (
          status IN ('pending', 'failed') AND available_at <= NOW()
        ) OR (
          status = 'processing' AND locked_at < NOW() - (${config.leaseMs} * INTERVAL '1 millisecond')
        )
        ORDER BY created_at
        FOR UPDATE SKIP LOCKED
        LIMIT ${config.batchSize}
      )
      UPDATE outbox_events AS event
      SET status = 'processing', locked_at = NOW(), locked_by = ${this.publisherId},
          attempt_count = event.attempt_count + 1
      FROM candidates
      WHERE event.id = candidates.id
      RETURNING event.id, event.aggregate_id, event.event_type, event.payload_json,
                event.correlation_id, event.attempt_count, event.delivery_version,
                event.organization_id
    `;
    events.forEach(() => this.metrics.recordOutbox('claimed'));
    return events;
  }

  private async publish(event: ClaimedOutboxEvent): Promise<void> {
    try {
      await this.queue.enqueue({
        aggregateId: event.aggregate_id,
        correlationId: event.correlation_id,
        deliveryId: outboxDeliveryId(event.id, event.delivery_version),
        deliveryVersion: event.delivery_version,
        eventId: event.id,
        eventType: event.event_type,
        organizationId: event.organization_id,
        payload: event.payload_json,
      });
      await this.prisma.outboxEvent.update({
        data: { lockedAt: null, lockedBy: null, publishedAt: new Date(), status: 'PUBLISHED' },
        where: { id: event.id },
      });
      this.metrics.recordOutbox('published');
    } catch (error) {
      const deadLetter = event.attempt_count >= this.environment.outbox.maxAttempts;
      const retryDelay = this.environment.outbox.retryBaseMs * 2 ** (event.attempt_count - 1);
      await this.prisma.outboxEvent.update({
        data: {
          availableAt: new Date(Date.now() + retryDelay),
          deadLetteredAt: deadLetter ? new Date() : null,
          lastErrorJson: { category: 'queue_unavailable', retryable: !deadLetter },
          lockedAt: null,
          lockedBy: null,
          status: deadLetter ? 'DEAD_LETTER' : 'FAILED',
        },
        where: { id: event.id },
      });
      this.metrics.recordOutbox(deadLetter ? 'dead_letter' : 'failed');
      void error;
    }
  }
}
