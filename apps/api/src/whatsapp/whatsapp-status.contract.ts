import { z } from 'zod';

export const whatsappObservedStatusSchema = z.enum(['sent', 'delivered', 'read', 'failed']);

export const whatsappStatusWebhookSchema = z
  .object({
    _fixture: z.object({ synthetic: z.literal(true), version: z.literal('v1') }).strict(),
    eventType: z.literal('message.status'),
    externalEventId: z.string().trim().min(3).max(128),
    occurredAt: z.string().datetime({ offset: true }),
    providerMessageId: z.string().regex(/^simulated:[0-9a-f]{64}$/u),
    status: whatsappObservedStatusSchema,
  })
  .strict();

export type WhatsAppObservedStatus = z.infer<typeof whatsappObservedStatusSchema>;
export type WhatsAppInternalStatus =
  | 'SIMULATED_ACCEPTED'
  | 'SIMULATED_DELIVERED'
  | 'SIMULATED_FAILED'
  | 'SIMULATED_READ'
  | 'SIMULATED_RECEIVED'
  | 'SIMULATED_SENT';
export type WhatsAppObservedInternalStatus = Exclude<
  WhatsAppInternalStatus,
  'SIMULATED_ACCEPTED' | 'SIMULATED_RECEIVED'
>;

export interface WhatsAppStatusTransitionDecision {
  readonly applied: boolean;
  readonly reason: 'duplicate_status' | 'out_of_order' | 'terminal_state' | null;
  readonly resultingStatus: WhatsAppInternalStatus;
}

const progressiveRank: Readonly<
  Record<Exclude<WhatsAppInternalStatus, 'SIMULATED_FAILED' | 'SIMULATED_RECEIVED'>, number>
> = {
  SIMULATED_ACCEPTED: 0,
  SIMULATED_SENT: 1,
  SIMULATED_DELIVERED: 2,
  SIMULATED_READ: 3,
};

export function toWhatsAppInternalStatus(
  status: WhatsAppObservedStatus,
): WhatsAppObservedInternalStatus {
  return `SIMULATED_${status.toUpperCase()}` as WhatsAppObservedInternalStatus;
}

export function decideWhatsAppStatusTransition(
  current: WhatsAppInternalStatus,
  observed: WhatsAppObservedInternalStatus,
): WhatsAppStatusTransitionDecision {
  if (current === observed) {
    return { applied: false, reason: 'duplicate_status', resultingStatus: current };
  }
  if (
    current === 'SIMULATED_READ' ||
    current === 'SIMULATED_FAILED' ||
    current === 'SIMULATED_RECEIVED'
  ) {
    return { applied: false, reason: 'terminal_state', resultingStatus: current };
  }
  if (observed === 'SIMULATED_FAILED') {
    if (current === 'SIMULATED_DELIVERED') {
      return { applied: false, reason: 'out_of_order', resultingStatus: current };
    }
    return { applied: true, reason: null, resultingStatus: observed };
  }
  if (progressiveRank[observed] <= progressiveRank[current]) {
    return { applied: false, reason: 'out_of_order', resultingStatus: current };
  }
  return { applied: true, reason: null, resultingStatus: observed };
}
