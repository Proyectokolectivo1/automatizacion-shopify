import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import fixture from './fixtures/whatsapp-connection.v1.json';
import type {
  WhatsAppConnectionProbe,
  WhatsAppConnectionProbeResult,
  WhatsAppProvider,
} from './whatsapp-provider';

@Injectable()
export class WhatsAppMockProvider implements WhatsAppProvider {
  public testConnection(probe: WhatsAppConnectionProbe): Promise<WhatsAppConnectionProbeResult> {
    const fingerprint = createHash('sha256')
      .update(`${probe.businessAccountId}:${probe.phoneNumberId}:${probe.apiVersion}`)
      .digest('hex')
      .slice(0, 12);
    return Promise.resolve({
      fixtureVersion: fixture.version,
      healthy: !fixture.invalidTokens.includes(probe.accessToken),
      mode: 'simulation',
      providerBusinessName: `${fixture.businessNamePrefix} ${fingerprint}`,
      providerPhoneLabel: `${fixture.phoneLabelPrefix} ${fingerprint}`,
    });
  }
}
