import { randomUUID } from 'node:crypto';

import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { EnvironmentService } from '../config/environment.service';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from './audit.service';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { roleHasPermission } from './permissions';
import type { AuthOrganizationOption, AuthPrincipal, AuthTokens } from './auth.types';
import { PasswordService } from './password.service';
import { hashSensitive, issueOpaqueToken, parseOpaqueToken, safeHashEquals } from './token';

interface LoginCommand {
  readonly email: string;
  readonly ipAddress: string;
  readonly organizationId: string;
  readonly password: string;
  readonly userAgent: string | undefined;
}

interface RefreshCommand {
  readonly ipAddress: string;
  readonly refreshToken: string;
  readonly userAgent: string | undefined;
}

interface DiscoverOrganizationsCommand {
  readonly email: string;
  readonly ipAddress: string;
  readonly password: string;
}

interface SwitchOrganizationCommand {
  readonly ipAddress: string;
  readonly organizationId: string;
  readonly principal: AuthPrincipal;
  readonly userAgent: string | undefined;
}

const INVALID_CREDENTIALS = 'Invalid credentials';

@Injectable()
export class AuthService {
  public constructor(
    private readonly audit: AuditService,
    private readonly environment: EnvironmentService,
    private readonly password: PasswordService,
    private readonly prisma: PrismaService,
    private readonly rateLimit: AuthRateLimitService,
  ) {}

  public async login(command: LoginCommand): Promise<AuthTokens> {
    const email = command.email.trim().toLowerCase();
    if (!(await this.rateLimit.consume(email, command.ipAddress))) {
      await this.audit.record({ action: 'auth.login', outcome: 'DENIED' });
      throw new HttpException('Too many login attempts', HttpStatus.TOO_MANY_REQUESTS);
    }

    const user = await this.prisma.user.findUnique({
      include: {
        memberships: {
          where: { organizationId: command.organizationId, status: 'ACTIVE' },
        },
      },
      where: { email },
    });
    const passwordMatches = await this.password.verify(user?.passwordHash, command.password);
    const membership = user?.memberships[0];
    const accountAvailable =
      user?.status === 'ACTIVE' &&
      (user.lockedUntil === null || user.lockedUntil <= new Date()) &&
      membership !== undefined;

    if (!passwordMatches || !accountAvailable || user === null) {
      if (user !== null) await this.recordFailedLogin(user.id);
      await this.audit.record({
        action: 'auth.login',
        actorUserId: user?.id,
        organizationId: membership?.organizationId,
        outcome: 'FAILURE',
      });
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const tokens = this.createTokenPair();
    await this.prisma.$transaction([
      this.prisma.user.update({
        data: { failedLoginAttempts: 0, lastLoginAt: new Date(), lockedUntil: null },
        where: { id: user.id },
      }),
      this.prisma.authSession.create({
        data: {
          accessExpiresAt: tokens.accessExpiresAt,
          accessTokenHash: tokens.accessHash,
          id: tokens.sessionId,
          ipHash: hashSensitive(command.ipAddress),
          organizationId: membership.organizationId,
          refreshExpiresAt: tokens.refreshExpiresAt,
          refreshTokenHash: tokens.refreshHash,
          userAgentHash: command.userAgent ? hashSensitive(command.userAgent) : null,
          userId: user.id,
        },
      }),
    ]);
    await this.rateLimit.clear(email, command.ipAddress);
    await this.audit.record({
      action: 'auth.login',
      actorUserId: user.id,
      organizationId: membership.organizationId,
      outcome: 'SUCCESS',
      resourceId: tokens.sessionId,
      resourceType: 'auth_session',
    });
    return this.publicTokens(tokens);
  }

  public async discoverOrganizations(
    command: DiscoverOrganizationsCommand,
  ): Promise<readonly AuthOrganizationOption[]> {
    const email = command.email.trim().toLowerCase();
    if (!(await this.rateLimit.consume(email, command.ipAddress, 'login-options'))) {
      await this.audit.record({ action: 'auth.login_options', outcome: 'DENIED' });
      throw new HttpException('Too many login attempts', HttpStatus.TOO_MANY_REQUESTS);
    }
    const user = await this.prisma.user.findUnique({
      include: {
        memberships: {
          include: { organization: true },
          orderBy: [{ organization: { name: 'asc' } }, { organizationId: 'asc' }],
          where: { status: 'ACTIVE' },
        },
      },
      where: { email },
    });
    const passwordMatches = await this.password.verify(user?.passwordHash, command.password);
    const accountAvailable =
      user?.status === 'ACTIVE' &&
      (user.lockedUntil === null || user.lockedUntil <= new Date()) &&
      user.memberships.length > 0;
    if (!passwordMatches || !accountAvailable || user === null) {
      if (user !== null) await this.recordFailedLogin(user.id);
      await this.audit.record({
        action: 'auth.login_options',
        actorUserId: user?.id,
        outcome: 'FAILURE',
      });
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    await this.rateLimit.clear(email, command.ipAddress, 'login-options');
    await this.audit.record({
      action: 'auth.login_options',
      actorUserId: user.id,
      metadata: { organizationCount: user.memberships.length },
      outcome: 'SUCCESS',
    });
    return user.memberships.map(({ organization, organizationId, role }) => ({
      dashboardAllowed: roleHasPermission(role, 'operations.queue.read'),
      name: organization.name,
      organizationId,
      role,
    }));
  }

  public async authenticate(accessToken: string): Promise<AuthPrincipal> {
    const parsed = parseOpaqueToken(accessToken);
    if (parsed === undefined) throw new UnauthorizedException('Invalid session');
    const session = await this.prisma.authSession.findUnique({
      include: {
        user: {
          include: {
            memberships: { where: { status: 'ACTIVE' } },
          },
        },
      },
      where: { id: parsed.sessionId },
    });
    const membership = session?.user.memberships.find(
      ({ organizationId }) => organizationId === session.organizationId,
    );
    const valid =
      session !== null &&
      safeHashEquals(session.accessTokenHash, parsed.secretHash) &&
      session.revokedAt === null &&
      session.accessExpiresAt > new Date() &&
      session.user.status === 'ACTIVE' &&
      membership !== undefined;
    if (!valid || session === null || membership === undefined) {
      throw new UnauthorizedException('Invalid session');
    }
    await this.prisma.authSession.updateMany({
      data: { lastUsedAt: new Date() },
      where: {
        id: session.id,
        OR: [{ lastUsedAt: null }, { lastUsedAt: { lt: new Date(Date.now() - 60_000) } }],
      },
    });
    return {
      email: session.user.email,
      organizationId: session.organizationId,
      role: membership.role,
      sessionId: session.id,
      userId: session.userId,
    };
  }

  public async listOrganizations(
    principal: AuthPrincipal,
  ): Promise<readonly AuthOrganizationOption[]> {
    const memberships = await this.prisma.organizationMembership.findMany({
      include: { organization: true },
      orderBy: [{ organization: { name: 'asc' } }, { organizationId: 'asc' }],
      where: { status: 'ACTIVE', userId: principal.userId },
    });
    return memberships.map(({ organization, organizationId, role }) => ({
      dashboardAllowed: roleHasPermission(role, 'operations.queue.read'),
      name: organization.name,
      organizationId,
      role,
    }));
  }

  public async refresh(command: RefreshCommand): Promise<AuthTokens> {
    const parsed = parseOpaqueToken(command.refreshToken);
    if (parsed === undefined) throw new UnauthorizedException('Invalid session');
    const session = await this.prisma.authSession.findUnique({
      include: {
        user: {
          include: { memberships: { where: { status: 'ACTIVE' } } },
        },
      },
      where: { id: parsed.sessionId },
    });
    if (session === null) throw new UnauthorizedException('Invalid session');
    if (!safeHashEquals(session.refreshTokenHash, parsed.secretHash)) {
      await this.prisma.authSession.update({
        data: { revokedAt: new Date() },
        where: { id: session.id },
      });
      await this.audit.record({
        action: 'auth.refresh_reuse',
        actorUserId: session.userId,
        organizationId: session.organizationId,
        outcome: 'DENIED',
        resourceId: session.id,
        resourceType: 'auth_session',
      });
      throw new UnauthorizedException('Invalid session');
    }
    const membership = session.user.memberships.find(
      ({ organizationId }) => organizationId === session.organizationId,
    );
    if (
      session.revokedAt !== null ||
      session.refreshExpiresAt <= new Date() ||
      session.user.status !== 'ACTIVE' ||
      membership === undefined
    ) {
      if (session.revokedAt === null) {
        await this.prisma.authSession.update({
          data: { revokedAt: new Date() },
          where: { id: session.id },
        });
      }
      throw new UnauthorizedException('Invalid session');
    }
    const tokens = this.createTokenPair(session.id);
    const updated = await this.prisma.authSession.updateMany({
      data: {
        accessExpiresAt: tokens.accessExpiresAt,
        accessTokenHash: tokens.accessHash,
        ipHash: hashSensitive(command.ipAddress),
        lastUsedAt: new Date(),
        refreshExpiresAt: tokens.refreshExpiresAt,
        refreshTokenHash: tokens.refreshHash,
        refreshVersion: { increment: 1 },
        userAgentHash: command.userAgent ? hashSensitive(command.userAgent) : null,
      },
      where: { id: session.id, refreshTokenHash: parsed.secretHash, revokedAt: null },
    });
    if (updated.count !== 1) throw new UnauthorizedException('Invalid session');
    await this.audit.record({
      action: 'auth.refresh',
      actorUserId: session.userId,
      organizationId: session.organizationId,
      outcome: 'SUCCESS',
      resourceId: session.id,
      resourceType: 'auth_session',
    });
    return this.publicTokens(tokens);
  }

  public async switchOrganization(command: SwitchOrganizationCommand): Promise<AuthTokens> {
    const tokens = this.createTokenPair();
    await this.prisma.$transaction(async (transaction) => {
      const membership = await transaction.organizationMembership.findFirst({
        include: { user: true },
        where: {
          organizationId: command.organizationId,
          status: 'ACTIVE',
          userId: command.principal.userId,
        },
      });
      if (membership === null || membership.user.status !== 'ACTIVE') {
        throw new ForbiddenException('Organization access denied');
      }
      const revoked = await transaction.authSession.updateMany({
        data: { revokedAt: new Date() },
        where: { id: command.principal.sessionId, revokedAt: null },
      });
      if (revoked.count !== 1) throw new UnauthorizedException('Invalid session');
      await transaction.authSession.create({
        data: {
          accessExpiresAt: tokens.accessExpiresAt,
          accessTokenHash: tokens.accessHash,
          id: tokens.sessionId,
          ipHash: hashSensitive(command.ipAddress),
          organizationId: command.organizationId,
          refreshExpiresAt: tokens.refreshExpiresAt,
          refreshTokenHash: tokens.refreshHash,
          userAgentHash: command.userAgent ? hashSensitive(command.userAgent) : null,
          userId: command.principal.userId,
        },
      });
    });
    await this.audit.record({
      action: 'auth.organization_switched',
      actorUserId: command.principal.userId,
      metadata: { sessionRotated: true },
      organizationId: command.organizationId,
      outcome: 'SUCCESS',
      resourceId: tokens.sessionId,
      resourceType: 'auth_session',
    });
    return this.publicTokens(tokens);
  }

  public async logout(principal: AuthPrincipal): Promise<void> {
    await this.prisma.authSession.update({
      data: { revokedAt: new Date() },
      where: { id: principal.sessionId },
    });
    await this.audit.record({
      action: 'auth.logout',
      actorUserId: principal.userId,
      organizationId: principal.organizationId,
      outcome: 'SUCCESS',
      resourceId: principal.sessionId,
      resourceType: 'auth_session',
    });
  }

  private createTokenPair(existingSessionId?: string) {
    const sessionId = existingSessionId ?? randomUUID();
    const access = issueOpaqueToken(sessionId);
    const refresh = issueOpaqueToken(sessionId);
    return {
      accessExpiresAt: new Date(Date.now() + this.environment.auth.accessTtlSeconds * 1_000),
      accessHash: access.hash,
      accessToken: access.token,
      refreshExpiresAt: new Date(Date.now() + this.environment.auth.refreshTtlSeconds * 1_000),
      refreshHash: refresh.hash,
      refreshToken: refresh.token,
      sessionId,
    };
  }

  private publicTokens(tokens: ReturnType<AuthService['createTokenPair']>): AuthTokens {
    return {
      accessExpiresAt: tokens.accessExpiresAt.toISOString(),
      accessToken: tokens.accessToken,
      refreshExpiresAt: tokens.refreshExpiresAt.toISOString(),
      refreshToken: tokens.refreshToken,
    };
  }

  private async recordFailedLogin(userId: string): Promise<void> {
    const config = this.environment.auth;
    await this.prisma.$executeRaw`
      UPDATE users
      SET failed_login_attempts = failed_login_attempts + 1,
          locked_until = CASE
            WHEN failed_login_attempts + 1 >= ${config.loginMaxAttempts}
              THEN NOW() + (${config.blockDurationMs} * INTERVAL '1 millisecond')
            ELSE locked_until
          END,
          updated_at = NOW()
      WHERE id = ${userId}::uuid
    `;
  }
}
