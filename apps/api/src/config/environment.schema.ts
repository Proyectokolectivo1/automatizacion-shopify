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

export const environmentSchema = z.object({
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
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  MINIO_API_PORT: port,
  MINIO_HOST: nonEmpty,
  MINIO_USE_SSL: booleanFlag('false'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
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
  POSTGRES_DB: nonEmpty,
  POSTGRES_HOST: nonEmpty,
  POSTGRES_PASSWORD: nonEmpty,
  POSTGRES_PORT: port,
  POSTGRES_USER: nonEmpty,
  REDIS_HOST: nonEmpty,
  REDIS_PASSWORD: nonEmpty,
  REDIS_PORT: port,
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
