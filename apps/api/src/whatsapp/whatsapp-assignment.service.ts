import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { AuditService } from '../auth/audit.service';
import type { AuthPrincipal } from '../auth/auth.types';
import { hashSensitive } from '../auth/token';
import { EnvironmentService } from '../config/environment.service';
import { PrismaService } from '../database/prisma.service';
import {
  IdempotencyStatus,
  Prisma,
  type WhatsAppConversationAssignmentAction,
  type WhatsAppConversationAssignmentReason,
} from '../generated/prisma/client';
import { requestHash } from '../foundation/request-hash';
import { MetricsService } from '../observability/metrics.service';
import { RequestContextService } from '../observability/request-context.service';

interface BaseAssignmentCommand {
  readonly conversationId: string;
  readonly expectedVersion: number;
  readonly idempotencyKey: string;
  readonly organizationId: string;
  readonly principal: AuthPrincipal;
  readonly storeId: string;
}

interface ReassignCommand extends BaseAssignmentCommand {
  readonly assigneeMembershipId: string;
  readonly reasonCode: Extract<
    WhatsAppConversationAssignmentReason,
    'SHIFT_CHANGE' | 'SPECIALIST_ROUTING' | 'WORKLOAD_BALANCE'
  >;
}

interface UnassignCommand extends BaseAssignmentCommand {
  readonly reasonCode: Extract<
    WhatsAppConversationAssignmentReason,
    'AGENT_UNAVAILABLE' | 'MANUAL_RELEASE' | 'SHIFT_CHANGE'
  >;
}

interface LockedConversationRow {
  readonly assigned_at: Date | null;
  readonly assigned_membership_id: string | null;
  readonly assignment_version: number;
  readonly id: string;
}

interface LockedIdempotencyRow {
  readonly request_hash: string;
  readonly response_snapshot_json: Prisma.JsonValue | null;
  readonly status: 'completed' | 'failed' | 'processing';
}

interface EligibleMembership {
  readonly id: string;
}

export interface WhatsAppAssignmentResult {
  readonly action: 'claim' | 'reassign' | 'unassign';
  readonly assignedAt: string | null;
  readonly assigneeMembershipId: string | null;
  readonly assignmentVersion: number;
  readonly conversationId: string;
  readonly mode: 'simulation';
}

type AssignmentCommand = BaseAssignmentCommand | ReassignCommand | UnassignCommand;
type AssignmentAction = 'claim' | 'reassign' | 'unassign';

const ELIGIBLE_ROLES = ['ADMIN', 'OPERATIONS', 'OWNER', 'SUPPORT'] as const;

@Injectable()
export class WhatsAppAssignmentService {
  public constructor(
    private readonly audit: AuditService,
    private readonly environment: EnvironmentService,
    private readonly metrics: MetricsService,
    private readonly prisma: PrismaService,
    private readonly requestContext: RequestContextService,
  ) {}

  public claim(command: BaseAssignmentCommand): Promise<WhatsAppAssignmentResult> {
    return this.mutate(command, 'claim');
  }

  public reassign(command: ReassignCommand): Promise<WhatsAppAssignmentResult> {
    return this.mutate(command, 'reassign');
  }

  public unassign(command: UnassignCommand): Promise<WhatsAppAssignmentResult> {
    return this.mutate(command, 'unassign');
  }

  private async mutate(
    command: AssignmentCommand,
    action: AssignmentAction,
  ): Promise<WhatsAppAssignmentResult> {
    const scope = `whatsapp.conversation.assignment.${action}`;
    const storedKey = `${command.organizationId}:${hashSensitive(command.idempotencyKey)}`;
    const request = this.request(command, action);
    const fingerprint = requestHash(request);
    try {
      this.assertEnabled();
      const transactionResult = await this.withSerializableRetry(() =>
        this.prisma.$transaction(
          async (transaction) => {
            await transaction.$executeRaw`
              INSERT INTO idempotency_keys (scope, key, request_hash, expires_at)
              VALUES (${scope}, ${storedKey}, ${fingerprint}, NOW() + INTERVAL '24 hours')
              ON CONFLICT (scope, key) DO NOTHING
            `;
            const [idempotency] = await transaction.$queryRaw<LockedIdempotencyRow[]>`
              SELECT request_hash, response_snapshot_json, status
              FROM idempotency_keys
              WHERE scope = ${scope} AND key = ${storedKey}
              FOR UPDATE
            `;
            if (idempotency === undefined) {
              throw new Error('Idempotency record could not be locked');
            }
            if (idempotency.request_hash !== fingerprint) {
              throw new ConflictException('Idempotency key was already used with another request');
            }
            if (idempotency.status === 'completed' && idempotency.response_snapshot_json !== null) {
              return {
                replayed: true,
                result: idempotency.response_snapshot_json as unknown as WhatsAppAssignmentResult,
              };
            }

            const [conversation] = await transaction.$queryRaw<LockedConversationRow[]>`
              SELECT id, assigned_membership_id, assignment_version, assigned_at
              FROM whatsapp_conversations
              WHERE id = ${command.conversationId}::uuid
                AND organization_id = ${command.organizationId}::uuid
                AND store_id = ${command.storeId}::uuid
              FOR UPDATE
            `;
            if (conversation === undefined) {
              throw new NotFoundException('WhatsApp conversation not found');
            }
            if (conversation.assignment_version !== command.expectedVersion) {
              throw new ConflictException('WhatsApp conversation assignment version changed');
            }

            const actor = await this.eligibleActor(transaction, command);
            const next = await this.nextAssignee(transaction, command, action, actor, conversation);
            const nextVersion = conversation.assignment_version + 1;
            const assignedAt = next === null ? null : new Date();
            await transaction.whatsAppConversation.update({
              data: {
                assignedAt,
                assignedMembershipId: next?.id ?? null,
                assignmentVersion: nextVersion,
              },
              where: { id: command.conversationId },
            });
            const reasonCode = 'reasonCode' in command ? command.reasonCode : null;
            await transaction.whatsAppConversationAssignmentHistory.create({
              data: {
                action: action.toUpperCase() as WhatsAppConversationAssignmentAction,
                actorMembershipId: actor.id,
                conversationId: command.conversationId,
                newAssigneeMembershipId: next?.id ?? null,
                organizationId: command.organizationId,
                previousAssigneeMembershipId: conversation.assigned_membership_id,
                reasonCode,
                storeId: command.storeId,
                version: nextVersion,
              },
            });
            await transaction.outboxEvent.create({
              data: {
                aggregateId: command.conversationId,
                aggregateType: 'whatsapp_conversation',
                correlationId: this.requestContext.correlationId ?? 'internal',
                eventType: 'whatsapp.conversation.assignment.changed.v1',
                organizationId: command.organizationId,
                payloadJson: {
                  action,
                  assigneeMembershipId: next?.id ?? null,
                  assignmentVersion: nextVersion,
                  conversationId: command.conversationId,
                  mode: 'simulation',
                  previousAssigneeMembershipId: conversation.assigned_membership_id,
                  reasonCode: reasonCode?.toLowerCase() ?? null,
                  storeId: command.storeId,
                },
              },
            });
            await transaction.auditLog.create({
              data: {
                action: `whatsapp.assignment.${action}ed`,
                actorUserId: command.principal.userId,
                correlationId: this.requestContext.correlationId ?? 'internal',
                metadataJson: {
                  action,
                  assignmentVersion: nextVersion,
                  mode: 'simulation',
                  reasonCode: reasonCode?.toLowerCase() ?? null,
                },
                organizationId: command.organizationId,
                outcome: 'SUCCESS',
                resourceId: command.conversationId,
                resourceType: 'whatsapp_conversation_assignment',
              },
            });
            const result: WhatsAppAssignmentResult = {
              action,
              assignedAt: assignedAt?.toISOString() ?? null,
              assigneeMembershipId: next?.id ?? null,
              assignmentVersion: nextVersion,
              conversationId: command.conversationId,
              mode: 'simulation',
            };
            await transaction.idempotencyKey.update({
              data: {
                responseSnapshotJson: result as unknown as Prisma.InputJsonObject,
                status: IdempotencyStatus.COMPLETED,
              },
              where: { scope_key: { key: storedKey, scope } },
            });
            return { replayed: false, result };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        ),
      );
      if (transactionResult.replayed) {
        await this.record(command, action, 'replayed');
        this.metrics.recordWhatsAppAssignmentOperation(action, 'replayed');
      } else {
        this.metrics.recordWhatsAppAssignmentOperation(action, 'success');
      }
      return transactionResult.result;
    } catch (error) {
      const outcome =
        error instanceof ForbiddenException
          ? 'denied'
          : error instanceof ConflictException
            ? 'conflict'
            : error instanceof NotFoundException
              ? 'not_found'
              : 'failure';
      this.metrics.recordWhatsAppAssignmentOperation(action, outcome);
      await this.record(command, action, outcome);
      throw error;
    }
  }

  private async eligibleActor(
    transaction: Prisma.TransactionClient,
    command: AssignmentCommand,
  ): Promise<EligibleMembership> {
    const membership = await transaction.organizationMembership.findUnique({
      select: { id: true, role: true, status: true, user: { select: { status: true } } },
      where: {
        organizationId_userId: {
          organizationId: command.organizationId,
          userId: command.principal.userId,
        },
      },
    });
    if (
      membership === null ||
      membership.status !== 'ACTIVE' ||
      membership.user.status !== 'ACTIVE' ||
      !ELIGIBLE_ROLES.includes(membership.role as (typeof ELIGIBLE_ROLES)[number])
    ) {
      throw new ForbiddenException('WhatsApp assignment actor is not eligible');
    }
    return { id: membership.id };
  }

  private async nextAssignee(
    transaction: Prisma.TransactionClient,
    command: AssignmentCommand,
    action: AssignmentAction,
    actor: EligibleMembership,
    conversation: LockedConversationRow,
  ): Promise<EligibleMembership | null> {
    if (action === 'claim') {
      if (conversation.assigned_membership_id !== null) {
        throw new ConflictException('WhatsApp conversation is already assigned');
      }
      return actor;
    }
    if (conversation.assigned_membership_id === null) {
      throw new ConflictException('WhatsApp conversation is not assigned');
    }
    if (action === 'unassign') return null;
    if (!('assigneeMembershipId' in command)) throw new Error('Assignee is required');
    const membership = await transaction.organizationMembership.findFirst({
      select: { id: true, role: true, status: true, user: { select: { status: true } } },
      where: { id: command.assigneeMembershipId, organizationId: command.organizationId },
    });
    if (membership === null) throw new NotFoundException('WhatsApp agent not found');
    if (
      membership.status !== 'ACTIVE' ||
      membership.user.status !== 'ACTIVE' ||
      !ELIGIBLE_ROLES.includes(membership.role as (typeof ELIGIBLE_ROLES)[number])
    ) {
      throw new ConflictException('WhatsApp agent is not eligible');
    }
    if (membership.id === conversation.assigned_membership_id) {
      throw new ConflictException('WhatsApp conversation already has that assignee');
    }
    return { id: membership.id };
  }

  private request(command: AssignmentCommand, action: AssignmentAction): Prisma.InputJsonObject {
    return {
      action,
      assigneeMembershipId: 'assigneeMembershipId' in command ? command.assigneeMembershipId : null,
      conversationId: command.conversationId,
      expectedVersion: command.expectedVersion,
      organizationId: command.organizationId,
      reasonCode: 'reasonCode' in command ? command.reasonCode : null,
      storeId: command.storeId,
    };
  }

  private assertEnabled(): void {
    const integration = this.environment.whatsapp;
    const inbox = this.environment.whatsappInbox;
    const assignments = this.environment.whatsappAssignments;
    if (
      !integration.enabled ||
      integration.killSwitch ||
      !integration.simulationMode ||
      !inbox.enabled ||
      inbox.killSwitch ||
      !inbox.simulationMode ||
      !assignments.enabled ||
      assignments.killSwitch ||
      !assignments.simulationMode
    ) {
      throw new ServiceUnavailableException('WhatsApp assignment simulation is disabled');
    }
  }

  private record(
    command: AssignmentCommand,
    action: AssignmentAction,
    outcome: string,
  ): Promise<void> {
    return this.audit.record({
      action: `whatsapp.assignment.${action}_${outcome}`,
      actorUserId: command.principal.userId,
      metadata: {
        action,
        expectedVersion: command.expectedVersion,
        mode: 'simulation',
      },
      organizationId: command.organizationId,
      outcome: outcome === 'denied' ? 'DENIED' : outcome === 'replayed' ? 'SUCCESS' : 'FAILURE',
      resourceId: command.conversationId,
      resourceType: 'whatsapp_conversation_assignment',
    });
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
