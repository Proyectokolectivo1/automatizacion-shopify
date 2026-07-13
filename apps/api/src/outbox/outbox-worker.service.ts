import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Job, Queue, Worker } from 'bullmq';

import { EnvironmentService } from '../config/environment.service';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import type { OutboxJobData } from './outbox.types';

@Injectable()
export class OutboxWorkerService implements OnModuleDestroy, OnModuleInit {
  private deadLetterQueue?: Queue<OutboxJobData>;
  private worker?: Worker<OutboxJobData>;

  public constructor(
    private readonly environment: EnvironmentService,
    private readonly prisma: PrismaService,
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
      if (!this.environment.outbox.simulationMode) {
        throw new Error('No external event adapter is enabled');
      }
      const payload = job.data.payload;
      if (
        payload !== null &&
        typeof payload === 'object' &&
        !Array.isArray(payload) &&
        payload.simulateFailure === true
      ) {
        throw new Error('Simulated consumer failure');
      }
      await this.markCompleted(job);
    } catch (error) {
      const finalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      await this.markFailed(job, finalAttempt);
      throw error;
    }
  }

  private async markActive(job: Job<OutboxJobData>): Promise<void> {
    await this.prisma.jobExecution.upsert({
      create: {
        aggregateId: job.data.aggregateId,
        attempt: job.attemptsMade + 1,
        correlationId: job.data.correlationId,
        jobId: job.data.eventId,
        jobName: job.name,
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
          jobId: job.data.eventId,
          queueName: this.environment.outbox.queueName,
        },
      },
    });
  }

  private async markCompleted(job: Job<OutboxJobData>): Promise<void> {
    await this.prisma.jobExecution.update({
      data: { completedAt: new Date(), status: 'COMPLETED' },
      where: {
        queueName_jobId: {
          jobId: job.data.eventId,
          queueName: this.environment.outbox.queueName,
        },
      },
    });
  }

  private async markFailed(job: Job<OutboxJobData>, finalAttempt: boolean): Promise<void> {
    await this.prisma.jobExecution.update({
      data: {
        completedAt: finalAttempt ? new Date() : null,
        errorJson: { category: 'consumer_failure', retryable: !finalAttempt },
        status: finalAttempt ? 'DEAD_LETTER' : 'FAILED',
      },
      where: {
        queueName_jobId: {
          jobId: job.data.eventId,
          queueName: this.environment.outbox.queueName,
        },
      },
    });
    if (finalAttempt) {
      await this.deadLetterQueue?.add(job.name, job.data, {
        jobId: job.data.eventId,
        removeOnComplete: false,
        removeOnFail: false,
      });
    }
  }
}
