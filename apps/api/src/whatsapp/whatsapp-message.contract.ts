import { z } from 'zod';

import { whatsappTemplateVariablesSchema } from './whatsapp-template.contract';

const textValueSchema = z.object({ type: z.literal('TEXT'), value: z.string().min(1).max(4_096) });
const urlValueSchema = z.object({ type: z.literal('URL'), value: z.string().url().max(2_048) });
const dateValueSchema = z.object({
  type: z.literal('DATE'),
  value: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
});
const currencyValueSchema = z.object({
  amountMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  currency: z.string().regex(/^[A-Z]{3}$/u),
  type: z.literal('CURRENCY'),
});

export const whatsappMessageVariableValueSchema = z.discriminatedUnion('type', [
  textValueSchema.strict(),
  urlValueSchema.strict(),
  dateValueSchema.strict(),
  currencyValueSchema.strict(),
]);

export const dispatchWhatsAppMessageSchema = z
  .object({
    eventType: z.string().regex(/^[a-z][a-z0-9_.-]{2,159}$/u),
    languageCode: z.string().regex(/^[a-z]{2}(?:_[A-Z]{2})?$/u),
    orderId: z.string().uuid(),
    variables: z.record(
      z.string().regex(/^[a-z][a-z0-9_]{1,63}$/u),
      whatsappMessageVariableValueSchema,
    ),
  })
  .strict();

export type WhatsAppMessageVariables = z.infer<typeof dispatchWhatsAppMessageSchema>['variables'];

export interface RenderedWhatsAppTemplate {
  readonly body: string;
  readonly parameters: readonly {
    readonly name: string;
    readonly renderedValue: string;
    readonly type: 'CURRENCY' | 'DATE' | 'TEXT' | 'URL';
  }[];
  readonly variableNames: readonly string[];
}

export function renderWhatsAppTemplate(
  bodyTemplate: string,
  schemaValue: unknown,
  variables: WhatsAppMessageVariables,
): RenderedWhatsAppTemplate {
  const schema = whatsappTemplateVariablesSchema.parse(schemaValue);
  const definitions = new Map(schema.variables.map((variable) => [variable.name, variable]));
  const suppliedNames = Object.keys(variables);
  if (suppliedNames.some((name) => !definitions.has(name))) {
    throw new Error('Unexpected WhatsApp template variable');
  }
  const parameters = schema.variables.map((definition) => {
    const supplied = variables[definition.name];
    if (supplied === undefined) {
      if (definition.required) throw new Error('Required WhatsApp template variable is missing');
      return { name: definition.name, renderedValue: '', type: definition.type };
    }
    if (supplied.type !== definition.type)
      throw new Error('WhatsApp template variable type differs');
    let renderedValue: string;
    switch (supplied.type) {
      case 'CURRENCY':
        renderedValue = `${supplied.currency} ${(supplied.amountMinor / 100).toFixed(2)}`;
        break;
      case 'DATE': {
        const date = new Date(`${supplied.value}T00:00:00.000Z`);
        if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== supplied.value) {
          throw new Error('WhatsApp template date is invalid');
        }
        renderedValue = supplied.value;
        break;
      }
      case 'TEXT':
        renderedValue = supplied.value;
        break;
      case 'URL': {
        const url = new URL(supplied.value);
        if (url.protocol !== 'https:') throw new Error('WhatsApp template URL must use HTTPS');
        renderedValue = supplied.value;
        break;
      }
    }
    if (definition.maxLength !== undefined && renderedValue.length > definition.maxLength) {
      throw new Error('WhatsApp template variable exceeds maxLength');
    }
    return { name: definition.name, renderedValue, type: definition.type };
  });
  let body = bodyTemplate;
  for (const parameter of parameters) {
    body = body.replaceAll(`{{${parameter.name}}}`, parameter.renderedValue);
  }
  if (body.includes('{{') || body.includes('}}') || body.length === 0 || body.length > 4_096) {
    throw new Error('WhatsApp template rendering is incomplete');
  }
  return { body, parameters, variableNames: parameters.map(({ name }) => name) };
}
