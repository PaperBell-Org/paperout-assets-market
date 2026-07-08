#!/usr/bin/env node
// Build self-contained bundle zips from catalog/bundles/*/bundle.yaml, and write
// dist/bundles.json for build-index to fold into index.json.
//
//   node scripts/pack-bundle.mjs --tag 1.0.0 [--dry-run]
//
// Each zip wraps the four consumption dirs in exactly ONE top-level folder
// (paperout/…), so the plugin's leading-dir strip yields defaults/ at the root
// (normalization invariant #5).

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseDefaultsFile } from './lib/parse-defaults.mjs';
import { loadRecipeManifests, loadBundleDefs } from './lib/catalog.mjs';
import { sha256File } from './lib/hash.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const REPO = process.env.MARKET_REPO || 'PaperBell-Org/paperout-assets-market';
const WRAP = 'paperout'; // single wrapping dir, stripped by the consumer

const norm = (p) => p.split(path.sep).join('/');
const abs = (rel) => path.join(ROOT, rel);
const exists = (rel) => fs.existsSync(abs(rel));

function walk(rel) {
  const out = [];
  for (const e of fs.readdirSync(abs(rel), { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const child = path.join(rel, e.name);
    if (e.isDirectory()) out.push(...walk(child));
    else out.push(norm(child));
  }
  return out;
}

function recipeClosure(id, manifests) {
  const files = new Set([`defaults/${id}.yaml`]);
  const parsed = parseDefaultsFile(abs(`defaults/${id}.yaml`));
  for (const r of parsed.requires) files.add(norm(r));
  for (const ef of manifests[id]?.extraFiles ?? []) files.add(norm(ef));
  return files;
}

function bundleClosure(def, manifests) {
  const files = new Set();
  if (def.includeAll) {
    for (const dir of ['defaults', 'filters', 'templates', 'csl']) {
      if (exists(dir)) for (const f of walk(dir)) files.add(f);
    }
    if (exists('preamble.sty')) files.add('preamble.sty');
    return files;
  }
  for (const id of def.include?.recipes ?? []) {
    if (!exists(`defaults/${id}.yaml`)) throw new Error(`bundle ${def.id}: recipe "${id}" has no defaults/${id}.yaml`);
    for (const f of recipeClosure(id, manifests)) files.add(f);
  }
  for (const extra of def.include?.extra ?? []) files.add(norm(extra));
  return files;
}

function packZip(def, files, outDir) {
  const version = def.version;
  const filename = `${def.id}-${version}.zip`;
  const stage = fs.mkdtempSync(path.join(outDir, `.stage-${def.id}-`));
  const wrapRoot = path.join(stage, WRAP);
  for (const rel of files) {
    const src = abs(rel);
    if (!fs.existsSync(src)) throw new Error(`bundle ${def.id}: missing file ${rel}`);
    const dst = path.join(wrapRoot, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
  }
  const outZip = path.join(outDir, filename);
  fs.rmSync(outZip, { force: true });
  execFileSync('zip', ['-r', '-q', '-X', outZip, WRAP], { cwd: stage });
  fs.rmSync(stage, { recursive: true, force: true });
  return { filename, outZip };
}

function bundleEntry(def, files, tag, filename, outZip, manifests) {
  const recipeId = def.include?.recipes?.[0];
  const manifest = recipeId ? manifests[recipeId] : null;
  return {
    id: def.id,
    type: 'bundle',
    version: def.version,
    title: def.title ?? def.id,
    description: def.description ?? '',
    filename,
    url: `https://github.com/${REPO}/releases/download/${tag}/${filename}`,
    sha256: sha256File(outZip),
    assets: [...files].sort(),
    ...(manifest ? {
      readmePath: `catalog/recipes/${recipeId}/README.md`,
      previewPath: `catalog/recipes/${recipeId}/preview.png`,
    } : {}),
  };
}

function argVal(args, name) {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const tag = argVal(args, '--tag') || '0.0.0';
  const dryRun = args.includes('--dry-run');
  const outDir = path.join(ROOT, 'dist');

  const defs = loadBundleDefs(path.join(ROOT, 'catalog'));
  const manifests = loadRecipeManifests(path.join(ROOT, 'catalog'));
  const ids = Object.keys(defs);
  if (!ids.length) { console.error('pack-bundle: no bundle definitions in catalog/bundles/'); process.exit(1); }

  if (!dryRun) fs.mkdirSync(outDir, { recursive: true });
  const entries = [];
  for (const id of ids) {
    const def = defs[id];
    if (!def.version) { console.error(`error: bundle ${id} has no version`); process.exit(1); }
    const files = bundleClosure(def, manifests);
    if (dryRun) {
      // validate files exist
      for (const rel of files) if (!exists(rel)) { console.error(`error: bundle ${id}: missing file ${rel}`); process.exit(1); }
      console.error(`ok (dry-run) ${id}: ${files.size} files`);
      continue;
    }
    const { filename, outZip } = packZip(def, files, outDir);
    entries.push(bundleEntry(def, files, tag, filename, outZip, manifests));
    console.error(`packed ${filename} (${files.size} files)`);
  }

  if (!dryRun) {
    fs.writeFileSync(path.join(outDir, 'bundles.json'), JSON.stringify(entries, null, 2) + '\n');
    console.error(`wrote dist/bundles.json (${entries.length} bundles)`);
  }
}
