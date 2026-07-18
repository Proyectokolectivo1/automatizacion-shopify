import { execFileSync, spawn } from 'node:child_process';
import { resolve } from 'node:path';

const apiPort = 3102;
const apiBaseUrl = `http://127.0.0.1:${apiPort}`;
const alertReceiverUrl = 'http://127.0.0.1:9087';
const sensitiveProbe = 'Bearer must-not-appear-in-logs';
const metricsBearerToken = 'local-observability-metrics-token-0001';
const correlationId = 'observability-fault-test:redis';
const initialTraceId = '0123456789abcdef0123456789abcdef';
const initialParentSpanId = '0123456789abcdef';
let output = '';

const dockerCompose = (...args) => {
  execFileSync('docker', ['compose', ...args], { stdio: 'inherit' });
};

const dockerComposeOutput = (...args) =>
  execFileSync('docker', ['compose', ...args], { encoding: 'utf8' });

const delay = (milliseconds) =>
  new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

const waitFor = async (description, check, timeoutMs = 30_000) => {
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

const readJson = async (path, expectedStatus, headers = {}) => {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: { authorization: sensitiveProbe, 'x-correlation-id': correlationId, ...headers },
  });
  if (response.status !== expectedStatus) {
    throw new Error(`${path} returned ${response.status}; expected ${expectedStatus}`);
  }
  return { body: await response.json(), response };
};

const readAlertEvents = async () => {
  const response = await fetch(`${alertReceiverUrl}/events`);
  if (!response.ok) throw new Error(`Alert receiver returned ${response.status}`);
  const body = await response.json();
  return Array.isArray(body?.events) ? body.events : [];
};

const api = spawn('node', ['dist/main.js'], {
  cwd: resolve('apps/api'),
  env: {
    ...process.env,
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
});
api.stdout.setEncoding('utf8');
api.stderr.setEncoding('utf8');
api.stdout.on('data', (chunk) => {
  output += chunk;
});
api.stderr.on('data', (chunk) => {
  output += chunk;
});

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
      const response = await fetch(`${apiBaseUrl}/health/live`);
      return response.ok ? true : undefined;
    }),
  ]);
  await fetch(`${alertReceiverUrl}/reset`, { method: 'POST' });

  console.log('[observability] Verificando W3C, correlación, Collector y métricas protegidas');
  await readJson('/health/ready', 200);
  const missing = await readJson('/missing?email=private@example.com', 404, {
    traceparent: `00-${initialTraceId}-${initialParentSpanId}-01`,
  });
  if (missing.response.headers.get('x-correlation-id') !== correlationId) {
    throw new Error('Correlation header was not propagated');
  }
  if (missing.response.headers.get('x-trace-id') !== initialTraceId) {
    throw new Error('W3C trace ID was not propagated');
  }
  const errorBody = missing.body;
  if (
    typeof errorBody !== 'object' ||
    errorBody === null ||
    errorBody.correlationId !== correlationId
  ) {
    throw new Error('Correlation ID is missing from the error body');
  }
  await fetch(`${apiBaseUrl}/metrics`).then((response) => {
    if (response.status !== 401) throw new Error(`Unprotected metrics returned ${response.status}`);
  });
  const metrics = await fetch(`${apiBaseUrl}/metrics`, {
    headers: { authorization: `Bearer ${metricsBearerToken}` },
  }).then(async (response) => {
    if (!response.ok) throw new Error(`Protected metrics returned ${response.status}`);
    if (response.headers.get('cache-control') !== 'no-store') {
      throw new Error('Metrics response is cacheable');
    }
    return response.text();
  });
  if (
    !metrics.includes('ecommerce_api_http_requests_total') ||
    !metrics.includes('ecommerce_api_observability_alert_operations_total')
  ) {
    throw new Error('Expected observability metrics are missing');
  }
  if (metrics.includes('private@example.com')) {
    throw new Error('Metrics contain query-string personal data');
  }
  const initialCollectorLogs = await waitFor('W3C trace in Collector', async () => {
    const logs = dockerComposeOutput('logs', '--no-color', 'otel-collector');
    return logs.toLowerCase().includes(initialTraceId) ? logs : undefined;
  });
  if (
    !initialCollectorLogs.toLowerCase().includes(initialParentSpanId) ||
    initialCollectorLogs.includes('private@example.com') ||
    initialCollectorLogs.includes(sensitiveProbe)
  ) {
    throw new Error('Collector trace is uncorrelated or contains sensitive data');
  }

  console.log('[observability] Deteniendo Redis y verificando alerta firing deduplicada');
  dockerCompose('stop', 'redis');
  const degraded = await waitFor('degraded readiness', async () => {
    const response = await fetch(`${apiBaseUrl}/health/ready`);
    if (response.status !== 503) return undefined;
    return response.json();
  });
  const dependencies =
    typeof degraded === 'object' && degraded !== null && 'dependencies' in degraded
      ? degraded.dependencies
      : undefined;
  if (!Array.isArray(dependencies)) throw new Error('Degraded readiness has no dependency list');
  const state = new Map(
    dependencies.flatMap((dependency) =>
      typeof dependency === 'object' &&
      dependency !== null &&
      'name' in dependency &&
      'status' in dependency &&
      typeof dependency.name === 'string' &&
      typeof dependency.status === 'string'
        ? [[dependency.name, dependency.status]]
        : [],
    ),
  );
  if (
    state.get('redis') !== 'down' ||
    state.get('postgres') !== 'up' ||
    state.get('minio') !== 'up'
  ) {
    throw new Error(`Unexpected dependency state: ${JSON.stringify(Object.fromEntries(state))}`);
  }
  await readJson('/health/ready', 503);
  await readJson('/health/ready', 503);
  const firingEvents = await waitFor('firing webhook', async () => {
    const events = await readAlertEvents();
    return events.some(({ status }) => status === 'firing') ? events : undefined;
  });
  if (firingEvents.filter(({ status }) => status === 'firing').length !== 1) {
    throw new Error(`Firing alert was not deduplicated: ${JSON.stringify(firingEvents)}`);
  }

  console.log('[observability] Reiniciando Redis y verificando alerta resolved');
  dockerCompose('up', '-d', '--wait', '--wait-timeout', '60', 'redis');
  await waitFor('readiness recovery', async () => {
    const response = await fetch(`${apiBaseUrl}/health/ready`);
    return response.status === 200 ? true : undefined;
  });
  const alertEvents = await waitFor('resolved webhook', async () => {
    const events = await readAlertEvents();
    return events.some(({ status }) => status === 'resolved') ? events : undefined;
  });
  if (alertEvents.map(({ status }) => status).join(',') !== 'firing,resolved') {
    throw new Error(`Unexpected alert lifecycle: ${JSON.stringify(alertEvents)}`);
  }

  console.log('[observability] Probando caída y recuperación del exporter OTLP');
  dockerCompose('stop', 'otel-collector');
  await readJson('/health/live', 200);
  await delay(750);
  if (api.exitCode !== null) throw new Error('API exited when the trace backend stopped');
  dockerCompose('up', '-d', '--wait', '--wait-timeout', '60', 'otel-collector');
  const recoveryTraceId = 'fedcba9876543210fedcba9876543210';
  await readJson('/health/live', 200, {
    traceparent: `00-${recoveryTraceId}-abcdef0123456789-01`,
  });
  await waitFor('trace exporter recovery', async () => {
    const logs = dockerComposeOutput('logs', '--no-color', 'otel-collector');
    return logs.toLowerCase().includes(recoveryTraceId) ? true : undefined;
  });

  await delay(100);
  if (
    output.includes(sensitiveProbe) ||
    output.includes(metricsBearerToken) ||
    output.includes('private@example.com')
  ) {
    throw new Error('Structured logs leaked authorization, metrics token or query-string PII');
  }
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
  if (!correlatedLog) throw new Error('No structured log correlates request and trace IDs');

  console.log(
    '[observability] OK: trazas, protección, alertas, redacción, degradación y recuperación verificadas',
  );
} finally {
  dockerCompose('up', '-d', '--wait', '--wait-timeout', '60', 'redis', 'otel-collector');
  if (!api.killed) api.kill('SIGTERM');
}
