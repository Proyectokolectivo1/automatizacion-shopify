import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { AuditService } from './audit.service';
import type { AuthenticatedRequest } from './auth.guard';
import { roleHasPermission, type Permission } from './permissions';
import { REQUIRED_PERMISSION } from './require-permission.decorator';

@Injectable()
export class RbacGuard implements CanActivate {
  public constructor(
    private readonly audit: AuditService,
    private readonly reflector: Reflector,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const permission = this.reflector.getAllAndOverride<Permission>(REQUIRED_PERMISSION, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (permission === undefined) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const principal = request.auth;
    const rawOrganizationId = request.params.organizationId;
    const routeOrganizationId =
      typeof rawOrganizationId === 'string' ? rawOrganizationId : rawOrganizationId?.[0];
    const allowed =
      principal !== undefined &&
      routeOrganizationId === principal.organizationId &&
      roleHasPermission(principal.role, permission);
    if (!allowed) {
      await this.audit.record({
        action: 'authorization.denied',
        actorUserId: principal?.userId,
        metadata: { permission },
        organizationId: principal?.organizationId,
        outcome: 'DENIED',
        resourceId: routeOrganizationId,
        resourceType: 'organization',
      });
      throw new ForbiddenException('Access denied');
    }
    return true;
  }
}
