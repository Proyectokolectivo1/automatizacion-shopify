import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';

import { AccountActionService } from './account-action.service';
import { AuthGuard, type AuthenticatedRequest } from './auth.guard';
import { AuthService } from './auth.service';
import { RbacGuard } from './rbac.guard';
import { RequirePermission } from './require-permission.decorator';

const loginSchema = z.object({
  email: z.string().trim().email().max(320),
  organizationId: z.string().uuid(),
  password: z.string().min(12).max(128),
});
const loginOptionsSchema = z
  .object({
    email: z.string().trim().email().max(320),
    password: z.string().min(12).max(128),
  })
  .strict();
const refreshSchema = z.object({ refreshToken: z.string().min(1).max(200) });
const switchOrganizationSchema = z.object({ organizationId: z.string().uuid() }).strict();
const invitationSchema = z.object({
  email: z.string().trim().email().max(320),
  role: z.enum(['OWNER', 'ADMIN', 'OPERATIONS', 'LOGISTICS', 'SUPPORT', 'FINANCE', 'READ_ONLY']),
});
const acceptInvitationSchema = z.object({
  password: z.string().min(12).max(128),
  token: z.string().min(32).max(200),
});
const requestRecoverySchema = z.object({ email: z.string().trim().email().max(320) });
const completeRecoverySchema = z.object({
  newPassword: z.string().min(12).max(128),
  token: z.string().min(32).max(200),
});

@Controller('auth')
export class AuthController {
  public constructor(
    private readonly accountActions: AccountActionService,
    private readonly auth: AuthService,
  ) {}

  @Post('login')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  public login(@Body() body: unknown, @Req() request: Request) {
    const input = this.parse(loginSchema, body);
    return this.auth.login({
      ...input,
      ipAddress: request.ip ?? 'unknown',
      userAgent: request.header('user-agent'),
    });
  }

  @Post('login-options')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  public loginOptions(@Body() body: unknown, @Req() request: Request) {
    const input = this.parse(loginOptionsSchema, body);
    return this.auth.discoverOrganizations({
      ...input,
      ipAddress: request.ip ?? 'unknown',
    });
  }

  @Post('refresh')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  public refresh(@Body() body: unknown, @Req() request: Request) {
    const input = this.parse(refreshSchema, body);
    return this.auth.refresh({
      ...input,
      ipAddress: request.ip ?? 'unknown',
      userAgent: request.header('user-agent'),
    });
  }

  @Post('organizations/:organizationId/invitations')
  @HttpCode(202)
  @Header('Cache-Control', 'no-store')
  @RequirePermission('organization.manage')
  @UseGuards(AuthGuard, RbacGuard)
  public createInvitation(
    @Body() body: unknown,
    @Param('organizationId') organizationId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = this.parse(invitationSchema, body);
    if (request.auth === undefined)
      throw new BadRequestException('Missing authenticated principal');
    return this.accountActions.createInvitation({
      ...input,
      organizationId,
      principal: request.auth,
    });
  }

  @Post('invitations/accept')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  public acceptInvitation(@Body() body: unknown) {
    return this.accountActions.acceptInvitation(this.parse(acceptInvitationSchema, body));
  }

  @Post('password-recovery/request')
  @HttpCode(202)
  @Header('Cache-Control', 'no-store')
  public requestPasswordRecovery(@Body() body: unknown, @Req() request: Request) {
    return this.accountActions.requestPasswordRecovery({
      ...this.parse(requestRecoverySchema, body),
      ipAddress: request.ip ?? 'unknown',
    });
  }

  @Post('password-recovery/complete')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  public completePasswordRecovery(@Body() body: unknown) {
    return this.accountActions.completePasswordRecovery(this.parse(completeRecoverySchema, body));
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  public async logout(@Req() request: AuthenticatedRequest): Promise<void> {
    if (request.auth === undefined)
      throw new BadRequestException('Missing authenticated principal');
    await this.auth.logout(request.auth);
  }

  @Get('organizations')
  @Header('Cache-Control', 'no-store')
  @UseGuards(AuthGuard)
  public organizations(@Req() request: AuthenticatedRequest) {
    if (request.auth === undefined)
      throw new BadRequestException('Missing authenticated principal');
    return this.auth.listOrganizations(request.auth);
  }

  @Post('switch-organization')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @UseGuards(AuthGuard)
  public switchOrganization(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    if (request.auth === undefined)
      throw new BadRequestException('Missing authenticated principal');
    return this.auth.switchOrganization({
      ...this.parse(switchOrganizationSchema, body),
      ipAddress: request.ip ?? 'unknown',
      principal: request.auth,
      userAgent: request.header('user-agent'),
    });
  }

  @Get('me')
  @Header('Cache-Control', 'no-store')
  @UseGuards(AuthGuard)
  public me(@Req() request: AuthenticatedRequest) {
    return request.auth;
  }

  @Get('organizations/:organizationId/admin-check')
  @RequirePermission('organization.manage')
  @UseGuards(AuthGuard, RbacGuard)
  public adminCheck(@Param('organizationId') organizationId: string) {
    return { authorized: true, organizationId };
  }

  private parse<T>(schema: z.ZodType<T>, body: unknown): T {
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid request');
    return parsed.data;
  }
}
