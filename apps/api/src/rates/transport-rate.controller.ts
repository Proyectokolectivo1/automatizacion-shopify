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
import { TransportRateService } from './transport-rate.service';

const identifier = z.string().uuid();
const idempotencyKey = z.string().trim().min(8).max(200);
const optionalSelector = z.string().trim().min(1).max(128).optional();
const optionalDate = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value))
  .optional();
const ruleSchema = z
  .object({
    amountMinor: z.number().int().min(1).max(1_000_000_000),
    city: optionalSelector,
    department: optionalSelector,
    priority: z.number().int().min(0).max(10_000),
    ruleKey: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[a-z0-9][a-z0-9_-]*$/u),
    shopifyProductId: optionalSelector,
    validFrom: optionalDate,
    validTo: optionalDate,
  })
  .strict()
  .refine(
    (rule) =>
      rule.validFrom === undefined || rule.validTo === undefined || rule.validFrom < rule.validTo,
    { message: 'validFrom must be before validTo' },
  );
const createPolicyBody = z
  .object({
    currency: z.literal('COP'),
    rules: z.array(ruleSchema).min(1).max(200),
    storeId: identifier.optional(),
  })
  .strict()
  .refine((body) => new Set(body.rules.map(({ ruleKey }) => ruleKey)).size === body.rules.length, {
    message: 'Rule keys must be unique',
  });
const previewBody = z
  .object({
    evaluatedAt: optionalDate,
    orderId: identifier,
  })
  .strict();

@Controller('operations/organizations/:organizationId/transport-rates')
@UseGuards(AuthGuard, RbacGuard)
export class TransportRateController {
  public constructor(private readonly transportRates: TransportRateService) {}

  @Post('policies')
  @HttpCode(201)
  @Header('Cache-Control', 'no-store')
  @RequirePermission('transport-rates.manage')
  public createPolicy(
    @Body() body: unknown,
    @Headers('idempotency-key') rawKey: string | undefined,
    @Param('organizationId') organizationId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const parsedBody = createPolicyBody.safeParse(body);
    const parsedKey = idempotencyKey.safeParse(rawKey);
    const parsedOrganization = identifier.safeParse(organizationId);
    const principal = request.auth;
    if (
      !parsedBody.success ||
      !parsedKey.success ||
      !parsedOrganization.success ||
      principal === undefined
    ) {
      throw new BadRequestException('Invalid request');
    }
    return this.transportRates.createPolicy({
      ...parsedBody.data,
      idempotencyKey: parsedKey.data,
      organizationId: parsedOrganization.data,
      principal,
    });
  }

  @Post('policies/:policyId/activate')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @RequirePermission('transport-rates.manage')
  public activatePolicy(
    @Headers('idempotency-key') rawKey: string | undefined,
    @Param('organizationId') organizationId: string,
    @Param('policyId') policyId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const parsedKey = idempotencyKey.safeParse(rawKey);
    const parsedOrganization = identifier.safeParse(organizationId);
    const parsedPolicy = identifier.safeParse(policyId);
    const principal = request.auth;
    if (
      !parsedKey.success ||
      !parsedOrganization.success ||
      !parsedPolicy.success ||
      principal === undefined
    ) {
      throw new BadRequestException('Invalid request');
    }
    return this.transportRates.activatePolicy({
      idempotencyKey: parsedKey.data,
      organizationId: parsedOrganization.data,
      policyId: parsedPolicy.data,
      principal,
    });
  }

  @Post('preview')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @RequirePermission('transport-rates.resolve')
  public preview(
    @Body() body: unknown,
    @Param('organizationId') organizationId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const parsedBody = previewBody.safeParse(body);
    const parsedOrganization = identifier.safeParse(organizationId);
    const principal = request.auth;
    if (!parsedBody.success || !parsedOrganization.success || principal === undefined) {
      throw new BadRequestException('Invalid request');
    }
    return this.transportRates.preview(
      {
        orderId: parsedBody.data.orderId,
        organizationId: parsedOrganization.data,
        principal,
      },
      parsedBody.data.evaluatedAt,
    );
  }

  @Post('orders/:orderId/resolve')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @RequirePermission('transport-rates.resolve')
  public resolve(
    @Headers('idempotency-key') rawKey: string | undefined,
    @Param('orderId') orderId: string,
    @Param('organizationId') organizationId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const parsedKey = idempotencyKey.safeParse(rawKey);
    const parsedOrder = identifier.safeParse(orderId);
    const parsedOrganization = identifier.safeParse(organizationId);
    const principal = request.auth;
    if (
      !parsedKey.success ||
      !parsedOrder.success ||
      !parsedOrganization.success ||
      principal === undefined
    ) {
      throw new BadRequestException('Invalid request');
    }
    return this.transportRates.resolve({
      idempotencyKey: parsedKey.data,
      orderId: parsedOrder.data,
      organizationId: parsedOrganization.data,
      principal,
    });
  }
}
