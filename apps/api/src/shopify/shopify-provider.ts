export const SHOPIFY_PROVIDER = Symbol('SHOPIFY_PROVIDER');

export type ShopifyProviderMode = 'live' | 'simulation';

export interface ShopifyConnectionProbe {
  readonly accessToken: string;
  readonly shopDomain: string;
}

export interface ShopifyConnectionResult {
  readonly capabilities: {
    readonly inventory: true;
    readonly locations: true;
    readonly orders: true;
  };
  readonly currency: string;
  readonly healthy: boolean;
  readonly mode: ShopifyProviderMode;
  readonly providerShopId: string;
  readonly shopName: string;
  readonly sourceVersion: string;
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
  readonly mode: ShopifyProviderMode;
  readonly nextCursor: string | null;
  readonly orders: readonly { readonly id: string; readonly updatedAt: Date }[];
  readonly sourceVersion: string;
}

export interface ShopifyWebhookRegistration {
  readonly accessToken: string;
  readonly callbackUrl: string;
  readonly shopDomain: string;
}

export interface ShopifyWebhookRegistrationResult {
  readonly created: boolean;
  readonly mode: ShopifyProviderMode;
  readonly subscriptionId: string;
}

export interface ShopifyOrderActionCommand {
  readonly accessToken: string;
  readonly action: 'cancel' | 'mark';
  readonly orderId: string;
  readonly shopDomain: string;
}

export interface ShopifyOrderActionResult {
  readonly alreadyApplied: boolean;
  readonly mode: ShopifyProviderMode;
  readonly remoteJobId: string | null;
}

export interface ShopifyProvider {
  applyOrderAction(command: ShopifyOrderActionCommand): Promise<ShopifyOrderActionResult>;
  ensureOrdersCreateWebhook(
    registration: ShopifyWebhookRegistration,
  ): Promise<ShopifyWebhookRegistrationResult>;
  fetchOrder(query: ShopifyOrderQuery): Promise<unknown>;
  listOrders(query: ShopifyOrderListQuery): Promise<ShopifyOrderListResult>;
  testConnection(probe: ShopifyConnectionProbe): Promise<ShopifyConnectionResult>;
}
