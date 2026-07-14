import { Injectable } from '@nestjs/common';
import { z } from 'zod';

const normalizedToken = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .transform((value) => value.toLowerCase());

const ruleSchema = z
  .object({
    financialStatuses: z.array(normalizedToken).min(1).max(40).optional(),
    gatewayNamesAny: z.array(normalizedToken).min(1).max(40).optional(),
    id: z.string().trim().min(1).max(80),
    paymentMode: z.enum(['prepaid', 'cod']),
    priority: z.number().int().min(0).max(10_000),
    tagsAny: z.array(normalizedToken).min(1).max(40).optional(),
  })
  .strict()
  .refine(
    (rule) =>
      rule.financialStatuses !== undefined ||
      rule.gatewayNamesAny !== undefined ||
      rule.tagsAny !== undefined,
    { message: 'A classification rule requires at least one selector' },
  );

const policySchema = z
  .object({
    rules: z.array(ruleSchema).min(1).max(100),
    schemaVersion: z.literal(1),
  })
  .strict()
  .refine((policy) => new Set(policy.rules.map((rule) => rule.id)).size === policy.rules.length, {
    message: 'Classification rule identifiers must be unique',
  });

const snapshotSchema = z
  .object({
    financial_status: normalizedToken,
    payment_gateway_names: z.array(normalizedToken).max(40).optional().default([]),
    tags: z.union([z.string().max(2_000), z.array(z.string().max(120)).max(100)]).optional(),
  })
  .passthrough();

export type ClassifiedPaymentMode = 'COD' | 'PREPAID';

export interface OrderClassificationDecision {
  readonly paymentMode: ClassifiedPaymentMode;
  readonly policyRuleId: string;
  readonly priority: number;
}

export class OrderClassificationError extends Error {
  public constructor(
    public readonly code: 'AMBIGUOUS_MATCH' | 'INVALID_POLICY' | 'INVALID_SNAPSHOT' | 'NO_MATCH',
    message: string,
  ) {
    super(message);
    this.name = 'OrderClassificationError';
  }
}

@Injectable()
export class OrderClassifier {
  public classify(policyInput: unknown, snapshotInput: unknown): OrderClassificationDecision {
    const policyResult = policySchema.safeParse(policyInput);
    if (!policyResult.success) {
      throw new OrderClassificationError(
        'INVALID_POLICY',
        'Order classification policy is invalid',
      );
    }
    const snapshotResult = snapshotSchema.safeParse(snapshotInput);
    if (!snapshotResult.success) {
      throw new OrderClassificationError(
        'INVALID_SNAPSHOT',
        'Order snapshot lacks valid classification evidence',
      );
    }

    const snapshot = snapshotResult.data;
    const tags = new Set(
      (Array.isArray(snapshot.tags) ? snapshot.tags : (snapshot.tags ?? '').split(','))
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean),
    );
    const gateways = new Set(snapshot.payment_gateway_names);
    const matches = policyResult.data.rules.filter((rule) => {
      const financialMatches =
        rule.financialStatuses === undefined ||
        rule.financialStatuses.includes(snapshot.financial_status);
      const gatewayMatches =
        rule.gatewayNamesAny === undefined ||
        rule.gatewayNamesAny.some((gateway) => gateways.has(gateway));
      const tagMatches =
        rule.tagsAny === undefined || rule.tagsAny.some((candidate) => tags.has(candidate));
      return financialMatches && gatewayMatches && tagMatches;
    });
    if (matches.length === 0) {
      throw new OrderClassificationError('NO_MATCH', 'No order classification rule matched');
    }

    const priority = Math.max(...matches.map((rule) => rule.priority));
    const winners = matches.filter((rule) => rule.priority === priority);
    if (new Set(winners.map((rule) => rule.paymentMode)).size > 1) {
      throw new OrderClassificationError(
        'AMBIGUOUS_MATCH',
        'Order classification rules produced contradictory results',
      );
    }
    const winner = [...winners].sort((left, right) => left.id.localeCompare(right.id))[0];
    if (winner === undefined) throw new Error('Classification winner is unexpectedly missing');
    return {
      paymentMode: winner.paymentMode === 'prepaid' ? 'PREPAID' : 'COD',
      policyRuleId: winner.id,
      priority: winner.priority,
    };
  }
}
