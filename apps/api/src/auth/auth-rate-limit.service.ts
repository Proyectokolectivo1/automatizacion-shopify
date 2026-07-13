import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';

import { EnvironmentService } from '../config/environment.service';
import { PrismaService } from '../database/prisma.service';
import { hashSensitive } from './token';

interface RateLimitRow {
  readonly blocked_until: Date | null;
}

@Injectable()
export class AuthRateLimitService implements OnModuleDestroy, OnModuleInit {
  private cleanupTimer?: NodeJS.Timeout;

  public constructor(
    private readonly environment: EnvironmentService,
    private readonly prisma: PrismaService,
  ) {}

  public onModuleInit(): void {
    this.cleanupTimer = setInterval(() => void this.cleanup().catch(() => undefined), 300_000);
    this.cleanupTimer.unref();
  }

  public onModuleDestroy(): void {
    if (this.cleanupTimer !== undefined) clearInterval(this.cleanupTimer);
  }

  public async consume(email: string, ipAddress: string, scope = 'login'): Promise<boolean> {
    const keyHash = hashSensitive(`${scope}|${email}|${ipAddress}`);
    const config = this.environment.auth;
    const [row] = await this.prisma.$queryRaw<RateLimitRow[]>`
      INSERT INTO auth_rate_limits (key_hash, window_started_at, attempt_count, updated_at)
      VALUES (${keyHash}, NOW(), 1, NOW())
      ON CONFLICT (key_hash) DO UPDATE SET
        window_started_at = CASE
          WHEN auth_rate_limits.window_started_at < NOW() - (${config.rateWindowMs} * INTERVAL '1 millisecond') THEN NOW()
          ELSE auth_rate_limits.window_started_at
        END,
        attempt_count = CASE
          WHEN auth_rate_limits.window_started_at < NOW() - (${config.rateWindowMs} * INTERVAL '1 millisecond') THEN 1
          ELSE auth_rate_limits.attempt_count + 1
        END,
        blocked_until = CASE
          WHEN auth_rate_limits.blocked_until > NOW() THEN auth_rate_limits.blocked_until
          WHEN auth_rate_limits.window_started_at >= NOW() - (${config.rateWindowMs} * INTERVAL '1 millisecond')
            AND auth_rate_limits.attempt_count + 1 > ${config.loginMaxAttempts}
            THEN NOW() + (${config.blockDurationMs} * INTERVAL '1 millisecond')
          ELSE NULL
        END,
        updated_at = NOW()
      RETURNING blocked_until
    `;
    return row?.blocked_until === null;
  }

  public async clear(email: string, ipAddress: string, scope = 'login'): Promise<void> {
    await this.prisma.authRateLimit.deleteMany({
      where: { keyHash: hashSensitive(`${scope}|${email}|${ipAddress}`) },
    });
  }

  private async cleanup(): Promise<void> {
    const retentionMs = this.environment.auth.rateWindowMs + this.environment.auth.blockDurationMs;
    await this.prisma.authRateLimit.deleteMany({
      where: { updatedAt: { lt: new Date(Date.now() - retentionMs) } },
    });
  }
}
