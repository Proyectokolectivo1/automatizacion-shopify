import { randomBytes } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

import { EnvironmentService } from '../config/environment.service';
import { PrismaService } from '../database/prisma.service';
import { EmailDeliveryService } from '../email/email-delivery.service';
import type { OrganizationRole, Prisma } from '../generated/prisma/client';
import { AuditService } from './audit.service';
import { AuthRateLimitService } from './auth-rate-limit.service';
import type { AuthPrincipal } from './auth.types';
import { PASSWORD_PARAMETERS, PasswordService } from './password.service';
import { hashSensitive } from './token';

interface CreateInvitationCommand {
  readonly email: string;
  readonly organizationId: string;
  readonly principal: AuthPrincipal;
  readonly role: OrganizationRole;
}

interface AcceptInvitationCommand {
  readonly password: string;
  readonly token: string;
}

interface RequestPasswordRecoveryCommand {
  readonly email: string;
  readonly ipAddress: string;
}

interface CompletePasswordRecoveryCommand {
  readonly newPassword: string;
  readonly token: string;
}

interface InvitationTokenRow {
  readonly consumed_at: Date | null;
  readonly expires_at: Date;
  readonly id: string;
  readonly invited_email: string;
  readonly invited_role: OrganizationRole;
  readonly organization_id: string;
  readonly revoked_at: Date | null;
}

interface PasswordResetTokenRow {
  readonly consumed_at: Date | null;
  readonly expires_at: Date;
  readonly id: string;
  readonly revoked_at: Date | null;
  readonly user_id: string;
  readonly user_status: string;
}

const INVALID_ACTION_TOKEN = 'Invalid or expired token';
const ACCEPTED = Object.freeze({ status: 'accepted' as const });

@Injectable()
export class AccountActionService {
  public constructor(
    private readonly audit: AuditService,
    private readonly emailDelivery: EmailDeliveryService,
    private readonly environment: EnvironmentService,
    private readonly password: PasswordService,
    private readonly prisma: PrismaService,
    private readonly rateLimit: AuthRateLimitService,
  ) {}

  public async createInvitation(command: CreateInvitationCommand): Promise<typeof ACCEPTED> {
    this.ensureEnabled();
    if (!this.canAssignRole(command.principal.role, command.role)) {
      await this.audit.record({
        action: 'auth.invitation.create_denied',
        actorUserId: command.principal.userId,
        organizationId: command.organizationId,
        outcome: 'DENIED',
      });
      throw new ForbiddenException('Role cannot be assigned');
    }

    const email = command.email.trim().toLowerCase();
    const issued = this.issueActionToken();
    const expiresAt = new Date(
      Date.now() + this.environment.accountActions.invitationTtlSeconds * 1_000,
    );
    const action = await this.prisma.$transaction(async (transaction) => {
      await this.lockLogicalAction(transaction, `invitation|${command.organizationId}|${email}`);
      const existingUser = await transaction.user.findUnique({
        include: { memberships: { where: { organizationId: command.organizationId } } },
        where: { email },
      });
      if (existingUser?.memberships[0]?.status === 'ACTIVE') {
        throw new ConflictException('User already belongs to the organization');
      }
      await transaction.accountActionToken.updateMany({
        data: { revokedAt: new Date() },
        where: {
          consumedAt: null,
          invitedEmail: email,
          organizationId: command.organizationId,
          purpose: 'INVITATION',
          revokedAt: null,
        },
      });
      return transaction.accountActionToken.create({
        data: {
          expiresAt,
          invitedEmail: email,
          invitedRole: command.role,
          issuedByUserId: command.principal.userId,
          organizationId: command.organizationId,
          purpose: 'INVITATION',
          tokenHash: issued.hash,
        },
      });
    });

    try {
      const delivery = this.emailDelivery.sendInvitation(email, issued.token);
      if (delivery.status === 'blocked') {
        throw new ServiceUnavailableException('Invitation delivery is disabled');
      }
    } catch (error: unknown) {
      await this.revoke(action.id);
      await this.audit.record({
        action: 'auth.invitation.created',
        actorUserId: command.principal.userId,
        organizationId: command.organizationId,
        outcome: 'FAILURE',
        resourceId: action.id,
        resourceType: 'account_action_token',
      });
      throw error;
    }

    await this.audit.record({
      action: 'auth.invitation.created',
      actorUserId: command.principal.userId,
      organizationId: command.organizationId,
      outcome: 'SUCCESS',
      resourceId: action.id,
      resourceType: 'account_action_token',
    });
    return ACCEPTED;
  }

  public async acceptInvitation(command: AcceptInvitationCommand): Promise<typeof ACCEPTED> {
    this.ensureEnabled();
    const passwordHash = await this.password.hash(command.password);
    try {
      const accepted = await this.prisma.$transaction(async (transaction) => {
        const [action] = await transaction.$queryRaw<InvitationTokenRow[]>`
          SELECT id,
                 organization_id,
                 invited_email,
                 upper(invited_role::text) AS invited_role,
                 expires_at,
                 consumed_at,
                 revoked_at
          FROM account_action_tokens
          WHERE token_hash = ${hashSensitive(command.token)}
            AND purpose = 'invitation'
            AND consumed_at IS NULL
            AND revoked_at IS NULL
            AND expires_at > NOW()
          FOR UPDATE
        `;
        this.assertActive(action);

        let user = await transaction.user.findUnique({ where: { email: action.invited_email } });
        if (user?.status === 'DISABLED') throw new BadRequestException(INVALID_ACTION_TOKEN);
        user ??= await transaction.user.create({
          data: {
            email: action.invited_email,
            passwordAlgorithm: PASSWORD_PARAMETERS.algorithm,
            passwordHash,
            passwordParametersJson: PASSWORD_PARAMETERS,
          },
        });

        const membership = await transaction.organizationMembership.findUnique({
          where: {
            organizationId_userId: {
              organizationId: action.organization_id,
              userId: user.id,
            },
          },
        });
        if (membership?.status === 'ACTIVE' && membership.role !== action.invited_role) {
          throw new ConflictException('Existing membership role cannot be changed by invitation');
        }
        if (membership === null) {
          await transaction.organizationMembership.create({
            data: {
              organizationId: action.organization_id,
              role: action.invited_role,
              userId: user.id,
            },
          });
        } else if (membership.status === 'REVOKED') {
          await transaction.organizationMembership.update({
            data: { role: action.invited_role, status: 'ACTIVE' },
            where: { id: membership.id },
          });
        }
        await transaction.accountActionToken.update({
          data: { consumedAt: new Date() },
          where: { id: action.id },
        });
        return { actionId: action.id, organizationId: action.organization_id, userId: user.id };
      });
      await this.audit.record({
        action: 'auth.invitation.accepted',
        actorUserId: accepted.userId,
        organizationId: accepted.organizationId,
        outcome: 'SUCCESS',
        resourceId: accepted.actionId,
        resourceType: 'account_action_token',
      });
      return ACCEPTED;
    } catch (error: unknown) {
      await this.audit.record({ action: 'auth.invitation.accept_denied', outcome: 'DENIED' });
      throw error;
    }
  }

  public async requestPasswordRecovery(
    command: RequestPasswordRecoveryCommand,
  ): Promise<typeof ACCEPTED> {
    const email = command.email.trim().toLowerCase();
    const issued = this.issueActionToken();
    const controls = this.environment.accountActions;
    if (!controls.enabled || controls.killSwitch) {
      await this.audit.record({ action: 'auth.password_recovery.requested', outcome: 'DENIED' });
      return ACCEPTED;
    }
    const allowed = await this.rateLimit.consume(email, command.ipAddress, 'password-recovery');
    if (!allowed) {
      await this.audit.record({ action: 'auth.password_recovery.requested', outcome: 'DENIED' });
      return ACCEPTED;
    }

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user?.status !== 'ACTIVE') {
      await this.audit.record({ action: 'auth.password_recovery.requested', outcome: 'SUCCESS' });
      return ACCEPTED;
    }

    const expiresAt = new Date(Date.now() + controls.passwordResetTtlSeconds * 1_000);
    const action = await this.prisma.$transaction(async (transaction) => {
      await this.lockLogicalAction(transaction, `password-reset|${user.id}`);
      await transaction.accountActionToken.updateMany({
        data: { revokedAt: new Date() },
        where: {
          consumedAt: null,
          purpose: 'PASSWORD_RESET',
          revokedAt: null,
          userId: user.id,
        },
      });
      return transaction.accountActionToken.create({
        data: {
          expiresAt,
          purpose: 'PASSWORD_RESET',
          tokenHash: issued.hash,
          userId: user.id,
        },
      });
    });

    try {
      const delivery = this.emailDelivery.sendPasswordReset(email, issued.token);
      if (delivery.status === 'blocked') throw new Error('Password recovery delivery is disabled');
    } catch {
      await this.revoke(action.id);
      await this.audit.record({
        action: 'auth.password_recovery.requested',
        outcome: 'FAILURE',
        resourceId: action.id,
        resourceType: 'account_action_token',
      });
      return ACCEPTED;
    }

    await this.audit.record({
      action: 'auth.password_recovery.requested',
      outcome: 'SUCCESS',
      resourceId: action.id,
      resourceType: 'account_action_token',
    });
    return ACCEPTED;
  }

  public async completePasswordRecovery(
    command: CompletePasswordRecoveryCommand,
  ): Promise<typeof ACCEPTED> {
    this.ensureEnabled();
    const passwordHash = await this.password.hash(command.newPassword);
    try {
      const completed = await this.prisma.$transaction(async (transaction) => {
        const [action] = await transaction.$queryRaw<PasswordResetTokenRow[]>`
          SELECT action.id,
                 action.user_id,
                 action.expires_at,
                 action.consumed_at,
                 action.revoked_at,
                 users.status::text AS user_status
          FROM account_action_tokens AS action
          INNER JOIN users ON users.id = action.user_id
          WHERE action.token_hash = ${hashSensitive(command.token)}
            AND action.purpose = 'password_reset'
            AND action.consumed_at IS NULL
            AND action.revoked_at IS NULL
            AND action.expires_at > NOW()
          FOR UPDATE
        `;
        this.assertActive(action);
        if (action.user_status !== 'active') throw new BadRequestException(INVALID_ACTION_TOKEN);
        await transaction.user.update({
          data: {
            failedLoginAttempts: 0,
            lockedUntil: null,
            passwordAlgorithm: PASSWORD_PARAMETERS.algorithm,
            passwordHash,
            passwordParametersJson: PASSWORD_PARAMETERS,
          },
          where: { id: action.user_id, status: 'ACTIVE' },
        });
        await transaction.authSession.updateMany({
          data: { revokedAt: new Date() },
          where: { revokedAt: null, userId: action.user_id },
        });
        await transaction.accountActionToken.update({
          data: { consumedAt: new Date() },
          where: { id: action.id },
        });
        return action;
      });
      await this.audit.record({
        action: 'auth.password_recovery.completed',
        actorUserId: completed.user_id,
        outcome: 'SUCCESS',
        resourceId: completed.id,
        resourceType: 'account_action_token',
      });
      return ACCEPTED;
    } catch (error: unknown) {
      await this.audit.record({
        action: 'auth.password_recovery.complete_denied',
        outcome: 'DENIED',
      });
      throw error;
    }
  }

  private assertActive<
    T extends { consumed_at: Date | null; expires_at: Date; revoked_at: Date | null },
  >(action: T | undefined): asserts action is T {
    if (
      action === undefined ||
      action.consumed_at !== null ||
      action.revoked_at !== null ||
      action.expires_at <= new Date()
    ) {
      throw new BadRequestException(INVALID_ACTION_TOKEN);
    }
  }

  private canAssignRole(actor: OrganizationRole, target: OrganizationRole): boolean {
    if (actor === 'OWNER') return target !== 'OWNER';
    if (actor === 'ADMIN') return target !== 'OWNER' && target !== 'ADMIN';
    return false;
  }

  private ensureEnabled(): void {
    const controls = this.environment.accountActions;
    if (!controls.enabled || controls.killSwitch) {
      throw new ServiceUnavailableException('Account actions are disabled');
    }
  }

  private issueActionToken(): { hash: string; token: string } {
    const token = randomBytes(32).toString('base64url');
    return { hash: hashSensitive(token), token };
  }

  private async lockLogicalAction(
    transaction: Prisma.TransactionClient,
    key: string,
  ): Promise<void> {
    await transaction.$queryRaw`
      SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0)) IS NULL AS acquired
    `;
  }

  private async revoke(id: string): Promise<void> {
    await this.prisma.accountActionToken.updateMany({
      data: { revokedAt: new Date() },
      where: { consumedAt: null, id, revokedAt: null },
    });
  }
}
