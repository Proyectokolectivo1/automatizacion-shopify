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
import { WhatsAppInboxService } from './whatsapp-inbox.service';

const identifierSchema = z.string().uuid();
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

@Controller('operations/organizations/:organizationId/whatsapp/stores/:storeId/conversations')
@RequirePermission('whatsapp-conversations.read')
@UseGuards(AuthGuard, RbacGuard)
export class WhatsAppInboxController {
  public constructor(private readonly inbox: WhatsAppInboxService) {}

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
