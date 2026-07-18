import { createHash } from 'node:crypto';

import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { z } from 'zod';

import { AuditService } from '../auth/audit.service';
import type { AuthPrincipal } from '../auth/auth.types';
import { EnvironmentService } from '../config/environment.service';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { MetricsService } from '../observability/metrics.service';
import { operationalItemsSql, type OperationalQueueItemType } from './operational-read-model';

interface SearchCommand {
  readonly cursor?: string | undefined;
  readonly from: Date;
  readonly limit: number;
  readonly organizationId: string;
  readonly principal: AuthPrincipal;
  readonly q: string;
  readonly requiresAttention?: boolean | undefined;
  readonly status?: string | undefined;
  readonly to: Date;
  readonly type?: OperationalQueueItemType | undefined;
}

interface SearchRow {
  readonly attentionReason: string | null;
  readonly itemId: string;
  readonly itemType: OperationalQueueItemType;
  readonly matchRank: number;
  readonly occurredAt: Date;
  readonly requiresAttention: boolean;
  readonly sortKey: string;
  readonly status: string;
}

const cursorSchema = z
  .object({
    at: z.string().datetime({ offset: true }),
    fingerprint: z.string().regex(/^[0-9a-f]{32}$/u),
    key: z
      .string()
      .regex(
        /^(order|payment_intent|shopify_reconciliation_issue|whatsapp_conversation|wompi_reconciliation_issue):[0-9a-f-]{36}$/u,
      ),
    rank: z.number().int().min(0).max(3),
  })
  .strict();

type SearchCursor = z.infer<typeof cursorSchema>;

@Injectable()
export class OperationalSearchService {
  public constructor(
    private readonly audit: AuditService,
    private readonly environment: EnvironmentService,
    private readonly metrics: MetricsService,
    private readonly prisma: PrismaService,
  ) {}

  public async list(command: SearchCommand) {
    this.assertEnabled();
    const normalizedQuery = command.q.trim().toLowerCase().replace(/\s+/gu, '_');
    const fingerprint = this.fingerprint(command, normalizedQuery);
    try {
      const cursor =
        command.cursor === undefined ? undefined : this.decodeCursor(command.cursor, fingerprint);
      const filters: Prisma.Sql[] = [
        Prisma.sql`occurred_at >= ${command.from}`,
        Prisma.sql`occurred_at < ${command.to}`,
      ];
      if (command.type !== undefined) filters.push(Prisma.sql`item_type = ${command.type}`);
      if (command.status !== undefined) filters.push(Prisma.sql`status = ${command.status}`);
      if (command.requiresAttention !== undefined) {
        filters.push(Prisma.sql`requires_attention = ${command.requiresAttention}`);
      }
      const where = Prisma.sql`WHERE ${Prisma.join(filters, ' AND ')}`;
      const identifierQuery = z.string().uuid().safeParse(normalizedQuery);
      const identifierMatch = identifierQuery.success
        ? Prisma.sql`item_id = ${identifierQuery.data}`
        : Prisma.sql`FALSE`;
      const rankedCursor =
        cursor === undefined
          ? Prisma.empty
          : Prisma.sql`WHERE (
              match_rank > ${cursor.rank}
              OR (match_rank = ${cursor.rank} AND occurred_at < ${new Date(cursor.at)})
              OR (match_rank = ${cursor.rank} AND occurred_at = ${new Date(cursor.at)} AND sort_key < ${cursor.key})
            )`;
      const rows = await this.prisma.$queryRaw<SearchRow[]>(Prisma.sql`
        WITH queue_items AS (
          ${operationalItemsSql(command.organizationId)}
        ), bounded_items AS (
          SELECT * FROM queue_items ${where}
        ), ranked_items AS (
          SELECT
            *,
            CASE
              WHEN ${identifierMatch} THEN 0
              WHEN lower(item_type) = ${normalizedQuery}
                OR lower(status) = ${normalizedQuery}
                OR lower(coalesce(attention_reason, '')) = ${normalizedQuery} THEN 1
              WHEN left(lower(item_type), char_length(${normalizedQuery})) = ${normalizedQuery}
                OR left(lower(status), char_length(${normalizedQuery})) = ${normalizedQuery}
                OR left(lower(coalesce(attention_reason, '')), char_length(${normalizedQuery})) = ${normalizedQuery} THEN 2
              ELSE 3
            END AS match_rank
          FROM bounded_items
          WHERE ${identifierMatch}
            OR position(${normalizedQuery} IN lower(item_type)) > 0
            OR position(${normalizedQuery} IN lower(status)) > 0
            OR position(${normalizedQuery} IN lower(coalesce(attention_reason, ''))) > 0
        )
        SELECT
          attention_reason AS "attentionReason",
          item_id AS "itemId",
          item_type AS "itemType",
          match_rank AS "matchRank",
          occurred_at AS "occurredAt",
          requires_attention AS "requiresAttention",
          sort_key AS "sortKey",
          status
        FROM ranked_items
        ${rankedCursor}
        ORDER BY match_rank ASC, occurred_at DESC, sort_key DESC
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
          matchKind: this.matchKind(row.matchRank),
          occurredAt: row.occurredAt,
          requiresAttention: row.requiresAttention,
          status: row.status,
          type: row.itemType,
        })),
        nextCursor: hasMore && last !== undefined ? this.encodeCursor(last, fingerprint) : null,
      };
      await this.record(command, 'operations.search.executed', 'SUCCESS', page.length);
      this.metrics.recordOperationalSearch('success');
      return result;
    } catch (error) {
      this.metrics.recordOperationalSearch('failure');
      await this.record(command, 'operations.search.failed', 'FAILURE', 0);
      throw error;
    }
  }

  private assertEnabled(): void {
    const search = this.environment.operationalSearch;
    if (!search.enabled || search.killSwitch) {
      throw new ServiceUnavailableException('Operational search is disabled');
    }
  }

  private fingerprint(command: SearchCommand, normalizedQuery: string): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          from: command.from.toISOString(),
          q: normalizedQuery,
          requiresAttention: command.requiresAttention ?? null,
          status: command.status ?? null,
          to: command.to.toISOString(),
          type: command.type ?? null,
        }),
      )
      .digest('hex')
      .slice(0, 32);
  }

  private encodeCursor(row: SearchRow, fingerprint: string): string {
    return Buffer.from(
      JSON.stringify({
        at: row.occurredAt.toISOString(),
        fingerprint,
        key: row.sortKey,
        rank: row.matchRank,
      }),
      'utf8',
    ).toString('base64url');
  }

  private decodeCursor(value: string, fingerprint: string): SearchCursor {
    try {
      const parsed = cursorSchema.parse(
        JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown,
      );
      if (parsed.fingerprint !== fingerprint) throw new Error('Cursor does not match query');
      return parsed;
    } catch {
      throw new BadRequestException('Invalid cursor');
    }
  }

  private matchKind(rank: number): 'contains' | 'exact_field' | 'exact_id' | 'prefix' {
    if (rank === 0) return 'exact_id';
    if (rank === 1) return 'exact_field';
    if (rank === 2) return 'prefix';
    return 'contains';
  }

  private record(
    command: SearchCommand,
    action: string,
    outcome: 'FAILURE' | 'SUCCESS',
    itemCount: number,
  ): Promise<void> {
    return this.audit.record({
      action,
      actorUserId: command.principal.userId,
      metadata: {
        itemCount,
        queryKind: z.string().uuid().safeParse(command.q.trim()).success ? 'identifier' : 'text',
        requiresAttention:
          command.requiresAttention === undefined ? 'all' : String(command.requiresAttention),
        status: command.status ?? 'all',
        type: command.type ?? 'all',
        windowMinutes: Math.ceil((command.to.getTime() - command.from.getTime()) / 60_000),
      },
      organizationId: command.organizationId,
      outcome,
      resourceType: 'operational_search',
    });
  }
}
