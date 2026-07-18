import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { z } from 'zod';

import { AuditService } from '../auth/audit.service';
import type { AuthPrincipal } from '../auth/auth.types';
import { EnvironmentService } from '../config/environment.service';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { MetricsService } from '../observability/metrics.service';
import { operationalItemsSql, type OperationalQueueItemType } from './operational-read-model';

interface ListCommand {
  readonly cursor?: string | undefined;
  readonly from?: Date | undefined;
  readonly limit: number;
  readonly organizationId: string;
  readonly principal: AuthPrincipal;
  readonly requiresAttention?: boolean | undefined;
  readonly status?: string | undefined;
  readonly storeId?: string | undefined;
  readonly to?: Date | undefined;
  readonly type?: OperationalQueueItemType | undefined;
}

interface QueueRow {
  readonly attentionReason: string | null;
  readonly itemId: string;
  readonly itemType: OperationalQueueItemType;
  readonly occurredAt: Date;
  readonly relatedResourceId: string | null;
  readonly relatedResourceType: string | null;
  readonly requiresAttention: boolean;
  readonly sortKey: string;
  readonly status: string;
  readonly storeId: string;
}

const cursorSchema = z
  .object({
    at: z.string().datetime({ offset: true }),
    key: z
      .string()
      .regex(
        /^(order|payment_intent|shopify_reconciliation_issue|whatsapp_conversation|wompi_reconciliation_issue):[0-9a-f-]{36}$/u,
      ),
  })
  .strict();

@Injectable()
export class OperationalQueueService {
  public constructor(
    private readonly audit: AuditService,
    private readonly environment: EnvironmentService,
    private readonly metrics: MetricsService,
    private readonly prisma: PrismaService,
  ) {}

  public async list(command: ListCommand) {
    this.assertEnabled();
    try {
      const cursor = command.cursor === undefined ? undefined : this.decodeCursor(command.cursor);
      const filters: Prisma.Sql[] = [];
      if (command.type !== undefined) filters.push(Prisma.sql`item_type = ${command.type}`);
      if (command.status !== undefined) filters.push(Prisma.sql`status = ${command.status}`);
      if (command.storeId !== undefined) filters.push(Prisma.sql`store_id = ${command.storeId}`);
      if (command.requiresAttention !== undefined) {
        filters.push(Prisma.sql`requires_attention = ${command.requiresAttention}`);
      }
      if (command.from !== undefined) filters.push(Prisma.sql`occurred_at >= ${command.from}`);
      if (command.to !== undefined) filters.push(Prisma.sql`occurred_at <= ${command.to}`);
      if (cursor !== undefined) {
        filters.push(
          Prisma.sql`(occurred_at < ${cursor.at} OR (occurred_at = ${cursor.at} AND sort_key < ${cursor.key}))`,
        );
      }
      const where =
        filters.length === 0 ? Prisma.empty : Prisma.sql`WHERE ${Prisma.join(filters, ' AND ')}`;
      const rows = await this.prisma.$queryRaw<QueueRow[]>(Prisma.sql`
        WITH queue_items AS (
          ${operationalItemsSql(command.organizationId)}
        )
        SELECT
          attention_reason AS "attentionReason",
          item_id AS "itemId",
          item_type AS "itemType",
          occurred_at AS "occurredAt",
          related_resource_id AS "relatedResourceId",
          related_resource_type AS "relatedResourceType",
          requires_attention AS "requiresAttention",
          sort_key AS "sortKey",
          status,
          store_id AS "storeId"
        FROM queue_items
        ${where}
        ORDER BY occurred_at DESC, sort_key DESC
        LIMIT ${command.limit + 1}
      `);
      const hasMore = rows.length > command.limit;
      const page = rows.slice(0, command.limit);
      const last = page.at(-1);
      const result = {
        contractVersion: 'v1' as const,
        items: page.map((row) => ({
          attentionReason: row.attentionReason,
          itemId: row.itemId,
          occurredAt: row.occurredAt,
          relatedResource:
            row.relatedResourceId === null || row.relatedResourceType === null
              ? null
              : { id: row.relatedResourceId, type: row.relatedResourceType },
          requiresAttention: row.requiresAttention,
          status: row.status,
          storeId: row.storeId,
          type: row.itemType,
        })),
        nextCursor:
          hasMore && last !== undefined ? this.encodeCursor(last.occurredAt, last.sortKey) : null,
      };
      await this.record(command, 'operations.queue.listed', 'SUCCESS', page.length);
      this.metrics.recordOperationalQueue('list', 'success');
      return result;
    } catch (error) {
      this.metrics.recordOperationalQueue('list', 'failure');
      await this.record(command, 'operations.queue.list_failed', 'FAILURE', 0);
      throw error;
    }
  }

  private assertEnabled(): void {
    const queue = this.environment.operationalQueue;
    if (!queue.enabled || queue.killSwitch) {
      throw new ServiceUnavailableException('Operational queue is disabled');
    }
  }

  private encodeCursor(at: Date, key: string): string {
    return Buffer.from(JSON.stringify({ at: at.toISOString(), key }), 'utf8').toString('base64url');
  }

  private decodeCursor(value: string): { at: Date; key: string } {
    try {
      const parsed = cursorSchema.parse(
        JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown,
      );
      return { at: new Date(parsed.at), key: parsed.key };
    } catch {
      throw new BadRequestException('Invalid cursor');
    }
  }

  private record(
    command: ListCommand,
    action: string,
    outcome: 'FAILURE' | 'SUCCESS',
    itemCount: number,
  ): Promise<void> {
    return this.audit.record({
      action,
      actorUserId: command.principal.userId,
      metadata: {
        itemCount,
        requiresAttention:
          command.requiresAttention === undefined ? 'all' : String(command.requiresAttention),
        status: command.status ?? 'all',
        storeFiltered: command.storeId !== undefined,
        type: command.type ?? 'all',
      },
      organizationId: command.organizationId,
      outcome,
      resourceType: 'operational_queue',
    });
  }
}
