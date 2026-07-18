import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  SHOPIFY_ADMIN_API_VERSION,
  ShopifyLiveProvider,
} from '../src/shopify/shopify-live.provider';
import { ShopifyOrderNormalizer } from '../src/shopify/shopify-order-normalizer';

const response = (body: unknown, status = 200, headers?: HeadersInit): Response =>
  new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json', ...headers },
    status,
  });

describe('ShopifyLiveProvider', () => {
  const provider = new ShopifyLiveProvider();

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses the pinned GraphQL endpoint and token header for a live connection probe', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      response({
        data: {
          inventoryItems: { nodes: [] },
          locations: { nodes: [{ id: 'gid://shopify/Location/1' }] },
          orders: { nodes: [] },
          shop: {
            currencyCode: 'COP',
            ianaTimezone: 'America/Bogota',
            id: 'gid://shopify/Shop/123',
            name: 'Tienda real',
          },
        },
      }),
    );

    await expect(
      provider.testConnection({
        accessToken: 'shpat_live_secret',
        shopDomain: 'example.myshopify.com',
      }),
    ).resolves.toEqual({
      capabilities: { inventory: true, locations: true, orders: true },
      currency: 'COP',
      healthy: true,
      mode: 'live',
      providerShopId: 'gid://shopify/Shop/123',
      shopName: 'Tienda real',
      sourceVersion: SHOPIFY_ADMIN_API_VERSION,
      timezone: 'America/Bogota',
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(
      `https://example.myshopify.com/admin/api/${SHOPIFY_ADMIN_API_VERSION}/graphql.json`,
    );
    expect(new Headers(init?.headers).get('X-Shopify-Access-Token')).toBe('shpat_live_secret');
  });

  it('uses opaque cursor pagination and maps legacy order identifiers', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      response({
        data: {
          orders: {
            nodes: [
              {
                id: 'gid://shopify/Order/456',
                legacyResourceId: '456',
                updatedAt: '2026-07-18T10:00:00Z',
              },
            ],
            pageInfo: { endCursor: 'opaque-next', hasNextPage: true },
          },
        },
      }),
    );

    const result = await provider.listOrders({
      accessToken: 'token',
      cursor: 'opaque-current',
      shopDomain: 'example.myshopify.com',
      updatedAfter: new Date('2026-07-18T00:00:00Z'),
      updatedBefore: new Date('2026-07-19T00:00:00Z'),
    });

    expect(result).toMatchObject({
      mode: 'live',
      nextCursor: 'opaque-next',
      orders: [{ id: '456' }],
      sourceVersion: SHOPIFY_ADMIN_API_VERSION,
    });
    const rawBody = fetchMock.mock.calls[0]?.[1]?.body;
    const body = JSON.parse(typeof rawBody === 'string' ? rawBody : '') as {
      variables: Record<string, unknown>;
    };
    expect(body.variables).toMatchObject({ after: 'opaque-current', first: 100 });
    expect(body.variables.query).toContain('updated_at:>=2026-07-18T00:00:00.000Z');
  });

  it('reuses an existing orders/create webhook and creates it only when absent', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        response({
          data: {
            webhookSubscriptions: {
              nodes: [
                {
                  id: 'gid://shopify/WebhookSubscription/1',
                  topic: 'ORDERS_CREATE',
                  uri: 'https://api.example.com/webhooks/shopify/store/orders-create',
                },
              ],
            },
          },
        }),
      )
      .mockResolvedValueOnce(response({ data: { webhookSubscriptions: { nodes: [] } } }))
      .mockResolvedValueOnce(
        response({
          data: {
            webhookSubscriptionCreate: {
              userErrors: [],
              webhookSubscription: {
                id: 'gid://shopify/WebhookSubscription/2',
                uri: 'https://api.example.com/webhooks/shopify/store-2/orders-create',
              },
            },
          },
        }),
      );
    const shared = {
      accessToken: 'token',
      shopDomain: 'example.myshopify.com',
    };
    await expect(
      provider.ensureOrdersCreateWebhook({
        ...shared,
        callbackUrl: 'https://api.example.com/webhooks/shopify/store/orders-create',
      }),
    ).resolves.toEqual({
      created: false,
      mode: 'live',
      subscriptionId: 'gid://shopify/WebhookSubscription/1',
    });
    await expect(
      provider.ensureOrdersCreateWebhook({
        ...shared,
        callbackUrl: 'https://api.example.com/webhooks/shopify/store-2/orders-create',
      }),
    ).resolves.toEqual({
      created: true,
      mode: 'live',
      subscriptionId: 'gid://shopify/WebhookSubscription/2',
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const rawCreateBody = fetchMock.mock.calls[2]?.[1]?.body;
    const createBody = JSON.parse(typeof rawCreateBody === 'string' ? rawCreateBody : '') as {
      variables: Record<string, unknown>;
    };
    expect(createBody.variables).toEqual({
      topic: 'ORDERS_CREATE',
      webhookSubscription: {
        uri: 'https://api.example.com/webhooks/shopify/store-2/orders-create',
      },
    });
  });

  it('transforms a real GraphQL order into the bounded normalizer contract', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        response({
          data: {
            order: {
              createdAt: '2026-07-18T10:00:00Z',
              currencyCode: 'COP',
              customer: null,
              displayFinancialStatus: 'PENDING',
              id: 'gid://shopify/Order/456',
              legacyResourceId: '456',
              lineItems: {
                nodes: [
                  {
                    id: 'gid://shopify/LineItem/1',
                    legacyResourceId: '1',
                    name: 'Producto',
                    originalUnitPriceSet: {
                      shopMoney: { amount: '10000.00', currencyCode: 'COP' },
                    },
                    quantity: 1,
                    sku: null,
                    variant: null,
                  },
                ],
                pageInfo: { endCursor: 'line-cursor-1', hasNextPage: true },
              },
              name: '#1001',
              shippingAddress: null,
              shippingLines: {
                nodes: [],
                pageInfo: { endCursor: null, hasNextPage: false },
              },
              subtotalPriceSet: { shopMoney: { amount: '10000.00', currencyCode: 'COP' } },
              tags: [],
              test: false,
              totalDiscountsSet: { shopMoney: { amount: '0.00', currencyCode: 'COP' } },
              totalPriceSet: { shopMoney: { amount: '10000.00', currencyCode: 'COP' } },
              totalTaxSet: { shopMoney: { amount: '0.00', currencyCode: 'COP' } },
              updatedAt: '2026-07-18T10:01:00Z',
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        response({
          data: {
            order: {
              lineItems: {
                nodes: [
                  {
                    id: 'gid://shopify/LineItem/2',
                    legacyResourceId: '2',
                    name: 'Bonificación',
                    originalUnitPriceSet: {
                      shopMoney: { amount: '0.00', currencyCode: 'COP' },
                    },
                    quantity: 1,
                    sku: null,
                    variant: null,
                  },
                ],
                pageInfo: { endCursor: null, hasNextPage: false },
              },
            },
          },
        }),
      );

    const payload = await provider.fetchOrder({
      accessToken: 'token',
      orderId: '456',
      shopDomain: 'example.myshopify.com',
    });
    const normalized = new ShopifyOrderNormalizer().normalize(payload);
    expect(normalized).toMatchObject({
      address: null,
      customer: null,
      id: '456',
      mode: 'live',
      sourceVersion: SHOPIFY_ADMIN_API_VERSION,
    });
    expect(normalized.items).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('marks abandonment idempotently and cancels without an automatic refund', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        response({
          data: {
            tagsAdd: {
              node: { id: 'gid://shopify/Order/456' },
              userErrors: [],
            },
          },
        }),
      )
      .mockResolvedValueOnce(response({ data: { order: { cancelledAt: null } } }))
      .mockResolvedValueOnce(
        response({
          data: {
            orderCancel: {
              job: { done: true, id: 'gid://shopify/Job/1' },
              orderCancelUserErrors: [],
            },
          },
        }),
      );
    const connection = { accessToken: 'token', shopDomain: 'example.myshopify.com' };
    await expect(
      provider.applyOrderAction({ ...connection, action: 'mark', orderId: '456' }),
    ).resolves.toMatchObject({ mode: 'live', remoteJobId: null });
    await expect(
      provider.applyOrderAction({ ...connection, action: 'cancel', orderId: '456' }),
    ).resolves.toMatchObject({ mode: 'live', remoteJobId: 'gid://shopify/Job/1' });

    const rawMarkBody = fetchMock.mock.calls[0]?.[1]?.body;
    const markBody = JSON.parse(typeof rawMarkBody === 'string' ? rawMarkBody : '') as {
      variables: Record<string, unknown>;
    };
    expect(markBody.variables).toEqual({
      id: 'gid://shopify/Order/456',
      tags: ['transport_payment_abandoned'],
    });
    const rawCancelBody = fetchMock.mock.calls[2]?.[1]?.body;
    const cancelBody = JSON.parse(typeof rawCancelBody === 'string' ? rawCancelBody : '') as {
      variables: Record<string, unknown>;
    };
    expect(cancelBody.variables).toMatchObject({
      orderId: 'gid://shopify/Order/456',
      reason: 'DECLINED',
      refundMethod: { originalPaymentMethodsRefund: false },
      restock: true,
    });
  });

  it('treats an already cancelled order as a successful replay', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(response({ data: { order: { cancelledAt: '2026-07-18T11:00:00Z' } } }));
    await expect(
      provider.applyOrderAction({
        accessToken: 'token',
        action: 'cancel',
        orderId: '456',
        shopDomain: 'example.myshopify.com',
      }),
    ).resolves.toEqual({ alreadyApplied: true, mode: 'live', remoteJobId: null });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('retries throttling and never exposes token or upstream message', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response({ error: 'temporary' }, 429, { 'retry-after': '0' }))
      .mockResolvedValueOnce(
        response({
          errors: [
            {
              extensions: { code: 'ACCESS_DENIED' },
              message: 'token shpat_do_not_leak is invalid',
            },
          ],
        }),
      );

    let failure: Error | undefined;
    try {
      await provider.testConnection({
        accessToken: 'shpat_do_not_leak',
        shopDomain: 'example.myshopify.com',
      });
    } catch (error) {
      failure = error as Error;
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(failure?.message).toBe('Shopify Admin API returned a GraphQL error');
    expect(failure?.message).not.toContain('shpat_do_not_leak');
  });
});
