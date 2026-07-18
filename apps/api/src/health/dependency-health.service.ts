import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { createClient, type RedisClientType } from 'redis';

import { EnvironmentService } from '../config/environment.service';
import { PrismaService } from '../database/prisma.service';
import type { DependencyStatus } from '../foundation/dependency-status';
import { AppLoggerService } from '../observability/app-logger.service';
import { MetricsService } from '../observability/metrics.service';
import { AlertingService } from '../observability/alerting.service';

export interface ReadinessStatus {
  readonly dependencies: readonly DependencyStatus[];
  readonly status: 'degraded' | 'ready';
  readonly timestamp: string;
}

@Injectable()
export class DependencyHealthService implements OnModuleDestroy {
  private redisClient: RedisClientType;

  public constructor(
    private readonly alerting: AlertingService,
    private readonly environment: EnvironmentService,
    private readonly logger: AppLoggerService,
    private readonly metrics: MetricsService,
    private readonly prisma: PrismaService,
  ) {
    this.redisClient = this.createRedisClient();
  }

  public async getReadiness(): Promise<ReadinessStatus> {
    const dependencies = await Promise.all([
      this.check('postgres', () => this.prisma.$queryRaw`SELECT 1`),
      this.check('redis', () => this.pingRedis()),
      this.check('minio', () => this.pingMinio()),
    ]);
    const ready = dependencies.every((dependency) => dependency.status === 'up');
    await this.alerting.observeDependencies(dependencies);

    return {
      dependencies,
      status: ready ? 'ready' : 'degraded',
      timestamp: new Date().toISOString(),
    };
  }

  public onModuleDestroy(): void {
    if (this.redisClient.isOpen) {
      this.redisClient.destroy();
    }
  }

  private async check(
    name: DependencyStatus['name'],
    operation: () => Promise<unknown>,
  ): Promise<DependencyStatus> {
    const startedAt = process.hrtime.bigint();
    try {
      await this.withTimeout(operation(), this.environment.dependencyTimeoutMs);
      const latencyMs = this.elapsedMilliseconds(startedAt);
      this.metrics.setDependencyReady(name, true);
      return { latencyMs, name, status: 'up' };
    } catch (error) {
      const latencyMs = this.elapsedMilliseconds(startedAt);
      this.metrics.setDependencyReady(name, false);
      this.logger.failure(error, { dependency: name, latencyMs }, 'dependency_health_failed');
      return { latencyMs, name, status: 'down' };
    }
  }

  private createRedisClient(): RedisClientType {
    const redis = this.environment.redis;
    const client = createClient({
      password: redis.password,
      socket: {
        connectTimeout: this.environment.dependencyTimeoutMs,
        host: redis.host,
        port: redis.port,
        reconnectStrategy: false,
      },
    });
    client.on('error', (error) => {
      this.logger.failure(error, { dependency: 'redis' }, 'dependency_connection_error');
    });
    return client;
  }

  private async pingRedis(): Promise<string> {
    try {
      if (!this.redisClient.isOpen) {
        await this.redisClient.connect();
      }
      return await this.redisClient.ping();
    } catch (error) {
      if (this.redisClient.isOpen) {
        this.redisClient.destroy();
      }
      this.redisClient = this.createRedisClient();
      throw error;
    }
  }

  private async pingMinio(): Promise<void> {
    const response = await fetch(this.environment.minioHealthUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(this.environment.dependencyTimeoutMs),
    });
    if (!response.ok) {
      throw new Error(`MinIO readiness returned HTTP ${response.status}`);
    }
  }

  private elapsedMilliseconds(startedAt: bigint): number {
    return Math.round(Number(process.hrtime.bigint() - startedAt) / 1_000_000);
  }

  private async withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
    let timeout: NodeJS.Timeout | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(
        () => reject(new Error(`Dependency check exceeded ${timeoutMs}ms`)),
        timeoutMs,
      );
    });
    try {
      return await Promise.race([operation, deadline]);
    } finally {
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
    }
  }
}
