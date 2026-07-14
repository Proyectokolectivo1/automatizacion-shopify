import { Injectable } from '@nestjs/common';
import { z } from 'zod';

const externalId = z
  .union([z.number().int().safe(), z.string().trim().min(1).max(128)])
  .transform(String);
const money = z.string().regex(/^\d+(?:\.\d{1,2})?$/u);
const optionalText = (maximum: number) => z.string().trim().max(maximum).nullable().optional();

const orderPayloadSchema = z
  .object({
    _fixture: z.object({ synthetic: z.literal(true), version: z.literal('v1') }),
    checkout_id: externalId.nullable().optional(),
    created_at: z.iso.datetime({ offset: true }),
    currency: z.string().regex(/^[A-Z]{3}$/u),
    financial_status: z.string().trim().min(1).max(40),
    payment_gateway_names: z.array(z.string().trim().min(1).max(120)).max(40).default([]),
    tags: z.union([z.string().max(2_000), z.array(z.string().max(120)).max(100)]).default([]),
    customer: z.object({
      accepts_marketing: z.boolean().default(false),
      email: z
        .email()
        .max(320)
        .transform((value) => value.toLowerCase()),
      first_name: optionalText(120),
      id: externalId,
      last_name: optionalText(120),
      phone: z.string().regex(/^\+[1-9][0-9]{7,14}$/u),
    }),
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
    shipping_address: z.object({
      address1: z.string().trim().min(1).max(255),
      address2: optionalText(255),
      city: z.string().trim().min(1).max(120),
      country_code: z.string().regex(/^[A-Z]{2}$/u),
      id: externalId,
      phone: z.string().regex(/^\+[1-9][0-9]{7,14}$/u),
      province: optionalText(120),
      zip: optionalText(32),
    }),
    shipping_lines: z
      .array(z.object({ price: money, title: z.string().trim().min(1).max(255) }))
      .max(20),
    source_name: z.literal('synthetic_fixture'),
    subtotal_price: money,
    test: z.literal(true),
    total_discounts: money,
    total_price: money,
    total_tax: money,
    updated_at: z.iso.datetime({ offset: true }),
  })
  .strict();

export interface NormalizedShopifyCustomer {
  readonly acceptsMarketing: boolean;
  readonly email: string;
  readonly firstName: string | null;
  readonly id: string;
  readonly lastName: string | null;
  readonly phoneE164: string;
}

export interface NormalizedShopifyAddress {
  readonly address1: string;
  readonly address2: string | null;
  readonly city: string;
  readonly countryCode: string;
  readonly department: string | null;
  readonly id: string;
  readonly normalizedAddress: string;
  readonly phoneE164: string;
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
  readonly address: NormalizedShopifyAddress;
  readonly checkoutId: string | null;
  readonly currency: string;
  readonly customer: NormalizedShopifyCustomer;
  readonly discountAmount: bigint;
  readonly fixtureVersion: 'v1';
  readonly id: string;
  readonly items: readonly NormalizedShopifyOrderItem[];
  readonly name: string;
  readonly rawSnapshot: Readonly<Record<string, unknown>>;
  readonly sourceCreatedAt: Date;
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

    const addressParts = [
      parsed.shipping_address.address1,
      parsed.shipping_address.address2,
      parsed.shipping_address.city,
      parsed.shipping_address.province,
      parsed.shipping_address.zip,
      parsed.shipping_address.country_code,
    ].filter((value): value is string => value !== null && value !== undefined && value !== '');

    return {
      address: {
        address1: parsed.shipping_address.address1,
        address2: parsed.shipping_address.address2 ?? null,
        city: parsed.shipping_address.city,
        countryCode: parsed.shipping_address.country_code,
        department: parsed.shipping_address.province ?? null,
        id: parsed.shipping_address.id,
        normalizedAddress: addressParts.join(', '),
        phoneE164: parsed.shipping_address.phone,
        postalCode: parsed.shipping_address.zip ?? null,
      },
      checkoutId: parsed.checkout_id ?? null,
      currency: parsed.currency,
      customer: {
        acceptsMarketing: parsed.customer.accepts_marketing,
        email: parsed.customer.email,
        firstName: parsed.customer.first_name ?? null,
        id: parsed.customer.id,
        lastName: parsed.customer.last_name ?? null,
        phoneE164: parsed.customer.phone,
      },
      discountAmount,
      fixtureVersion: parsed._fixture.version,
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
            fixtureVersion: parsed._fixture.version,
            productId: item.product_id ?? null,
            quantity: item.quantity,
            sku: item.sku ?? null,
            synthetic: true,
            variantId: item.variant_id ?? null,
          },
          totalPriceAmount: unitPriceAmount * BigInt(item.quantity),
          unitPriceAmount,
          variantId: item.variant_id ?? null,
          variantName: item.variant_title ?? null,
        };
      }),
      name: parsed.name,
      rawSnapshot: parsed,
      sourceCreatedAt,
      sourceUpdatedAt,
      subtotalAmount,
      taxAmount,
      totalAmount,
      transportChargeAmount,
    };
  }

  private toMinorUnits(value: string): bigint {
    const [whole, fractional = ''] = value.split('.');
    return BigInt(whole ?? '0') * 100n + BigInt(fractional.padEnd(2, '0'));
  }
}
