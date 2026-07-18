import { describe, expect, it } from 'vitest';

import fixture from '../src/whatsapp/fixtures/whatsapp-inbound-message.v1.json';
import { whatsappInboundWebhookSchema } from '../src/whatsapp/whatsapp-inbound.contract';

describe('WhatsApp synthetic inbound message contract v1', () => {
  it('accepts the strict versioned synthetic text fixture', () => {
    expect(whatsappInboundWebhookSchema.parse(fixture)).toMatchObject({
      eventType: 'message.received',
      message: { type: 'text' },
    });
  });

  it('rejects non-synthetic, blank and unsupported message payloads', () => {
    expect(
      whatsappInboundWebhookSchema.safeParse({ ...fixture, _fixture: { synthetic: false } })
        .success,
    ).toBe(false);
    expect(
      whatsappInboundWebhookSchema.safeParse({
        ...fixture,
        message: { type: 'text', text: '   ' },
      }).success,
    ).toBe(false);
    expect(
      whatsappInboundWebhookSchema.safeParse({
        ...fixture,
        message: { type: 'image', url: 'https://example.invalid/image' },
      }).success,
    ).toBe(false);
  });

  it('does not silently accept the official Meta envelope as synthetic v1', () => {
    expect(
      whatsappInboundWebhookSchema.safeParse({
        object: 'whatsapp_business_account',
        entry: [],
      }).success,
    ).toBe(false);
  });
});
