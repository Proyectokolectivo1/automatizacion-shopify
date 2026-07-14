export const SHOPIFY_PROVIDER = Symbol('SHOPIFY_PROVIDER');

export interface ShopifyConnectionProbe {
  readonly accessToken: string;
  readonly shopDomain: string;
}

export interface ShopifyConnectionResult {
  readonly currency: string;
  readonly fixtureVersion: string;
  readonly healthy: boolean;
  readonly mode: 'simulation';
  readonly providerShopId: string;
  readonly shopName: string;
  readonly timezone: string;
}

export interface ShopifyOrderQuery {
  readonly accessToken: string;
  readonly orderId: string;
  readonly shopDomain: string;
}

export interface ShopifyOrderListQuery {
  readonly accessToken: string;
  readonly cursor?: string | undefined;
  readonly shopDomain: string;
  readonly updatedAfter: Date;
  readonly updatedBefore: Date;
}

export interface ShopifyOrderListResult {
  readonly fixtureVersion: string;
  readonly nextCursor: string | null;
  readonly orders: readonly { readonly id: string; readonly updatedAt: Date }[];
}

export interface ShopifyProvider {
  fetchOrder(query: ShopifyOrderQuery): Promise<unknown>;
  listOrders(query: ShopifyOrderListQuery): Promise<ShopifyOrderListResult>;
  testConnection(probe: ShopifyConnectionProbe): Promise<ShopifyConnectionResult>;
}
