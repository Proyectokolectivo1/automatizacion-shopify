import { z } from 'zod';

export const whatsappTemplateCategorySchema = z.enum(['AUTHENTICATION', 'MARKETING', 'UTILITY']);
export const whatsappTemplateVariableSchema = z
  .object({
    maxLength: z.number().int().min(1).max(4_096).optional(),
    name: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/u),
    required: z.boolean(),
    type: z.enum(['CURRENCY', 'DATE', 'TEXT', 'URL']),
  })
  .strict();

export const whatsappTemplateVariablesSchema = z
  .object({
    variables: z.array(whatsappTemplateVariableSchema).max(20),
    version: z.literal('v1'),
  })
  .strict();

export const whatsappTemplateContentSchema = z
  .object({
    bodyTemplate: z.string().trim().min(1).max(4_096),
    category: whatsappTemplateCategorySchema,
    metaTemplateName: z.string().regex(/^[a-z][a-z0-9_]{2,511}$/u),
    variablesSchema: whatsappTemplateVariablesSchema,
  })
  .strict();

export const createWhatsAppTemplateSchema = whatsappTemplateContentSchema
  .extend({
    eventType: z.string().regex(/^[a-z][a-z0-9_.-]{2,159}$/u),
    languageCode: z.string().regex(/^[a-z]{2}(?:_[A-Z]{2})?$/u),
    name: z.string().regex(/^[a-z][a-z0-9_]{2,119}$/u),
  })
  .strict();

export const reviewWhatsAppTemplateSchema = z
  .object({
    decision: z.enum(['APPROVE', 'REJECT']),
    reasonCode: z
      .string()
      .regex(/^[a-z][a-z0-9_.-]{2,79}$/u)
      .optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.decision === 'REJECT' && value.reasonCode === undefined) {
      context.addIssue({ code: 'custom', message: 'reasonCode is required for rejection' });
    }
    if (value.decision === 'APPROVE' && value.reasonCode !== undefined) {
      context.addIssue({ code: 'custom', message: 'reasonCode is not valid for approval' });
    }
  });

export type WhatsAppTemplateContent = z.infer<typeof whatsappTemplateContentSchema>;
export type WhatsAppTemplateVariables = z.infer<typeof whatsappTemplateVariablesSchema>;

const placeholderPattern = /\{\{([a-z][a-z0-9_]*)\}\}/gu;

export function validateWhatsAppTemplateContent(content: WhatsAppTemplateContent): void {
  const names = content.variablesSchema.variables.map(({ name }) => name);
  if (new Set(names).size !== names.length) throw new Error('Template variables must be unique');

  const placeholders = [...content.bodyTemplate.matchAll(placeholderPattern)].map(
    (match) => match[1] as string,
  );
  const remainder = content.bodyTemplate.replaceAll(placeholderPattern, '');
  if (remainder.includes('{{') || remainder.includes('}}')) {
    throw new Error('Template contains a malformed variable placeholder');
  }
  const placeholderNames = new Set(placeholders);
  if (
    names.some((name) => !placeholderNames.has(name)) ||
    placeholders.some((name) => !names.includes(name))
  ) {
    throw new Error('Template placeholders and variable schema must match');
  }
}
