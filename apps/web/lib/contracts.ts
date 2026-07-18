import { z } from 'zod';

export const OPERATIONAL_TYPES = [
  'order',
  'payment_intent',
  'shopify_reconciliation_issue',
  'whatsapp_conversation',
  'wompi_reconciliation_issue',
] as const;

export const organizationOptionSchema = z
  .object({
    dashboardAllowed: z.boolean(),
    name: z.string().min(1).max(160),
    organizationId: z.string().uuid(),
    role: z.enum(['OWNER', 'ADMIN', 'OPERATIONS', 'LOGISTICS', 'SUPPORT', 'FINANCE', 'READ_ONLY']),
  })
  .strict();

export const organizationOptionsSchema = z.array(organizationOptionSchema).max(100);

export const authTokensSchema = z
  .object({
    accessExpiresAt: z.iso.datetime({ offset: true }),
    accessToken: z.string().min(1).max(200),
    refreshExpiresAt: z.iso.datetime({ offset: true }),
    refreshToken: z.string().min(1).max(200),
  })
  .strict();

export const principalSchema = z
  .object({
    email: z.string().email(),
    organizationId: z.string().uuid(),
    role: organizationOptionSchema.shape.role,
    sessionId: z.string().uuid(),
    userId: z.string().uuid(),
  })
  .strict();

export const summarySchema = z
  .object({
    byStatus: z.array(
      z
        .object({
          requiresAttention: z.number().int().nonnegative(),
          status: z.string().min(1).max(80),
          total: z.number().int().nonnegative(),
        })
        .strict(),
    ),
    byType: z.array(
      z
        .object({
          requiresAttention: z.number().int().nonnegative(),
          total: z.number().int().nonnegative(),
          type: z.enum(OPERATIONAL_TYPES),
        })
        .strict(),
    ),
    contractVersion: z.literal('v1'),
    filters: z
      .object({ storeId: z.string().uuid().nullable(), type: z.string().nullable() })
      .strict(),
    totals: z
      .object({
        requiresAttention: z.number().int().nonnegative(),
        total: z.number().int().nonnegative(),
      })
      .strict(),
    window: z
      .object({
        from: z.iso.datetime({ offset: true }),
        to: z.iso.datetime({ offset: true }),
      })
      .strict(),
  })
  .strict();

export const queueSchema = z
  .object({
    contractVersion: z.literal('v1'),
    items: z.array(
      z
        .object({
          attentionReason: z.string().nullable(),
          itemId: z.string(),
          occurredAt: z.iso.datetime({ offset: true }),
          relatedResource: z
            .object({ id: z.string(), type: z.string().min(1).max(80) })
            .strict()
            .nullable(),
          requiresAttention: z.boolean(),
          status: z.string().min(1).max(80),
          storeId: z.string().uuid(),
          type: z.enum(OPERATIONAL_TYPES),
        })
        .strict(),
    ),
    nextCursor: z.string().max(512).nullable(),
  })
  .strict();

export type OperationalType = (typeof OPERATIONAL_TYPES)[number];
export type OrganizationOption = z.infer<typeof organizationOptionSchema>;
export type OperationalSummary = z.infer<typeof summarySchema>;

export interface DashboardQueueItem {
  readonly attentionReason: string | null;
  readonly occurredAt: string;
  readonly requiresAttention: boolean;
  readonly status: string;
  readonly type: OperationalType;
}

export interface DashboardPayload {
  readonly currentOrganization: OrganizationOption;
  readonly nextCursor: string | null;
  readonly organizations: readonly OrganizationOption[];
  readonly queue: readonly DashboardQueueItem[];
  readonly summary: OperationalSummary;
}

export const dashboardPayloadSchema: z.ZodType<DashboardPayload> = z
  .object({
    currentOrganization: organizationOptionSchema,
    nextCursor: z.string().max(512).nullable(),
    organizations: organizationOptionsSchema,
    queue: z.array(
      z
        .object({
          attentionReason: z.string().nullable(),
          occurredAt: z.iso.datetime({ offset: true }),
          requiresAttention: z.boolean(),
          status: z.string().min(1).max(80),
          type: z.enum(OPERATIONAL_TYPES),
        })
        .strict(),
    ),
    summary: summarySchema,
  })
  .strict();
