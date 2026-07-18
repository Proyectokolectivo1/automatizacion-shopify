import {
  BadRequestException,
  Body,
  Controller,
  Header,
  Headers,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';

import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { RbacGuard } from '../auth/rbac.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { dispatchWhatsAppMessageSchema } from './whatsapp-message.contract';
import { WhatsAppMessageService } from './whatsapp-message.service';

const identifierSchema = z.string().uuid();
const idempotencyKeySchema = z.string().trim().min(8).max(200);

@Controller('integrations/organizations/:organizationId/whatsapp/stores/:storeId/messages')
@RequirePermission('whatsapp-messages.dispatch')
@UseGuards(AuthGuard, RbacGuard)
export class WhatsAppMessageController {
  public constructor(private readonly messages: WhatsAppMessageService) {}

  @Post('transactional')
  @HttpCode(202)
  @Header('Cache-Control', 'no-store')
  public dispatch(
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('organizationId') organizationId: string,
    @Param('storeId') storeId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const parsedBody = dispatchWhatsAppMessageSchema.safeParse(body);
    const parsedKey = idempotencyKeySchema.safeParse(idempotencyKey);
    const parsedOrganizationId = identifierSchema.safeParse(organizationId);
    const parsedStoreId = identifierSchema.safeParse(storeId);
    if (
      !parsedBody.success ||
      !parsedKey.success ||
      !parsedOrganizationId.success ||
      !parsedStoreId.success ||
      request.auth === undefined
    ) {
      throw new BadRequestException('Invalid request');
    }
    return this.messages.dispatch({
      ...parsedBody.data,
      idempotencyKey: parsedKey.data,
      organizationId: parsedOrganizationId.data,
      principal: request.auth,
      storeId: parsedStoreId.data,
    });
  }
}
