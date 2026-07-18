import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { z } from 'zod';

import { AuditService } from '../auth/audit.service';
import type { AuthPrincipal } from '../auth/auth.types';
import { EnvironmentService } from '../config/environment.service';
import { PrismaService } from '../database/prisma.service';
import { Prisma, WhatsAppMessageDirection } from '../generated/prisma/client';
import { MetricsService } from '../observability/metrics.service';
import { WhatsAppCredentialCipher } from './whatsapp-credential-cipher';

interface BaseCommand {
  readonly cursor?: string | undefined;
  readonly limit: number;
  readonly organizationId: string;
  readonly principal: AuthPrincipal;
  readonly storeId: string;
}

interface ListCommand extends BaseCommand {
  readonly identity?: 'known_customer' | 'unknown_contact' | undefined;
  readonly status?: 'closed' | 'open' | undefined;
}

interface TimelineCommand extends BaseCommand {
  readonly conversationId: string;
  readonly direction?: 'inbound' | 'outbound' | undefined;
}

const cursorSchema = z
  .object({ at: z.string().datetime({ offset: true }), id: z.string().uuid() })
  .strict();

@Injectable()
export class WhatsAppInboxService {
  public constructor(
    private readonly audit: AuditService,
    private readonly cipher: WhatsAppCredentialCipher,
    private readonly environment: EnvironmentService,
    private readonly metrics: MetricsService,
    private readonly prisma: PrismaService,
  ) {}

  public async list(command: ListCommand) {
    this.assertEnabled();
    try {
      await this.assertStore(command.organizationId, command.storeId);
      const cursor = command.cursor === undefined ? undefined : this.decodeCursor(command.cursor);
      const conversations = await this.prisma.whatsAppConversation.findMany({
        orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
        select: {
          _count: { select: { messages: true } },
          customerId: true,
          id: true,
          lastMessageAt: true,
          messages: {
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            select: { direction: true, status: true },
            take: 1,
          },
          status: true,
        },
        take: command.limit + 1,
        where: {
          organizationId: command.organizationId,
          storeId: command.storeId,
          ...(command.status === undefined
            ? {}
            : { status: command.status.toUpperCase() as 'CLOSED' | 'OPEN' }),
          ...(command.identity === undefined
            ? {}
            : { customerId: command.identity === 'known_customer' ? { not: null } : null }),
          ...(cursor === undefined
            ? {}
            : {
                OR: [
                  { lastMessageAt: { lt: cursor.at } },
                  { id: { lt: cursor.id }, lastMessageAt: cursor.at },
                ],
              }),
        },
      });
      const hasMore = conversations.length > command.limit;
      const page = conversations.slice(0, command.limit);
      const last = page.at(-1);
      const result = {
        items: page.map((conversation) => ({
          conversationId: conversation.id,
          identity: conversation.customerId === null ? 'unknown_contact' : 'known_customer',
          lastMessageAt: conversation.lastMessageAt,
          latestDirection: conversation.messages[0]?.direction.toLowerCase() ?? null,
          latestStatus: conversation.messages[0]?.status.toLowerCase() ?? null,
          messageCount: conversation._count.messages,
          status: conversation.status.toLowerCase(),
        })),
        mode: 'simulation' as const,
        nextCursor:
          hasMore && last !== undefined ? this.encodeCursor(last.lastMessageAt, last.id) : null,
      };
      await this.record(command, 'whatsapp.inbox.listed', 'SUCCESS', {
        identity: command.identity ?? 'all',
        itemCount: page.length,
        status: command.status ?? 'all',
      });
      this.metrics.recordWhatsAppInboxOperation('list', 'success');
      return result;
    } catch (error) {
      this.metrics.recordWhatsAppInboxOperation('list', 'failure');
      await this.record(command, 'whatsapp.inbox.list_failed', 'FAILURE');
      throw error;
    }
  }

  public async timeline(command: TimelineCommand) {
    this.assertEnabled();
    try {
      await this.assertStore(command.organizationId, command.storeId);
      const conversation = await this.prisma.whatsAppConversation.findFirst({
        select: { id: true },
        where: {
          id: command.conversationId,
          organizationId: command.organizationId,
          storeId: command.storeId,
        },
      });
      if (conversation === null) throw new NotFoundException('WhatsApp conversation not found');
      const cursor = command.cursor === undefined ? undefined : this.decodeCursor(command.cursor);
      const messages = await this.prisma.whatsAppMessage.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          body: true,
          createdAt: true,
          direction: true,
          encryptedBodyJson: true,
          id: true,
          retentionExpiresAt: true,
          status: true,
          statusHistory: {
            orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
            select: {
              applied: true,
              fromStatus: true,
              observedStatus: true,
              occurredAt: true,
              resultingStatus: true,
            },
          },
          type: true,
        },
        take: command.limit + 1,
        where: {
          conversationId: command.conversationId,
          organizationId: command.organizationId,
          storeId: command.storeId,
          ...(command.direction === undefined
            ? {}
            : { direction: command.direction.toUpperCase() as WhatsAppMessageDirection }),
          ...(cursor === undefined
            ? {}
            : {
                OR: [
                  { createdAt: { lt: cursor.at } },
                  { createdAt: cursor.at, id: { lt: cursor.id } },
                ],
              }),
        },
      });
      const hasMore = messages.length > command.limit;
      const page = messages.slice(0, command.limit);
      const last = page.at(-1);
      const now = new Date();
      const result = {
        conversationId: command.conversationId,
        items: page.map((message) => {
          const content = this.content(message, command, now);
          return {
            content: content.value,
            contentState: content.state,
            direction: message.direction.toLowerCase(),
            messageId: message.id,
            occurredAt: message.createdAt,
            status: message.status.toLowerCase(),
            statusHistory: message.statusHistory.map((history) => ({
              applied: history.applied,
              fromStatus: history.fromStatus?.toLowerCase() ?? null,
              observedStatus: history.observedStatus.toLowerCase(),
              occurredAt: history.occurredAt,
              resultingStatus: history.resultingStatus.toLowerCase(),
            })),
            type: message.type.toLowerCase(),
          };
        }),
        mode: 'simulation' as const,
        nextCursor:
          hasMore && last !== undefined ? this.encodeCursor(last.createdAt, last.id) : null,
      };
      await this.record(command, 'whatsapp.inbox.timeline_viewed', 'SUCCESS', {
        direction: command.direction ?? 'all',
        itemCount: page.length,
      });
      this.metrics.recordWhatsAppInboxOperation('timeline', 'success');
      return result;
    } catch (error) {
      this.metrics.recordWhatsAppInboxOperation('timeline', 'failure');
      await this.record(command, 'whatsapp.inbox.timeline_failed', 'FAILURE');
      throw error;
    }
  }

  private content(
    message: {
      body: string | null;
      direction: WhatsAppMessageDirection;
      encryptedBodyJson: Prisma.JsonValue | null;
      id: string;
      retentionExpiresAt: Date | null;
    },
    command: TimelineCommand,
    now: Date,
  ): { state: 'available' | 'expired'; value: string | null } {
    if (message.direction === WhatsAppMessageDirection.OUTBOUND) {
      return { state: 'available', value: message.body };
    }
    if (message.retentionExpiresAt === null || message.retentionExpiresAt <= now) {
      return { state: 'expired', value: null };
    }
    return {
      state: 'available',
      value: this.cipher.decryptInboundMessageContent(
        message.encryptedBodyJson,
        command.organizationId,
        command.storeId,
        message.id,
      ),
    };
  }

  private assertEnabled(): void {
    const integration = this.environment.whatsapp;
    const inbox = this.environment.whatsappInbox;
    if (
      !integration.enabled ||
      integration.killSwitch ||
      !integration.simulationMode ||
      !inbox.enabled ||
      inbox.killSwitch ||
      !inbox.simulationMode
    ) {
      throw new ServiceUnavailableException('WhatsApp inbox simulation is disabled');
    }
  }

  private async assertStore(organizationId: string, storeId: string): Promise<void> {
    const store = await this.prisma.store.findFirst({
      select: { id: true },
      where: { id: storeId, organizationId },
    });
    if (store === null) throw new NotFoundException('WhatsApp inbox not found');
  }

  private encodeCursor(at: Date, id: string): string {
    return Buffer.from(JSON.stringify({ at: at.toISOString(), id }), 'utf8').toString('base64url');
  }

  private decodeCursor(value: string): { at: Date; id: string } {
    try {
      const parsed = cursorSchema.parse(
        JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown,
      );
      return { at: new Date(parsed.at), id: parsed.id };
    } catch {
      throw new BadRequestException('Invalid cursor');
    }
  }

  private record(
    command: BaseCommand,
    action: string,
    outcome: 'FAILURE' | 'SUCCESS',
    metadata: Record<string, string | number> = {},
  ): Promise<void> {
    return this.audit.record({
      action,
      actorUserId: command.principal.userId,
      metadata: { ...metadata, mode: 'simulation' },
      organizationId: command.organizationId,
      outcome,
      resourceType: 'whatsapp_conversation',
    });
  }
}
