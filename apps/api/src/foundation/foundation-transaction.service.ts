import { ConflictException, Injectable } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';
import { IdempotencyStatus, Prisma } from '../generated/prisma/client';
import { requestHash } from './request-hash';

export interface CreateFoundationAggregateCommand {
  readonly correlationId: string;
  readonly currency: string;
  readonly idempotencyKey: string;
  readonly name: string;
  readonly timezone: string;
}

export interface FoundationAggregateResult {
  readonly organizationId: string;
  readonly outboxEventId: string;
  readonly replayed: boolean;
}

interface LockedIdempotencyRow {
  request_hash: string;
  response_snapshot_json: Prisma.JsonValue | null;
  status: 'completed' | 'failed' | 'processing';
}

const SCOPE = 'foundation.organization.create';

@Injectable()
export class FoundationTransactionService {
  public constructor(private readonly prisma: PrismaService) {}

  public async execute(
    command: CreateFoundationAggregateCommand,
  ): Promise<FoundationAggregateResult> {
    const hash = requestHash({
      currency: command.currency,
      name: command.name,
      timezone: command.timezone,
    });

    for (let retry = 0; retry < 3; retry += 1) {
      try {
        return await this.prisma.$transaction(
          async (transaction) => {
            await transaction.$executeRaw`
              INSERT INTO idempotency_keys (scope, key, request_hash, expires_at)
              VALUES (${SCOPE}, ${command.idempotencyKey}, ${hash}, NOW() + INTERVAL '24 hours')
              ON CONFLICT (scope, key) DO NOTHING
            `;
            const [record] = await transaction.$queryRaw<LockedIdempotencyRow[]>`
              SELECT request_hash, response_snapshot_json, status
              FROM idempotency_keys
              WHERE scope = ${SCOPE} AND key = ${command.idempotencyKey}
              FOR UPDATE
            `;

            if (record === undefined) {
              throw new Error('Idempotency record could not be locked');
            }
            if (record.request_hash !== hash) {
              throw new ConflictException('Idempotency key was already used with another request');
            }
            if (record.status === 'completed' && record.response_snapshot_json !== null) {
              const snapshot = record.response_snapshot_json as {
                organizationId: string;
                outboxEventId: string;
              };
              return { ...snapshot, replayed: true };
            }

            const organization = await transaction.organization.create({
              data: {
                defaultCurrency: command.currency,
                name: command.name,
                timezone: command.timezone,
              },
            });
            const event = await transaction.outboxEvent.create({
              data: {
                aggregateId: organization.id,
                aggregateType: 'organization',
                correlationId: command.correlationId,
                eventType: 'foundation.organization.created',
                payloadJson: {
                  organizationId: organization.id,
                  schemaVersion: 1,
                },
              },
            });
            const snapshot = { organizationId: organization.id, outboxEventId: event.id };
            await transaction.idempotencyKey.update({
              data: {
                responseSnapshotJson: snapshot,
                status: IdempotencyStatus.COMPLETED,
              },
              where: { scope_key: { key: command.idempotencyKey, scope: SCOPE } },
            });
            return { ...snapshot, replayed: false };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (this.isSerializationConflict(error) && retry < 2) {
          await new Promise((resolve) => setTimeout(resolve, 25 * (retry + 1)));
          continue;
        }
        throw error;
      }
    }
    throw new Error('Serializable transaction retry limit reached');
  }

  private isSerializationConflict(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
      return false;
    }
    if (error.code === 'P2034') {
      return true;
    }
    const metadata = error.meta as { code?: string } | undefined;
    return (
      error.code === 'P2010' && (metadata?.code === '40001' || error.message.includes('40001'))
    );
  }
}
