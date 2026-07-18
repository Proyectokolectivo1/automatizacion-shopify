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

import { ShopifyWebhookService } from './shopify-webhook.service';

const identifierSchema = z.string().uuid();
const headersSchema = z.object({
  apiVersion: z.string().trim().min(1).max(32),
  hmac: z.string().trim().min(1).max(256),
  shopDomain: z.string().trim().min(1).max(255),
  topic: z.literal('orders/create'),
  triggeredAt: z.string().trim().min(1).max(64),
  webhookId: z.string().trim().min(1).max(128),
});

@Controller('webhooks/shopify/:storeId')
export class ShopifyWebhookController {
  public constructor(private readonly webhooks: ShopifyWebhookService) {}

  @Post('orders-create')
  @HttpCode(202)
  @Header('Cache-Control', 'no-store')
  public receiveOrdersCreate(
    @Param('storeId') storeId: string,
    @Headers('x-shopify-api-version') apiVersion: string | undefined,
    @Headers('x-shopify-hmac-sha256') hmac: string | undefined,
    @Headers('x-shopify-shop-domain') shopDomain: string | undefined,
    @Headers('x-shopify-topic') topic: string | undefined,
    @Headers('x-shopify-triggered-at') triggeredAt: string | undefined,
    @Headers('x-shopify-webhook-id') webhookId: string | undefined,
    @Req() request: Request,
  ) {
    const parsedStoreId = identifierSchema.safeParse(storeId);
    const parsedHeaders = headersSchema.safeParse({
      apiVersion,
      hmac,
      shopDomain,
      topic,
      triggeredAt,
      webhookId,
    });
    if (!parsedStoreId.success || !parsedHeaders.success || !Buffer.isBuffer(request.body)) {
      throw new BadRequestException('Invalid Shopify webhook request');
    }
    return this.webhooks.receive({
      ...parsedHeaders.data,
      rawBody: request.body,
      storeId: parsedStoreId.data,
    });
  }
}
