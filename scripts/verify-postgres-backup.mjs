import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';

const MAX_CAPTURE_BYTES = 16 * 1024 * 1024;
const ARTIFACT_DIRECTORY = resolve('.artifacts', 'postgres-backup');
const DATABASE_NAME_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_-]{0,62}$/;

const decode = (value) => value?.toString('utf8').trim() ?? '';

const compose = (args, options = {}) => {
  const stdio = [options.stdinFd ?? 'ignore', options.stdoutFd ?? 'pipe', 'pipe'];
  const result = spawnSync('docker', ['compose', ...args], {
    encoding: null,
    maxBuffer: MAX_CAPTURE_BYTES,
    stdio,
    windowsHide: true,
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const stderr = decode(result.stderr);
    throw new Error(
      `${options.label ?? 'docker compose'} falló con código ${result.status}${stderr ? `: ${stderr}` : ''}`,
    );
  }

  return decode(result.stdout);
};

const postgresEnvironment = (name) =>
  compose(['exec', '-T', 'postgres', 'printenv', name], {
    label: `lectura de ${name}`,
  });

const assertDatabaseName = (value, label) => {
  if (!DATABASE_NAME_PATTERN.test(value)) {
    throw new Error(`${label} no tiene un nombre PostgreSQL seguro`);
  }
};

const manifestSql = `
SET lock_timeout = '5s';
SET statement_timeout = '120s';
CREATE TEMP TABLE backup_verification_counts (
  table_name text PRIMARY KEY,
  row_count text NOT NULL
) ON COMMIT DROP;
DO $verify$
DECLARE
  current_table text;
  current_count bigint;
BEGIN
  FOR current_table IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', current_table) INTO current_count;
    INSERT INTO backup_verification_counts (table_name, row_count)
    VALUES (current_table, current_count::text);
  END LOOP;
END
$verify$;
SELECT json_build_object(
  'rowCounts', COALESCE(
    (
      SELECT json_object_agg(table_name, row_count ORDER BY table_name)
      FROM backup_verification_counts
    ),
    '{}'::json
  ),
  'constraints', COALESCE(
    (
      SELECT json_agg(definition ORDER BY definition)
      FROM (
        SELECT format(
          '%s.%s:%s:%s',
          namespace.nspname,
          relation.relname,
          constraint_record.conname,
          pg_get_constraintdef(constraint_record.oid, true)
        ) AS definition
        FROM pg_constraint AS constraint_record
        JOIN pg_class AS relation ON relation.oid = constraint_record.conrelid
        JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public'
      ) AS constraint_definitions
    ),
    '[]'::json
  ),
  'indexes', COALESCE(
    (
      SELECT json_agg(definition ORDER BY definition)
      FROM (
        SELECT format('%s.%s:%s:%s', schemaname, tablename, indexname, indexdef) AS definition
        FROM pg_indexes
        WHERE schemaname = 'public'
      ) AS index_definitions
    ),
    '[]'::json
  ),
  'sequences', COALESCE(
    (
      SELECT json_object_agg(sequencename, COALESCE(last_value::text, 'null') ORDER BY sequencename)
      FROM pg_sequences
      WHERE schemaname = 'public'
    ),
    '{}'::json
  ),
  'migrations', COALESCE(
    (
      SELECT json_agg(migration ORDER BY migration->>'name')
      FROM (
        SELECT json_build_object(
          'name', migration_name,
          'checksum', checksum,
          'finished', finished_at IS NOT NULL,
          'rolledBack', rolled_back_at IS NOT NULL
        ) AS migration
        FROM public._prisma_migrations
      ) AS migration_records
    ),
    '[]'::json
  )
)::text;
`;

const readManifest = (databaseUser, databaseName) => {
  const output = compose(
    [
      'exec',
      '-T',
      'postgres',
      'psql',
      '-XAtq',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      databaseUser,
      '-d',
      databaseName,
      '-c',
      manifestSql,
    ],
    { label: `manifiesto de ${databaseName}` },
  );

  const jsonLine = output.split(/\r?\n/u).filter(Boolean).at(-1);
  if (!jsonLine) {
    throw new Error(`PostgreSQL no devolvió el manifiesto de ${databaseName}`);
  }

  return JSON.parse(jsonLine);
};

const databaseExists = (databaseUser, sourceDatabase, candidateDatabase) => {
  const output = compose(
    [
      'exec',
      '-T',
      'postgres',
      'psql',
      '-XAtq',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      databaseUser,
      '-d',
      sourceDatabase,
      '-c',
      `SELECT count(*) FROM pg_database WHERE datname = '${candidateDatabase}'`,
    ],
    { label: 'verificación de cleanup PostgreSQL' },
  );

  return output === '1';
};

mkdirSync(ARTIFACT_DIRECTORY, { recursive: true, mode: 0o700 });

const runId = `${new Date().toISOString().replaceAll(/[:.]/gu, '-')}-${randomBytes(6).toString('hex')}`;
const restoreDatabase = `restore_verify_${randomBytes(10).toString('hex')}`;
const dumpPath = resolve(ARTIFACT_DIRECTORY, `${runId}.dump`);
const reportPath = resolve(ARTIFACT_DIRECTORY, `${runId}.json`);
const startedAt = new Date();
const started = performance.now();
let dumpFd;
let restoreFd;
let mainError;
let sourceManifest;
let restoredManifest;
let backupDurationMs = 0;
let restoreDurationMs = 0;
let verificationDurationMs = 0;
let backupBytes = 0;

console.log('[backup] Validando configuración e iniciando PostgreSQL local');
compose(['config', '--quiet'], { label: 'validación Compose' });
compose(['up', '-d', '--wait', '--wait-timeout', '180', 'postgres'], {
  label: 'inicio de PostgreSQL',
});

const databaseUser = postgresEnvironment('POSTGRES_USER');
const sourceDatabase = postgresEnvironment('POSTGRES_DB');
assertDatabaseName(databaseUser, 'POSTGRES_USER');
assertDatabaseName(sourceDatabase, 'POSTGRES_DB');
assertDatabaseName(restoreDatabase, 'base temporal');
assert.notEqual(restoreDatabase, sourceDatabase, 'la base temporal no puede ser la fuente');

try {
  console.log('[backup] Capturando manifiesto fuente y generando dump temporal');
  sourceManifest = readManifest(databaseUser, sourceDatabase);
  const backupStarted = performance.now();
  dumpFd = openSync(dumpPath, 'wx', 0o600);
  compose(
    [
      'exec',
      '-T',
      'postgres',
      'pg_dump',
      '-U',
      databaseUser,
      '-d',
      sourceDatabase,
      '--format=custom',
      '--compress=6',
      '--no-owner',
      '--no-privileges',
    ],
    { label: 'pg_dump', stdoutFd: dumpFd },
  );
  closeSync(dumpFd);
  dumpFd = undefined;
  backupDurationMs = performance.now() - backupStarted;
  backupBytes = statSync(dumpPath).size;
  assert.ok(backupBytes > 0, 'el dump PostgreSQL debe contener datos');

  console.log('[backup] Restaurando el dump en una base aislada');
  const restoreStarted = performance.now();
  compose(
    [
      'exec',
      '-T',
      'postgres',
      'createdb',
      '-U',
      databaseUser,
      '--template=template0',
      restoreDatabase,
    ],
    { label: 'creación de base temporal' },
  );
  restoreFd = openSync(dumpPath, 'r');
  compose(
    [
      'exec',
      '-T',
      'postgres',
      'pg_restore',
      '-U',
      databaseUser,
      '-d',
      restoreDatabase,
      '--exit-on-error',
      '--single-transaction',
      '--no-owner',
      '--no-privileges',
    ],
    { label: 'pg_restore', stdinFd: restoreFd },
  );
  closeSync(restoreFd);
  restoreFd = undefined;
  restoreDurationMs = performance.now() - restoreStarted;

  console.log('[backup] Comparando filas, migraciones, constraints, índices y secuencias');
  const verificationStarted = performance.now();
  restoredManifest = readManifest(databaseUser, restoreDatabase);
  assert.deepEqual(
    restoredManifest,
    sourceManifest,
    'el manifiesto restaurado difiere de la fuente',
  );
  verificationDurationMs = performance.now() - verificationStarted;
} catch (error) {
  mainError = error;
} finally {
  if (dumpFd !== undefined) {
    closeSync(dumpFd);
  }
  if (restoreFd !== undefined) {
    closeSync(restoreFd);
  }

  try {
    compose(
      [
        'exec',
        '-T',
        'postgres',
        'dropdb',
        '-U',
        databaseUser,
        '--if-exists',
        '--force',
        restoreDatabase,
      ],
      { label: 'eliminación de base temporal' },
    );
  } catch (cleanupError) {
    mainError = mainError
      ? new AggregateError([mainError, cleanupError], 'falló la ejecución y su cleanup')
      : cleanupError;
  }

  if (existsSync(dumpPath)) {
    unlinkSync(dumpPath);
  }
}

if (databaseExists(databaseUser, sourceDatabase, restoreDatabase) || existsSync(dumpPath)) {
  throw new Error('el cleanup dejó una base o dump temporal');
}

if (mainError) {
  throw mainError;
}

const completedAt = new Date();
const report = {
  schemaVersion: 1,
  outcome: 'passed',
  startedAt: startedAt.toISOString(),
  completedAt: completedAt.toISOString(),
  durationsMs: {
    backup: Math.round(backupDurationMs),
    restore: Math.round(restoreDurationMs),
    verification: Math.round(verificationDurationMs),
    total: Math.round(performance.now() - started),
  },
  backupBytes,
  verified: {
    tables: Object.keys(sourceManifest.rowCounts).length,
    constraints: sourceManifest.constraints.length,
    indexes: sourceManifest.indexes.length,
    sequences: Object.keys(sourceManifest.sequences).length,
    migrationRecords: sourceManifest.migrations.length,
    migrationsApplied: sourceManifest.migrations.filter(
      (migration) => migration.finished && !migration.rolledBack,
    ).length,
  },
  cleanup: {
    dumpRemoved: true,
    restoreDatabaseRemoved: true,
  },
  scope: 'local-verification-only',
};

writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, {
  encoding: 'utf8',
  flag: 'wx',
  mode: 0o600,
});

console.log(
  `[backup] OK: ${report.verified.tables} tablas y ${report.verified.migrationsApplied} migraciones aplicadas; ` +
    `backup ${report.durationsMs.backup} ms, restore ${report.durationsMs.restore} ms, ` +
    `verificación ${report.durationsMs.verification} ms, total ${report.durationsMs.total} ms`,
);
console.log(`[backup] Reporte local sin datos: ${reportPath}`);
