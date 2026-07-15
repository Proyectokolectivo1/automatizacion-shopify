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

import { WhatsAppStatusService } from './whatsapp-status.service';

const identifierSchema = z.string().uuid();
const signatureSchema = z.string().trim().min(1).max(256);

@Controller('webhooks/whatsapp/:storeId')
export class WhatsAppStatusController {
  public constructor(private readonly statuses: WhatsAppStatusService) {}

  @Post('statuses')
  @HttpCode(202)
  @Header('Cache-Control', 'no-store')
  public receiveStatus(
    @Headers('x-simulated-whatsapp-signature-v1') signature: string | undefined,
    @Param('storeId') storeId: string,
    @Req() request: Request,
  ) {
    const parsedStoreId = identifierSchema.safeParse(storeId);
    const parsedSignature = signatureSchema.safeParse(signature);
    if (!parsedStoreId.success || !parsedSignature.success || !Buffer.isBuffer(request.body)) {
      throw new BadRequestException('Invalid WhatsApp status webhook request');
    }
    return this.statuses.receive({
      rawBody: request.body,
      signature: parsedSignature.data,
      storeId: parsedStoreId.data,
    });
  }
}
