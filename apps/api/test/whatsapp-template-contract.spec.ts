import { describe, expect, it } from 'vitest';

import fixture from '../src/whatsapp/fixtures/whatsapp-template.v1.json';
import {
  createWhatsAppTemplateSchema,
  reviewWhatsAppTemplateSchema,
  validateWhatsAppTemplateContent,
} from '../src/whatsapp/whatsapp-template.contract';

describe('WhatsApp local template contract v1', () => {
  it('accepts the synthetic fixture with explicit simulation metadata', () => {
    expect(fixture).toMatchObject({ fixtureVersion: 'v1', mode: 'simulation' });
    const parsed = createWhatsAppTemplateSchema.parse(fixture.template);
    expect(() => validateWhatsAppTemplateContent(parsed)).not.toThrow();
  });

  it('rejects undefined, unused, duplicated and malformed placeholders', () => {
    const valid = createWhatsAppTemplateSchema.parse(fixture.template);
    expect(() =>
      validateWhatsAppTemplateContent({ ...valid, bodyTemplate: 'Hola {{undefined_name}}' }),
    ).toThrow('must match');
    expect(() =>
      validateWhatsAppTemplateContent({
        ...valid,
        bodyTemplate: 'Hola {{customer_name}}',
      }),
    ).toThrow('must match');
    expect(() =>
      validateWhatsAppTemplateContent({
        ...valid,
        variablesSchema: {
          ...valid.variablesSchema,
          variables: [valid.variablesSchema.variables[0]!, valid.variablesSchema.variables[0]!],
        },
      }),
    ).toThrow('must be unique');
    expect(() =>
      validateWhatsAppTemplateContent({ ...valid, bodyTemplate: 'Hola {{Customer Name}}' }),
    ).toThrow('malformed');
  });

  it('requires a bounded reason only for simulated rejection', () => {
    expect(reviewWhatsAppTemplateSchema.safeParse({ decision: 'APPROVE' }).success).toBe(true);
    expect(reviewWhatsAppTemplateSchema.safeParse({ decision: 'REJECT' }).success).toBe(false);
    expect(
      reviewWhatsAppTemplateSchema.safeParse({ decision: 'REJECT', reasonCode: 'policy_mismatch' })
        .success,
    ).toBe(true);
    expect(
      reviewWhatsAppTemplateSchema.safeParse({ decision: 'APPROVE', reasonCode: 'not_valid' })
        .success,
    ).toBe(false);
  });
});
