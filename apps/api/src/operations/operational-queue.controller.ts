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
import { OperationalQueueService } from './operational-queue.service';

const identifier = z.string().uuid();
const itemType = z.enum([
  'order',
  'payment_intent',
  'shopify_reconciliation_issue',
  'whatsapp_conversation',
  'wompi_reconciliation_issue',
]);
const itemStatus = z.enum([
  'abandono_pago_transporte',
  'approved',
  'cancelled',
  'closed',
  'declined',
  'error',
  'expired',
  'invalid_data',
  'manual_review',
  'open',
  'pending',
  'pending_transport_payment',
  'ready_for_logistics',
  'ready_for_payment_classification',
  'received',
  'reprocessing',
  'resolved',
  'transport_payment_expired',
  'validating',
  'voided',
]);
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

@Controller('operations/organizations/:organizationId/queue')
@RequirePermission('operations.queue.read')
@UseGuards(AuthGuard, RbacGuard)
export class OperationalQueueController {
  public constructor(private readonly queue: OperationalQueueService) {}

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
}
