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
import { PaymentIntentService } from './payment-intent.service';

const identifier = z.string().uuid();
const idempotencyKey = z.string().trim().min(8).max(200);
const emptyBody = z.object({}).strict();

@Controller('operations/organizations/:organizationId/payments')
@UseGuards(AuthGuard, RbacGuard)
export class PaymentIntentController {
  public constructor(private readonly paymentIntents: PaymentIntentService) {}

  @Post('orders/:orderId/intents')
  @HttpCode(201)
  @Header('Cache-Control', 'no-store')
  @RequirePermission('payment-intents.create')
  public create(
    @Body() body: unknown,
    @Headers('idempotency-key') rawKey: string | undefined,
    @Param('orderId') orderId: string,
    @Param('organizationId') organizationId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const parsedKey = idempotencyKey.safeParse(rawKey);
    const parsedBody = emptyBody.safeParse(body ?? {});
    const parsedOrder = identifier.safeParse(orderId);
    const parsedOrganization = identifier.safeParse(organizationId);
    const principal = request.auth;
    if (
      !parsedKey.success ||
      !parsedBody.success ||
      !parsedOrder.success ||
      !parsedOrganization.success ||
      principal === undefined
    ) {
      throw new BadRequestException('Invalid request');
    }
    return this.paymentIntents.create({
      idempotencyKey: parsedKey.data,
      orderId: parsedOrder.data,
      organizationId: parsedOrganization.data,
      principal,
    });
  }
}
