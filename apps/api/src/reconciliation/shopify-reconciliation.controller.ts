import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';

import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { RbacGuard } from '../auth/rbac.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { ShopifyReconciliationService } from './shopify-reconciliation.service';

const identifier = z.string().uuid();
const idempotencyKey = z.string().trim().min(8).max(200);
const runBody = z.object({
  windowEndedAt: z.iso.datetime({ offset: true }).transform((value) => new Date(value)),
  windowStartedAt: z.iso.datetime({ offset: true }).transform((value) => new Date(value)),
});
const inspectQuery = z.object({
  cursor: z.string().trim().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(['OPEN', 'REPROCESSING', 'RESOLVED']).optional(),
});

@Controller('operations/organizations/:organizationId/shopify/reconciliation')
@RequirePermission('reconciliation.manage')
@UseGuards(AuthGuard, RbacGuard)
export class ShopifyReconciliationController {
  public constructor(private readonly reconciliation: ShopifyReconciliationService) {}

  @Post('stores/:storeId/run')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  public run(
    @Body() body: unknown,
    @Param('organizationId') organizationId: string,
    @Req() request: AuthenticatedRequest,
    @Param('storeId') storeId: string,
  ) {
    const principal = request.auth;
    const parsed = runBody.safeParse(body);
    const parsedOrganization = identifier.safeParse(organizationId);
    const parsedStore = identifier.safeParse(storeId);
    if (
      !parsed.success ||
      !parsedOrganization.success ||
      !parsedStore.success ||
      principal === undefined
    ) {
      throw new BadRequestException('Invalid request');
    }
    return this.reconciliation.run({
      ...parsed.data,
      organizationId: parsedOrganization.data,
      principal,
      storeId: parsedStore.data,
    });
  }

  @Get('issues')
  @Header('Cache-Control', 'no-store')
  public inspect(
    @Param('organizationId') organizationId: string,
    @Query() query: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const principal = request.auth;
    const parsed = inspectQuery.safeParse(query);
    const parsedOrganization = identifier.safeParse(organizationId);
    if (!parsed.success || !parsedOrganization.success || principal === undefined) {
      throw new BadRequestException('Invalid request');
    }
    return this.reconciliation.inspect({
      ...parsed.data,
      organizationId: parsedOrganization.data,
      principal,
    });
  }

  @Post('issues/:issueId/reprocess')
  @HttpCode(202)
  @Header('Cache-Control', 'no-store')
  public reprocess(
    @Headers('idempotency-key') rawKey: string | undefined,
    @Param('issueId') issueId: string,
    @Param('organizationId') organizationId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const principal = request.auth;
    const parsedIssue = identifier.safeParse(issueId);
    const parsedKey = idempotencyKey.safeParse(rawKey);
    const parsedOrganization = identifier.safeParse(organizationId);
    if (
      !parsedIssue.success ||
      !parsedKey.success ||
      !parsedOrganization.success ||
      principal === undefined
    ) {
      throw new BadRequestException('Invalid request');
    }
    return this.reconciliation.reprocess({
      idempotencyKey: parsedKey.data,
      issueId: parsedIssue.data,
      organizationId: parsedOrganization.data,
      principal,
    });
  }
}
