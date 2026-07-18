import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';

import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { RbacGuard } from '../auth/rbac.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { OPERATIONAL_ITEM_TYPES } from './operational-read-model';
import { OperationalAlertService } from './operational-alert.service';

const identifier = z.string().uuid();
const querySchema = z
  .object({
    cursor: z.string().min(1).max(512).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    status: z.enum(['open', 'resolved']).optional(),
    type: z.enum(OPERATIONAL_ITEM_TYPES).optional(),
  })
  .strict();

@Controller('operations/organizations/:organizationId/alerts')
@RequirePermission('operations.alerts.read')
@UseGuards(AuthGuard, RbacGuard)
export class OperationalAlertController {
  public constructor(private readonly alerts: OperationalAlertService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  public list(
    @Param('organizationId') organizationId: string,
    @Query() rawQuery: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const principal = request.auth;
    const parsedOrganization = identifier.safeParse(organizationId);
    const parsedQuery = querySchema.safeParse(rawQuery);
    if (!parsedOrganization.success || !parsedQuery.success || principal === undefined) {
      throw new BadRequestException('Invalid request');
    }
    const { status, ...query } = parsedQuery.data;
    return this.alerts.list({
      ...query,
      organizationId: parsedOrganization.data,
      principal,
      ...(status === undefined ? {} : { status: status === 'open' ? 'OPEN' : 'RESOLVED' }),
    });
  }

  @Get('rules')
  @Header('Cache-Control', 'no-store')
  public listRules(
    @Param('organizationId') organizationId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const principal = request.auth;
    const parsedOrganization = identifier.safeParse(organizationId);
    if (!parsedOrganization.success || principal === undefined) {
      throw new BadRequestException('Invalid request');
    }
    return this.alerts.listRules({ organizationId: parsedOrganization.data, principal });
  }
}
