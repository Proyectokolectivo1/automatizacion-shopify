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
import { OperationalSearchService } from './operational-search.service';

const identifier = z.string().uuid();
const hasControlCharacters = (value: string): boolean =>
  [...value].some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 31 || code === 127;
  });
const querySchema = z
  .object({
    cursor: z.string().min(1).max(768).optional(),
    from: z.iso.datetime({ offset: true }).transform((value) => new Date(value)),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    q: z
      .string()
      .trim()
      .min(2)
      .max(80)
      .refine((value) => !hasControlCharacters(value)),
    requiresAttention: z
      .enum(['false', 'true'])
      .transform((value) => value === 'true')
      .optional(),
    status: z.enum(OPERATIONAL_ITEM_STATUSES).optional(),
    to: z.iso.datetime({ offset: true }).transform((value) => new Date(value)),
    type: z.enum(OPERATIONAL_ITEM_TYPES).optional(),
  })
  .strict()
  .refine(({ from, to }) => from < to, { message: 'Invalid date range' })
  .refine(({ from, to }) => to.getTime() - from.getTime() <= 31 * 24 * 60 * 60 * 1000, {
    message: 'Date range exceeds 31 days',
  });

@Controller('operations/organizations/:organizationId/search')
@RequirePermission('operations.search.read')
@UseGuards(AuthGuard, RbacGuard)
export class OperationalSearchController {
  public constructor(private readonly search: OperationalSearchService) {}

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
    return this.search.list({
      ...parsedQuery.data,
      organizationId: parsedOrganization.data,
      principal,
    });
  }
}
