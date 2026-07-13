import { z } from 'zod';

const port = z.coerce.number().int().min(1).max(65_535);
const nonEmpty = z.string().trim().min(1);
const booleanFlag = (defaultValue: 'true' | 'false') =>
  z
    .enum(['true', 'false'])
    .default(defaultValue)
    .transform((value) => value === 'true');
const queueName = z.string().regex(/^[a-z0-9][a-z0-9_-]{2,79}$/u);

export const environmentSchema = z.object({
  API_HOST: nonEmpty.default('127.0.0.1'),
  API_PORT: port.default(3001),
  DEPENDENCY_TIMEOUT_MS: z.coerce.number().int().min(100).max(30_000).default(1_500),
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
