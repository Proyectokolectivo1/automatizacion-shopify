import { BadRequestException } from '@nestjs/common';

const SHOPIFY_DOMAIN = /^(?!-)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?[.]myshopify[.]com$/u;

export function normalizeShopifyDomain(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[.]$/u, '');
  if (!SHOPIFY_DOMAIN.test(normalized)) {
    throw new BadRequestException('Invalid Shopify shop domain');
  }
  return normalized;
}
