import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

const ROOT = resolve('.');
const DETECTION_BUDGET_MS = 15_000;
const RECOVERY_BUDGET_MS = 30_000;
const SHUTDOWN_TIMEOUT_MS = 10_000;
const alertReceiverUrl = 'http://127.0.0.1:9087';
const sensitiveProbe = `Bearer ${randomBytes(24).toString('base64url')}`;
const metricsBearerToken = randomBytes(32).toString('base64url');
const correlationId = `observability-fault-test:${randomBytes(8).toString('hex')}`;
const initialTraceId = randomBytes(16).toString('hex');
const initialParentSpanId = randomBytes(8).toString('hex');
let output = '';

const dockerCompose = (...args) => {
  execFileSync('docker', ['compose', ...args], { cwd: ROOT, stdio: 'inherit' });
};

const dockerComposeOutput = (...args) =>
  execFileSync('docker', ['compose', ...args], { cwd: ROOT, encoding: 'utf8' });

const delay = (milliseconds) =>
  new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

const freePort = () =>
  new Promise((resolvePromise, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        server.close();
        reject(new Error('No se pudo reservar un puerto local'));
        return;
      }
      server.close((error) => (error === undefined ? resolvePromise(address.port) : reject(error)));
    });
  });

const waitFor = async (description, check, timeoutMs = RECOVERY_BUDGET_MS) => {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const result = await check();
      if (result !== undefined) return result;
    } catch (error) {
      lastError = error;
    }
    await delay(250);
  }
  throw new Error(
    `${description} timed out${lastError instanceof Error ? `: ${lastError.message}` : ''}`,
  );
};

const stopProcess = async (child) => {
  if (child === undefined || child.exitCode !== null) return;
  const exited = new Promise((resolvePromise) => child.once('exit', resolvePromise));
  child.kill('SIGTERM');
  const stopped = await Promise.race([
    exited.then(() => true),
    delay(SHUTDOWN_TIMEOUT_MS).then(() => false),
  ]);
  if (!stopped) {
    child.kill('SIGKILL');
    await exited;
  }
};

const assertClosed = async (url) => {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(500) });
    } catch {
      return;
    }
    await delay(100);
  }
  throw new Error('La API siguió respondiendo después del shutdown');
};

const apiPort = await freePort();
const apiBaseUrl = `http://127.0.0.1:${apiPort}`;

const readJson = async (path, expectedStatus, headers = {}) => {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    cache: 'no-store',
    headers: { authorization: sensitiveProbe, 'x-correlation-id': correlationId, ...headers },
    signal: AbortSignal.timeout(3_000),
  });
  if (response.status !== expectedStatus) {
    throw new Error(`${path} returned ${response.status}; expected ${expectedStatus}`);
  }
  return { body: await response.json(), response };
};

const readAlertEvents = async () => {
  const response = await fetch(`${alertReceiverUrl}/events`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(3_000),
  });
  if (!response.ok) throw new Error(`Alert receiver returned ${response.status}`);
  const body = await response.json();
  return Array.isArray(body?.events) ? body.events : [];
};

console.log('[observability] Iniciando dependencias locales saludables');
dockerCompose('config', '--quiet');
dockerCompose('up', '-d', '--wait', '--wait-timeout', '180');

const collectOutput = (chunk) => {
  output += chunk;
  if (Buffer.byteLength(output, 'utf8') > 4 * 1024 * 1024) {
    api.kill('SIGTERM');
  }
};
const spawnApi = () => {
  const child = spawn(process.execPath, [resolve(ROOT, 'apps', 'api', 'dist', 'main.js')], {
    cwd: ROOT,
    env: {
      ...process.env,
      API_HOST: '127.0.0.1',
      API_PORT: String(apiPort),
      LOG_LEVEL: 'info',
      METRICS_ACCESS_MODE: 'bearer',
      METRICS_BEARER_TOKEN: metricsBearerToken,
      NODE_ENV: 'test',
      OBSERVABILITY_ALERTMANAGER_URL: 'http://127.0.0.1:9093/api/v2/alerts',
      OBSERVABILITY_ALERTS_ENABLED: 'true',
      OBSERVABILITY_ALERTS_KILL_SWITCH: 'false',
      OBSERVABILITY_ALERTS_TIMEOUT_MS: '1000',
      OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'http://127.0.0.1:4318/v1/traces',
      OTEL_EXPORT_TIMEOUT_MS: '500',
      OTEL_TRACE_SAMPLE_RATIO: '1',
      OTEL_TRACING_ENABLED: 'true',
      OTEL_TRACING_KILL_SWITCH: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', collectOutput);
  child.stderr.on('data', collectOutput);
  return child;
};
let api = spawnApi();

const drillStartedAt = performance.now();
let redisReadinessDetectionMs = 0;
let alertFiringDetectionMs = 0;
let redisReadinessRecoveryMs = 0;
let alertResolvedRecoveryMs = 0;
let collectorTraceRecoveryMs = 0;
let success = false;

try {
  console.log('[observability] Esperando backends locales y API compilada');
  await Promise.all([
    waitFor('Collector health', async () => {
      const response = await fetch('http://127.0.0.1:13133');
      return response.ok ? true : undefined;
    }),
    waitFor('Alertmanager health', async () => {
      const response = await fetch('http://127.0.0.1:9093/-/healthy');
      return response.ok ? true : undefined;
    }),
    waitFor('Alert receiver health', async () => {
      const response = await fetch(`${alertReceiverUrl}/health`);
      return response.ok ? true : undefined;
    }),
    waitFor('API startup', async () => {
      if (api.exitCode !== null) throw new Error('API terminó durante startup');
      const response = await fetch(`${apiBaseUrl}/health/live`);
      return response.ok ? true : undefined;
    }),
  ]);
  await fetch(`${alertReceiverUrl}/reset`, { method: 'POST', signal: AbortSignal.timeout(3_000) });

  console.log('[observability] Verificando W3C, correlación, Collector y métricas protegidas');
  await readJson('/health/ready', 200);
  const missing = await readJson('/missing?email=private@example.com', 404, {
    traceparent: `00-${initialTraceId}-${initialParentSpanId}-01`,
  });
  assert.equal(missing.response.headers.get('x-correlation-id'), correlationId);
  assert.equal(missing.response.headers.get('x-trace-id'), initialTraceId);
  assert.equal(missing.body?.correlationId, correlationId);

  const deniedMetrics = await fetch(`${apiBaseUrl}/metrics`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(3_000),
  });
  assert.equal(deniedMetrics.status, 401, 'Métricas sin Bearer no fueron rechazadas');
  const metricsResponse = await fetch(`${apiBaseUrl}/metrics`, {
    cache: 'no-store',
    headers: { authorization: `Bearer ${metricsBearerToken}` },
    signal: AbortSignal.timeout(3_000),
  });
  assert.equal(metricsResponse.status, 200, 'Métricas protegidas no respondieron 200');
  assert.equal(metricsResponse.headers.get('cache-control'), 'no-store');
  const metrics = await metricsResponse.text();
  assert.ok(metrics.includes('ecommerce_api_http_requests_total'));
  assert.ok(metrics.includes('ecommerce_api_observability_alert_operations_total'));
  assert.equal(metrics.includes('private@example.com'), false);

  const initialCollectorLogs = await waitFor('W3C trace in Collector', async () => {
    const logs = dockerComposeOutput('logs', '--no-color', 'otel-collector');
    return logs.toLowerCase().includes(initialTraceId) ? logs : undefined;
  });
  assert.ok(initialCollectorLogs.toLowerCase().includes(initialParentSpanId));
  assert.equal(initialCollectorLogs.includes('private@example.com'), false);
  assert.equal(initialCollectorLogs.includes(sensitiveProbe), false);

  console.log('[observability] Midiendo caída Redis y alerta firing deduplicada');
  const redisFailureStartedAt = performance.now();
  dockerCompose('stop', 'redis');
  const degraded = await waitFor(
    'degraded readiness',
    async () => {
      const response = await fetch(`${apiBaseUrl}/health/ready`);
      return response.status === 503 ? response.json() : undefined;
    },
    DETECTION_BUDGET_MS,
  );
  redisReadinessDetectionMs = performance.now() - redisFailureStartedAt;
  const dependencies = Array.isArray(degraded?.dependencies) ? degraded.dependencies : [];
  const state = new Map(dependencies.map(({ name, status }) => [name, status]));
  assert.deepEqual(
    Object.fromEntries(state),
    { minio: 'up', postgres: 'up', redis: 'down' },
    'Readiness degradado no aisló Redis',
  );
  await readJson('/health/ready', 503);
  await readJson('/health/ready', 503);
  const firingEvents = await waitFor(
    'firing webhook',
    async () => {
      const events = await readAlertEvents();
      return events.some(({ status }) => status === 'firing') ? events : undefined;
    },
    DETECTION_BUDGET_MS,
  );
  alertFiringDetectionMs = performance.now() - redisFailureStartedAt;
  assert.equal(firingEvents.filter(({ status }) => status === 'firing').length, 1);
  assert.ok(redisReadinessDetectionMs <= DETECTION_BUDGET_MS);
  assert.ok(alertFiringDetectionMs <= DETECTION_BUDGET_MS);

  console.log('[observability] Reiniciando API para reconstruir alerta activa sin duplicarla');
  await stopProcess(api);
  await assertClosed(`${apiBaseUrl}/health/live`);
  api = spawnApi();
  await waitFor('API restart', async () => {
    if (api.exitCode !== null) throw new Error('API terminó durante restart');
    const response = await fetch(`${apiBaseUrl}/health/live`);
    return response.ok ? true : undefined;
  });
  await readJson('/health/ready', 503);
  const hydratedEvents = await readAlertEvents();
  assert.equal(hydratedEvents.filter(({ status }) => status === 'firing').length, 1);

  console.log('[observability] Midiendo recuperación Redis y alerta resolved');
  const redisRecoveryStartedAt = performance.now();
  dockerCompose('up', '-d', '--wait', '--wait-timeout', '60', 'redis');
  await waitFor('readiness recovery', async () => {
    const response = await fetch(`${apiBaseUrl}/health/ready`);
    return response.status === 200 ? true : undefined;
  });
  redisReadinessRecoveryMs = performance.now() - redisRecoveryStartedAt;
  const alertEvents = await waitFor('resolved webhook', async () => {
    const events = await readAlertEvents();
    return events.some(({ status }) => status === 'resolved') ? events : undefined;
  });
  alertResolvedRecoveryMs = performance.now() - redisRecoveryStartedAt;
  assert.equal(alertEvents.map(({ status }) => status).join(','), 'firing,resolved');
  assert.ok(redisReadinessRecoveryMs <= RECOVERY_BUDGET_MS);
  assert.ok(alertResolvedRecoveryMs <= RECOVERY_BUDGET_MS);

  console.log('[observability] Midiendo caída y recuperación del exporter OTLP');
  dockerCompose('stop', 'otel-collector');
  await readJson('/health/live', 200);
  await delay(750);
  assert.equal(api.exitCode, null, 'API terminó cuando cayó el backend de trazas');
  const collectorRecoveryStartedAt = performance.now();
  dockerCompose('up', '-d', '--wait', '--wait-timeout', '60', 'otel-collector');
  const recoveryTraceId = randomBytes(16).toString('hex');
  await readJson('/health/live', 200, {
    traceparent: `00-${recoveryTraceId}-${randomBytes(8).toString('hex')}-01`,
  });
  await waitFor('trace exporter recovery', async () => {
    const logs = dockerComposeOutput('logs', '--no-color', 'otel-collector');
    return logs.toLowerCase().includes(recoveryTraceId) ? true : undefined;
  });
  collectorTraceRecoveryMs = performance.now() - collectorRecoveryStartedAt;
  assert.ok(collectorTraceRecoveryMs <= RECOVERY_BUDGET_MS);

  await delay(100);
  assert.equal(output.includes(sensitiveProbe), false);
  assert.equal(output.includes(metricsBearerToken), false);
  assert.equal(output.includes('private@example.com'), false);
  const correlatedLog = output
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return undefined;
      }
    })
    .some((entry) => entry?.correlationId === correlationId && entry?.traceId === initialTraceId);
  assert.equal(correlatedLog, true, 'No existe log estructurado correlacionado');
  success = true;
} finally {
  dockerCompose('up', '-d', '--wait', '--wait-timeout', '60', 'redis', 'otel-collector');
  await stopProcess(api);
  await assertClosed(`${apiBaseUrl}/health/live`);
}

assert.equal(success, true, 'El drill de observabilidad no completó');
const reportDirectory = resolve(ROOT, '.artifacts', 'observability');
mkdirSync(reportDirectory, { recursive: true, mode: 0o700 });
const reportPath = resolve(
  reportDirectory,
  `e9-h5a-${new Date().toISOString().replaceAll(/[:.]/gu, '-')}.json`,
);
writeFileSync(
  reportPath,
  `${JSON.stringify(
    {
      schemaVersion: 1,
      outcome: 'passed',
      scope: 'local-observability-recovery-drill-only',
      budgetsMs: { detection: DETECTION_BUDGET_MS, recovery: RECOVERY_BUDGET_MS },
      durationsMs: {
        alertFiringDetection: Math.round(alertFiringDetectionMs),
        alertResolvedRecovery: Math.round(alertResolvedRecoveryMs),
        collectorTraceRecovery: Math.round(collectorTraceRecoveryMs),
        redisReadinessDetection: Math.round(redisReadinessDetectionMs),
        redisReadinessRecovery: Math.round(redisReadinessRecoveryMs),
        totalRuntime: Math.round(performance.now() - drillStartedAt),
      },
      verified: {
        alertLifecycleDeduplicated: true,
        alertStateHydratedAfterRestart: true,
        apiSurvivesTraceBackendFailure: true,
        cleanShutdown: true,
        metricsBearer: true,
        redaction: true,
        servicesRestored: true,
        w3cCorrelation: true,
      },
      limitations: [
        'no_production_slo',
        'no_external_routing',
        'no_persistent_trace_backend',
        'no_deployment',
      ],
    },
    null,
    2,
  )}\n`,
  { encoding: 'utf8', mode: 0o600 },
);

console.log(
  `[observability] OK: firing ${Math.round(alertFiringDetectionMs)} ms, resolved ${Math.round(alertResolvedRecoveryMs)} ms, Collector ${Math.round(collectorTraceRecoveryMs)} ms`,
);
console.log(`[observability] Reporte local redactado: ${reportPath}`);
