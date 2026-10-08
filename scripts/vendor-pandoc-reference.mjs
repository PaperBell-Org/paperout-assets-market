#!/usr/bin/env node
// Vendor pandoc's default reference.docx into scripts/reference-base/ — the base every
// Word master in templates/ is patched from (scripts/mk-*-reference.mjs).
//
//   node scripts/vendor-pandoc-reference.mjs           # extract from the pandoc on PATH
//   node scripts/vendor-pandoc-reference.mjs --check   # does it match the vendored base?
//
// Why vendor: a master is pandoc's default with two parts patched and fourteen copied
// verbatim (theme, settings, numbering, fonts, docProps, rels). Taking the base from
// whichever pandoc is installed made every master — and the CI check on every PR — a
// function of the local toolchain. With the base committed, `--check` on the masters
// needs no pandoc at all, and moving to a new pandoc's base is a separate commit
// whose diff names the parts that changed.
//
// The extracted file is re-zipped with lib/docx.mjs's deterministic writer: pandoc
// stamps the current time into each entry header, so its raw output is never the same
// bytes twice. Entry names, order and content are kept exactly.
//
// Upgrade procedure (after bumping PANDOC_VERSION in .github/scripts/install-pandoc.sh):
//   1. `--check` with the new pandoc. If it matches, the vendored base is still right;
//      nothing to do.
//   2. Otherwise run without `--check`; it writes pandoc-reference-<version>.docx and
//      lists the parts that changed. Point BASE_REFERENCE_DOCX (scripts/lib/docx.mjs) at
//      it, delete the old file, re-run both mk-*-reference.mjs generators, and review
//      what the new base brings into the shipped masters before committing.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { readZip, writeZip, entriesEqual, diffEntries, BASE_REFERENCE_DOCX } from './lib/docx.mjs';

const NAME = 'vendor-pandoc-reference';
const ROOT = path.resolve(path.dirname(BASE_REFERENCE_DOCX), '..', '..');
const rel = (p) => path.relative(ROOT, p);
const USAGE =
  `usage: node scripts/${NAME}.mjs [--check]\n` +
  '  (no args)  write pandoc-reference-<version>.docx from the pandoc on PATH\n' +
  `  --check    exit 1 unless the pandoc on PATH ships the same base as ${rel(BASE_REFERENCE_DOCX)}\n` +
  '  --help     show this message';

const argv = process.argv.slice(2);
if (argv.includes('--help') || argv.includes('-h')) {
  console.error(USAGE);
  process.exit(0);
}
const unknown = argv.filter((a) => a !== '--check');
if (unknown.length) {
  console.error(`${NAME}: unknown argument(s): ${unknown.join(' ')}\n${USAGE}`);
  process.exit(2);
}
const check = argv.includes('--check');

let version;
try {
  version = execFileSync('pandoc', ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    .split('\n')[0]
    .replace(/^pandoc(?:\.exe)?\s+/, '')
    .trim();
} catch {
  console.error(`${NAME}: pandoc not found on PATH`);
  process.exit(2);
}

const fresh = readZip(
  execFileSync('pandoc', ['--print-default-data-file', 'reference.docx'], {
    stdio: ['ignore', 'pipe', 'inherit'],
    maxBuffer: 64 * 1024 * 1024,
  })
);
const vendored = fs.existsSync(BASE_REFERENCE_DOCX) ? readZip(fs.readFileSync(BASE_REFERENCE_DOCX)) : null;

if (check) {
  if (vendored === null) {
    console.error(`${NAME}: ${rel(BASE_REFERENCE_DOCX)} is missing`);
    process.exit(1);
  }
  const diff = diffEntries(vendored, fresh);
  if (diff.length) {
    console.error(
      `${NAME}: pandoc ${version}'s reference.docx differs from ${rel(BASE_REFERENCE_DOCX)}\n` +
        diff.map((d) => `  ${d}`).join('\n')
    );
    process.exit(1);
  }
  console.error(`${NAME}: pandoc ${version} ships the vendored base (${fresh.length} parts)`);
  process.exit(0);
}

const target = path.join(path.dirname(BASE_REFERENCE_DOCX), `pandoc-reference-${version}.docx`);
if (target !== BASE_REFERENCE_DOCX && vendored !== null && entriesEqual(vendored, fresh)) {
  console.error(`${NAME}: pandoc ${version} ships the same base as ${rel(BASE_REFERENCE_DOCX)} — nothing written`);
  process.exit(0);
}
const existing = fs.existsSync(target) ? readZip(fs.readFileSync(target)) : null;
if (existing !== null && entriesEqual(existing, fresh)) {
  console.error(`${NAME}: ${rel(target)} already up to date — left unchanged`);
} else {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, writeZip(fresh));
  console.error(`${NAME}: wrote ${rel(target)} (${fresh.length} parts)`);
}

if (target !== BASE_REFERENCE_DOCX) {
  const diff = vendored === null ? ['(no current base to compare against)'] : diffEntries(vendored, fresh);
  console.error(
    `${NAME}: the generators still read ${rel(BASE_REFERENCE_DOCX)}. Changes from it:\n` +
      diff.map((d) => `    ${d}`).join('\n') + '\n' +
      '  To switch: point BASE_REFERENCE_DOCX in scripts/lib/docx.mjs at the new file, delete the old one,\n' +
      '  and re-run node scripts/mk-manuscript-reference.mjs and node scripts/mk-response-letter-reference.mjs.'
  );
}
