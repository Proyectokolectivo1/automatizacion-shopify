import { z } from 'zod';

const port = z.coerce.number().int().min(1).max(65_535);
const nonEmpty = z.string().trim().min(1);

export const environmentSchema = z.object({
  API_HOST: nonEmpty.default('127.0.0.1'),
  API_PORT: port.default(3001),
  DEPENDENCY_TIMEOUT_MS: z.coerce.number().int().min(100).max(30_000).default(1_500),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  MINIO_API_PORT: port,
  MINIO_HOST: nonEmpty,
  MINIO_USE_SSL: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
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
