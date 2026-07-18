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
import { FinanceOverviewService } from './finance-overview.service';

const identifier = z.string().uuid();
const querySchema = z
  .object({
    from: z.iso.datetime({ offset: true }).transform((value) => new Date(value)),
    to: z.iso.datetime({ offset: true }).transform((value) => new Date(value)),
  })
  .strict()
  .refine(({ from, to }) => from < to, { message: 'Invalid date range' })
  .refine(({ from, to }) => to.getTime() - from.getTime() <= 31 * 24 * 60 * 60 * 1000, {
    message: 'Date range exceeds 31 days',
  });

@Controller('finance/organizations/:organizationId/overview')
@RequirePermission('finance.overview.read')
@UseGuards(AuthGuard, RbacGuard)
export class FinanceOverviewController {
  public constructor(private readonly overview: FinanceOverviewService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  public get(
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
    return this.overview.summarize({
      ...parsedQuery.data,
      organizationId: parsedOrganization.data,
      principal,
    });
  }
}
