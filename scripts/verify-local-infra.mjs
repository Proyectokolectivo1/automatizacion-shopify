import { execFileSync } from 'node:child_process';

const run = (executable, args, options = {}) => {
  const output = execFileSync(executable, args, {
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
  });

  return output?.trim() ?? '';
};

const compose = (...args) => run('docker', ['compose', ...args]);
const composeCapture = (...args) => run('docker', ['compose', ...args], { capture: true });

const assertEqual = (actual, expected, label) => {
  if (actual !== expected) {
    throw new Error(
      `${label}: se esperaba ${JSON.stringify(expected)} y se obtuvo ${JSON.stringify(actual)}`,
    );
  }
};

console.log('[infra] Validando configuración Compose');
compose('config', '--quiet');

console.log('[infra] Iniciando servicios y esperando health checks');
compose('up', '-d', '--wait', '--wait-timeout', '180');

console.log('[infra] Verificando protocolos de PostgreSQL, Redis y MinIO');
compose(
  'exec',
  '-T',
  'postgres',
  'sh',
  '-c',
  'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" && psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT 1" >/dev/null',
);
compose(
  'exec',
  '-T',
  'redis',
  'sh',
  '-c',
  'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli ping | grep -q PONG',
);
compose(
  'exec',
  '-T',
  'minio',
  'curl',
  '--fail',
  '--silent',
  'http://localhost:9000/minio/health/live',
);
compose(
  'exec',
  '-T',
  'minio',
  'sh',
  '-c',
  'mc alias set local http://localhost:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null && mc mb --ignore-existing "local/$MINIO_BUCKET" >/dev/null',
);

console.log('[infra] Escribiendo marcadores de persistencia');
compose(
  'exec',
  '-T',
  'postgres',
  'sh',
  '-c',
  'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "CREATE TABLE IF NOT EXISTS infra_smoke (id integer PRIMARY KEY, value text NOT NULL); INSERT INTO infra_smoke (id, value) VALUES (1, \'persisted\') ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value;" >/dev/null',
);
compose(
  'exec',
  '-T',
  'redis',
  'sh',
  '-c',
  'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli SET infra:smoke persisted >/dev/null',
);
compose(
  'exec',
  '-T',
  'minio',
  'sh',
  '-c',
  'printf \'persisted\' | mc pipe "local/$MINIO_BUCKET/.infra-smoke" >/dev/null',
);

console.log('[infra] Recreando contenedores sin eliminar volúmenes');
compose('down');
compose('up', '-d', '--wait', '--wait-timeout', '180');

const postgresValue = composeCapture(
  'exec',
  '-T',
  'postgres',
  'sh',
  '-c',
  'psql -At -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT value FROM infra_smoke WHERE id = 1"',
);
const redisValue = composeCapture(
  'exec',
  '-T',
  'redis',
  'sh',
  '-c',
  'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli --raw GET infra:smoke',
);
const minioValue = composeCapture(
  'exec',
  '-T',
  'minio',
  'sh',
  '-c',
  'mc alias set local http://localhost:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null && mc cat "local/$MINIO_BUCKET/.infra-smoke"',
);

assertEqual(postgresValue, 'persisted', 'Persistencia PostgreSQL');
assertEqual(redisValue, 'persisted', 'Persistencia Redis');
assertEqual(minioValue, 'persisted', 'Persistencia MinIO');

console.log('[infra] Limpiando marcadores de prueba');
compose(
  'exec',
  '-T',
  'postgres',
  'sh',
  '-c',
  'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "DROP TABLE infra_smoke" >/dev/null',
);
compose(
  'exec',
  '-T',
  'redis',
  'sh',
  '-c',
  'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli DEL infra:smoke >/dev/null',
);
compose(
  'exec',
  '-T',
  'minio',
  'sh',
  '-c',
  'mc rm --force "local/$MINIO_BUCKET/.infra-smoke" >/dev/null',
);

console.log('[infra] OK: servicios saludables y volúmenes persistentes tras recreación');
