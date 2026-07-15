export const WOMPI_PROVIDER = Symbol('WOMPI_PROVIDER');

export interface WompiHostedCheckoutCommand {
  readonly amountMinor: number;
  readonly currency: 'COP';
  readonly expiresAt: Date;
  readonly reference: string;
}

export interface WompiHostedCheckoutResult {
  readonly checkoutUrl: string;
  readonly fixtureVersion: string;
  readonly mode: 'simulation';
  readonly providerCheckoutId: null;
}

export interface WompiProvider {
  createHostedCheckout(command: WompiHostedCheckoutCommand): Promise<WompiHostedCheckoutResult>;
}
