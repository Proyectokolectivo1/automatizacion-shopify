import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';

import { AuditService } from '../auth/audit.service';
import type { AuthPrincipal } from '../auth/auth.types';
import { EnvironmentService } from '../config/environment.service';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { MetricsService } from '../observability/metrics.service';
import { operationalItemsSql, type OperationalQueueItemType } from './operational-read-model';

interface DetailCommand {
  readonly itemId: string;
  readonly organizationId: string;
  readonly principal: AuthPrincipal;
  readonly type: OperationalQueueItemType;
}

interface BaseRow {
  readonly attentionReason: string | null;
  readonly occurredAt: Date;
  readonly requiresAttention: boolean;
  readonly status: string;
}

type TimelineEvent =
  | {
      readonly at: Date;
      readonly event: 'assignment_change';
      readonly action: string;
      readonly reasonCode: string | null;
      readonly version: number;
    }
  | {
      readonly at: Date;
      readonly event: 'state_transition';
      readonly fromStatus: string;
      readonly toStatus: string;
    };

@Injectable()
export class OperationalDetailService {
  public constructor(
    private readonly audit: AuditService,
    private readonly environment: EnvironmentService,
    private readonly metrics: MetricsService,
    private readonly prisma: PrismaService,
  ) {}

  public async get(command: DetailCommand) {
    this.assertEnabled();
    try {
      const base = await this.loadBase(command);
      if (base === undefined) throw new NotFoundException('Operational item not found');
      const projection = await this.loadProjection(command);
      const result = {
        contractVersion: 'v1' as const,
        item: {
          attentionReason: base.attentionReason,
          details: projection.details,
          occurredAt: base.occurredAt,
          requiresAttention: base.requiresAttention,
          status: base.status,
          type: command.type,
        },
        timeline: projection.timeline,
      };
      await this.record(command, 'operations.detail.viewed', 'SUCCESS', result.timeline.length);
      this.metrics.recordOperationalDetail('success');
      return result;
    } catch (error) {
      this.metrics.recordOperationalDetail('failure');
      await this.record(command, 'operations.detail.view_failed', 'FAILURE', 0);
      throw error;
    }
  }

  private async loadBase(command: DetailCommand): Promise<BaseRow | undefined> {
    const rows = await this.prisma.$queryRaw<BaseRow[]>(Prisma.sql`
      WITH operational_items AS (
        ${operationalItemsSql(command.organizationId)}
      )
      SELECT
        attention_reason AS "attentionReason",
        occurred_at AS "occurredAt",
        requires_attention AS "requiresAttention",
        status
      FROM operational_items
      WHERE item_type = ${command.type} AND item_id = ${command.itemId}
      LIMIT 1
    `);
    return rows[0];
  }

  private async loadProjection(command: DetailCommand): Promise<{
    readonly details: Readonly<Record<string, boolean | number | string | null>>;
    readonly timeline: readonly TimelineEvent[];
  }> {
    if (command.type === 'order') return this.loadOrder(command);
    if (command.type === 'payment_intent') return this.loadPaymentIntent(command);
    if (command.type === 'shopify_reconciliation_issue') return this.loadShopifyIssue(command);
    if (command.type === 'wompi_reconciliation_issue') return this.loadWompiIssue(command);
    return this.loadWhatsAppConversation(command);
  }

  private async loadOrder(command: DetailCommand) {
    const [order, history] = await Promise.all([
      this.prisma.order.findFirst({
        select: {
          codCollectAmount: true,
          currency: true,
          paymentMode: true,
          totalAmount: true,
          transportChargeAmount: true,
          version: true,
        },
        where: { id: command.itemId, organizationId: command.organizationId },
      }),
      this.prisma.orderStateHistory.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { createdAt: true, fromState: true, toState: true },
        take: 25,
        where: { orderId: command.itemId, organizationId: command.organizationId },
      }),
    ]);
    if (order === null) throw new NotFoundException('Operational item not found');
    return {
      details: {
        codCollectAmount: order.codCollectAmount.toString(),
        currency: order.currency,
        kind: 'order',
        paymentMode: order.paymentMode.toLowerCase(),
        totalAmount: order.totalAmount.toString(),
        transportChargeAmount: order.transportChargeAmount.toString(),
        version: order.version,
      },
      timeline: history.map(({ createdAt, fromState, toState }) => ({
        at: createdAt,
        event: 'state_transition' as const,
        fromStatus: fromState.toLowerCase(),
        toStatus: toState.toLowerCase(),
      })),
    };
  }

  private async loadPaymentIntent(command: DetailCommand) {
    const intent = await this.prisma.paymentIntent.findFirst({
      select: {
        amount: true,
        attemptNumber: true,
        currency: true,
        expiredAt: true,
        expiresAt: true,
      },
      where: { id: command.itemId, organizationId: command.organizationId },
    });
    if (intent === null) throw new NotFoundException('Operational item not found');
    return {
      details: {
        amount: intent.amount.toString(),
        attemptNumber: intent.attemptNumber,
        currency: intent.currency,
        expiredAt: intent.expiredAt?.toISOString() ?? null,
        expiresAt: intent.expiresAt.toISOString(),
        kind: 'payment_intent',
      },
      timeline: [],
    };
  }

  private async loadShopifyIssue(command: DetailCommand) {
    const issue = await this.prisma.orderReconciliationIssue.findFirst({
      select: {
        detectionCount: true,
        issueType: true,
        lastDetectedAt: true,
        reprocessStartedAt: true,
        resolvedAt: true,
      },
      where: { id: command.itemId, organizationId: command.organizationId },
    });
    if (issue === null) throw new NotFoundException('Operational item not found');
    return {
      details: {
        detectionCount: issue.detectionCount,
        issueType: issue.issueType.toLowerCase(),
        kind: 'shopify_reconciliation_issue',
        lastDetectedAt: issue.lastDetectedAt.toISOString(),
        reprocessStartedAt: issue.reprocessStartedAt?.toISOString() ?? null,
        resolvedAt: issue.resolvedAt?.toISOString() ?? null,
      },
      timeline: [],
    };
  }

  private async loadWompiIssue(command: DetailCommand) {
    const issue = await this.prisma.paymentReconciliationIssue.findFirst({
      select: {
        acceptedEventStatus: true,
        authoritativeStatus: true,
        detectionCount: true,
        issueType: true,
        lastDetectedAt: true,
        localStatus: true,
        resolvedAt: true,
      },
      where: { id: command.itemId, organizationId: command.organizationId },
    });
    if (issue === null) throw new NotFoundException('Operational item not found');
    return {
      details: {
        acceptedEventStatus: issue.acceptedEventStatus?.toLowerCase() ?? null,
        authoritativeStatus: issue.authoritativeStatus?.toLowerCase() ?? null,
        detectionCount: issue.detectionCount,
        issueType: issue.issueType.toLowerCase(),
        kind: 'wompi_reconciliation_issue',
        lastDetectedAt: issue.lastDetectedAt.toISOString(),
        localStatus: issue.localStatus?.toLowerCase() ?? null,
        resolvedAt: issue.resolvedAt?.toISOString() ?? null,
      },
      timeline: [],
    };
  }

  private async loadWhatsAppConversation(command: DetailCommand) {
    const [conversation, history] = await Promise.all([
      this.prisma.whatsAppConversation.findFirst({
        select: {
          assignedMembershipId: true,
          assignmentVersion: true,
          lastMessageAt: true,
        },
        where: { id: command.itemId, organizationId: command.organizationId },
      }),
      this.prisma.whatsAppConversationAssignmentHistory.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { action: true, createdAt: true, reasonCode: true, version: true },
        take: 25,
        where: { conversationId: command.itemId, organizationId: command.organizationId },
      }),
    ]);
    if (conversation === null) throw new NotFoundException('Operational item not found');
    return {
      details: {
        assigned: conversation.assignedMembershipId !== null,
        assignmentVersion: conversation.assignmentVersion,
        kind: 'whatsapp_conversation',
        lastMessageAt: conversation.lastMessageAt.toISOString(),
      },
      timeline: history.map(({ action, createdAt, reasonCode, version }) => ({
        action: action.toLowerCase(),
        at: createdAt,
        event: 'assignment_change' as const,
        reasonCode: reasonCode?.toLowerCase() ?? null,
        version,
      })),
    };
  }

  private assertEnabled(): void {
    const detail = this.environment.operationalDetail;
    if (!detail.enabled || detail.killSwitch) {
      throw new ServiceUnavailableException('Operational detail is disabled');
    }
  }

  private record(
    command: DetailCommand,
    action: string,
    outcome: 'FAILURE' | 'SUCCESS',
    timelineCount: number,
  ): Promise<void> {
    return this.audit.record({
      action,
      actorUserId: command.principal.userId,
      metadata: { timelineCount, type: command.type },
      organizationId: command.organizationId,
      outcome,
      resourceType: 'operational_detail',
    });
  }
}
