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
import { WhatsAppAssignmentService } from './whatsapp-assignment.service';
import { WhatsAppInboxService } from './whatsapp-inbox.service';

const identifierSchema = z.string().uuid();
const idempotencyKeySchema = z.string().trim().min(8).max(200);
const baseQuerySchema = z.object({
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
const conversationQuerySchema = baseQuerySchema
  .extend({
    identity: z.enum(['known_customer', 'unknown_contact']).optional(),
    status: z.enum(['open', 'closed']).optional(),
  })
  .strict();
const timelineQuerySchema = baseQuerySchema
  .extend({ direction: z.enum(['inbound', 'outbound']).optional() })
  .strict();
const claimSchema = z.object({ expectedVersion: z.number().int().min(0) }).strict();
const reassignSchema = claimSchema
  .extend({
    assigneeMembershipId: identifierSchema,
    reasonCode: z.enum(['SHIFT_CHANGE', 'SPECIALIST_ROUTING', 'WORKLOAD_BALANCE']),
  })
  .strict();
const unassignSchema = claimSchema
  .extend({ reasonCode: z.enum(['AGENT_UNAVAILABLE', 'MANUAL_RELEASE', 'SHIFT_CHANGE']) })
  .strict();

@Controller('operations/organizations/:organizationId/whatsapp/stores/:storeId/conversations')
@RequirePermission('whatsapp-conversations.read')
@UseGuards(AuthGuard, RbacGuard)
export class WhatsAppInboxController {
  public constructor(
    private readonly assignments: WhatsAppAssignmentService,
    private readonly inbox: WhatsAppInboxService,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  public list(
    @Param('organizationId') organizationId: string,
    @Param('storeId') storeId: string,
    @Query() rawQuery: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const tenant = this.parseTenant(organizationId, storeId, request);
    const query = conversationQuerySchema.safeParse(rawQuery);
    if (!query.success) throw new BadRequestException('Invalid request');
    return this.inbox.list({ ...tenant, ...query.data });
  }

  @Get(':conversationId/messages')
  @Header('Cache-Control', 'no-store')
  public timeline(
    @Param('conversationId') conversationId: string,
    @Param('organizationId') organizationId: string,
    @Param('storeId') storeId: string,
    @Query() rawQuery: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const tenant = this.parseTenant(organizationId, storeId, request);
    const parsedConversationId = identifierSchema.safeParse(conversationId);
    const query = timelineQuerySchema.safeParse(rawQuery);
    if (!parsedConversationId.success || !query.success) {
      throw new BadRequestException('Invalid request');
    }
    return this.inbox.timeline({
      ...tenant,
      ...query.data,
      conversationId: parsedConversationId.data,
    });
  }

  @Post(':conversationId/assignment/claim')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @RequirePermission('whatsapp-conversations.claim')
  public claim(
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('conversationId') conversationId: string,
    @Param('organizationId') organizationId: string,
    @Param('storeId') storeId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const tenant = this.parseTenant(organizationId, storeId, request);
    const parsedBody = claimSchema.safeParse(body);
    const parsedConversationId = identifierSchema.safeParse(conversationId);
    const parsedKey = idempotencyKeySchema.safeParse(idempotencyKey);
    if (!parsedBody.success || !parsedConversationId.success || !parsedKey.success) {
      throw new BadRequestException('Invalid request');
    }
    return this.assignments.claim({
      ...tenant,
      ...parsedBody.data,
      conversationId: parsedConversationId.data,
      idempotencyKey: parsedKey.data,
    });
  }

  @Post(':conversationId/assignment/reassign')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @RequirePermission('whatsapp-conversations.assign')
  public reassign(
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('conversationId') conversationId: string,
    @Param('organizationId') organizationId: string,
    @Param('storeId') storeId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const tenant = this.parseTenant(organizationId, storeId, request);
    const parsedBody = reassignSchema.safeParse(body);
    const parsedConversationId = identifierSchema.safeParse(conversationId);
    const parsedKey = idempotencyKeySchema.safeParse(idempotencyKey);
    if (!parsedBody.success || !parsedConversationId.success || !parsedKey.success) {
      throw new BadRequestException('Invalid request');
    }
    return this.assignments.reassign({
      ...tenant,
      ...parsedBody.data,
      conversationId: parsedConversationId.data,
      idempotencyKey: parsedKey.data,
    });
  }

  @Post(':conversationId/assignment/unassign')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @RequirePermission('whatsapp-conversations.assign')
  public unassign(
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('conversationId') conversationId: string,
    @Param('organizationId') organizationId: string,
    @Param('storeId') storeId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const tenant = this.parseTenant(organizationId, storeId, request);
    const parsedBody = unassignSchema.safeParse(body);
    const parsedConversationId = identifierSchema.safeParse(conversationId);
    const parsedKey = idempotencyKeySchema.safeParse(idempotencyKey);
    if (!parsedBody.success || !parsedConversationId.success || !parsedKey.success) {
      throw new BadRequestException('Invalid request');
    }
    return this.assignments.unassign({
      ...tenant,
      ...parsedBody.data,
      conversationId: parsedConversationId.data,
      idempotencyKey: parsedKey.data,
    });
  }

  private parseTenant(organizationId: string, storeId: string, request: AuthenticatedRequest) {
    const parsedOrganizationId = identifierSchema.safeParse(organizationId);
    const parsedStoreId = identifierSchema.safeParse(storeId);
    if (!parsedOrganizationId.success || !parsedStoreId.success || request.auth === undefined) {
      throw new BadRequestException('Invalid request');
    }
    return {
      organizationId: parsedOrganizationId.data,
      principal: request.auth,
      storeId: parsedStoreId.data,
    };
  }
}
