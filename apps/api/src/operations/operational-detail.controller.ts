import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';

import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { RbacGuard } from '../auth/rbac.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { OPERATIONAL_ITEM_TYPES } from './operational-read-model';
import { OperationalDetailService } from './operational-detail.service';

const identifier = z.string().uuid();
const itemType = z.enum(OPERATIONAL_ITEM_TYPES);

@Controller('operations/organizations/:organizationId/items')
@RequirePermission('operations.detail.read')
@UseGuards(AuthGuard, RbacGuard)
export class OperationalDetailController {
  public constructor(private readonly detail: OperationalDetailService) {}

  @Get(':type/:itemId')
  @Header('Cache-Control', 'no-store')
  public get(
    @Param('organizationId') organizationId: string,
    @Param('type') type: string,
    @Param('itemId') itemId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const principal = request.auth;
    const parsedOrganization = identifier.safeParse(organizationId);
    const parsedItemId = identifier.safeParse(itemId);
    const parsedType = itemType.safeParse(type);
    if (
      !parsedOrganization.success ||
      !parsedItemId.success ||
      !parsedType.success ||
      principal === undefined
    ) {
      throw new BadRequestException('Invalid request');
    }
    return this.detail.get({
      itemId: parsedItemId.data,
      organizationId: parsedOrganization.data,
      principal,
      type: parsedType.data,
    });
  }
}
