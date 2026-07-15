import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import fixture from './fixtures/wompi-checkout.v1.json';
import type {
  WompiHostedCheckoutCommand,
  WompiHostedCheckoutResult,
  WompiProvider,
} from './wompi-provider';

@Injectable()
export class WompiMockProvider implements WompiProvider {
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
    return Promise.resolve({
      checkoutUrl: checkout.toString(),
      fixtureVersion: fixture.version,
      mode: 'simulation',
      providerCheckoutId: null,
    });
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
