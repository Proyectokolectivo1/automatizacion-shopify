import {
  BadRequestException,
  Controller,
  Header,
  Headers,
  HttpCode,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';

import { WhatsAppInboundService } from './whatsapp-inbound.service';

const identifierSchema = z.string().uuid();
const signatureSchema = z.string().trim().min(1).max(256);

@Controller('webhooks/whatsapp/:storeId')
export class WhatsAppInboundController {
  public constructor(private readonly inbound: WhatsAppInboundService) {}

  @Post('messages')
  @HttpCode(202)
  @Header('Cache-Control', 'no-store')
  public receiveMessage(
    @Headers('x-simulated-whatsapp-signature-v1') signature: string | undefined,
    @Param('storeId') storeId: string,
    @Req() request: Request,
  ) {
    const parsedStoreId = identifierSchema.safeParse(storeId);
    const parsedSignature = signatureSchema.safeParse(signature);
    if (!parsedStoreId.success || !parsedSignature.success || !Buffer.isBuffer(request.body)) {
      throw new BadRequestException('Invalid WhatsApp inbound webhook request');
    }
    return this.inbound.receive({
      rawBody: request.body,
      signature: parsedSignature.data,
      storeId: parsedStoreId.data,
    });
  }
}
