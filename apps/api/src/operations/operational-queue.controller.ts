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
import { OPERATIONAL_ITEM_STATUSES, OPERATIONAL_ITEM_TYPES } from './operational-read-model';
import { OperationalQueueService } from './operational-queue.service';
import { OperationalSummaryService } from './operational-summary.service';

const identifier = z.string().uuid();
const itemType = z.enum(OPERATIONAL_ITEM_TYPES);
const itemStatus = z.enum(OPERATIONAL_ITEM_STATUSES);
const querySchema = z
  .object({
    cursor: z.string().min(1).max(512).optional(),
    from: z.iso
      .datetime({ offset: true })
      .transform((value) => new Date(value))
      .optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    requiresAttention: z
      .enum(['false', 'true'])
      .default('true')
      .transform((value) => value === 'true'),
    status: itemStatus.optional(),
    storeId: identifier.optional(),
    to: z.iso
      .datetime({ offset: true })
      .transform((value) => new Date(value))
      .optional(),
    type: itemType.optional(),
  })
  .strict()
  .refine(({ from, to }) => from === undefined || to === undefined || from <= to, {
    message: 'Invalid date range',
  });
const summaryQuerySchema = z
  .object({
    from: z.iso.datetime({ offset: true }).transform((value) => new Date(value)),
    storeId: identifier.optional(),
    to: z.iso.datetime({ offset: true }).transform((value) => new Date(value)),
    type: itemType.optional(),
  })
  .strict()
  .refine(({ from, to }) => from < to, { message: 'Invalid date range' })
  .refine(({ from, to }) => to.getTime() - from.getTime() <= 31 * 24 * 60 * 60 * 1000, {
    message: 'Date range exceeds 31 days',
  });

@Controller('operations/organizations/:organizationId/queue')
@RequirePermission('operations.queue.read')
@UseGuards(AuthGuard, RbacGuard)
export class OperationalQueueController {
  public constructor(
    private readonly queue: OperationalQueueService,
    private readonly summary: OperationalSummaryService,
  ) {}

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
    return this.queue.list({
      ...parsedQuery.data,
      organizationId: parsedOrganization.data,
      principal,
    });
  }

  @Get('summary')
  @Header('Cache-Control', 'no-store')
  public summarize(
    @Param('organizationId') organizationId: string,
    @Query() rawQuery: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const principal = request.auth;
    const parsedOrganization = identifier.safeParse(organizationId);
    const parsedQuery = summaryQuerySchema.safeParse(rawQuery);
    if (!parsedOrganization.success || !parsedQuery.success || principal === undefined) {
      throw new BadRequestException('Invalid request');
    }
    return this.summary.summarize({
      ...parsedQuery.data,
      organizationId: parsedOrganization.data,
      principal,
    });
  }
}
