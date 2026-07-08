#!/usr/bin/env node
// CI / PR entry point. Runs the full invariant + index check (strict) and the
// identity-leak scan. Exits non-zero on any error.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIndex } from './build-index.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const tag = process.env.RELEASE_TAG || '0.0.0-validate';

const errors = [];

// 1. invariants + index bijection + requires exist (strict)
const { errors: idxErrors, warnings } = buildIndex({ tag, strict: true });
errors.push(...idxErrors);

// 2. identity-leak scan — personal cover-letter assets must stay placeholders.
const clDir = path.join(ROOT, 'templates', 'cover_letter');
if (fs.existsSync(clDir)) {
  if (!fs.existsSync(path.join(clDir, 'README.md'))) {
    errors.push('templates/cover_letter/README.md missing (needed to explain placeholder replacement)');
  }
  const PLACEHOLDER_MAX = 50 * 1024; // real logos/signatures are typically larger
  for (const f of ['MPI-GEA_logo.pdf', 'Song_signature.png']) {
    const fp = path.join(clDir, f);
    if (fs.existsSync(fp)) {
      const size = fs.statSync(fp).size;
      if (size > PLACEHOLDER_MAX) {
        errors.push(`templates/cover_letter/${f} is ${size}B (> ${PLACEHOLDER_MAX}) — looks like a real identity asset, not a placeholder`);
      }
    }
  }
}

for (const w of warnings) console.error(`warn:  ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`error: ${e}`);
  console.error(`\nvalidation failed: ${errors.length} error(s)`);
  process.exit(1);
}
console.error('validation passed');
