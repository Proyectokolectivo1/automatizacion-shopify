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

export interface ShopifyProvider {
  fetchOrder(query: ShopifyOrderQuery): Promise<unknown>;
  testConnection(probe: ShopifyConnectionProbe): Promise<ShopifyConnectionResult>;
}
