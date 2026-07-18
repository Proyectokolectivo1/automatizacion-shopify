import { BadRequestException, Controller, Header, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';

import { WompiWebhookService } from './wompi-webhook.service';

@Controller('webhooks/wompi')
export class WompiWebhookController {
  public constructor(private readonly webhooks: WompiWebhookService) {}

  @Post('transactions')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  public receiveTransaction(@Req() request: Request) {
    if (!Buffer.isBuffer(request.body)) {
      throw new BadRequestException('Invalid Wompi webhook request');
    }
    return this.webhooks.receive(request.body);
  }
}
