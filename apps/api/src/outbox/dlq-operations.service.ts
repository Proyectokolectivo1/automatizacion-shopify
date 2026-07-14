import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { AuditService } from '../auth/audit.service';
import type { AuthPrincipal } from '../auth/auth.types';
import { hashSensitive } from '../auth/token';
import { EnvironmentService } from '../config/environment.service';
import { PrismaService } from '../database/prisma.service';
import { IdempotencyStatus, Prisma } from '../generated/prisma/client';
import { requestHash } from '../foundation/request-hash';

interface InspectCommand {
  readonly cursor?: string | undefined;
  readonly eventType?: string | undefined;
  readonly limit: number;
  readonly organizationId: string;
  readonly principal: AuthPrincipal;
}

interface ReprocessCommand {
  readonly eventId: string;
  readonly idempotencyKey: string;
  readonly organizationId: string;
  readonly principal: AuthPrincipal;
}

interface LockedIdempotencyRow {
  request_hash: string;
  response_snapshot_json: Prisma.JsonValue | null;
  status: 'completed' | 'failed' | 'processing';
}

interface LockedOutboxRow {
  delivery_version: number;
  reprocess_count: number;
  status: 'dead_letter' | 'failed' | 'pending' | 'processing' | 'published';
}

export interface ReprocessResult {
  readonly deliveryVersion: number;
  readonly eventId: string;
  readonly reprocessCount: number;
  readonly status: 'pending';
}

interface CursorValue {
  readonly createdAt: Date;
  readonly id: string;
}

const SCOPE = 'outbox.dlq.reprocess';

@Injectable()
export class DlqOperationsService {
  public constructor(
    private readonly audit: AuditService,
    private readonly environment: EnvironmentService,
    private readonly prisma: PrismaService,
  ) {}

  public async inspect(command: InspectCommand) {
    this.assertEnabled();
    try {
      const cursor = command.cursor === undefined ? undefined : this.decodeCursor(command.cursor);
      const events = await this.prisma.outboxEvent.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          aggregateId: true,
          aggregateType: true,
          attemptCount: true,
          createdAt: true,
          deadLetteredAt: true,
          eventType: true,
          id: true,
          lastErrorJson: true,
          reprocessCount: true,
        },
        take: command.limit + 1,
        where: {
          ...(command.eventType === undefined ? {} : { eventType: command.eventType }),
          organizationId: command.organizationId,
          status: 'DEAD_LETTER',
          ...(cursor === undefined
            ? {}
            : {
                OR: [
                  { createdAt: { lt: cursor.createdAt } },
                  { createdAt: cursor.createdAt, id: { lt: cursor.id } },
                ],
              }),
        },
      });
      const hasMore = events.length > command.limit;
      const page = events.slice(0, command.limit);
      const last = page.at(-1);
      const result = {
        items: page.map(({ lastErrorJson, ...event }) => ({
          ...event,
          errorCategory: this.errorCategory(lastErrorJson),
        })),
        nextCursor:
          hasMore && last !== undefined ? this.encodeCursor(last.createdAt, last.id) : null,
      };
      await this.audit.record({
        action: 'outbox.dlq.inspected',
        actorUserId: command.principal.userId,
        metadata: { eventType: command.eventType ?? 'all', itemCount: page.length },
        organizationId: command.organizationId,
        outcome: 'SUCCESS',
        resourceType: 'outbox_event',
      });
      return result;
    } catch (error) {
      await this.audit.record({
        action: 'outbox.dlq.inspect_failed',
        actorUserId: command.principal.userId,
        organizationId: command.organizationId,
        outcome: 'FAILURE',
        resourceType: 'outbox_event',
      });
      throw error;
    }
  }

  public async reprocess(command: ReprocessCommand): Promise<ReprocessResult> {
    this.assertEnabled();
    const storedKey = `${command.organizationId}:${command.eventId}:${hashSensitive(command.idempotencyKey)}`;
    const hash = requestHash({ eventId: command.eventId, organizationId: command.organizationId });
    try {
      const transactionResult = await this.withSerializableRetry(async () =>
        this.prisma.$transaction(
          async (transaction) => {
            await transaction.$executeRaw`
              INSERT INTO idempotency_keys (scope, key, request_hash, expires_at)
              VALUES (${SCOPE}, ${storedKey}, ${hash}, NOW() + INTERVAL '24 hours')
              ON CONFLICT (scope, key) DO NOTHING
            `;
            const [record] = await transaction.$queryRaw<LockedIdempotencyRow[]>`
              SELECT request_hash, response_snapshot_json, status
              FROM idempotency_keys
              WHERE scope = ${SCOPE} AND key = ${storedKey}
              FOR UPDATE
            `;
            if (record === undefined) throw new Error('Idempotency record could not be locked');
            if (record.request_hash !== hash) {
              throw new ConflictException('Idempotency key was already used with another request');
            }
            if (record.status === 'completed' && record.response_snapshot_json !== null) {
              return {
                replayed: true,
                result: record.response_snapshot_json as unknown as ReprocessResult,
              };
            }
            const [event] = await transaction.$queryRaw<LockedOutboxRow[]>`
              SELECT status, delivery_version, reprocess_count
              FROM outbox_events
              WHERE id = ${command.eventId}::uuid
                AND organization_id = ${command.organizationId}::uuid
              FOR UPDATE
            `;
            if (event === undefined) throw new NotFoundException('DLQ event not found');
            if (event.status !== 'dead_letter') {
              throw new ConflictException('Only dead-letter events can be reprocessed');
            }
            const result: ReprocessResult = {
              deliveryVersion: event.delivery_version + 1,
              eventId: command.eventId,
              reprocessCount: event.reprocess_count + 1,
              status: 'pending',
            };
            await transaction.$executeRaw`
              UPDATE outbox_events
              SET attempt_count = 0,
                  available_at = NOW(),
                  dead_lettered_at = NULL,
                  delivery_version = delivery_version + 1,
                  last_error_json = NULL,
                  locked_at = NULL,
                  locked_by = NULL,
                  published_at = NULL,
                  reprocess_count = reprocess_count + 1,
                  status = 'pending'
              WHERE id = ${command.eventId}::uuid
                AND organization_id = ${command.organizationId}::uuid
            `;
            await transaction.idempotencyKey.update({
              data: { responseSnapshotJson: { ...result }, status: IdempotencyStatus.COMPLETED },
              where: { scope_key: { key: storedKey, scope: SCOPE } },
            });
            return { replayed: false, result };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        ),
      );
      await this.audit.record({
        action: transactionResult.replayed
          ? 'outbox.dlq.reprocess_replayed'
          : 'outbox.dlq.reprocessed',
        actorUserId: command.principal.userId,
        metadata: { deliveryVersion: transactionResult.result.deliveryVersion },
        organizationId: command.organizationId,
        outcome: 'SUCCESS',
        resourceId: command.eventId,
        resourceType: 'outbox_event',
      });
      return transactionResult.result;
    } catch (error) {
      await this.audit.record({
        action: 'outbox.dlq.reprocess_failed',
        actorUserId: command.principal.userId,
        organizationId: command.organizationId,
        outcome: 'FAILURE',
        resourceId: command.eventId,
        resourceType: 'outbox_event',
      });
      throw error;
    }
  }

  private assertEnabled(): void {
    const controls = this.environment.outboxOperations;
    if (!controls.enabled || controls.killSwitch) {
      throw new ServiceUnavailableException('Outbox operations are disabled');
    }
  }

  private decodeCursor(value: string): CursorValue {
    try {
      const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as {
        createdAt?: unknown;
        id?: unknown;
      };
      const id = typeof parsed.id === 'string' ? parsed.id : '';
      const createdAt = new Date(typeof parsed.createdAt === 'string' ? parsed.createdAt : '');
      if (!Number.isFinite(createdAt.getTime()) || !/^[0-9a-f-]{36}$/iu.test(id)) throw new Error();
      return { createdAt, id };
    } catch {
      throw new BadRequestException('Invalid pagination cursor');
    }
  }

  private encodeCursor(createdAt: Date, id: string): string {
    return Buffer.from(JSON.stringify({ createdAt: createdAt.toISOString(), id })).toString(
      'base64url',
    );
  }

  private errorCategory(value: Prisma.JsonValue | null): string | null {
    if (value === null || Array.isArray(value) || typeof value !== 'object') return null;
    const category = value.category;
    return typeof category === 'string' ? category.slice(0, 80) : null;
  }

  private async withSerializableRetry<T>(operation: () => Promise<T>): Promise<T> {
    for (let retry = 0; retry < 3; retry += 1) {
      try {
        return await operation();
      } catch (error) {
        if (!this.isSerializationConflict(error) || retry === 2) throw error;
        await new Promise((resolve) => setTimeout(resolve, 25 * (retry + 1)));
      }
    }
    throw new Error('Serializable transaction retry limit reached');
  }

  private isSerializationConflict(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
    if (error.code === 'P2034') return true;
    const metadata = error.meta as { code?: string } | undefined;
    return (
      error.code === 'P2010' && (metadata?.code === '40001' || error.message.includes('40001'))
    );
  }
}
