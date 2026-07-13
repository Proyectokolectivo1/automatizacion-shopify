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

import { AuthGuard, type AuthenticatedRequest } from './auth.guard';
import { AuthService } from './auth.service';
import { RbacGuard } from './rbac.guard';
import { RequirePermission } from './require-permission.decorator';

const loginSchema = z.object({
  email: z.string().trim().email().max(320),
  organizationId: z.string().uuid(),
  password: z.string().min(12).max(128),
});
const refreshSchema = z.object({ refreshToken: z.string().min(1).max(200) });

@Controller('auth')
export class AuthController {
  public constructor(private readonly auth: AuthService) {}

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

  @Post('logout')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  public async logout(@Req() request: AuthenticatedRequest): Promise<void> {
    if (request.auth === undefined)
      throw new BadRequestException('Missing authenticated principal');
    await this.auth.logout(request.auth);
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
