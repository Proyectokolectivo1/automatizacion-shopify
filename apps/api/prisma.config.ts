import { resolve } from 'node:path';

import { config as loadDotenv } from 'dotenv';
import { defineConfig } from 'prisma/config';

loadDotenv({
  override: false,
  path: resolve(import.meta.dirname, '..', '..', '.env'),
  quiet: true,
});

const required = (name: string): string => {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(`Missing required database configuration: ${name}`);
  }
  return value;
};

const databaseUrl =
  process.env.DATABASE_URL ??
  `postgresql://${encodeURIComponent(required('POSTGRES_USER'))}:${encodeURIComponent(
    required('POSTGRES_PASSWORD'),
  )}@${required('POSTGRES_HOST')}:${required('POSTGRES_PORT')}/${encodeURIComponent(
    required('POSTGRES_DB'),
  )}`;

export default defineConfig({
  datasource: { url: databaseUrl },
  migrations: { path: 'prisma/migrations' },
  schema: 'prisma/schema.prisma',
});
