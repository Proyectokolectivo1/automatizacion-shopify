import {
  BadRequestException,
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
import { IdempotencyStatus, Prisma, type OrganizationRole } from '../generated/prisma/client';
import { requestHash } from '../foundation/request-hash';
import { MetricsService } from '../observability/metrics.service';
import { RequestContextService } from '../observability/request-context.service';

interface ListCommand {
  readonly cursor?: string | undefined;
  readonly limit: number;
  readonly organizationId: string;
  readonly principal: AuthPrincipal;
}

interface ChangeRoleCommand {
  readonly idempotencyKey: string;
  readonly membershipId: string;
  readonly organizationId: string;
  readonly principal: AuthPrincipal;
  readonly role: OrganizationRole;
}

interface RevokeCommand {
  readonly idempotencyKey: string;
  readonly membershipId: string;
  readonly organizationId: string;
  readonly principal: AuthPrincipal;
}

interface LockedIdempotencyRow {
  request_hash: string;
  response_snapshot_json: Prisma.JsonValue | null;
  status: 'completed' | 'failed' | 'processing';
}

interface CursorValue {
  readonly createdAt: Date;
  readonly id: string;
}

export interface MembershipRoleResult {
  readonly membershipId: string;
  readonly role: OrganizationRole;
  readonly status: 'active';
}

export interface MembershipRevokeResult {
  readonly membershipId: string;
  readonly status: 'revoked';
}

const ROLE_SCOPE = 'identity.membership.role.change';
const REVOKE_SCOPE = 'identity.membership.revoke';

@Injectable()
export class IdentityAdministrationService {
  public constructor(
    private readonly audit: AuditService,
    private readonly environment: EnvironmentService,
    private readonly metrics: MetricsService,
    private readonly prisma: PrismaService,
    private readonly requestContext: RequestContextService,
  ) {}

  public async list(command: ListCommand) {
    this.assertEnabled();
    try {
      const cursor = command.cursor === undefined ? undefined : this.decodeCursor(command.cursor);
      const memberships = await this.prisma.organizationMembership.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          createdAt: true,
          id: true,
          role: true,
          status: true,
          updatedAt: true,
          user: { select: { email: true, id: true, status: true } },
        },
        take: command.limit + 1,
        where: {
          organizationId: command.organizationId,
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
      const hasMore = memberships.length > command.limit;
      const page = memberships.slice(0, command.limit);
      const last = page.at(-1);
      const result = {
        items: page.map((membership) => ({
          createdAt: membership.createdAt.toISOString(),
          email: membership.user.email,
          membershipId: membership.id,
          role: membership.role,
          status: membership.status.toLowerCase(),
          updatedAt: membership.updatedAt.toISOString(),
          userId: membership.user.id,
          userStatus: membership.user.status.toLowerCase(),
        })),
        nextCursor:
          hasMore && last !== undefined ? this.encodeCursor(last.createdAt, last.id) : null,
      };
      await this.audit.record({
        action: 'identity.membership.listed',
        actorUserId: command.principal.userId,
        metadata: { itemCount: page.length },
        organizationId: command.organizationId,
        outcome: 'SUCCESS',
        resourceType: 'organization_membership',
      });
      return result;
    } catch (error) {
      await this.audit.record({
        action: 'identity.membership.list_failed',
        actorUserId: command.principal.userId,
        organizationId: command.organizationId,
        outcome: 'FAILURE',
        resourceType: 'organization_membership',
      });
      throw error;
    }
  }

  public changeRole(command: ChangeRoleCommand): Promise<MembershipRoleResult> {
    return this.mutate<MembershipRoleResult>({
      command,
      request: { membershipId: command.membershipId, role: command.role },
      scope: ROLE_SCOPE,
      execute: async (transaction) => {
        const membership = await this.lockMembership(
          transaction,
          command.organizationId,
          command.membershipId,
        );
        if (membership.status !== 'ACTIVE') {
          throw new ConflictException('Only active memberships can change role');
        }
        this.assertMutationAllowed(
          command.principal,
          membership.userId,
          membership.role,
          command.role,
        );
        if (membership.role === 'OWNER' && command.role !== 'OWNER') {
          await this.assertAnotherOwner(transaction, command.organizationId);
        }
        if (membership.role !== command.role) {
          await transaction.organizationMembership.update({
            data: { role: command.role },
            where: { id: command.membershipId },
          });
          await this.revokeSessions(transaction, command.organizationId, membership.userId);
        }
        return {
          membershipId: command.membershipId,
          role: command.role,
          status: 'active',
        };
      },
      action: 'identity.membership.role_changed',
      replayAction: 'identity.membership.role_change_replayed',
    });
  }

  public revoke(command: RevokeCommand): Promise<MembershipRevokeResult> {
    return this.mutate<MembershipRevokeResult>({
      command,
      request: { membershipId: command.membershipId },
      scope: REVOKE_SCOPE,
      execute: async (transaction) => {
        const membership = await this.lockMembership(
          transaction,
          command.organizationId,
          command.membershipId,
        );
        this.assertMutationAllowed(command.principal, membership.userId, membership.role);
        if (membership.status === 'ACTIVE') {
          if (membership.role === 'OWNER') {
            await this.assertAnotherOwner(transaction, command.organizationId);
          }
          await transaction.organizationMembership.update({
            data: { status: 'REVOKED' },
            where: { id: command.membershipId },
          });
          await this.revokeSessions(transaction, command.organizationId, membership.userId);
        }
        return { membershipId: command.membershipId, status: 'revoked' };
      },
      action: 'identity.membership.revoked',
      replayAction: 'identity.membership.revoke_replayed',
    });
  }

  private async mutate<T extends object>(options: {
    readonly action: string;
    readonly command: ChangeRoleCommand | RevokeCommand;
    readonly execute: (transaction: Prisma.TransactionClient) => Promise<T>;
    readonly replayAction: string;
    readonly request: Prisma.InputJsonObject;
    readonly scope: string;
  }): Promise<T> {
    this.assertEnabled();
    const { command } = options;
    const storedKey = `${command.organizationId}:${hashSensitive(command.idempotencyKey)}`;
    const hash = requestHash({ ...options.request, organizationId: command.organizationId });
    try {
      const transactionResult = await this.withSerializableRetry(() =>
        this.prisma.$transaction(
          async (transaction) => {
            await transaction.$executeRaw`
              INSERT INTO idempotency_keys (scope, key, request_hash, expires_at)
              VALUES (${options.scope}, ${storedKey}, ${hash}, NOW() + INTERVAL '24 hours')
              ON CONFLICT (scope, key) DO NOTHING
            `;
            const [record] = await transaction.$queryRaw<LockedIdempotencyRow[]>`
              SELECT request_hash, response_snapshot_json, status
              FROM idempotency_keys
              WHERE scope = ${options.scope} AND key = ${storedKey}
              FOR UPDATE
            `;
            if (record === undefined) throw new Error('Idempotency record could not be locked');
            if (record.request_hash !== hash) {
              throw new ConflictException('Idempotency key was already used with another request');
            }
            if (record.status === 'completed' && record.response_snapshot_json !== null) {
              return { replayed: true, result: record.response_snapshot_json as T };
            }

            await transaction.$executeRaw`
              SELECT pg_advisory_xact_lock(
                hashtextextended(${'identity.memberships:' + command.organizationId}, 0)
              )
            `;
            const result = await options.execute(transaction);
            await transaction.idempotencyKey.update({
              data: {
                responseSnapshotJson: result as Prisma.InputJsonObject,
                status: IdempotencyStatus.COMPLETED,
              },
              where: { scope_key: { key: storedKey, scope: options.scope } },
            });
            await transaction.auditLog.create({
              data: {
                action: options.action,
                actorUserId: command.principal.userId,
                correlationId: this.requestContext.correlationId ?? 'internal',
                metadataJson: {
                  requestedRole: 'role' in command ? command.role : undefined,
                },
                organizationId: command.organizationId,
                outcome: 'SUCCESS',
                resourceId: command.membershipId,
                resourceType: 'organization_membership',
              },
            });
            return { replayed: false, result };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        ),
      );
      if (transactionResult.replayed) {
        await this.audit.record({
          action: options.replayAction,
          actorUserId: command.principal.userId,
          organizationId: command.organizationId,
          outcome: 'SUCCESS',
          resourceId: command.membershipId,
          resourceType: 'organization_membership',
        });
      } else {
        this.metrics.recordIdentityOperation(options.action, 'success');
      }
      return transactionResult.result;
    } catch (error) {
      await this.audit.record({
        action: `${options.action}_failed`,
        actorUserId: command.principal.userId,
        organizationId: command.organizationId,
        outcome: error instanceof ForbiddenException ? 'DENIED' : 'FAILURE',
        resourceId: command.membershipId,
        resourceType: 'organization_membership',
      });
      throw error;
    }
  }

  private assertEnabled(): void {
    const controls = this.environment.identityAdministration;
    if (!controls.enabled || controls.killSwitch) {
      throw new ServiceUnavailableException('Identity administration is disabled');
    }
  }

  private assertMutationAllowed(
    principal: AuthPrincipal,
    targetUserId: string,
    currentRole: OrganizationRole,
    requestedRole?: OrganizationRole,
  ): void {
    if (targetUserId === principal.userId) {
      throw new ForbiddenException('Self membership changes are not allowed');
    }
    if (
      principal.role === 'ADMIN' &&
      (currentRole === 'OWNER' ||
        currentRole === 'ADMIN' ||
        requestedRole === 'OWNER' ||
        requestedRole === 'ADMIN')
    ) {
      throw new ForbiddenException('Administrators cannot manage privileged memberships');
    }
  }

  private async assertAnotherOwner(
    transaction: Prisma.TransactionClient,
    organizationId: string,
  ): Promise<void> {
    const owners = await transaction.organizationMembership.count({
      where: { organizationId, role: 'OWNER', status: 'ACTIVE' },
    });
    if (owners <= 1) throw new ConflictException('The last owner cannot be changed or revoked');
  }

  private async lockMembership(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    membershipId: string,
  ) {
    const membership = await transaction.organizationMembership.findFirst({
      where: { id: membershipId, organizationId },
    });
    if (membership === null) throw new NotFoundException('Membership not found');
    return membership;
  }

  private async revokeSessions(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    userId: string,
  ): Promise<void> {
    await transaction.authSession.updateMany({
      data: { revokedAt: new Date() },
      where: { organizationId, revokedAt: null, userId },
    });
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
