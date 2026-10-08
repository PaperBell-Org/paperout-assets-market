#!/usr/bin/env node
// Render each recipe's sample and write the first page as catalog/recipes/<id>/preview.png.
//
//   node scripts/mk-previews.mjs [<id> ...]     (no ids: every recipe with a sample)
//
// Run by hand when a recipe's look changes — deliberately NOT part of CI: the result
// depends on the local TeX install and fonts (several recipes use macOS fonts), and
// a preview is a picture for humans, not something to gate a PR on.
//
// Needs pandoc (+ pandoc-crossref), xelatex and pdftoppm (poppler). docx recipes also
// need LibreOffice (`soffice`) to turn the Word file into a PDF; without it they are
// skipped and keep their current preview.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readZip } from './lib/docx.mjs';
import { parseDefaultsFile } from './lib/parse-defaults.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const RECIPES = path.join(ROOT, 'catalog', 'recipes');
const WIDTH = 800; // px; a card-sized preview, not a print proof

function have(bin, arg = '--version') {
  try {
    execFileSync(bin, [arg], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('usage: node scripts/mk-previews.mjs [<recipe-id> ...]');
  process.exit(0);
}
const unknown = args.filter((a) => a.startsWith('--'));
if (unknown.length) {
  console.error(`mk-previews: unknown argument(s): ${unknown.join(' ')}`);
  process.exit(2);
}
for (const [bin, arg] of [['pandoc'], ['xelatex'], ['pdftoppm', '-v']]) {
  if (!have(bin, arg)) {
    console.error(`mk-previews: ${bin} not found`);
    process.exit(2);
  }
}
const SOFFICE = ['soffice', 'libreoffice'].find((b) => have(b));

const ids = args.length
  ? args
  : fs.readdirSync(RECIPES).filter((id) => fs.existsSync(path.join(RECIPES, id, 'sample', 'input.md'))).sort();

function run(bin, argv, cwd) {
  execFileSync(bin, argv, { cwd, stdio: 'pipe' });
}

// Produce a PDF of the recipe's sample in `tmp`, or return null when this machine can't.
function renderPdf(id, tmp) {
  const sample = path.join(RECIPES, id, 'sample', 'input.md');
  const defaults = path.join(ROOT, 'defaults', `${id}.yaml`);
  const to = String(parseDefaultsFile(defaults).doc.to || '').trim();
  const pandoc = (out) =>
    run('pandoc', [sample, '--data-dir', ROOT, '--resource-path', path.dirname(sample), '--defaults', defaults, '-o', out]);

  if (to.endsWith('.lua')) {
    // custom writer → submission zip with main.tex; compile it as the journal would
    const zip = path.join(tmp, 'out.zip');
    pandoc(zip);
    const dir = path.join(tmp, 'zip');
    for (const e of readZip(fs.readFileSync(zip))) {
      const p = path.join(dir, e.name);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, e.data);
    }
    for (let i = 0; i < 2; i++) run('xelatex', ['-interaction=nonstopmode', '-halt-on-error', 'main.tex'], dir);
    return path.join(dir, 'main.pdf');
  }
  if (to === 'docx') {
    if (!SOFFICE) return null;
    const docx = path.join(tmp, 'out.docx');
    pandoc(docx);
    run(SOFFICE, ['--headless', '--convert-to', 'pdf', '--outdir', tmp, docx]);
    return path.join(tmp, 'out.pdf');
  }
  const pdf = path.join(tmp, 'out.pdf');
  pandoc(pdf);
  return pdf;
}

let failed = 0;
for (const id of ids) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `preview-${id}-`));
  try {
    const pdf = renderPdf(id, tmp);
    if (!pdf) {
      console.log(`${id}: skipped (docx needs LibreOffice/soffice to render)`);
      continue;
    }
    const stem = path.join(tmp, 'page');
    run('pdftoppm', ['-png', '-r', '150', '-f', '1', '-l', '1', '-scale-to-x', String(WIDTH), '-scale-to-y', '-1', '-singlefile', pdf, stem]);
    const dest = path.join(RECIPES, id, 'preview.png');
    fs.copyFileSync(`${stem}.png`, dest);
    console.log(`${id}: wrote ${path.relative(ROOT, dest)} (${fs.statSync(dest).size} bytes)`);
  } catch (err) {
    failed++;
    const msg = String(err.stderr || err.message).trim().split('\n').slice(-3).join(' | ');
    console.error(`${id}: FAILED — ${msg}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
process.exit(failed ? 1 : 0);
