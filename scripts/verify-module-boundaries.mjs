import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(repositoryRoot, 'apps', 'api', 'src');

const compositionModule = '@composition';
const platformModules = new Set([
  'auth',
  'config',
  'database',
  'email',
  'foundation',
  'generated',
  'health',
  'observability',
]);
const domainModules = new Set([
  'finance',
  'identity',
  'operations',
  'orders',
  'outbox',
  'payments',
  'rates',
  'reconciliation',
  'shopify',
  'whatsapp',
]);

// Platform dependencies point only toward lower-level capabilities. This keeps business domains out
// of shared infrastructure and prevents the health/observability cycle from returning.
const allowedPlatformDependencies = new Map([
  ['auth', new Set(['config', 'database', 'email', 'generated', 'observability'])],
  ['config', new Set()],
  ['database', new Set(['config', 'generated'])],
  ['email', new Set(['config'])],
  ['foundation', new Set(['database', 'generated'])],
  ['generated', new Set()],
  ['health', new Set(['config', 'database', 'foundation', 'observability'])],
  ['observability', new Set(['config', 'foundation'])],
]);

// These are deliberate application-level collaborations, not a blanket permission between domains.
const allowedDomainCollaborations = new Set([
  'outbox->orders',
  'outbox->shopify',
  'reconciliation->shopify',
  'shopify->orders',
  'whatsapp->identity',
]);

const normalizePath = (value) => value.split(path.sep).join('/');

const moduleForRelativePath = (relativePath) => {
  const normalized = normalizePath(relativePath);
  return normalized.includes('/') ? normalized.split('/')[0] : compositionModule;
};

const evaluateBoundary = (sourceModule, targetModule) => {
  if (sourceModule === compositionModule) {
    return undefined;
  }
  if (!platformModules.has(sourceModule) && !domainModules.has(sourceModule)) {
    return `source module '${sourceModule}' is not registered`;
  }
  if (targetModule === compositionModule) {
    return `module '${sourceModule}' cannot import a composition root`;
  }
  if (!platformModules.has(targetModule) && !domainModules.has(targetModule)) {
    return `target module '${targetModule}' is not registered`;
  }
  if (sourceModule === targetModule) {
    return undefined;
  }

  if (platformModules.has(sourceModule)) {
    if (allowedPlatformDependencies.get(sourceModule)?.has(targetModule)) {
      return undefined;
    }
    return `platform module '${sourceModule}' cannot depend on '${targetModule}'`;
  }

  if (platformModules.has(targetModule)) {
    return undefined;
  }

  const collaboration = `${sourceModule}->${targetModule}`;
  if (allowedDomainCollaborations.has(collaboration)) {
    return undefined;
  }
  return `domain collaboration '${collaboration}' is not allowlisted`;
};

const boundaryFixtures = [
  { allowed: true, source: compositionModule, target: 'whatsapp' },
  { allowed: true, source: 'operations', target: 'auth' },
  { allowed: true, source: 'observability', target: 'foundation' },
  { allowed: true, source: 'outbox', target: 'shopify' },
  { allowed: false, source: 'config', target: 'shopify' },
  { allowed: false, source: 'observability', target: 'health' },
  { allowed: false, source: 'payments', target: 'whatsapp' },
  { allowed: false, source: 'unregistered', target: 'config' },
];

const verifyFixtures = () => {
  for (const fixture of boundaryFixtures) {
    const violation = evaluateBoundary(fixture.source, fixture.target);
    assert.equal(
      violation === undefined,
      fixture.allowed,
      `boundary fixture ${fixture.source}->${fixture.target} did not behave as expected`,
    );
  }
};

const collectTypeScriptFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === 'generated') {
      continue;
    }
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectTypeScriptFiles(entryPath)));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(entryPath);
    }
  }
  return files;
};

const extractLocalImports = (source) => {
  const imports = [];
  const patterns = [
    /\b(?:import|export)\s+(?:type\s+)?(?:[^;'"\r\n]+?\s+from\s+)?["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      if (match[1]?.startsWith('.')) {
        imports.push({ index: match.index, specifier: match[1] });
      }
    }
  }
  return imports;
};

const lineAt = (source, index) => source.slice(0, index).split('\n').length;

const verifyRepository = async () => {
  const files = await collectTypeScriptFiles(sourceRoot);
  const violations = [];
  const usedDomainCollaborations = new Set();
  let localImportCount = 0;

  for (const file of files) {
    const source = await readFile(file, 'utf8');
    const sourceRelative = path.relative(sourceRoot, file);
    const sourceModule = moduleForRelativePath(sourceRelative);

    for (const localImport of extractLocalImports(source)) {
      localImportCount += 1;
      const targetAbsolute = path.resolve(path.dirname(file), localImport.specifier);
      const targetRelative = path.relative(sourceRoot, targetAbsolute);
      if (targetRelative.startsWith('..') || path.isAbsolute(targetRelative)) {
        violations.push({
          file: normalizePath(path.relative(repositoryRoot, file)),
          line: lineAt(source, localImport.index),
          reason: `relative import '${localImport.specifier}' escapes apps/api/src`,
        });
        continue;
      }

      const targetModule = moduleForRelativePath(targetRelative);
      const violation = evaluateBoundary(sourceModule, targetModule);
      if (violation) {
        violations.push({
          file: normalizePath(path.relative(repositoryRoot, file)),
          line: lineAt(source, localImport.index),
          reason: `${violation} (${localImport.specifier})`,
        });
      } else {
        const collaboration = `${sourceModule}->${targetModule}`;
        if (allowedDomainCollaborations.has(collaboration)) {
          usedDomainCollaborations.add(collaboration);
        }
      }
    }
  }

  for (const collaboration of allowedDomainCollaborations) {
    if (!usedDomainCollaborations.has(collaboration)) {
      violations.push({
        file: 'scripts/verify-module-boundaries.mjs',
        line: 0,
        reason: `stale domain collaboration '${collaboration}' must be removed or exercised`,
      });
    }
  }

  if (violations.length > 0) {
    for (const violation of violations) {
      console.error(`${violation.file}:${violation.line} ${violation.reason}`);
    }
    throw new Error(`Module boundary verification failed with ${violations.length} violation(s).`);
  }

  console.log(
    `Module boundaries OK: ${files.length} source files, ${localImportCount} local imports, ` +
      `${usedDomainCollaborations.size} explicit domain collaborations, ` +
      `${boundaryFixtures.length} allow/deny fixtures.`,
  );
};

verifyFixtures();
await verifyRepository();
