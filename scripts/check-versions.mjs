#!/usr/bin/env node
// Assert every recipe/bundle manifest version equals the release tag, so published
// zip filenames and index versions line up with the tag.
//
//   node scripts/check-versions.mjs <tag>

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const tag = (process.argv[2] || '').replace(/^v/, '');
if (!tag) {
  console.error('usage: check-versions.mjs <tag>');
  process.exit(2);
}

const bad = [];
for (const [kind, file] of [['recipes', 'recipe.yaml'], ['bundles', 'bundle.yaml']]) {
  const dir = path.join(ROOT, 'catalog', kind);
  if (!fs.existsSync(dir)) continue;
  for (const id of fs.readdirSync(dir)) {
    const fp = path.join(dir, id, file);
    if (!fs.existsSync(fp)) continue;
    const v = YAML.parse(fs.readFileSync(fp, 'utf8'))?.version;
    if (v && v !== tag) bad.push(`${kind}/${id}: ${v}`);
  }
}

if (bad.length) {
  console.error(`version(s) do not match tag ${tag}:`);
  for (const b of bad) console.error(`  ${b}`);
  console.error('\nBump the manifest version(s) to match the tag (or tag the matching version).');
  process.exit(1);
}
console.error(`all catalog versions match tag ${tag}`);
