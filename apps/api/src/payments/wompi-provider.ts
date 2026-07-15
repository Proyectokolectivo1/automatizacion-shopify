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
  readonly providerCheckoutId: string;
}

export type WompiTransactionStatus = 'APPROVED' | 'DECLINED' | 'ERROR' | 'PENDING' | 'VOIDED';

export interface WompiTransactionSnapshot {
  readonly amountMinor: number;
  readonly currency: 'COP';
  readonly id: string;
  readonly reference: string;
  readonly status: WompiTransactionStatus;
}

export interface WompiProvider {
  createHostedCheckout(command: WompiHostedCheckoutCommand): Promise<WompiHostedCheckoutResult>;
  getTransaction(transactionId: string): Promise<WompiTransactionSnapshot>;
}
