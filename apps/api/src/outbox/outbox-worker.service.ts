import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Job, Queue, Worker } from 'bullmq';

import { EnvironmentService } from '../config/environment.service';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { OrderClassificationService } from '../orders/order-classification.service';
import { ShopifyOrderSyncService } from '../shopify/shopify-order-sync.service';
import { ShopifyOrderActionService } from '../shopify/shopify-order-action.service';
import type { OutboxJobData } from './outbox.types';

@Injectable()
export class OutboxWorkerService implements OnModuleDestroy, OnModuleInit {
  private deadLetterQueue?: Queue<OutboxJobData>;
  private worker?: Worker<OutboxJobData>;

  public constructor(
    private readonly environment: EnvironmentService,
    private readonly prisma: PrismaService,
    private readonly shopifyOrderSync?: ShopifyOrderSyncService,
    private readonly orderClassification?: OrderClassificationService,
    private readonly shopifyOrderAction?: ShopifyOrderActionService,
  ) {}

  public onModuleInit(): void {
    const config = this.environment.outbox;
    if (!config.enabled || config.killSwitch) {
      return;
    }
    const redis = this.environment.redis;
    const connection = {
      host: redis.host,
      maxRetriesPerRequest: null,
      password: redis.password,
      port: redis.port,
    };
    this.deadLetterQueue = new Queue<OutboxJobData>(config.dlqName, { connection });
    this.worker = new Worker<OutboxJobData>(config.queueName, async (job) => this.process(job), {
      connection,
      concurrency: config.batchSize,
    });
    this.worker.on('error', () => undefined);
    this.deadLetterQueue.on('error', () => undefined);
  }

  public async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.deadLetterQueue?.close();
  }

  private async process(job: Job<OutboxJobData>): Promise<void> {
    await this.markActive(job);
    try {
      const payload = job.data.payload;
      if (
        payload !== null &&
        typeof payload === 'object' &&
        !Array.isArray(payload) &&
        payload.simulateFailure === true
      ) {
        throw new Error('Simulated consumer failure');
      }
      if (this.isShopifyWebhook(job)) {
        if (this.shopifyOrderSync === undefined) {
          throw new Error('Shopify order sync consumer is not configured');
        }
        await this.shopifyOrderSync.syncFromWebhook({
          correlationId: job.data.correlationId,
          organizationId: job.data.organizationId,
          webhookEventId: job.data.aggregateId,
        });
      }
      if (this.isOrderSynchronized(job)) {
        if (this.orderClassification === undefined) {
          throw new Error('Order classification consumer is not configured');
        }
        await this.orderClassification.classify({
          correlationId: job.data.correlationId,
          eventId: job.data.eventId,
          orderId: job.data.aggregateId,
          organizationId: job.data.organizationId,
        });
      }
      if (this.isShopifyOrderAction(job)) {
        if (this.shopifyOrderAction === undefined) {
          throw new Error('Shopify order action consumer is not configured');
        }
        await this.shopifyOrderAction.apply({
          correlationId: job.data.correlationId,
          eventId: job.data.eventId,
          organizationId: job.data.organizationId,
        });
      }
      await this.markCompleted(job);
    } catch (error) {
      const finalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      await this.markFailed(job, finalAttempt);
      throw error;
    }
  }

  private async markActive(job: Job<OutboxJobData>): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.jobExecution.upsert({
        create: {
          aggregateId: job.data.aggregateId,
          attempt: job.attemptsMade + 1,
          correlationId: job.data.correlationId,
          eventId: job.data.eventId,
          jobId: job.data.deliveryId,
          jobName: job.name,
          organizationId: job.data.organizationId,
          queueName: this.environment.outbox.queueName,
          startedAt: new Date(),
          status: 'ACTIVE',
        },
        update: {
          attempt: job.attemptsMade + 1,
          errorJson: Prisma.DbNull,
          startedAt: new Date(),
          status: 'ACTIVE',
        },
        where: {
          queueName_jobId: {
            jobId: job.data.deliveryId,
            queueName: this.environment.outbox.queueName,
          },
        },
      });
      if (this.isShopifyWebhook(job)) {
        await transaction.webhookEvent.updateMany({
          data: { attemptCount: job.attemptsMade + 1, status: 'PROCESSING' },
          where: { id: job.data.aggregateId, organizationId: job.data.organizationId },
        });
      }
    });
  }

  private async markCompleted(job: Job<OutboxJobData>): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const completedAt = new Date();
      await transaction.jobExecution.update({
        data: { completedAt, status: 'COMPLETED' },
        where: {
          queueName_jobId: {
            jobId: job.data.deliveryId,
            queueName: this.environment.outbox.queueName,
          },
        },
      });
      if (this.isShopifyWebhook(job)) {
        await transaction.webhookEvent.updateMany({
          data: {
            errorCode: null,
            errorMessage: null,
            processedAt: completedAt,
            status: 'PROCESSED',
          },
          where: { id: job.data.aggregateId, organizationId: job.data.organizationId },
        });
      }
    });
  }

  private async markFailed(job: Job<OutboxJobData>, finalAttempt: boolean): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.jobExecution.update({
        data: {
          completedAt: finalAttempt ? new Date() : null,
          errorJson: { category: 'consumer_failure', retryable: !finalAttempt },
          status: finalAttempt ? 'DEAD_LETTER' : 'FAILED',
        },
        where: {
          queueName_jobId: {
            jobId: job.data.deliveryId,
            queueName: this.environment.outbox.queueName,
          },
        },
      });
      if (finalAttempt) {
        await transaction.outboxEvent.updateMany({
          data: {
            deadLetteredAt: new Date(),
            lastErrorJson: { category: 'consumer_failure', retryable: false },
            lockedAt: null,
            lockedBy: null,
            publishedAt: null,
            status: 'DEAD_LETTER',
          },
          where: {
            deliveryVersion: job.data.deliveryVersion,
            id: job.data.eventId,
            organizationId: job.data.organizationId,
          },
        });
      }
      if (this.isShopifyWebhook(job)) {
        await transaction.webhookEvent.updateMany({
          data: {
            attemptCount: job.attemptsMade + 1,
            errorCode: 'consumer_failure',
            errorMessage: 'Webhook consumer failed',
            processedAt: finalAttempt ? new Date() : null,
            status: finalAttempt ? 'DEAD_LETTER' : 'FAILED',
          },
          where: { id: job.data.aggregateId, organizationId: job.data.organizationId },
        });
      }
    });
    if (finalAttempt) {
      await this.deadLetterQueue?.add(job.name, job.data, {
        jobId: job.data.deliveryId,
        removeOnComplete: false,
        removeOnFail: false,
      });
    }
  }

  private isShopifyWebhook(job: Job<OutboxJobData>): boolean {
    return job.name === 'shopify.webhook.received.v1';
  }

  private isOrderSynchronized(job: Job<OutboxJobData>): boolean {
    return job.name === 'shopify.order.synchronized.v1';
  }

  private isShopifyOrderAction(job: Job<OutboxJobData>): boolean {
    return job.name === 'shopify.order.abandonment-action.requested.v1';
  }
}
