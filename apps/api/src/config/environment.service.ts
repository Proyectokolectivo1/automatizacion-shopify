import { Injectable } from '@nestjs/common';

import { type Environment, parseEnvironment } from './environment.schema';

@Injectable()
export class EnvironmentService {
  private readonly values: Environment;

  public constructor() {
    this.values = parseEnvironment(process.env);
  }

  public get apiPort(): number {
    return this.values.API_PORT;
  }

  public get apiHost(): string {
    return this.values.API_HOST;
  }

  public get dependencyTimeoutMs(): number {
    return this.values.DEPENDENCY_TIMEOUT_MS;
  }

  public get auth(): Readonly<{
    accessTtlSeconds: number;
    blockDurationMs: number;
    loginMaxAttempts: number;
    rateWindowMs: number;
    refreshTtlSeconds: number;
  }> {
    return {
      accessTtlSeconds: this.values.AUTH_ACCESS_TTL_SECONDS,
      blockDurationMs: this.values.AUTH_BLOCK_DURATION_MS,
      loginMaxAttempts: this.values.AUTH_LOGIN_MAX_ATTEMPTS,
      rateWindowMs: this.values.AUTH_RATE_WINDOW_MS,
      refreshTtlSeconds: this.values.AUTH_REFRESH_TTL_SECONDS,
    };
  }

  public get emailDelivery(): Readonly<{
    enabled: boolean;
    killSwitch: boolean;
    simulationMode: boolean;
  }> {
    return {
      enabled: this.values.EMAIL_DELIVERY_ENABLED,
      killSwitch: this.values.EMAIL_KILL_SWITCH,
      simulationMode: this.values.EMAIL_SIMULATION_MODE,
    };
  }

  public get databaseUrl(): string {
    const postgres = this.postgres;
    const user = encodeURIComponent(postgres.user);
    const password = encodeURIComponent(postgres.password);
    return `postgresql://${user}:${password}@${postgres.host}:${postgres.port}/${postgres.database}`;
  }

  public get logLevel(): Environment['LOG_LEVEL'] {
    return this.values.LOG_LEVEL;
  }

  public get nodeEnvironment(): Environment['NODE_ENV'] {
    return this.values.NODE_ENV;
  }

  public get postgres(): Readonly<{
    database: string;
    host: string;
    password: string;
    port: number;
    user: string;
  }> {
    return {
      database: this.values.POSTGRES_DB,
      host: this.values.POSTGRES_HOST,
      password: this.values.POSTGRES_PASSWORD,
      port: this.values.POSTGRES_PORT,
      user: this.values.POSTGRES_USER,
    };
  }

  public get redis(): Readonly<{ host: string; password: string; port: number }> {
    return {
      host: this.values.REDIS_HOST,
      password: this.values.REDIS_PASSWORD,
      port: this.values.REDIS_PORT,
    };
  }

  public get outbox(): Readonly<{
    batchSize: number;
    dlqName: string;
    enabled: boolean;
    killSwitch: boolean;
    leaseMs: number;
    maxAttempts: number;
    pollIntervalMs: number;
    queueName: string;
    retryBaseMs: number;
    simulationMode: boolean;
  }> {
    return {
      batchSize: this.values.OUTBOX_BATCH_SIZE,
      dlqName: this.values.OUTBOX_DLQ_NAME,
      enabled: this.values.OUTBOX_PUBLISHER_ENABLED,
      killSwitch: this.values.OUTBOX_KILL_SWITCH,
      leaseMs: this.values.OUTBOX_LEASE_MS,
      maxAttempts: this.values.OUTBOX_MAX_ATTEMPTS,
      pollIntervalMs: this.values.OUTBOX_POLL_INTERVAL_MS,
      queueName: this.values.OUTBOX_QUEUE_NAME,
      retryBaseMs: this.values.OUTBOX_RETRY_BASE_MS,
      simulationMode: this.values.OUTBOX_SIMULATION_MODE,
    };
  }

  public get minioHealthUrl(): string {
    const protocol = this.values.MINIO_USE_SSL ? 'https' : 'http';
    return `${protocol}://${this.values.MINIO_HOST}:${this.values.MINIO_API_PORT}/minio/health/ready`;
  }
}
