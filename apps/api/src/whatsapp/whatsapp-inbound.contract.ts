import { z } from 'zod';

const nonBlankText = z
  .string()
  .min(1)
  .max(4096)
  .refine((value) => value.trim().length > 0, 'Text must not be blank');

export const whatsappInboundWebhookSchema = z
  .object({
    _fixture: z.object({ synthetic: z.literal(true), version: z.literal('v1') }).strict(),
    eventType: z.literal('message.received'),
    externalEventId: z.string().trim().min(3).max(128),
    occurredAt: z.string().datetime({ offset: true }),
    providerMessageId: z.string().regex(/^simulated:[0-9a-f]{64}$/u),
    senderPhoneE164: z.string().regex(/^\+[1-9][0-9]{7,14}$/u),
    message: z.object({ type: z.literal('text'), text: nonBlankText }).strict(),
  })
  .strict();

export type WhatsAppInboundWebhook = z.infer<typeof whatsappInboundWebhookSchema>;
