import { z } from 'zod';

const port = z.coerce.number().int().min(1).max(65_535);
const nonEmpty = z.string().trim().min(1);
const booleanFlag = (defaultValue: 'true' | 'false') =>
  z
    .enum(['true', 'false'])
    .default(defaultValue)
    .transform((value) => value === 'true');
const queueName = z.string().regex(/^[a-z0-9][a-z0-9_-]{2,79}$/u);
const optionalTrimmed = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    schema.optional(),
  );
const safeHttpUrl = z
  .string()
  .url()
  .max(2_048)
  .refine((value) => {
    const url = new URL(value);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.username === '' &&
      url.password === '' &&
      url.hash === '' &&
      url.search === ''
    );
  }, 'must be an HTTP(S) URL without credentials, query or fragment');

export const environmentSchema = z
  .object({
    API_HOST: nonEmpty.default('127.0.0.1'),
    API_PORT: port.default(3001),
    AUTH_ACCOUNT_ACTIONS_ENABLED: booleanFlag('false'),
    AUTH_ACCOUNT_ACTIONS_KILL_SWITCH: booleanFlag('true'),
    AUTH_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).max(3_600).default(900),
    AUTH_BLOCK_DURATION_MS: z.coerce.number().int().min(10_000).max(86_400_000).default(300_000),
    AUTH_LOGIN_MAX_ATTEMPTS: z.coerce.number().int().min(2).max(20).default(5),
    AUTH_INVITATION_TTL_SECONDS: z.coerce.number().int().min(300).max(604_800).default(86_400),
    AUTH_PASSWORD_RESET_TTL_SECONDS: z.coerce.number().int().min(300).max(86_400).default(1_800),
    AUTH_RATE_WINDOW_MS: z.coerce.number().int().min(10_000).max(3_600_000).default(60_000),
    AUTH_REFRESH_TTL_SECONDS: z.coerce.number().int().min(3_600).max(7_776_000).default(2_592_000),
    DEPENDENCY_TIMEOUT_MS: z.coerce.number().int().min(100).max(30_000).default(1_500),
    EMAIL_DELIVERY_ENABLED: booleanFlag('false'),
    EMAIL_KILL_SWITCH: booleanFlag('true'),
    EMAIL_SIMULATION_MODE: booleanFlag('true'),
    IDENTITY_ADMIN_ENABLED: booleanFlag('false'),
    IDENTITY_ADMIN_KILL_SWITCH: booleanFlag('true'),
    IDENTITY_BOOTSTRAP_EMAIL: optionalTrimmed(z.string().trim().email().max(320)),
    IDENTITY_BOOTSTRAP_ENABLED: booleanFlag('false'),
    IDENTITY_BOOTSTRAP_KILL_SWITCH: booleanFlag('true'),
    IDENTITY_BOOTSTRAP_ORGANIZATION_NAME: optionalTrimmed(z.string().trim().min(1).max(160)),
    IDENTITY_BOOTSTRAP_PASSWORD: optionalTrimmed(z.string().min(12).max(128)),
    IDENTITY_BOOTSTRAP_SECRET: optionalTrimmed(z.string().min(32).max(512)),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    METRICS_ACCESS_MODE: z.enum(['bearer', 'disabled', 'loopback']).default('loopback'),
    METRICS_BEARER_TOKEN: optionalTrimmed(z.string().min(32).max(512)),
    MINIO_API_PORT: port,
    MINIO_HOST: nonEmpty,
    MINIO_USE_SSL: booleanFlag('false'),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    OBSERVABILITY_ALERTS_ENABLED: booleanFlag('false'),
    OBSERVABILITY_ALERTS_KILL_SWITCH: booleanFlag('true'),
    OBSERVABILITY_ALERTS_TIMEOUT_MS: z.coerce.number().int().min(100).max(5_000).default(1_000),
    OBSERVABILITY_ALERTMANAGER_URL: safeHttpUrl.default('http://127.0.0.1:9093/api/v2/alerts'),
    OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: safeHttpUrl.default('http://127.0.0.1:4318/v1/traces'),
    OTEL_EXPORT_TIMEOUT_MS: z.coerce.number().int().min(100).max(10_000).default(1_000),
    OTEL_SERVICE_NAME: z
      .string()
      .regex(/^[a-z0-9][a-z0-9._-]{2,79}$/u)
      .default('ecommerce-api'),
    OTEL_TRACE_SAMPLE_RATIO: z.coerce.number().min(0).max(1).default(1),
    OTEL_TRACING_ENABLED: booleanFlag('false'),
    OTEL_TRACING_KILL_SWITCH: booleanFlag('true'),
    OUTBOX_BATCH_SIZE: z.coerce.number().int().min(1).max(500).default(25),
    OUTBOX_DLQ_NAME: queueName.default('dead-letter'),
    OUTBOX_KILL_SWITCH: booleanFlag('true'),
    OUTBOX_LEASE_MS: z.coerce.number().int().min(1_000).max(900_000).default(30_000),
    OUTBOX_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
    OUTBOX_OPERATIONS_ENABLED: booleanFlag('false'),
    OUTBOX_OPERATIONS_KILL_SWITCH: booleanFlag('true'),
    OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().min(100).max(60_000).default(1_000),
    OUTBOX_PUBLISHER_ENABLED: booleanFlag('false'),
    OUTBOX_QUEUE_NAME: queueName.default('foundation-events'),
    OUTBOX_RETRY_BASE_MS: z.coerce.number().int().min(100).max(60_000).default(1_000),
    OUTBOX_SIMULATION_MODE: booleanFlag('true'),
    ORDER_CLASSIFICATION_ENABLED: booleanFlag('false'),
    ORDER_CLASSIFICATION_KILL_SWITCH: booleanFlag('true'),
    ORDER_CLASSIFICATION_SIMULATION_MODE: booleanFlag('true'),
    TRANSPORT_RATES_ENABLED: booleanFlag('false'),
    TRANSPORT_RATES_KILL_SWITCH: booleanFlag('true'),
    TRANSPORT_RATES_SIMULATION_MODE: booleanFlag('true'),
    WOMPI_ENABLED: booleanFlag('false'),
    WOMPI_KILL_SWITCH: booleanFlag('true'),
    WOMPI_SIMULATION_MODE: booleanFlag('true'),
    WOMPI_PAYMENT_LINK_TTL_MINUTES: z.coerce.number().int().min(15).max(1_440).default(1_440),
    WOMPI_WEBHOOKS_ENABLED: booleanFlag('false'),
    WOMPI_WEBHOOKS_KILL_SWITCH: booleanFlag('true'),
    WOMPI_WEBHOOKS_MAX_BODY_BYTES: z.coerce
      .number()
      .int()
      .min(1_024)
      .max(1_048_576)
      .default(262_144),
    WOMPI_WEBHOOKS_MAX_SKEW_SECONDS: z.coerce.number().int().min(30).max(3_600).default(300),
    PAYMENT_REMINDERS_ENABLED: booleanFlag('false'),
    PAYMENT_REMINDERS_KILL_SWITCH: booleanFlag('true'),
    PAYMENT_REMINDERS_SIMULATION_MODE: booleanFlag('true'),
    PAYMENT_REMINDERS_POLL_INTERVAL_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(900_000)
      .default(60_000),
    PAYMENT_REMINDERS_BATCH_SIZE: z.coerce.number().int().min(1).max(500).default(50),
    PAYMENT_EXPIRATION_ENABLED: booleanFlag('false'),
    PAYMENT_EXPIRATION_KILL_SWITCH: booleanFlag('true'),
    PAYMENT_EXPIRATION_SIMULATION_MODE: booleanFlag('true'),
    PAYMENT_EXPIRATION_DEFAULT_ACTION: z.enum(['MARK', 'CANCEL']).default('MARK'),
    PAYMENT_EXPIRATION_POLL_INTERVAL_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(900_000)
      .default(60_000),
    PAYMENT_EXPIRATION_BATCH_SIZE: z.coerce.number().int().min(1).max(500).default(50),
    WOMPI_RECONCILIATION_ENABLED: booleanFlag('false'),
    WOMPI_RECONCILIATION_KILL_SWITCH: booleanFlag('true'),
    WOMPI_RECONCILIATION_SIMULATION_MODE: booleanFlag('true'),
    WOMPI_RECONCILIATION_POLL_INTERVAL_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(86_400_000)
      .default(300_000),
    WOMPI_RECONCILIATION_INTERVAL_HOURS: z.coerce.number().int().min(1).max(168).default(24),
    WOMPI_RECONCILIATION_LOOKBACK_HOURS: z.coerce.number().int().min(1).max(720).default(24),
    WOMPI_RECONCILIATION_BATCH_SIZE: z.coerce.number().int().min(1).max(500).default(25),
    WHATSAPP_CREDENTIAL_KEY_VERSION: optionalTrimmed(z.string().regex(/^v[1-9][0-9]*$/u)),
    WHATSAPP_CREDENTIAL_KEYS_JSON: optionalTrimmed(z.string().max(8_192)),
    WHATSAPP_INTEGRATIONS_ENABLED: booleanFlag('false'),
    WHATSAPP_INTEGRATIONS_KILL_SWITCH: booleanFlag('true'),
    WHATSAPP_SIMULATION_MODE: booleanFlag('true'),
    WHATSAPP_TEMPLATES_ENABLED: booleanFlag('false'),
    WHATSAPP_TEMPLATES_KILL_SWITCH: booleanFlag('true'),
    WHATSAPP_TEMPLATES_SIMULATION_MODE: booleanFlag('true'),
    WHATSAPP_MESSAGES_ENABLED: booleanFlag('false'),
    WHATSAPP_MESSAGES_KILL_SWITCH: booleanFlag('true'),
    WHATSAPP_MESSAGES_SIMULATION_MODE: booleanFlag('true'),
    WHATSAPP_WEBHOOKS_ENABLED: booleanFlag('false'),
    WHATSAPP_WEBHOOKS_KILL_SWITCH: booleanFlag('true'),
    WHATSAPP_WEBHOOKS_MAX_BODY_BYTES: z.coerce
      .number()
      .int()
      .min(1_024)
      .max(1_048_576)
      .default(262_144),
    WHATSAPP_WEBHOOKS_SIMULATION_MODE: booleanFlag('true'),
    WHATSAPP_INBOUND_ENABLED: booleanFlag('false'),
    WHATSAPP_INBOUND_KILL_SWITCH: booleanFlag('true'),
    WHATSAPP_INBOUND_SIMULATION_MODE: booleanFlag('true'),
    WHATSAPP_INBOUND_CONTENT_RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(30),
    WHATSAPP_INBOX_ENABLED: booleanFlag('false'),
    WHATSAPP_INBOX_KILL_SWITCH: booleanFlag('true'),
    WHATSAPP_INBOX_SIMULATION_MODE: booleanFlag('true'),
    WHATSAPP_ASSIGNMENTS_ENABLED: booleanFlag('false'),
    WHATSAPP_ASSIGNMENTS_KILL_SWITCH: booleanFlag('true'),
    WHATSAPP_ASSIGNMENTS_SIMULATION_MODE: booleanFlag('true'),
    OPERATIONAL_QUEUE_ENABLED: booleanFlag('false'),
    OPERATIONAL_QUEUE_KILL_SWITCH: booleanFlag('true'),
    POSTGRES_DB: nonEmpty,
    POSTGRES_HOST: nonEmpty,
    POSTGRES_PASSWORD: nonEmpty,
    POSTGRES_PORT: port,
    POSTGRES_USER: nonEmpty,
    REDIS_HOST: nonEmpty,
    REDIS_PASSWORD: nonEmpty,
    REDIS_PORT: port,
    SHOPIFY_CREDENTIAL_KEY_VERSION: optionalTrimmed(z.string().regex(/^v[1-9][0-9]*$/u)),
    SHOPIFY_CREDENTIAL_KEYS_JSON: optionalTrimmed(z.string().max(8_192)),
    SHOPIFY_INTEGRATIONS_ENABLED: booleanFlag('false'),
    SHOPIFY_INTEGRATIONS_KILL_SWITCH: booleanFlag('true'),
    SHOPIFY_SIMULATION_MODE: booleanFlag('true'),
    SHOPIFY_WEBHOOKS_ENABLED: booleanFlag('false'),
    SHOPIFY_WEBHOOKS_KILL_SWITCH: booleanFlag('true'),
    SHOPIFY_WEBHOOKS_MAX_BODY_BYTES: z.coerce
      .number()
      .int()
      .min(1_024)
      .max(1_048_576)
      .default(262_144),
    SHOPIFY_WEBHOOKS_SIMULATION_MODE: booleanFlag('true'),
    SHOPIFY_ORDER_SYNC_ENABLED: booleanFlag('false'),
    SHOPIFY_ORDER_SYNC_KILL_SWITCH: booleanFlag('true'),
    SHOPIFY_ORDER_SYNC_SIMULATION_MODE: booleanFlag('true'),
    SHOPIFY_RECONCILIATION_ENABLED: booleanFlag('false'),
    SHOPIFY_RECONCILIATION_KILL_SWITCH: booleanFlag('true'),
    SHOPIFY_RECONCILIATION_MAX_WINDOW_HOURS: z.coerce.number().int().min(1).max(168).default(24),
    SHOPIFY_RECONCILIATION_SIMULATION_MODE: booleanFlag('true'),
    SHOPIFY_RECONCILIATION_STUCK_AFTER_MINUTES: z.coerce
      .number()
      .int()
      .min(1)
      .max(1_440)
      .default(15),
  })
  .superRefine((environment, context) => {
    if (
      environment.METRICS_ACCESS_MODE === 'bearer' &&
      environment.METRICS_BEARER_TOKEN === undefined
    ) {
      context.addIssue({
        code: 'custom',
        message: 'is required when METRICS_ACCESS_MODE is bearer',
        path: ['METRICS_BEARER_TOKEN'],
      });
    }
    if (environment.NODE_ENV === 'production' && environment.METRICS_ACCESS_MODE !== 'bearer') {
      context.addIssue({
        code: 'custom',
        message: 'must be bearer in production',
        path: ['METRICS_ACCESS_MODE'],
      });
    }
  });

export type Environment = z.infer<typeof environmentSchema>;

export function parseEnvironment(source: NodeJS.ProcessEnv): Environment {
  const result = environmentSchema.safeParse(source);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');

    throw new Error(`Invalid environment configuration: ${details}`);
  }

  return result.data;
}
