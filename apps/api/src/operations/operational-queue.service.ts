import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { z } from 'zod';

import { AuditService } from '../auth/audit.service';
import type { AuthPrincipal } from '../auth/auth.types';
import { EnvironmentService } from '../config/environment.service';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { MetricsService } from '../observability/metrics.service';

export type OperationalQueueItemType =
  | 'order'
  | 'payment_intent'
  | 'shopify_reconciliation_issue'
  | 'whatsapp_conversation'
  | 'wompi_reconciliation_issue';

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
          SELECT
            'order'::text AS item_type,
            id::text AS item_id,
            store_id::text AS store_id,
            current_state::text AS status,
            source_created_at AS occurred_at,
            current_state IN ('invalid_data', 'transport_payment_expired', 'abandono_pago_transporte', 'manual_review') AS requires_attention,
            CASE WHEN current_state IN ('invalid_data', 'transport_payment_expired', 'abandono_pago_transporte', 'manual_review')
              THEN 'order_' || current_state::text ELSE NULL END AS attention_reason,
            NULL::text AS related_resource_type,
            NULL::text AS related_resource_id,
            'order:' || id::text AS sort_key
          FROM orders WHERE organization_id = ${command.organizationId}::uuid
          UNION ALL
          SELECT
            'shopify_reconciliation_issue', id::text, store_id::text, status::text, first_detected_at,
            status IN ('open', 'reprocessing'),
            CASE WHEN status IN ('open', 'reprocessing') THEN 'shopify_' || issue_type::text ELSE NULL END,
            CASE WHEN order_id IS NULL THEN NULL ELSE 'order' END,
            order_id::text,
            'shopify_reconciliation_issue:' || id::text
          FROM order_reconciliation_issues WHERE organization_id = ${command.organizationId}::uuid
          UNION ALL
          SELECT
            'payment_intent', id::text, store_id::text, status::text, created_at,
            status = 'error',
            CASE WHEN status = 'error' THEN 'payment_intent_error' ELSE NULL END,
            'order', order_id::text, 'payment_intent:' || id::text
          FROM payment_intents WHERE organization_id = ${command.organizationId}::uuid
          UNION ALL
          SELECT
            'wompi_reconciliation_issue', id::text, store_id::text, status::text, first_detected_at,
            status = 'open',
            CASE WHEN status = 'open' THEN 'wompi_' || issue_type::text ELSE NULL END,
            'payment_intent', payment_intent_id::text,
            'wompi_reconciliation_issue:' || id::text
          FROM payment_reconciliation_issues WHERE organization_id = ${command.organizationId}::uuid
          UNION ALL
          SELECT
            'whatsapp_conversation', id::text, store_id::text, status::text, created_at,
            status = 'open' AND assigned_membership_id IS NULL,
            CASE WHEN status = 'open' AND assigned_membership_id IS NULL
              THEN 'whatsapp_conversation_unassigned' ELSE NULL END,
            NULL::text, NULL::text, 'whatsapp_conversation:' || id::text
          FROM whatsapp_conversations WHERE organization_id = ${command.organizationId}::uuid
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
