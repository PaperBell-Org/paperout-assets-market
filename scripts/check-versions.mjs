#!/usr/bin/env node
// Assert every recipe/bundle manifest declares a valid semver `version`. Versions are
// INDEPENDENT per asset — they are NOT tied to the repository's release tag. Bump an
// asset's own version only when that asset changes.
//
//   node scripts/check-versions.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { isSemver } from './lib/version.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

const bad = [];
for (const [kind, file] of [['recipes', 'recipe.yaml'], ['bundles', 'bundle.yaml']]) {
  const dir = path.join(ROOT, 'catalog', kind);
  if (!fs.existsSync(dir)) continue;
  for (const id of fs.readdirSync(dir)) {
    const fp = path.join(dir, id, file);
    if (!fs.existsSync(fp)) continue;
    const v = YAML.parse(fs.readFileSync(fp, 'utf8'))?.version;
    if (!isSemver(v)) bad.push(`${kind}/${id}: ${JSON.stringify(v)}`);
  }
}

if (bad.length) {
  console.error('invalid/missing semver version:');
  for (const b of bad) console.error(`  ${b}`);
  process.exit(1);
}
console.error('all catalog versions are valid semver');
