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
import { readZip } from './lib/docx.mjs';
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

// What a recipe produces, and therefore how it is fingerprinted:
//   zip    — `to:` is a path to a custom Lua writer (pandoc 3 accepts that). Run the real
//            export and hash the sorted entry list plus each entry's content. Re-running
//            the chain with `-t latex` would bypass the writer completely, leaving zip
//            layout, figure packaging and bibliography extraction untested.
//   docx   — the produced document.xml (stable; timestamps live elsewhere in the zip)
//   beamer — the beamer LaTeX source
//   latex  — everything else; PDF recipes render this via xelatex at full build
// Hash entry CONTENT, never zip bytes: deflate is not a fixed function, zlib's exact bit
// stream varies between versions (same reason scripts/lib/docx.mjs compares entries).
function outputKind(to) {
  if (to.endsWith('.lua')) return 'zip';
  if (to === 'docx') return 'docx';
  if (to === 'beamer') return 'beamer';
  return 'latex';
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
// Which zip entries can carry an absolute repo path worth normalizing.
const TEXT_ENTRY = /\.(tex|bib|cls|bst|txt|md|json|ya?ml)$/i;

// Every export lands in its own temp dir, swept on exit — --all --full otherwise
// leaves one directory per recipe behind, payload and all, on every local run.
const tmpDirs = [];
process.on('exit', () => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
});

function exportTo(id, sample, defaults, ext) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `recipe-${id}-`));
  tmpDirs.push(tmp);
  const out = path.join(tmp, `out.${ext}`);
  execFileSync('pandoc', [sample, '--data-dir', ROOT, '--resource-path', path.dirname(sample), '--defaults', defaults, '-o', out], { stdio: 'pipe' });
  return out;
}

function zipFingerprint(zip) {
  // readZip() (scripts/lib/docx.mjs) is a generic reader despite the module name: it
  // walks the central directory and inflates each entry. Shelling out to `unzip` would
  // cost one process per entry, re-scan the archive every time, and make the `unzip`
  // binary load-bearing in a path that has a pure-Node answer.
  const entries = readZip(fs.readFileSync(zip)).sort((a, b) => (a.name < b.name ? -1 : 1));
  const parts = entries.map(({ name, data }) =>
    // normalize() round-trips through utf8, which would mangle binary payloads — and
    // only text entries can carry an absolute repo path worth normalizing anyway.
    `${name}\n${sha256(TEXT_ENTRY.test(name) ? normalize(data) : data)}\n`);
  return sha256(Buffer.from(parts.join(''), 'utf8'));
}

function fingerprint(id) {
  const sample = path.join(ROOT, 'catalog', 'recipes', id, 'sample', 'input.md');
  const defaults = path.join(ROOT, 'defaults', `${id}.yaml`);
  const kind = outputKind(recipeTo(defaults));

  // `artifact` is the real export this fingerprint already had to produce, handed back
  // so --full can stat it instead of exporting the same thing a second time. The
  // latex/beamer kinds return none: their fingerprint streams `-t <kind>` to stdout,
  // while a full build renders a PDF — genuinely two different exports.
  if (kind === 'zip') {
    const zip = exportTo(id, sample, defaults, 'zip');
    return { fp: zipFingerprint(zip), artifact: zip };
  }
  if (kind === 'docx') {
    const docx = exportTo(id, sample, defaults, 'docx');
    const xml = readZip(fs.readFileSync(docx)).find((e) => e.name === 'word/document.xml').data;
    return { fp: sha256(normalize(xml)), artifact: docx };
  }

  const out = execFileSync('pandoc', [sample, '--data-dir', ROOT, '--resource-path', path.dirname(sample), '--defaults', defaults, '-t', kind, '-o', '-'], {
    maxBuffer: 64 * 1024 * 1024,
  });
  return { fp: sha256(normalize(out)) };
}

function fullBuild(id, artifact) {
  const outFile = artifact ?? exportTo(
    id,
    path.join(ROOT, 'catalog', 'recipes', id, 'sample', 'input.md'),
    path.join(ROOT, 'defaults', `${id}.yaml`),
    'pdf', // only latex/beamer reach here, and both render a PDF
  );
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
    const { fp, artifact } = fingerprint(id);
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
      const size = fullBuild(id, artifact);
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
