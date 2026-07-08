#!/usr/bin/env node
// PR scope gate. External contributions should ADD assets; modifying or deleting an
// existing protected/core file requires a maintainer to apply the "core-change" label.
// Runs in CI with GITHUB_BASE_REF + PR_LABELS set; skips gracefully off-PR.
//
//   node scripts/check-pr-scope.mjs [--base=<ref>]

import { execFileSync } from 'node:child_process';

const baseArg = process.argv.find((a) => a.startsWith('--base='));
const base = process.env.GITHUB_BASE_REF || (baseArg && baseArg.split('=')[1]) || 'main';
const labels = (process.env.PR_LABELS || '').toLowerCase();
const hasCoreChangeLabel = /\bcore-change\b/.test(labels);

const PROTECTED = [/^filters\//, /^templates\//, /^csl\//, /^defaults\//, /^preamble\.sty$/, /^scripts\//, /^\.github\//];

function diffLines() {
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

const lines = diffLines();
if (!lines) {
  console.error(`check-pr-scope: cannot diff against ${base} (skipping — not a PR context)`);
  process.exit(0);
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

if (violations.length && !hasCoreChangeLabel) {
  console.error('check-pr-scope: this PR modifies/deletes protected core files:');
  for (const v of violations) console.error(`  ${v}`);
  console.error('\nExternal contributions should ADD files. To change an existing core asset, a maintainer must apply the "core-change" label.');
  process.exit(1);
}
console.error(
  violations.length
    ? `check-pr-scope: ${violations.length} core change(s) approved via core-change label`
    : 'check-pr-scope: ok — no protected core files modified'
);
