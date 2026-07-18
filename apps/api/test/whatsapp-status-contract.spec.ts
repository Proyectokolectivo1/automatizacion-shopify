import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import fixture from '../src/whatsapp/fixtures/whatsapp-status-webhook.v1.json';
import {
  decideWhatsAppStatusTransition,
  toWhatsAppInternalStatus,
  whatsappStatusWebhookSchema,
} from '../src/whatsapp/whatsapp-status.contract';
import { verifySimulatedWhatsAppStatusSignature } from '../src/whatsapp/whatsapp-status-signature';

describe('WhatsApp simulated status webhook contract v1', () => {
  it('accepts only the versioned synthetic public fixture', () => {
    expect(whatsappStatusWebhookSchema.parse(fixture.event)).toMatchObject({
      eventType: 'message.status',
      status: 'sent',
    });
    expect(
      whatsappStatusWebhookSchema.safeParse({ ...fixture.event, _fixture: { synthetic: false } })
        .success,
    ).toBe(false);
    expect(
      whatsappStatusWebhookSchema.safeParse({ ...fixture.event, status: 'accepted' }).success,
    ).toBe(false);
  });

  it('authenticates raw bytes with a synthetic secret distinct from the send token', () => {
    const rawBody = Buffer.from(JSON.stringify(fixture.event), 'utf8');
    const webhookSecret = 'synthetic-whatsapp-webhook-secret-v1';
    const signature = `sha256=${createHmac('sha256', webhookSecret).update(rawBody).digest('hex')}`;
    expect(verifySimulatedWhatsAppStatusSignature(rawBody, signature, webhookSecret)).toBe(true);
    expect(
      verifySimulatedWhatsAppStatusSignature(rawBody, signature, 'mock-whatsapp-valid-token'),
    ).toBe(false);
    expect(verifySimulatedWhatsAppStatusSignature(rawBody, 'sha256=invalid', webhookSecret)).toBe(
      false,
    );
  });

  it('advances monotonically and never overwrites terminal or delivered states with failure', () => {
    expect(toWhatsAppInternalStatus('delivered')).toBe('SIMULATED_DELIVERED');
    expect(
      decideWhatsAppStatusTransition('SIMULATED_ACCEPTED', 'SIMULATED_DELIVERED'),
    ).toMatchObject({ applied: true, reason: null });
    expect(decideWhatsAppStatusTransition('SIMULATED_DELIVERED', 'SIMULATED_SENT')).toMatchObject({
      applied: false,
      reason: 'out_of_order',
    });
    expect(decideWhatsAppStatusTransition('SIMULATED_DELIVERED', 'SIMULATED_FAILED')).toMatchObject(
      { applied: false, reason: 'out_of_order' },
    );
    expect(decideWhatsAppStatusTransition('SIMULATED_READ', 'SIMULATED_FAILED')).toMatchObject({
      applied: false,
      reason: 'terminal_state',
    });
    expect(decideWhatsAppStatusTransition('SIMULATED_SENT', 'SIMULATED_SENT')).toMatchObject({
      applied: false,
      reason: 'duplicate_status',
    });
  });
});
