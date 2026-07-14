import {
  BadRequestException,
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
import { DlqOperationsService } from './dlq-operations.service';

const identifierSchema = z.string().uuid();
const querySchema = z.object({
  cursor: z.string().max(512).optional(),
  eventType: z.string().trim().min(1).max(160).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
const idempotencyKeySchema = z.string().trim().min(8).max(200);

@Controller('operations/organizations/:organizationId/dlq')
@RequirePermission('outbox.manage')
@UseGuards(AuthGuard, RbacGuard)
export class DlqOperationsController {
  public constructor(private readonly operations: DlqOperationsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  public inspect(
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
    return this.operations.inspect({
      ...query.data,
      organizationId: parsedOrganizationId.data,
      principal,
    });
  }

  @Post(':eventId/reprocess')
  @HttpCode(202)
  @Header('Cache-Control', 'no-store')
  public reprocess(
    @Param('eventId') eventId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('organizationId') organizationId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const principal = request.auth;
    const parsedEventId = identifierSchema.safeParse(eventId);
    const parsedKey = idempotencyKeySchema.safeParse(idempotencyKey);
    const parsedOrganizationId = identifierSchema.safeParse(organizationId);
    if (
      !parsedEventId.success ||
      !parsedKey.success ||
      !parsedOrganizationId.success ||
      principal === undefined
    ) {
      throw new BadRequestException('Invalid request');
    }
    return this.operations.reprocess({
      eventId: parsedEventId.data,
      idempotencyKey: parsedKey.data,
      organizationId: parsedOrganizationId.data,
      principal,
    });
  }
}
