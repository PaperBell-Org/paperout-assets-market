#!/usr/bin/env node
// PR scope gate. External contributions should ADD assets; modifying or deleting an
// existing protected/core file requires a maintainer to apply the "core-change" label.
// Runs in CI with GITHUB_BASE_REF + PR_LABELS set; skips gracefully off-PR.
//
//   node scripts/check-pr-scope.mjs [--base=<ref>]

import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CONSUMPTION_DIRS } from './lib/catalog.mjs';

/**
 * Whether PR_LABELS (label names joined with commas by the workflow) contains exactly
 * `core-change`. Each name is compared whole: a word-boundary regex would also accept
 * `not-core-change` or `revert-core-change`, since `-` is a word boundary.
 */
export function hasCoreChangeLabel(labels) {
  return String(labels || '')
    .split(',')
    .some((l) => l.trim().toLowerCase() === 'core-change');
}

// Every consumption dir is core, plus the shared preamble and the toolchain itself.
const PROTECTED = [
  ...CONSUMPTION_DIRS.map((d) => new RegExp(`^${d}/`)),
  /^preamble\.sty$/,
  /^scripts\//,
  /^\.github\//,
];

function diffLines(base) {
  for (const range of [`origin/${base}...HEAD`, `${base}...HEAD`]) {
    try {
      const out = execFileSync('git', ['diff', '--name-status', range], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      return out.trim().split('\n').filter(Boolean);
    } catch {
      /* try next range */
    }
  }
  return null;
}

function main() {
  const baseArg = process.argv.find((a) => a.startsWith('--base='));
  const base = process.env.GITHUB_BASE_REF || (baseArg && baseArg.split('=')[1]) || 'main';

  const lines = diffLines(base);
  if (!lines) {
    console.error(`check-pr-scope: cannot diff against ${base} (skipping — not a PR context)`);
    return 0;
  }

  const violations = [];
  for (const l of lines) {
    const m = l.match(/^(\S+)\s+(.+)$/);
    if (!m) continue;
    const status = m[1];
    const file = m[2];
    const changedExisting = /^[MDR]/.test(status); // Modified / Deleted / Renamed
    if (changedExisting && PROTECTED.some((re) => re.test(file))) {
      violations.push(`${status}\t${file}`);
    }
  }

  if (violations.length && !hasCoreChangeLabel(process.env.PR_LABELS)) {
    console.error('check-pr-scope: this PR modifies/deletes protected core files:');
    for (const v of violations) console.error(`  ${v}`);
    console.error('\nExternal contributions should ADD files. To change an existing core asset, a maintainer must apply the "core-change" label.');
    return 1;
  }
  console.error(
    violations.length
      ? `check-pr-scope: ${violations.length} core change(s) approved via core-change label`
      : 'check-pr-scope: ok — no protected core files modified'
  );
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
