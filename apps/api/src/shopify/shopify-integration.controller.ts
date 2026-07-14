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
import { ShopifyIntegrationService } from './shopify-integration.service';

const identifierSchema = z.string().uuid();
const idempotencyKeySchema = z.string().trim().min(8).max(200);
const tokenSchema = z.object({ accessToken: z.string().min(16).max(512) });
const registrationSchema = tokenSchema.extend({
  currency: z.string().regex(/^[A-Z]{3}$/u),
  displayName: z.string().trim().min(1).max(160),
  name: z.string().trim().min(1).max(160),
  shopDomain: z.string().trim().min(1).max(255),
  timezone: z.string().trim().min(1).max(64),
});

@Controller('integrations/organizations/:organizationId/shopify/stores')
@RequirePermission('integration.manage')
@UseGuards(AuthGuard, RbacGuard)
export class ShopifyIntegrationController {
  public constructor(private readonly shopify: ShopifyIntegrationService) {}

  @Post()
  @HttpCode(201)
  @Header('Cache-Control', 'no-store')
  public register(
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('organizationId') organizationId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const parsed = this.parse(body, idempotencyKey, organizationId, request);
    const registration = registrationSchema.safeParse(body);
    if (!registration.success) throw new BadRequestException('Invalid request');
    return this.shopify.register({
      ...registration.data,
      idempotencyKey: parsed.idempotencyKey,
      organizationId: parsed.organizationId,
      principal: parsed.principal,
    });
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
    return this.shopify.testConnection(
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
    return this.shopify.activate(this.parseStore(idempotencyKey, organizationId, storeId, request));
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
    return this.shopify.deactivate(
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
    return this.shopify.rotateCredentials({ ...parsed, accessToken: token.data.accessToken });
  }

  private parse(
    _body: unknown,
    idempotencyKey: string | undefined,
    organizationId: string,
    request: AuthenticatedRequest,
  ) {
    const principal = request.auth;
    const parsedKey = idempotencyKeySchema.safeParse(idempotencyKey);
    const parsedOrganizationId = identifierSchema.safeParse(organizationId);
    if (!parsedKey.success || !parsedOrganizationId.success || principal === undefined) {
      throw new BadRequestException('Invalid request');
    }
    return {
      idempotencyKey: parsedKey.data,
      organizationId: parsedOrganizationId.data,
      principal,
    };
  }

  private parseStore(
    idempotencyKey: string | undefined,
    organizationId: string,
    storeId: string,
    request: AuthenticatedRequest,
  ) {
    const parsed = this.parse(undefined, idempotencyKey, organizationId, request);
    const parsedStoreId = identifierSchema.safeParse(storeId);
    if (!parsedStoreId.success) throw new BadRequestException('Invalid request');
    return { ...parsed, storeId: parsedStoreId.data };
  }
}
