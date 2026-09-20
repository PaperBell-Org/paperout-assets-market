#!/usr/bin/env node
// Build-test a recipe against its sample note and check its golden fingerprint.
//
//   node scripts/build-recipe.mjs <id> [--update-golden] [--full] [--all]
//
// Two modes:
//   fingerprint (default) — run the recipe's filter chain to a reproducible Pandoc
//       native AST and sha256 it. Catches "a shared filter change altered a
//       downstream recipe's output". Needs: pandoc (+ pandoc-crossref).
//   --full — additionally run the recipe's real export (PDF/DOCX) and assert it
//       succeeds and is non-empty. Needs the full toolchain (xelatex, ...); run in
//       CI's docker image.
//
// --update-golden writes the fingerprint instead of comparing (do this deliberately
// and explain why in your PR).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sha256 } from './lib/hash.mjs';
import { parseDefaultsFile } from './lib/parse-defaults.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

const args = process.argv.slice(2);
const updateGolden = args.includes('--update-golden');
const full = args.includes('--full');
const all = args.includes('--all');
const ids = args.filter((a) => !a.startsWith('--'));

function haveTool(bin) {
  try {
    execFileSync(bin, ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function recipeIds() {
  if (all) {
    const dir = path.join(ROOT, 'catalog', 'recipes');
    return fs.readdirSync(dir).filter((id) => fs.existsSync(path.join(dir, id, 'sample', 'input.md')));
  }
  return ids;
}

function recipeTo(defaults) {
  return String(parseDefaultsFile(defaults).doc.to || '').trim();
}

// Some filters inject the absolute asset path (e.g. cover_letter.lua's AssetDir →
// \graphicspath). Normalize the repo root to a placeholder so the fingerprint is
// reproducible across machines (local /Users/… vs CI /home/runner/…).
function normalize(buf) {
  return Buffer.from(buf.toString('utf8').split(ROOT).join('${REPO_ROOT}'), 'utf8');
}

// Pandoc resolves images relative to the working directory, which here is the repo
// root — so a figure living next to sample/input.md would silently degrade to alt
// text (a warning, exit 0) and the golden would prove nothing about figure handling.
// --resource-path points it at the sample's own directory.
//
// A reproducible text fingerprint of the recipe's real output, honoring its FORMAT:
//   docx   → the produced document.xml (stable; timestamps live elsewhere in the zip)
//   *.lua  → a custom Lua writer producing a zip: the sorted entry list plus a hash
//            of each entry's content (see zipFingerprint)
//   beamer → the beamer LaTeX source
//   else   → the LaTeX source (PDF recipes render this via xelatex at full build)

// A recipe whose `to:` is a path to a custom Lua writer (pandoc 3 accepts that) must
// be fingerprinted by RUNNING it. Re-running the chain with `-t latex`, as the generic
// branch below does, bypasses the writer completely — zip layout, figure packaging,
// bibliography extraction and .bst selection would all go untested and the golden
// would prove nothing.
//
// Hash entry CONTENT, never the zip bytes: deflate is not a fixed function, zlib's
// exact bit stream varies between versions (the same reason scripts/lib/docx.mjs
// compares entries rather than file hashes).
const TEXT_ENTRY = /\.(tex|bib|cls|bst|txt|md|json|ya?ml)$/i;

function zipFingerprint(id, sample, defaults) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `recipe-${id}-`));
  const zip = path.join(tmp, 'out.zip');
  execFileSync('pandoc', [sample, '--data-dir', ROOT, '--resource-path', path.dirname(sample), '--defaults', defaults, '-o', zip], { stdio: 'pipe' });

  const names = execFileSync('unzip', ['-Z1', zip], { maxBuffer: 16 * 1024 * 1024 })
    .toString('utf8').split('\n').map((s) => s.trim()).filter(Boolean).sort();

  const parts = [];
  for (const name of names) {
    const content = execFileSync('unzip', ['-p', zip, name], { maxBuffer: 64 * 1024 * 1024 });
    // normalize() round-trips through utf8, which would mangle binary payloads —
    // only text entries can carry an absolute repo path worth normalizing anyway.
    parts.push(`${name}\n${sha256(TEXT_ENTRY.test(name) ? normalize(content) : content)}\n`);
  }
  return sha256(Buffer.from(parts.join(''), 'utf8'));
}

function fingerprint(id) {
  const sample = path.join(ROOT, 'catalog', 'recipes', id, 'sample', 'input.md');
  const defaults = path.join(ROOT, 'defaults', `${id}.yaml`);
  const to = recipeTo(defaults);
  if (to.endsWith('.lua')) return zipFingerprint(id, sample, defaults);
  if (to === 'docx') {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `recipe-${id}-`));
    const docx = path.join(tmp, 'out.docx');
    execFileSync('pandoc', [sample, '--data-dir', ROOT, '--resource-path', path.dirname(sample), '--defaults', defaults, '-o', docx], { stdio: 'pipe' });
    const xml = execFileSync('unzip', ['-p', docx, 'word/document.xml'], { maxBuffer: 64 * 1024 * 1024 });
    return sha256(normalize(xml));
  }
  const writer = to === 'beamer' ? 'beamer' : 'latex';
  const out = execFileSync('pandoc', [sample, '--data-dir', ROOT, '--resource-path', path.dirname(sample), '--defaults', defaults, '-t', writer, '-o', '-'], {
    maxBuffer: 64 * 1024 * 1024,
  });
  return sha256(normalize(out));
}

function fullBuild(id) {
  const sample = path.join(ROOT, 'catalog', 'recipes', id, 'sample', 'input.md');
  const defaults = path.join(ROOT, 'defaults', `${id}.yaml`);
  const to = recipeTo(defaults);
  const ext = to === 'docx' ? 'docx' : to.endsWith('.lua') ? 'zip' : 'pdf';
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `recipe-${id}-`));
  const outFile = path.join(tmp, `output.${ext}`);
  execFileSync('pandoc', [sample, '--data-dir', ROOT, '--resource-path', path.dirname(sample), '--defaults', defaults, '-o', outFile], { stdio: 'pipe' });
  const size = fs.existsSync(outFile) ? fs.statSync(outFile).size : 0;
  if (size <= 0) throw new Error('produced empty output');
  return size;
}

if (!haveTool('pandoc')) {
  console.error('build-recipe: pandoc not found — install pandoc (and pandoc-crossref) to build-test recipes.');
  process.exit(2);
}

const targets = recipeIds();
if (!targets.length) {
  console.error('build-recipe: no recipe ids given. Usage: build-recipe.mjs <id> [--all] [--update-golden] [--full]');
  process.exit(2);
}

let failed = 0;
for (const id of targets) {
  const goldenPath = path.join(ROOT, 'catalog', 'recipes', id, 'sample', 'expected.fingerprint');
  try {
    const fp = fingerprint(id);
    if (updateGolden) {
      fs.writeFileSync(goldenPath, fp + '\n');
      console.error(`${id}: golden updated → ${fp.slice(0, 12)}…`);
    } else if (!fs.existsSync(goldenPath)) {
      console.error(`${id}: no golden yet — run with --update-golden to create it`);
      failed++;
    } else {
      const golden = fs.readFileSync(goldenPath, 'utf8').trim();
      if (golden !== fp) {
        console.error(`${id}: FINGERPRINT MISMATCH\n  golden:  ${golden}\n  current: ${fp}\n  If intended, re-run with --update-golden and explain in your PR.`);
        failed++;
      } else {
        console.error(`${id}: fingerprint ok (${fp.slice(0, 12)}…)`);
      }
    }
    if (full) {
      const size = fullBuild(id);
      console.error(`${id}: full build ok (${size} bytes)`);
    }
  } catch (e) {
    console.error(`${id}: build FAILED — ${e.message.split('\n')[0]}`);
    failed++;
  }
}

if (failed) {
  console.error(`\nbuild-recipe: ${failed} recipe(s) failed`);
  process.exit(1);
}
console.error('build-recipe: all recipes passed');
