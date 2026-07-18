import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve('.');
const MAX_TRACKED_FILE_BYTES = 10 * 1024 * 1024;
const EXACT_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;

const run = (executable, args, options = {}) => {
  const result = spawnSync(executable, args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${options.label ?? executable} falló con código ${result.status}`);
  }
  return result;
};

const normalizePath = (path) => path.replaceAll('\\', '/');
const trackedOutput = run('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
  label: 'git ls-files',
}).stdout;
const trackedFiles = trackedOutput.split('\0').filter(Boolean).map(normalizePath);
assert.ok(trackedFiles.length > 0, 'Git no devolvió archivos rastreados');

const prohibitedTrackedPaths = trackedFiles.filter((path) => {
  if (path === '.env.example') return false;
  return (
    /(^|\/)\.env(?:\.|$)/u.test(path) ||
    /(^|\/)\.artifacts\//u.test(path) ||
    /(^|\/)(?:\.next|coverage|dist|node_modules)\//u.test(path) ||
    path.startsWith('apps/api/src/generated/prisma/') ||
    /\.(?:dump|key|p12|pem|pfx)$/iu.test(path)
  );
});
assert.deepEqual(
  prohibitedTrackedPaths,
  [],
  'Git rastrea artefactos o archivos sensibles prohibidos',
);

const secretDetectors = [
  {
    name: 'private_key',
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/gu,
  },
  { name: 'github_classic_token', pattern: /\bgh[pousr]_[A-Za-z0-9]{36,255}\b/gu },
  { name: 'github_fine_grained_token', pattern: /\bgithub_pat_[A-Za-z0-9_]{40,255}\b/gu },
  { name: 'aws_access_key', pattern: /\bAKIA[0-9A-Z]{16}\b/gu },
  { name: 'shopify_access_token', pattern: /\bshpat_[a-fA-F0-9]{32}\b/gu },
  { name: 'slack_token', pattern: /\bxox[baprs]-[A-Za-z0-9-]{24,255}\b/gu },
  { name: 'wompi_key', pattern: /\b(?:prv|pub)_(?:prod|test)_[A-Za-z0-9]{24,255}\b/gu },
];
const detectorSamples = new Map([
  ['private_key', ['-----BEGIN ', 'PRIVATE KEY-----'].join('')],
  ['github_classic_token', `ghp_${'A'.repeat(36)}`],
  ['github_fine_grained_token', `github_pat_${'A'.repeat(40)}`],
  ['aws_access_key', `AKIA${'A'.repeat(16)}`],
  ['shopify_access_token', `shpat_${'a'.repeat(32)}`],
  ['slack_token', `xoxb-${'A'.repeat(24)}`],
  ['wompi_key', `prv_test_${'A'.repeat(24)}`],
]);
for (const detector of secretDetectors) {
  const sample = detectorSamples.get(detector.name);
  assert.ok(sample, `Falta muestra sintética para ${detector.name}`);
  detector.pattern.lastIndex = 0;
  assert.equal(detector.pattern.test(sample), true, `Detector inoperante: ${detector.name}`);
}
const secretFindings = [];

for (const path of trackedFiles) {
  const buffer = readFileSync(resolve(ROOT, path));
  assert.ok(
    buffer.byteLength <= MAX_TRACKED_FILE_BYTES,
    `Archivo rastreado demasiado grande para auditar: ${path}`,
  );
  const content = buffer.toString('utf8');
  for (const detector of secretDetectors) {
    detector.pattern.lastIndex = 0;
    for (const match of content.matchAll(detector.pattern)) {
      const offset = match.index ?? 0;
      const line = content.slice(0, offset).split('\n').length;
      secretFindings.push({ detector: detector.name, line, path });
    }
  }
}
if (secretFindings.length > 0) {
  throw new Error(`Secret scan encontró: ${JSON.stringify(secretFindings)}`);
}

for (const ignoredPath of ['.env', '.artifacts/security/probe.json']) {
  const ignored = run('git', ['check-ignore', '--no-index', '-q', ignoredPath], {
    allowFailure: true,
  });
  assert.equal(ignored.status, 0, `${ignoredPath} debe estar excluido de Git`);
}

const packageFiles = trackedFiles.filter((path) => path.endsWith('package.json'));
assert.ok(packageFiles.includes('package.json'), 'Falta package.json raíz');
let dependencyDeclarations = 0;
for (const path of packageFiles) {
  const manifest = JSON.parse(readFileSync(resolve(ROOT, path), 'utf8'));
  for (const lifecycle of ['install', 'postinstall', 'preinstall', 'prepare', 'prepublishOnly']) {
    assert.equal(
      manifest.scripts?.[lifecycle],
      undefined,
      `${path} contiene lifecycle script ${lifecycle}`,
    );
  }
  for (const group of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    for (const [name, version] of Object.entries(manifest[group] ?? {})) {
      dependencyDeclarations += 1;
      assert.equal(typeof version, 'string', `${path}:${group}.${name} no es string`);
      assert.match(
        version,
        EXACT_VERSION_PATTERN,
        `${path}:${group}.${name} no usa versión exacta`,
      );
    }
  }
}
const rootManifest = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'));
assert.match(rootManifest.packageManager, /^pnpm@\d+\.\d+\.\d+$/u, 'packageManager no está fijado');
assert.ok(trackedFiles.includes('pnpm-lock.yaml'), 'pnpm-lock.yaml no está rastreado');

const workflow = readFileSync(resolve(ROOT, '.github/workflows/ci.yml'), 'utf8');
assert.doesNotMatch(
  workflow,
  /^\s*pull_request_target\s*:/gmu,
  'CI no debe usar pull_request_target',
);
assert.match(workflow, /permissions:\s*\r?\n\s+contents: read/u, 'CI debe limitar permisos');
assert.match(
  workflow,
  /persist-credentials: false/u,
  'Checkout debe desactivar credenciales persistentes',
);
assert.match(
  workflow,
  /pnpm install --frozen-lockfile/u,
  'CI debe usar el lockfile sin modificarlo',
);
for (const match of workflow.matchAll(/^\s*uses:\s*([^@\s]+)@([^\s]+)\s*$/gmu)) {
  const reference = match[2] ?? '';
  assert.doesNotMatch(
    reference,
    /^(?:HEAD|main|master|v\d+)$/u,
    'CI usa una acción con ref flotante',
  );
}

const compose = readFileSync(resolve(ROOT, 'docker-compose.yml'), 'utf8');
assert.doesNotMatch(compose, /:\s*latest\s*$/gmu, 'Compose usa una imagen latest');
assert.doesNotMatch(compose, /^\s*privileged:\s*true\s*$/gmu, 'Compose habilita privileged');
assert.doesNotMatch(compose, /^\s*network_mode:\s*host\s*$/gmu, 'Compose usa red host');
assert.doesNotMatch(compose, /\/var\/run\/docker\.sock/u, 'Compose monta el socket Docker');
const imageReferences = [...compose.matchAll(/^\s*image:\s*([^\s]+)\s*$/gmu)].map(
  (match) => match[1] ?? '',
);
assert.ok(imageReferences.length > 0, 'Compose no declara imágenes');
for (const image of imageReferences) {
  assert.match(image, /(?:@sha256:|:[^/:]+$)/u, `Imagen Compose sin tag/digest: ${image}`);
}
for (const match of compose.matchAll(/^\s*-\s*['"]([^'"]*:\d+:\d+)['"]\s*$/gmu)) {
  assert.match(match[1] ?? '', /^127\.0\.0\.1:/u, 'Compose publica un puerto fuera de loopback');
}
for (const requiredSecret of [
  'POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?',
  'REDIS_PASSWORD: ${REDIS_PASSWORD:?',
  'MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD:?',
]) {
  assert.ok(compose.includes(requiredSecret), `Compose no exige ${requiredSecret.split(':')[0]}`);
}

const nextConfig = readFileSync(resolve(ROOT, 'apps/web/next.config.ts'), 'utf8');
for (const requiredHeader of [
  'Content-Security-Policy',
  'Cross-Origin-Opener-Policy',
  'Permissions-Policy',
  'Referrer-Policy',
  'X-Content-Type-Options',
  'X-Frame-Options',
]) {
  assert.ok(nextConfig.includes(requiredHeader), `Falta header web ${requiredHeader}`);
}
assert.ok(nextConfig.includes("frame-ancestors 'none'"), 'CSP no bloquea framing');
assert.ok(nextConfig.includes("object-src 'none'"), 'CSP no bloquea objetos');
assert.match(
  nextConfig,
  /process\.env\.NODE_ENV === 'development' \? " 'unsafe-eval'" : ''/u,
  'unsafe-eval debe limitarse explícitamente a desarrollo',
);
assert.equal(nextConfig.includes('poweredByHeader: false'), true, 'Next debe ocultar X-Powered-By');

const pnpmCli = process.env.npm_execpath;
assert.ok(pnpmCli, 'pnpm no expuso npm_execpath');
const auditResult = run(
  process.execPath,
  [pnpmCli, 'audit', '--prod', '--audit-level', 'high', '--json'],
  { allowFailure: true },
);
assert.equal(auditResult.status, 0, 'pnpm audit productivo falló o no pudo consultar advisories');
const jsonStart = auditResult.stdout.indexOf('{');
assert.ok(jsonStart >= 0, 'pnpm audit no devolvió JSON');
const audit = JSON.parse(auditResult.stdout.slice(jsonStart));
const vulnerabilities = audit.metadata?.vulnerabilities ?? {};
assert.equal(vulnerabilities.high ?? 0, 0, 'pnpm audit encontró vulnerabilidades high');
assert.equal(vulnerabilities.critical ?? 0, 0, 'pnpm audit encontró vulnerabilidades critical');

const reportDirectory = resolve(ROOT, '.artifacts', 'security');
mkdirSync(reportDirectory, { recursive: true, mode: 0o700 });
const reportPath = resolve(
  reportDirectory,
  `e9-h3a-${new Date().toISOString().replaceAll(/[:.]/gu, '-')}.json`,
);
const report = {
  schemaVersion: 1,
  outcome: 'passed',
  scope: 'local-security-baseline-only',
  scanned: {
    trackedFiles: trackedFiles.length,
    packageManifests: packageFiles.length,
    dependencyDeclarations,
    productionDependencies: audit.metadata?.dependencies ?? null,
    composeImages: imageReferences.length,
  },
  findings: {
    highConfidenceSecrets: 0,
    prohibitedTrackedArtifacts: 0,
    highVulnerabilities: 0,
    criticalVulnerabilities: 0,
  },
  controls: [
    'git_secret_scan',
    'secret_detector_self_test',
    'tracked_artifact_policy',
    'exact_dependency_versions',
    'lifecycle_script_policy',
    'ci_least_privilege',
    'compose_local_hardening',
    'web_security_headers',
    'production_dependency_audit',
  ],
  limitations: [
    'not_a_pentest',
    'no_sast_or_dast',
    'ci_actions_use_exact_tags_not_commit_digests',
    'web_csp_still_allows_inline_scripts',
    'no_target_infrastructure_or_tls_validation',
  ],
};
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, {
  encoding: 'utf8',
  flag: 'wx',
  mode: 0o600,
});

console.log(
  `[security] OK: ${report.scanned.trackedFiles} archivos, ${report.scanned.productionDependencies} dependencias productivas, cero secretos high-confidence y cero high/critical`,
);
console.log(`[security] Reporte local redactado: ${reportPath}`);
