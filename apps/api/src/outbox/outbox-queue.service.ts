import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';

import { EnvironmentService } from '../config/environment.service';
import type { OutboxJobData } from './outbox.types';

@Injectable()
export class OutboxQueueService implements OnModuleDestroy {
  private queue?: Queue<OutboxJobData>;

  public constructor(private readonly environment: EnvironmentService) {}

  public async enqueue(data: OutboxJobData): Promise<void> {
    this.queue ??= this.createQueue();
    await this.queue.add(data.eventType, data, { jobId: data.deliveryId });
  }

  public async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
  }

  private createQueue(): Queue<OutboxJobData> {
    const redis = this.environment.redis;
    const queue = new Queue<OutboxJobData>(this.environment.outbox.queueName, {
      connection: {
        connectTimeout: this.environment.dependencyTimeoutMs,
        enableOfflineQueue: false,
        host: redis.host,
        maxRetriesPerRequest: 1,
        password: redis.password,
        port: redis.port,
        retryStrategy: () => null,
      },
      defaultJobOptions: {
        attempts: this.environment.outbox.maxAttempts,
        backoff: { delay: this.environment.outbox.retryBaseMs, type: 'exponential' },
        removeOnComplete: { age: 86_400, count: 10_000 },
        removeOnFail: { age: 604_800, count: 50_000 },
      },
    });
    queue.on('error', () => undefined);
    return queue;
  }
}
