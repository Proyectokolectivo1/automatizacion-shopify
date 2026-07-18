import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import type {
  ShopifyConnectionProbe,
  ShopifyConnectionResult,
  ShopifyOrderListQuery,
  ShopifyOrderListResult,
  ShopifyOrderActionCommand,
  ShopifyOrderActionResult,
  ShopifyOrderQuery,
  ShopifyProvider,
  ShopifyWebhookRegistration,
  ShopifyWebhookRegistrationResult,
} from './shopify-provider';

export const SHOPIFY_ADMIN_API_VERSION = '2026-07';
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 3;
const PAGE_SIZE = 100;

const moneySchema = z.object({ amount: z.string(), currencyCode: z.string() });
const moneySetSchema = z.object({ shopMoney: moneySchema });
const userErrorSchema = z.object({ field: z.array(z.string()).nullish(), message: z.string() });
const pageInfoSchema = z.object({ endCursor: z.string().nullable(), hasNextPage: z.boolean() });
const lineItemNodeSchema = z.object({
  id: z.string(),
  legacyResourceId: z.string(),
  name: z.string(),
  originalUnitPriceSet: moneySetSchema,
  quantity: z.number().int(),
  sku: z.string().nullable(),
  variant: z
    .object({
      id: z.string(),
      legacyResourceId: z.string(),
      product: z.object({ id: z.string(), legacyResourceId: z.string() }),
      title: z.string(),
    })
    .nullable(),
});

const connectionSchema = z.object({
  inventoryItems: z.object({ nodes: z.array(z.object({ id: z.string() })) }),
  locations: z.object({ nodes: z.array(z.object({ id: z.string() })) }),
  orders: z.object({ nodes: z.array(z.object({ id: z.string() })) }),
  shop: z.object({
    currencyCode: z.string(),
    id: z.string(),
    ianaTimezone: z.string(),
    name: z.string(),
  }),
});

const orderNodeSchema = z.object({
  createdAt: z.string(),
  currencyCode: z.string(),
  customer: z
    .object({
      acceptsMarketing: z.boolean(),
      email: z.string().nullable(),
      firstName: z.string().nullable(),
      id: z.string(),
      lastName: z.string().nullable(),
      legacyResourceId: z.string(),
      phone: z.string().nullable(),
    })
    .nullable(),
  displayFinancialStatus: z.string().nullable(),
  id: z.string(),
  legacyResourceId: z.string(),
  lineItems: z.object({
    nodes: z.array(lineItemNodeSchema),
    pageInfo: pageInfoSchema,
  }),
  name: z.string(),
  shippingAddress: z
    .object({
      address1: z.string().nullable(),
      address2: z.string().nullable(),
      city: z.string().nullable(),
      countryCodeV2: z.string().nullable(),
      id: z.string().nullable(),
      phone: z.string().nullable(),
      province: z.string().nullable(),
      zip: z.string().nullable(),
    })
    .nullable(),
  shippingLines: z.object({
    nodes: z.array(z.object({ originalPriceSet: moneySetSchema, title: z.string() })),
    pageInfo: pageInfoSchema,
  }),
  subtotalPriceSet: moneySetSchema,
  tags: z.array(z.string()),
  test: z.boolean(),
  totalDiscountsSet: moneySetSchema,
  totalPriceSet: moneySetSchema,
  totalTaxSet: moneySetSchema,
  updatedAt: z.string(),
});

const orderSchema = z.object({ order: orderNodeSchema.nullable() });
const lineItemPageSchema = z.object({
  order: z
    .object({
      lineItems: z.object({ nodes: z.array(lineItemNodeSchema), pageInfo: pageInfoSchema }),
    })
    .nullable(),
});
const orderListSchema = z.object({
  orders: z.object({
    nodes: z.array(
      z.object({ id: z.string(), legacyResourceId: z.string(), updatedAt: z.string() }),
    ),
    pageInfo: pageInfoSchema,
  }),
});
const webhookListSchema = z.object({
  webhookSubscriptions: z.object({
    nodes: z.array(z.object({ id: z.string(), topic: z.string(), uri: z.string() })),
  }),
});
const webhookCreateSchema = z.object({
  webhookSubscriptionCreate: z.object({
    userErrors: z.array(userErrorSchema),
    webhookSubscription: z.object({ id: z.string(), uri: z.string() }).nullable(),
  }),
});
const tagsAddSchema = z.object({
  tagsAdd: z.object({
    node: z.object({ id: z.string() }).nullable(),
    userErrors: z.array(userErrorSchema),
  }),
});
const cancellationStatusSchema = z.object({
  order: z.object({ cancelledAt: z.string().nullable() }).nullable(),
});
const cancellationSchema = z.object({
  orderCancel: z.object({
    job: z.object({ done: z.boolean(), id: z.string() }).nullable(),
    orderCancelUserErrors: z.array(userErrorSchema.extend({ code: z.string().nullish() })),
  }),
});
const jobSchema = z.object({ job: z.object({ done: z.boolean(), id: z.string() }).nullable() });

interface GraphQlEnvelope {
  readonly data?: unknown;
  readonly errors?: readonly {
    readonly extensions?: { readonly code?: string; readonly requestId?: string };
  }[];
  readonly extensions?: {
    readonly cost?: {
      readonly throttleStatus?: {
        readonly currentlyAvailable?: number;
        readonly restoreRate?: number;
      };
    };
  };
}

@Injectable()
export class ShopifyLiveProvider implements ShopifyProvider {
  public async applyOrderAction(
    command: ShopifyOrderActionCommand,
  ): Promise<ShopifyOrderActionResult> {
    const orderId = this.orderGid(command.orderId);
    if (command.action === 'mark') {
      const result = tagsAddSchema.parse(
        await this.request(
          command,
          `mutation ShopifyMarkAbandonedOrder($id: ID!, $tags: [String!]!) {
            tagsAdd(id: $id, tags: $tags) { node { id } userErrors { field message } }
          }`,
          { id: orderId, tags: ['transport_payment_abandoned'] },
        ),
      ).tagsAdd;
      if (result.userErrors.length > 0 || result.node === null) {
        throw new Error('Shopify order could not be marked as abandoned');
      }
      return { alreadyApplied: false, mode: 'live', remoteJobId: null };
    }

    const status = cancellationStatusSchema.parse(
      await this.request(
        command,
        `query ShopifyOrderCancellationStatus($id: ID!) { order(id: $id) { cancelledAt } }`,
        { id: orderId },
      ),
    ).order;
    if (status === null) throw new Error('Shopify order was not found');
    if (status.cancelledAt !== null) {
      return { alreadyApplied: true, mode: 'live', remoteJobId: null };
    }
    const result = cancellationSchema.parse(
      await this.request(
        command,
        `mutation ShopifyCancelAbandonedOrder(
          $orderId: ID!,
          $refundMethod: OrderCancelRefundMethodInput!,
          $restock: Boolean!,
          $reason: OrderCancelReason!,
          $staffNote: String
        ) {
          orderCancel(
            orderId: $orderId,
            refundMethod: $refundMethod,
            restock: $restock,
            reason: $reason,
            staffNote: $staffNote
          ) {
            job { id done }
            orderCancelUserErrors { field message code }
          }
        }`,
        {
          orderId,
          reason: 'DECLINED',
          refundMethod: { originalPaymentMethodsRefund: false },
          restock: true,
          staffNote: 'Transport payment expired',
        },
      ),
    ).orderCancel;
    if (result.orderCancelUserErrors.length > 0 || result.job === null) {
      throw new Error('Shopify order cancellation was rejected');
    }
    if (!result.job.done) await this.waitForJob(command, result.job.id);
    return { alreadyApplied: false, mode: 'live', remoteJobId: result.job.id };
  }

  public async ensureOrdersCreateWebhook(
    registration: ShopifyWebhookRegistration,
  ): Promise<ShopifyWebhookRegistrationResult> {
    const existing = webhookListSchema
      .parse(
        await this.request(
          registration,
          `query ShopifyOrdersCreateWebhooks {
          webhookSubscriptions(first: 100, topics: [ORDERS_CREATE]) {
            nodes { id topic uri }
          }
        }`,
        ),
      )
      .webhookSubscriptions.nodes.find(
        (subscription) =>
          subscription.topic === 'ORDERS_CREATE' && subscription.uri === registration.callbackUrl,
      );
    if (existing !== undefined) {
      return { created: false, mode: 'live', subscriptionId: existing.id };
    }
    const created = webhookCreateSchema.parse(
      await this.request(
        registration,
        `mutation ShopifyOrdersCreateWebhook(
          $topic: WebhookSubscriptionTopic!,
          $webhookSubscription: WebhookSubscriptionInput!
        ) {
          webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
            webhookSubscription { id uri }
            userErrors { field message }
          }
        }`,
        {
          topic: 'ORDERS_CREATE',
          webhookSubscription: { uri: registration.callbackUrl },
        },
      ),
    ).webhookSubscriptionCreate;
    if (created.userErrors.length > 0 || created.webhookSubscription === null) {
      throw new Error('Shopify webhook subscription could not be created');
    }
    return { created: true, mode: 'live', subscriptionId: created.webhookSubscription.id };
  }

  public async testConnection(probe: ShopifyConnectionProbe): Promise<ShopifyConnectionResult> {
    const data = connectionSchema.parse(
      await this.request(
        probe,
        `query ShopifyConnectionProbe {
          shop { id name currencyCode ianaTimezone }
          orders(first: 1) { nodes { id } }
          inventoryItems(first: 1) { nodes { id } }
          locations(first: 1) { nodes { id } }
        }`,
      ),
    );
    return {
      capabilities: { inventory: true, locations: true, orders: true },
      currency: data.shop.currencyCode,
      healthy: true,
      mode: 'live',
      providerShopId: data.shop.id,
      shopName: data.shop.name,
      sourceVersion: SHOPIFY_ADMIN_API_VERSION,
      timezone: data.shop.ianaTimezone,
    };
  }

  public async fetchOrder(query: ShopifyOrderQuery): Promise<unknown> {
    const data = orderSchema.parse(
      await this.request(
        query,
        `query ShopifyOrder($id: ID!) {
          order(id: $id) {
            id legacyResourceId name createdAt updatedAt currencyCode displayFinancialStatus tags test
            customer { id legacyResourceId firstName lastName email phone acceptsMarketing }
            shippingAddress { id address1 address2 city province zip countryCodeV2 phone }
            subtotalPriceSet { shopMoney { amount currencyCode } }
            totalDiscountsSet { shopMoney { amount currencyCode } }
            totalTaxSet { shopMoney { amount currencyCode } }
            totalPriceSet { shopMoney { amount currencyCode } }
            shippingLines(first: 20) {
              nodes { title originalPriceSet { shopMoney { amount currencyCode } } }
              pageInfo { endCursor hasNextPage }
            }
            lineItems(first: 250) { nodes {
              id legacyResourceId name quantity sku originalUnitPriceSet { shopMoney { amount currencyCode } }
              variant { id legacyResourceId title product { id legacyResourceId } }
            } pageInfo { endCursor hasNextPage } }
          }
        }`,
        { id: this.orderGid(query.orderId) },
      ),
    );
    if (data.order === null) throw new Error('Shopify order was not found');
    if (data.order.shippingLines.pageInfo.hasNextPage) {
      throw new Error('Shopify order exceeds the supported shipping line limit');
    }
    const lineItems = [...data.order.lineItems.nodes];
    let pageInfo = data.order.lineItems.pageInfo;
    while (pageInfo.hasNextPage) {
      if (lineItems.length >= 500 || pageInfo.endCursor === null) {
        throw new Error('Shopify order exceeds the supported line item limit');
      }
      const page = lineItemPageSchema.parse(
        await this.request(
          query,
          `query ShopifyOrderLineItems($id: ID!, $after: String) {
            order(id: $id) {
              lineItems(first: 250, after: $after) {
                nodes {
                  id legacyResourceId name quantity sku
                  originalUnitPriceSet { shopMoney { amount currencyCode } }
                  variant { id legacyResourceId title product { id legacyResourceId } }
                }
                pageInfo { endCursor hasNextPage }
              }
            }
          }`,
          { after: pageInfo.endCursor, id: this.orderGid(query.orderId) },
        ),
      ).order;
      if (page === null) throw new Error('Shopify order was not found during pagination');
      lineItems.push(...page.lineItems.nodes);
      pageInfo = page.lineItems.pageInfo;
    }
    if (lineItems.length > 500) {
      throw new Error('Shopify order exceeds the supported line item limit');
    }
    return this.toNormalizerPayload({
      ...data.order,
      lineItems: { nodes: lineItems, pageInfo },
    });
  }

  public async listOrders(query: ShopifyOrderListQuery): Promise<ShopifyOrderListResult> {
    const filter = `updated_at:>=${query.updatedAfter.toISOString()} updated_at:<${query.updatedBefore.toISOString()}`;
    const data = orderListSchema.parse(
      await this.request(
        query,
        `query ShopifyOrders($after: String, $first: Int!, $query: String!) {
          orders(after: $after, first: $first, query: $query, sortKey: UPDATED_AT) {
            nodes { id legacyResourceId updatedAt }
            pageInfo { endCursor hasNextPage }
          }
        }`,
        { after: query.cursor ?? null, first: PAGE_SIZE, query: filter },
      ),
    );
    return {
      mode: 'live',
      nextCursor: data.orders.pageInfo.hasNextPage ? data.orders.pageInfo.endCursor : null,
      orders: data.orders.nodes.map((order) => ({
        id: order.legacyResourceId,
        updatedAt: new Date(order.updatedAt),
      })),
      sourceVersion: SHOPIFY_ADMIN_API_VERSION,
    };
  }

  private async request(
    connection: { readonly accessToken: string; readonly shopDomain: string },
    query: string,
    variables: Readonly<Record<string, unknown>> = {},
  ): Promise<unknown> {
    const url = `https://${connection.shopDomain}/admin/api/${SHOPIFY_ADMIN_API_VERSION}/graphql.json`;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      let response: Response;
      try {
        response = await fetch(url, {
          body: JSON.stringify({ query, variables }),
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': connection.accessToken,
          },
          method: 'POST',
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch {
        if (attempt === MAX_ATTEMPTS) throw new Error('Shopify Admin API request failed');
        await this.backoff(attempt);
        continue;
      }

      const retryable = response.status === 429 || response.status >= 500;
      if (!response.ok) {
        if (!retryable || attempt === MAX_ATTEMPTS) {
          throw new Error(`Shopify Admin API rejected the request (${response.status})`);
        }
        await this.backoff(attempt, response.headers.get('retry-after'));
        continue;
      }

      let envelope: GraphQlEnvelope;
      try {
        envelope = (await response.json()) as GraphQlEnvelope;
      } catch {
        throw new Error('Shopify Admin API returned an invalid response');
      }
      if (envelope.errors !== undefined && envelope.errors.length > 0) {
        const codes = envelope.errors
          .map((error) => error.extensions?.code)
          .filter((code): code is string => typeof code === 'string');
        if (codes.includes('THROTTLED') && attempt < MAX_ATTEMPTS) {
          await this.backoff(attempt);
          continue;
        }
        const requestId = envelope.errors.find((error) => error.extensions?.requestId)?.extensions
          ?.requestId;
        throw new Error(
          requestId === undefined
            ? 'Shopify Admin API returned a GraphQL error'
            : `Shopify Admin API returned a GraphQL error (request ${requestId})`,
        );
      }
      if (envelope.data === undefined) throw new Error('Shopify Admin API returned no data');
      return envelope.data;
    }
    throw new Error('Shopify Admin API retry limit reached');
  }

  private orderGid(orderId: string): string {
    return orderId.startsWith('gid://shopify/Order/') ? orderId : `gid://shopify/Order/${orderId}`;
  }

  private toNormalizerPayload(order: z.infer<typeof orderNodeSchema>): unknown {
    const customer =
      order.customer === null
        ? null
        : {
            accepts_marketing: order.customer.acceptsMarketing,
            email: order.customer.email,
            first_name: order.customer.firstName,
            id: order.customer.legacyResourceId,
            last_name: order.customer.lastName,
            phone: order.customer.phone,
          };
    const shippingAddress =
      order.shippingAddress === null
        ? null
        : {
            address1: order.shippingAddress.address1,
            address2: order.shippingAddress.address2,
            city: order.shippingAddress.city,
            country_code: order.shippingAddress.countryCodeV2,
            id: order.shippingAddress.id,
            phone: order.shippingAddress.phone,
            province: order.shippingAddress.province,
            zip: order.shippingAddress.zip,
          };
    return {
      _source: { mode: 'live', version: SHOPIFY_ADMIN_API_VERSION },
      checkout_id: null,
      created_at: order.createdAt,
      currency: order.currencyCode,
      customer,
      financial_status: order.displayFinancialStatus ?? 'UNKNOWN',
      id: order.legacyResourceId,
      line_items: order.lineItems.nodes.map((item) => ({
        id: item.legacyResourceId,
        name: item.name,
        price: item.originalUnitPriceSet.shopMoney.amount,
        product_id: item.variant?.product.legacyResourceId ?? null,
        quantity: item.quantity,
        sku: item.sku,
        variant_id: item.variant?.legacyResourceId ?? null,
        variant_title: item.variant?.title ?? null,
      })),
      name: order.name,
      payment_gateway_names: [],
      shipping_address: shippingAddress,
      shipping_lines: order.shippingLines.nodes.map((line) => ({
        price: line.originalPriceSet.shopMoney.amount,
        title: line.title,
      })),
      source_name: 'shopify_graphql',
      subtotal_price: order.subtotalPriceSet.shopMoney.amount,
      tags: order.tags,
      test: order.test,
      total_discounts: order.totalDiscountsSet.shopMoney.amount,
      total_price: order.totalPriceSet.shopMoney.amount,
      total_tax: order.totalTaxSet.shopMoney.amount,
      updated_at: order.updatedAt,
    };
  }

  private async backoff(attempt: number, retryAfter: string | null = null): Promise<void> {
    const parsed = retryAfter === null ? Number.NaN : Number(retryAfter);
    const delay = Number.isFinite(parsed)
      ? Math.min(Math.max(parsed * 1_000, 100), 5_000)
      : 250 * 2 ** (attempt - 1);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  private async waitForJob(
    connection: { readonly accessToken: string; readonly shopDomain: string },
    jobId: string,
  ): Promise<void> {
    for (let poll = 1; poll <= 3; poll += 1) {
      await this.backoff(poll);
      const result = jobSchema.parse(
        await this.request(
          connection,
          `query ShopifyCancellationJob($id: ID!) { job(id: $id) { id done } }`,
          { id: jobId },
        ),
      ).job;
      if (result === null) throw new Error('Shopify cancellation job was not found');
      if (result.done) return;
    }
    throw new Error('Shopify cancellation is still processing');
  }
}
