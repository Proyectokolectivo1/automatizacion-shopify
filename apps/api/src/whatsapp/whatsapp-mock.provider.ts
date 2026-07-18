import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import fixture from './fixtures/whatsapp-connection.v1.json';
import messageFixture from './fixtures/whatsapp-message.v1.json';
import type {
  WhatsAppConnectionProbe,
  WhatsAppConnectionProbeResult,
  WhatsAppProvider,
  WhatsAppTemplateDispatch,
  WhatsAppTemplateDispatchResult,
} from './whatsapp-provider';

@Injectable()
export class WhatsAppMockProvider implements WhatsAppProvider {
  public dispatchTemplate(
    dispatch: WhatsAppTemplateDispatch,
  ): Promise<WhatsAppTemplateDispatchResult> {
    const accepted =
      !fixture.invalidTokens.includes(dispatch.accessToken) &&
      /^\+[1-9][0-9]{7,14}$/u.test(dispatch.recipientPhoneE164);
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          businessKeyHash: dispatch.businessKeyHash,
          languageCode: dispatch.languageCode,
          parameters: dispatch.parameters,
          phoneNumberId: dispatch.phoneNumberId,
          recipientPhoneE164: dispatch.recipientPhoneE164,
          templateName: dispatch.templateName,
        }),
      )
      .digest('hex');
    return Promise.resolve({
      accepted,
      fixtureVersion: 'v1',
      mode: 'simulation',
      providerMessageId: `${messageFixture.providerMessageIdPrefix}${fingerprint}`,
    });
  }

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
