import {
  BadRequestException,
  Body,
  Controller,
  Header,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';

import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { RbacGuard } from '../auth/rbac.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { WhatsAppIntegrationService } from './whatsapp-integration.service';

const identifierSchema = z.string().uuid();
const idempotencyKeySchema = z.string().trim().min(8).max(200);
const providerIdentifierSchema = z.string().regex(/^[A-Za-z0-9_-]{3,128}$/u);
const tokenSchema = z.object({ accessToken: z.string().min(16).max(512) });
const registrationSchema = tokenSchema.extend({
  apiVersion: z.string().regex(/^v[1-9][0-9]{0,2}[.][0-9]+$/u),
  businessAccountId: providerIdentifierSchema,
  displayName: z.string().trim().min(1).max(160),
  phoneNumberId: providerIdentifierSchema,
});

@Controller('integrations/organizations/:organizationId/whatsapp/stores')
@RequirePermission('integration.manage')
@UseGuards(AuthGuard, RbacGuard)
export class WhatsAppIntegrationController {
  public constructor(private readonly whatsapp: WhatsAppIntegrationService) {}

  @Post(':storeId')
  @HttpCode(201)
  @Header('Cache-Control', 'no-store')
  public configure(
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('organizationId') organizationId: string,
    @Param('storeId') storeId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const parsed = this.parseStore(idempotencyKey, organizationId, storeId, request);
    const registration = registrationSchema.safeParse(body);
    if (!registration.success) throw new BadRequestException('Invalid request');
    return this.whatsapp.configure({ ...parsed, ...registration.data });
  }

  @Post(':storeId/test')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  public testConnection(
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('organizationId') organizationId: string,
    @Param('storeId') storeId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.whatsapp.testConnection(
      this.parseStore(idempotencyKey, organizationId, storeId, request),
    );
  }

  @Post(':storeId/activate')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  public activate(
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('organizationId') organizationId: string,
    @Param('storeId') storeId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.whatsapp.activate(
      this.parseStore(idempotencyKey, organizationId, storeId, request),
    );
  }

  @Post(':storeId/deactivate')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  public deactivate(
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('organizationId') organizationId: string,
    @Param('storeId') storeId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.whatsapp.deactivate(
      this.parseStore(idempotencyKey, organizationId, storeId, request),
    );
  }

  @Patch(':storeId/credentials')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  public rotateCredentials(
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('organizationId') organizationId: string,
    @Param('storeId') storeId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const parsed = this.parseStore(idempotencyKey, organizationId, storeId, request);
    const token = tokenSchema.safeParse(body);
    if (!token.success) throw new BadRequestException('Invalid request');
    return this.whatsapp.rotateCredentials({ ...parsed, accessToken: token.data.accessToken });
  }

  private parseStore(
    idempotencyKey: string | undefined,
    organizationId: string,
    storeId: string,
    request: AuthenticatedRequest,
  ) {
    const principal = request.auth;
    const parsedKey = idempotencyKeySchema.safeParse(idempotencyKey);
    const parsedOrganizationId = identifierSchema.safeParse(organizationId);
    const parsedStoreId = identifierSchema.safeParse(storeId);
    if (
      !parsedKey.success ||
      !parsedOrganizationId.success ||
      !parsedStoreId.success ||
      principal === undefined
    ) {
      throw new BadRequestException('Invalid request');
    }
    return {
      idempotencyKey: parsedKey.data,
      organizationId: parsedOrganizationId.data,
      principal,
      storeId: parsedStoreId.data,
    };
  }
}
