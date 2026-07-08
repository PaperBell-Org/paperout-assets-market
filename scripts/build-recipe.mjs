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

// A reproducible text fingerprint of the recipe's real output, honoring its FORMAT:
//   docx   → the produced document.xml (stable; timestamps live elsewhere in the zip)
//   beamer → the beamer LaTeX source
//   else   → the LaTeX source (PDF recipes render this via xelatex at full build)
function fingerprint(id) {
  const sample = path.join(ROOT, 'catalog', 'recipes', id, 'sample', 'input.md');
  const defaults = path.join(ROOT, 'defaults', `${id}.yaml`);
  const to = recipeTo(defaults);
  if (to === 'docx') {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `recipe-${id}-`));
    const docx = path.join(tmp, 'out.docx');
    execFileSync('pandoc', [sample, '--data-dir', ROOT, '--defaults', defaults, '-o', docx], { stdio: 'pipe' });
    const xml = execFileSync('unzip', ['-p', docx, 'word/document.xml'], { maxBuffer: 64 * 1024 * 1024 });
    return sha256(normalize(xml));
  }
  const writer = to === 'beamer' ? 'beamer' : 'latex';
  const out = execFileSync('pandoc', [sample, '--data-dir', ROOT, '--defaults', defaults, '-t', writer, '-o', '-'], {
    maxBuffer: 64 * 1024 * 1024,
  });
  return sha256(normalize(out));
}

function fullBuild(id) {
  const sample = path.join(ROOT, 'catalog', 'recipes', id, 'sample', 'input.md');
  const defaults = path.join(ROOT, 'defaults', `${id}.yaml`);
  const to = recipeTo(defaults);
  const ext = to === 'docx' ? 'docx' : 'pdf';
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `recipe-${id}-`));
  const outFile = path.join(tmp, `output.${ext}`);
  execFileSync('pandoc', [sample, '--data-dir', ROOT, '--defaults', defaults, '-o', outFile], { stdio: 'pipe' });
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
