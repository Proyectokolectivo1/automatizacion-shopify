import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';

import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { RbacGuard } from '../auth/rbac.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { IdentityAdministrationService } from './identity-administration.service';

const identifierSchema = z.string().uuid();
const idempotencyKeySchema = z.string().trim().min(8).max(200);
const querySchema = z.object({
  cursor: z.string().max(512).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
const roleSchema = z.object({
  role: z.enum(['OWNER', 'ADMIN', 'OPERATIONS', 'LOGISTICS', 'SUPPORT', 'FINANCE', 'READ_ONLY']),
});

@Controller('identity/organizations/:organizationId/memberships')
@RequirePermission('identity.manage')
@UseGuards(AuthGuard, RbacGuard)
export class IdentityAdministrationController {
  public constructor(private readonly identities: IdentityAdministrationService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  public list(
    @Param('organizationId') organizationId: string,
    @Query() rawQuery: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const principal = request.auth;
    const parsedOrganizationId = identifierSchema.safeParse(organizationId);
    const query = querySchema.safeParse(rawQuery);
    if (!parsedOrganizationId.success || !query.success || principal === undefined) {
      throw new BadRequestException('Invalid request');
    }
    return this.identities.list({
      ...query.data,
      organizationId: parsedOrganizationId.data,
      principal,
    });
  }

  @Patch(':membershipId/role')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  public changeRole(
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('membershipId') membershipId: string,
    @Param('organizationId') organizationId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const principal = request.auth;
    const parsedBody = roleSchema.safeParse(body);
    const parsedKey = idempotencyKeySchema.safeParse(idempotencyKey);
    const parsedMembershipId = identifierSchema.safeParse(membershipId);
    const parsedOrganizationId = identifierSchema.safeParse(organizationId);
    if (
      !parsedBody.success ||
      !parsedKey.success ||
      !parsedMembershipId.success ||
      !parsedOrganizationId.success ||
      principal === undefined
    ) {
      throw new BadRequestException('Invalid request');
    }
    return this.identities.changeRole({
      idempotencyKey: parsedKey.data,
      membershipId: parsedMembershipId.data,
      organizationId: parsedOrganizationId.data,
      principal,
      role: parsedBody.data.role,
    });
  }

  @Post(':membershipId/revoke')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  public revoke(
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('membershipId') membershipId: string,
    @Param('organizationId') organizationId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const principal = request.auth;
    const parsedKey = idempotencyKeySchema.safeParse(idempotencyKey);
    const parsedMembershipId = identifierSchema.safeParse(membershipId);
    const parsedOrganizationId = identifierSchema.safeParse(organizationId);
    if (
      !parsedKey.success ||
      !parsedMembershipId.success ||
      !parsedOrganizationId.success ||
      principal === undefined
    ) {
      throw new BadRequestException('Invalid request');
    }
    return this.identities.revoke({
      idempotencyKey: parsedKey.data,
      membershipId: parsedMembershipId.data,
      organizationId: parsedOrganizationId.data,
      principal,
    });
  }
}
