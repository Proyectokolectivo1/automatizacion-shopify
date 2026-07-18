import { Injectable } from '@nestjs/common';
import { z } from 'zod';

const externalId = z
  .union([z.number().int().safe(), z.string().trim().min(1).max(128)])
  .transform(String);
const money = z.string().regex(/^\d+(?:\.\d{1,2})?$/u);
const optionalText = (maximum: number) => z.string().trim().max(maximum).nullable().optional();

const customerSchema = z.object({
  accepts_marketing: z.boolean().default(false),
  email: z
    .email()
    .max(320)
    .transform((value) => value.toLowerCase())
    .nullable(),
  first_name: optionalText(120),
  id: externalId,
  last_name: optionalText(120),
  phone: z
    .string()
    .regex(/^\+[1-9][0-9]{7,14}$/u)
    .nullable(),
});

const addressSchema = z.object({
  address1: z.string().trim().min(1).max(255).nullable(),
  address2: optionalText(255),
  city: z.string().trim().min(1).max(120).nullable(),
  country_code: z
    .string()
    .regex(/^[A-Z]{2}$/u)
    .nullable(),
  id: externalId.nullable(),
  phone: z
    .string()
    .regex(/^\+[1-9][0-9]{7,14}$/u)
    .nullable(),
  province: optionalText(120),
  zip: optionalText(32),
});

const orderPayloadSchema = z
  .object({
    _fixture: z.object({ synthetic: z.literal(true), version: z.literal('v1') }).optional(),
    _source: z
      .object({ mode: z.literal('live'), version: z.string().regex(/^20[0-9]{2}-[01][0-9]$/u) })
      .optional(),
    checkout_id: externalId.nullable().optional(),
    created_at: z.iso.datetime({ offset: true }),
    currency: z.string().regex(/^[A-Z]{3}$/u),
    financial_status: z.string().trim().min(1).max(40),
    payment_gateway_names: z.array(z.string().trim().min(1).max(120)).max(40).default([]),
    tags: z.union([z.string().max(2_000), z.array(z.string().max(120)).max(100)]).default([]),
    customer: customerSchema.nullable(),
    id: externalId,
    line_items: z
      .array(
        z.object({
          id: externalId,
          name: z.string().trim().min(1).max(255),
          price: money,
          product_id: externalId.nullable().optional(),
          quantity: z.number().int().positive().max(10_000),
          sku: optionalText(120),
          variant_id: externalId.nullable().optional(),
          variant_title: optionalText(255),
        }),
      )
      .min(1)
      .max(500),
    name: z.string().trim().min(1).max(80),
    shipping_address: addressSchema.nullable(),
    shipping_lines: z
      .array(z.object({ price: money, title: z.string().trim().min(1).max(255) }))
      .max(20),
    source_name: z.enum(['shopify_graphql', 'synthetic_fixture']),
    subtotal_price: money,
    test: z.boolean(),
    total_discounts: money,
    total_price: money,
    total_tax: money,
    updated_at: z.iso.datetime({ offset: true }),
  })
  .strict()
  .superRefine((value, context) => {
    const simulated = value._fixture !== undefined;
    const live = value._source !== undefined;
    if (simulated === live) {
      context.addIssue({ code: 'custom', message: 'Exactly one Shopify source is required' });
      return;
    }
    if (
      simulated &&
      (value.test !== true ||
        value.source_name !== 'synthetic_fixture' ||
        value.customer === null ||
        value.shipping_address === null)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Synthetic Shopify fixture contract is invalid',
      });
    }
    if (live && value.source_name !== 'shopify_graphql') {
      context.addIssue({ code: 'custom', message: 'Live Shopify source contract is invalid' });
    }
  });

export interface NormalizedShopifyCustomer {
  readonly acceptsMarketing: boolean;
  readonly email: string | null;
  readonly firstName: string | null;
  readonly id: string;
  readonly lastName: string | null;
  readonly phoneE164: string | null;
}

export interface NormalizedShopifyAddress {
  readonly address1: string;
  readonly address2: string | null;
  readonly city: string;
  readonly countryCode: string;
  readonly department: string | null;
  readonly id: string;
  readonly normalizedAddress: string;
  readonly phoneE164: string | null;
  readonly postalCode: string | null;
}

export interface NormalizedShopifyOrderItem {
  readonly id: string;
  readonly productId: string | null;
  readonly productName: string;
  readonly quantity: number;
  readonly sku: string | null;
  readonly snapshot: Readonly<Record<string, boolean | number | string | null>>;
  readonly totalPriceAmount: bigint;
  readonly unitPriceAmount: bigint;
  readonly variantId: string | null;
  readonly variantName: string | null;
}

export interface NormalizedShopifyOrder {
  readonly address: NormalizedShopifyAddress | null;
  readonly checkoutId: string | null;
  readonly currency: string;
  readonly customer: NormalizedShopifyCustomer | null;
  readonly discountAmount: bigint;
  readonly id: string;
  readonly items: readonly NormalizedShopifyOrderItem[];
  readonly mode: 'live' | 'simulation';
  readonly name: string;
  readonly rawSnapshot: Readonly<Record<string, unknown>>;
  readonly sourceCreatedAt: Date;
  readonly sourceVersion: string;
  readonly sourceUpdatedAt: Date;
  readonly subtotalAmount: bigint;
  readonly taxAmount: bigint;
  readonly totalAmount: bigint;
  readonly transportChargeAmount: bigint;
}

@Injectable()
export class ShopifyOrderNormalizer {
  public normalize(input: unknown): NormalizedShopifyOrder {
    const parsed = orderPayloadSchema.parse(input);
    const mode = parsed._fixture === undefined ? 'live' : 'simulation';
    const sourceVersion = parsed._fixture?.version ?? parsed._source?.version;
    if (sourceVersion === undefined) throw new Error('Shopify source version is missing');
    const sourceCreatedAt = new Date(parsed.created_at);
    const sourceUpdatedAt = new Date(parsed.updated_at);
    if (sourceUpdatedAt < sourceCreatedAt) {
      throw new Error('Shopify order updated_at precedes created_at');
    }

    const subtotalAmount = this.toMinorUnits(parsed.subtotal_price);
    const discountAmount = this.toMinorUnits(parsed.total_discounts);
    const taxAmount = this.toMinorUnits(parsed.total_tax);
    const totalAmount = this.toMinorUnits(parsed.total_price);
    const transportChargeAmount = parsed.shipping_lines.reduce(
      (total, line) => total + this.toMinorUnits(line.price),
      0n,
    );
    if (subtotalAmount - discountAmount + taxAmount + transportChargeAmount !== totalAmount) {
      throw new Error('Shopify order totals are inconsistent');
    }

    const address = this.normalizeAddress(parsed.shipping_address);

    return {
      address,
      checkoutId: parsed.checkout_id ?? null,
      currency: parsed.currency,
      customer:
        parsed.customer === null
          ? null
          : {
              acceptsMarketing: parsed.customer.accepts_marketing,
              email: parsed.customer.email,
              firstName: parsed.customer.first_name ?? null,
              id: parsed.customer.id,
              lastName: parsed.customer.last_name ?? null,
              phoneE164: parsed.customer.phone,
            },
      discountAmount,
      id: parsed.id,
      items: parsed.line_items.map((item) => {
        const unitPriceAmount = this.toMinorUnits(item.price);
        return {
          id: item.id,
          productId: item.product_id ?? null,
          productName: item.name,
          quantity: item.quantity,
          sku: item.sku ?? null,
          snapshot: {
            mode,
            productId: item.product_id ?? null,
            quantity: item.quantity,
            sku: item.sku ?? null,
            sourceVersion,
            synthetic: mode === 'simulation',
            variantId: item.variant_id ?? null,
          },
          totalPriceAmount: unitPriceAmount * BigInt(item.quantity),
          unitPriceAmount,
          variantId: item.variant_id ?? null,
          variantName: item.variant_title ?? null,
        };
      }),
      name: parsed.name,
      mode,
      rawSnapshot: parsed,
      sourceCreatedAt,
      sourceVersion,
      sourceUpdatedAt,
      subtotalAmount,
      taxAmount,
      totalAmount,
      transportChargeAmount,
    };
  }

  private normalizeAddress(
    address: z.infer<typeof addressSchema> | null,
  ): NormalizedShopifyAddress | null {
    if (
      address === null ||
      address.address1 === null ||
      address.city === null ||
      address.country_code === null ||
      address.id === null
    ) {
      return null;
    }
    const addressParts = [
      address.address1,
      address.address2,
      address.city,
      address.province,
      address.zip,
      address.country_code,
    ].filter((value): value is string => value !== null && value !== undefined && value !== '');
    return {
      address1: address.address1,
      address2: address.address2 ?? null,
      city: address.city,
      countryCode: address.country_code,
      department: address.province ?? null,
      id: address.id,
      normalizedAddress: addressParts.join(', '),
      phoneE164: address.phone,
      postalCode: address.zip ?? null,
    };
  }

  private toMinorUnits(value: string): bigint {
    const [whole, fractional = ''] = value.split('.');
    return BigInt(whole ?? '0') * 100n + BigInt(fractional.padEnd(2, '0'));
  }
}
