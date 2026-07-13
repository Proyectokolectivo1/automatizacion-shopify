import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const environmentPath = resolve('.env');
const force = process.argv.includes('--force');

if (existsSync(environmentPath) && !force) {
  console.log('El archivo .env ya existe; no se modificó. Use --force para regenerarlo.');
  process.exit(0);
}

const secret = () => randomBytes(32).toString('base64url');
const content = `NODE_ENV=development
API_HOST=127.0.0.1
API_PORT=3001
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
LOG_LEVEL=info
DEPENDENCY_TIMEOUT_MS=1500
AUTH_ACCESS_TTL_SECONDS=900
AUTH_REFRESH_TTL_SECONDS=2592000
AUTH_LOGIN_MAX_ATTEMPTS=5
AUTH_RATE_WINDOW_MS=60000
AUTH_BLOCK_DURATION_MS=300000
EMAIL_DELIVERY_ENABLED=false
EMAIL_KILL_SWITCH=true
EMAIL_SIMULATION_MODE=true
OUTBOX_PUBLISHER_ENABLED=false
OUTBOX_KILL_SWITCH=true
OUTBOX_SIMULATION_MODE=true
OUTBOX_QUEUE_NAME=foundation-events
OUTBOX_DLQ_NAME=dead-letter
OUTBOX_BATCH_SIZE=25
OUTBOX_LEASE_MS=30000
OUTBOX_MAX_ATTEMPTS=5
OUTBOX_POLL_INTERVAL_MS=1000
OUTBOX_RETRY_BASE_MS=1000
POSTGRES_HOST=127.0.0.1
POSTGRES_PORT=5433
POSTGRES_DB=ecommerce
POSTGRES_USER=ecommerce
POSTGRES_PASSWORD=${secret()}
REDIS_HOST=127.0.0.1
REDIS_PORT=6380
REDIS_PASSWORD=${secret()}
MINIO_HOST=127.0.0.1
MINIO_API_PORT=9100
MINIO_CONSOLE_PORT=9101
MINIO_ROOT_USER=ecommerce_local
MINIO_ROOT_PASSWORD=${secret()}
MINIO_BUCKET=ecommerce-documents
MINIO_USE_SSL=false
`;

writeFileSync(environmentPath, content, { encoding: 'utf8', flag: 'w', mode: 0o600 });
console.log(
  'Entorno local generado en .env con secretos aleatorios. El archivo está excluido de Git.',
);
