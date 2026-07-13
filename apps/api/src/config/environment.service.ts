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

  public get minioHealthUrl(): string {
    const protocol = this.values.MINIO_USE_SSL ? 'https' : 'http';
    return `${protocol}://${this.values.MINIO_HOST}:${this.values.MINIO_API_PORT}/minio/health/ready`;
  }
}
