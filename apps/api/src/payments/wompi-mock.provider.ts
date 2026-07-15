import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import fixture from './fixtures/wompi-checkout.v1.json';
import type {
  WompiHostedCheckoutCommand,
  WompiHostedCheckoutResult,
  WompiProvider,
  WompiTransactionSnapshot,
  WompiTransactionStatus,
} from './wompi-provider';

@Injectable()
export class WompiMockProvider implements WompiProvider {
  private available = true;
  private readonly transactions = new Map<string, WompiTransactionSnapshot>();

  public async createHostedCheckout(
    command: WompiHostedCheckoutCommand,
  ): Promise<WompiHostedCheckoutResult> {
    this.validate(command);
    const expiration = command.expiresAt.toISOString();
    const signature = createHash('sha256')
      .update(
        `${command.reference}${command.amountMinor}${command.currency}${expiration}${fixture.integritySecret}`,
      )
      .digest('hex');
    const checkout = new URL(fixture.checkoutBaseUrl);
    checkout.searchParams.set('public-key', fixture.publicKey);
    checkout.searchParams.set('currency', command.currency);
    checkout.searchParams.set('amount-in-cents', String(command.amountMinor));
    checkout.searchParams.set('reference', command.reference);
    checkout.searchParams.set('signature:integrity', signature);
    checkout.searchParams.set('expiration-time', expiration);
    const providerCheckoutId = `sim_${createHash('sha256').update(command.reference).digest('hex').slice(0, 32)}`;
    this.transactions.set(providerCheckoutId, {
      amountMinor: command.amountMinor,
      currency: command.currency,
      id: providerCheckoutId,
      reference: command.reference,
      status: 'PENDING',
    });
    return Promise.resolve({
      checkoutUrl: checkout.toString(),
      fixtureVersion: fixture.version,
      mode: 'simulation',
      providerCheckoutId,
    });
  }

  public getTransaction(transactionId: string): Promise<WompiTransactionSnapshot> {
    if (!this.available) throw new Error('Synthetic Wompi provider is unavailable');
    const transaction = this.transactions.get(transactionId);
    if (transaction === undefined) throw new Error('Synthetic Wompi transaction not found');
    return Promise.resolve({ ...transaction });
  }

  public setSyntheticTransactionStatus(
    transactionId: string,
    status: WompiTransactionStatus,
  ): void {
    const transaction = this.transactions.get(transactionId);
    if (transaction === undefined) throw new Error('Synthetic Wompi transaction not found');
    this.transactions.set(transactionId, { ...transaction, status });
  }

  public setSyntheticAvailability(available: boolean): void {
    this.available = available;
  }

  public setSyntheticTransactionSnapshot(
    transactionId: string,
    snapshot: Partial<Omit<WompiTransactionSnapshot, 'id'>>,
  ): void {
    const transaction = this.transactions.get(transactionId);
    if (transaction === undefined) throw new Error('Synthetic Wompi transaction not found');
    this.transactions.set(transactionId, { ...transaction, ...snapshot, id: transactionId });
  }

  private validate(command: WompiHostedCheckoutCommand): void {
    if (
      command.currency !== 'COP' ||
      !Number.isSafeInteger(command.amountMinor) ||
      command.amountMinor <= 0 ||
      !/^[A-Za-z0-9_-]{1,255}$/u.test(command.reference) ||
      !Number.isFinite(command.expiresAt.getTime()) ||
      command.expiresAt <= new Date()
    ) {
      throw new Error('Invalid synthetic Wompi checkout command');
    }
  }
}
