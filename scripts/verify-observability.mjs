import { execFileSync, spawn } from 'node:child_process';
import { resolve } from 'node:path';

const apiPort = 3102;
const apiBaseUrl = `http://127.0.0.1:${apiPort}`;
const sensitiveProbe = 'Bearer must-not-appear-in-logs';
const correlationId = 'observability-fault-test:redis';
let output = '';

const dockerCompose = (...args) => {
  execFileSync('docker', ['compose', ...args], { stdio: 'inherit' });
};

const delay = (milliseconds) =>
  new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

const waitFor = async (description, check, timeoutMs = 30_000) => {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const result = await check();
      if (result !== undefined) {
        return result;
      }
    } catch (error) {
      lastError = error;
    }
    await delay(250);
  }
  throw new Error(
    `${description} timed out${lastError instanceof Error ? `: ${lastError.message}` : ''}`,
  );
};

const readJson = async (path, expectedStatus) => {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: { authorization: sensitiveProbe, 'x-correlation-id': correlationId },
  });
  if (response.status !== expectedStatus) {
    throw new Error(`${path} returned ${response.status}; expected ${expectedStatus}`);
  }
  return { body: await response.json(), response };
};

const api = spawn('node', ['dist/main.js'], {
  cwd: resolve('apps/api'),
  env: { ...process.env, API_PORT: String(apiPort), LOG_LEVEL: 'info', NODE_ENV: 'test' },
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
  console.log('[observability] Esperando API compilada');
  await waitFor('API startup', async () => {
    const response = await fetch(`${apiBaseUrl}/health/live`);
    return response.ok ? true : undefined;
  });

  console.log('[observability] Verificando readiness, correlación y métricas');
  await readJson('/health/ready', 200);
  const missing = await readJson('/missing?email=private@example.com', 404);
  if (missing.response.headers.get('x-correlation-id') !== correlationId) {
    throw new Error('Correlation header was not propagated');
  }
  const errorBody = missing.body;
  if (
    typeof errorBody !== 'object' ||
    errorBody === null ||
    errorBody.correlationId !== correlationId
  ) {
    throw new Error('Correlation ID is missing from the error body');
  }
  const metrics = await fetch(`${apiBaseUrl}/metrics`).then((response) => response.text());
  if (!metrics.includes('ecommerce_api_http_requests_total')) {
    throw new Error('HTTP request metric is missing');
  }
  if (metrics.includes('private@example.com')) {
    throw new Error('Metrics contain query-string personal data');
  }

  console.log('[observability] Deteniendo Redis y esperando estado degraded');
  dockerCompose('stop', 'redis');
  const degraded = await waitFor('degraded readiness', async () => {
    const response = await fetch(`${apiBaseUrl}/health/ready`);
    if (response.status !== 503) {
      return undefined;
    }
    return response.json();
  });
  const dependencies =
    typeof degraded === 'object' && degraded !== null && 'dependencies' in degraded
      ? degraded.dependencies
      : undefined;
  if (!Array.isArray(dependencies)) {
    throw new Error('Degraded readiness has no dependency list');
  }
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

  console.log('[observability] Reiniciando Redis y esperando recuperación');
  dockerCompose('up', '-d', '--wait', '--wait-timeout', '60', 'redis');
  await waitFor('readiness recovery', async () => {
    const response = await fetch(`${apiBaseUrl}/health/ready`);
    return response.status === 200 ? true : undefined;
  });

  await delay(100);
  if (output.includes(sensitiveProbe) || output.includes('private@example.com')) {
    throw new Error('Structured logs leaked the authorization probe or query-string PII');
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
    .some((entry) => entry?.correlationId === correlationId);
  if (!correlatedLog) {
    throw new Error('No structured log contains the propagated correlation ID');
  }

  console.log('[observability] OK: degradación, métricas, redacción y recuperación verificadas');
} finally {
  dockerCompose('up', '-d', '--wait', '--wait-timeout', '60', 'redis');
  if (!api.killed) {
    api.kill('SIGTERM');
  }
}
