import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

const ROOT = resolve('.');
const STARTUP_TIMEOUT_MS = 45_000;
const SHUTDOWN_TIMEOUT_MS = 10_000;

const run = (executable, args, label) => {
  const result = spawnSync(executable, args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label} falló con código ${result.status}`);
  return result.stdout.trim();
};

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
      const port = address.port;
      server.close((error) => (error ? reject(error) : resolvePromise(port)));
    });
  });

const startProcess = (executable, args, environment, cwd = ROOT) => {
  const child = spawn(executable, args, {
    cwd,
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let outputBytes = 0;
  const consume = (chunk) => {
    outputBytes += chunk.length;
    if (outputBytes > 2 * 1024 * 1024) child.kill('SIGTERM');
  };
  child.stdout.on('data', consume);
  child.stderr.on('data', consume);
  return child;
};

const requestUntilReady = async (child, url, predicate) => {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error('Un proceso de smoke terminó durante startup');
    try {
      const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(2_000) });
      if (await predicate(response)) return response;
    } catch {
      // El proceso aún está iniciando.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 150));
  }
  throw new Error('Timeout esperando un artefacto productivo');
};

const stopProcess = async (child) => {
  if (child === undefined || child.exitCode !== null) return;
  const exited = new Promise((resolvePromise) => child.once('exit', resolvePromise));
  child.kill('SIGTERM');
  const stopped = await Promise.race([
    exited.then(() => true),
    new Promise((resolvePromise) => setTimeout(() => resolvePromise(false), SHUTDOWN_TIMEOUT_MS)),
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
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error('Un puerto del smoke siguió respondiendo después del shutdown');
};

const pnpmCli = process.env.npm_execpath;
assert.ok(pnpmCli, 'pnpm no expuso npm_execpath');
const pnpm = (...args) => run(process.execPath, [pnpmCli, ...args], `pnpm ${args.join(' ')}`);

console.log('[release-smoke] Iniciando dependencias locales');
run('docker', ['compose', 'config', '--quiet'], 'docker compose config');
run('docker', ['compose', 'up', '-d', '--wait', '--wait-timeout', '180'], 'docker compose up');

console.log('[release-smoke] Aplicando migraciones y comprobando reaplicación no-op');
const migrationStarted = performance.now();
pnpm('database:migrate');
const firstMigrationDurationMs = performance.now() - migrationStarted;
const noOpStarted = performance.now();
pnpm('database:migrate');
const noOpMigrationDurationMs = performance.now() - noOpStarted;
pnpm('database:status');

const [apiPort, webPort] = await Promise.all([freePort(), freePort()]);
assert.notEqual(apiPort, webPort, 'API y web deben usar puertos distintos');
const metricsToken = randomBytes(32).toString('base64url');
const detailReferenceKey = randomBytes(32).toString('base64url');
const apiBaseUrl = `http://127.0.0.1:${apiPort}`;
const webBaseUrl = `http://127.0.0.1:${webPort}`;
const started = performance.now();
let apiProcess;
let webProcess;
let apiStartupDurationMs = 0;
let webStartupDurationMs = 0;
let success = false;

try {
  console.log('[release-smoke] Iniciando API compilada en modo production');
  const apiStarted = performance.now();
  apiProcess = startProcess(process.execPath, [resolve(ROOT, 'apps', 'api', 'dist', 'main.js')], {
    ...process.env,
    API_HOST: '127.0.0.1',
    API_PORT: String(apiPort),
    LOG_LEVEL: 'silent',
    METRICS_ACCESS_MODE: 'bearer',
    METRICS_BEARER_TOKEN: metricsToken,
    NODE_ENV: 'production',
    WEB_ORIGIN: webBaseUrl,
  });
  const liveness = await requestUntilReady(apiProcess, `${apiBaseUrl}/health/live`, (response) =>
    Promise.resolve(response.status === 200),
  );
  apiStartupDurationMs = performance.now() - apiStarted;
  const liveBody = await liveness.json();
  assert.deepEqual(
    { service: liveBody.service, status: liveBody.status },
    { service: 'api', status: 'ok' },
  );
  const readiness = await fetch(`${apiBaseUrl}/health/ready`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(5_000),
  });
  assert.equal(readiness.status, 200, 'Readiness productivo no respondió 200');
  const readinessBody = await readiness.json();
  assert.equal(readinessBody.status, 'ready', 'Readiness productivo no está ready');

  const metricsDenied = await fetch(`${apiBaseUrl}/metrics`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(5_000),
  });
  assert.equal(metricsDenied.status, 401, 'Métricas deben rechazar acceso sin Bearer');
  const metricsAllowed = await fetch(`${apiBaseUrl}/metrics`, {
    cache: 'no-store',
    headers: { authorization: `Bearer ${metricsToken}` },
    signal: AbortSignal.timeout(5_000),
  });
  assert.equal(metricsAllowed.status, 200, 'Métricas no aceptaron Bearer técnico');
  assert.match(
    metricsAllowed.headers.get('content-type') ?? '',
    /text\/plain/u,
    'Métricas devolvieron content-type inesperado',
  );

  console.log('[release-smoke] Iniciando Next standalone en modo production');
  const webStarted = performance.now();
  webProcess = startProcess(
    process.execPath,
    [
      resolve(ROOT, 'apps', 'web', 'node_modules', 'next', 'dist', 'bin', 'next'),
      'start',
      '--hostname',
      '127.0.0.1',
      '--port',
      String(webPort),
    ],
    {
      ...process.env,
      API_INTERNAL_BASE_URL: apiBaseUrl,
      NODE_ENV: 'production',
      WEB_API_TIMEOUT_MS: '5000',
      WEB_DETAIL_REFERENCE_KEY: detailReferenceKey,
      WEB_ORIGIN: webBaseUrl,
    },
    resolve(ROOT, 'apps', 'web'),
  );
  const homepage = await requestUntilReady(webProcess, webBaseUrl, (response) =>
    Promise.resolve(response.status === 200),
  );
  webStartupDurationMs = performance.now() - webStarted;
  const requiredHeaders = new Map([
    ['cross-origin-opener-policy', 'same-origin'],
    ['permissions-policy', 'camera=(), geolocation=(), microphone=()'],
    ['referrer-policy', 'no-referrer'],
    ['x-content-type-options', 'nosniff'],
    ['x-frame-options', 'DENY'],
  ]);
  for (const [name, expected] of requiredHeaders) {
    assert.equal(homepage.headers.get(name), expected, `Header productivo inválido: ${name}`);
  }
  const csp = homepage.headers.get('content-security-policy') ?? '';
  assert.ok(csp.includes("frame-ancestors 'none'"), 'CSP productiva no bloquea framing');
  assert.ok(csp.includes("object-src 'none'"), 'CSP productiva no bloquea objetos');
  assert.equal(csp.includes('unsafe-eval'), false, 'CSP productiva permite unsafe-eval');
  assert.equal(homepage.headers.has('x-powered-by'), false, 'Next expone X-Powered-By');

  const dashboard = await fetch(
    `${webBaseUrl}/api/dashboard?from=2026-07-17T00%3A00%3A00.000Z&to=2026-07-18T00%3A00%3A00.000Z`,
    { cache: 'no-store', signal: AbortSignal.timeout(5_000) },
  );
  assert.equal(dashboard.status, 401, 'BFF sin sesión debe responder 401');
  assert.match(dashboard.headers.get('cache-control') ?? '', /no-store/u, 'BFF debe usar no-store');
  success = true;
} finally {
  await stopProcess(webProcess);
  await stopProcess(apiProcess);
  await Promise.all([assertClosed(`${apiBaseUrl}/health/live`), assertClosed(webBaseUrl)]);
}

assert.equal(success, true, 'El smoke productivo no completó');
const reportDirectory = resolve(ROOT, '.artifacts', 'release-smoke');
mkdirSync(reportDirectory, { recursive: true, mode: 0o700 });
const reportPath = resolve(
  reportDirectory,
  `e9-h4a-${new Date().toISOString().replaceAll(/[:.]/gu, '-')}.json`,
);
const report = {
  schemaVersion: 1,
  outcome: 'passed',
  scope: 'local-production-artifact-smoke-only',
  durationsMs: {
    firstMigration: Math.round(firstMigrationDurationMs),
    noOpMigration: Math.round(noOpMigrationDurationMs),
    apiStartup: Math.round(apiStartupDurationMs),
    webStartup: Math.round(webStartupDurationMs),
    totalRuntime: Math.round(performance.now() - started),
  },
  verified: {
    apiLiveness: true,
    apiReadiness: true,
    metricsBearer: true,
    webHeaders: true,
    bffUnauthenticated: true,
    productionCspWithoutUnsafeEval: true,
    cleanShutdown: true,
    portsClosed: true,
  },
  limitations: ['no_deployment', 'no_tls_or_proxy', 'no_real_rollback', 'no_release_approval'],
};
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, {
  encoding: 'utf8',
  flag: 'wx',
  mode: 0o600,
});
console.log(
  `[release-smoke] OK: API ${report.durationsMs.apiStartup} ms, web ${report.durationsMs.webStartup} ms; shutdown limpio`,
);
console.log(`[release-smoke] Reporte local redactado: ${reportPath}`);
