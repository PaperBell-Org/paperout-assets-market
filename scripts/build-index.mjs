#!/usr/bin/env node
// Scan the four consumption dirs + catalog, validate the invariants, and emit
// index.json (the manifest the plugin and frontend consume).
//
//   node scripts/build-index.mjs --tag 1.0.0 [--out dist/index.json] [--strict] [--check]
//
// Exports buildIndex() so validate.mjs reuses the exact same checks.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checkDefaults } from './lib/invariants.mjs';
import { parseDefaultsFile } from './lib/parse-defaults.mjs';
import { sha256File } from './lib/hash.mjs';
import { fileVersion, isSemver, normalizeSemver } from './lib/version.mjs';
import { loadRecipeManifests, loadAssetDocs, loadCslStyles, INTERNAL_DEFAULTS } from './lib/catalog.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const REPO = process.env.MARKET_REPO || 'PaperBell-Org/paperout-assets-market';
const SCHEMA_VERSION = 1;

const norm = (p) => p.split(path.sep).join('/');
const abs = (rel) => path.join(ROOT, rel);
const exists = (rel) => fs.existsSync(abs(rel));

function listFiles(rel, { exts, recursive = false } = {}) {
  if (!exists(rel)) return [];
  const out = [];
  for (const entry of fs.readdirSync(abs(rel), { withFileTypes: true })) {
    const childRel = path.join(rel, entry.name);
    if (entry.isDirectory()) {
      if (recursive) out.push(...listFiles(childRel, { exts, recursive }));
      continue;
    }
    if (entry.name.startsWith('.')) continue;
    if (exts && !exts.some((e) => entry.name.endsWith(e))) continue;
    out.push(childRel);
  }
  return out;
}

function rawUrl(rel, tag) {
  return `https://raw.githubusercontent.com/${REPO}/${tag}/${norm(rel)}`;
}

// Normalize a title/description into a bilingual { en, zh } object. Accepts a plain
// string (→ en, empty zh) or an { en, zh } object.
function bilingual(v) {
  if (v && typeof v === 'object') return { en: v.en ?? '', zh: v.zh ?? '' };
  if (typeof v === 'string') return { en: v, zh: '' };
  return { en: '', zh: '' };
}

function fileRef(rel, tag) {
  return { path: norm(rel), url: rawUrl(rel, tag), sha256: sha256File(abs(rel)) };
}

function leafAsset(rel, type, tag, docs) {
  const id = norm(rel);
  const doc = docs[id] || {};
  return {
    id,
    type,
    version: fileVersion(rel, tag),
    title: bilingual(doc.title),
    description: bilingual(doc.description),
    sourcePath: id,
    url: rawUrl(rel, tag),
    sha256: sha256File(abs(rel)),
    tier: 'core',
    reviewed: true,
  };
}

export function buildIndex({ tag = '0.0.0', strict = false } = {}) {
  const errors = [];
  const warnings = [];
  const assets = [];
  const seen = new Set();
  const add = (a) => {
    if (seen.has(a.id)) errors.push(`duplicate asset id: ${a.id}`);
    seen.add(a.id);
    assets.push(a);
  };

  const docs = loadAssetDocs(path.join(ROOT, 'catalog'));

  // leaf assets
  for (const rel of listFiles('filters', { exts: ['.lua'] })) add(leafAsset(rel, 'filter', tag, docs));
  for (const rel of listFiles('csl', { exts: ['.csl'] })) add(leafAsset(rel, 'csl', tag, docs));
  for (const rel of listFiles('templates', { exts: ['.tex', '.latex', '.sty', '.docx'] })) add(leafAsset(rel, 'template', tag, docs));

  const manifests = loadRecipeManifests(path.join(ROOT, 'catalog'));

  // defaults → recipes / includes / fallback
  for (const rel of listFiles('defaults', { exts: ['.yaml'] })) {
    const id = path.basename(rel, '.yaml');
    const internal = INTERNAL_DEFAULTS[id];

    // includes (e.g. crossref.yaml) are shared config data, not export recipes —
    // they carry no template/filters/data-dir, so recipe invariants don't apply.
    if (internal === 'include') {
      add(leafAsset(rel, 'include', tag, docs));
      continue;
    }

    errors.push(...checkDefaults(path.basename(rel), fs.readFileSync(abs(rel), 'utf8')));

    const parsed = parseDefaultsFile(abs(rel));
    const requires = parsed.requires.map(norm);
    for (const r of requires) if (!exists(r)) errors.push(`recipe ${id}: requires missing file ${r}`);

    const manifest = manifests[id];
    const isFallback = internal === 'recipe';
    if (!manifest && !isFallback) {
      (strict ? errors : warnings).push(`recipe "${id}" has no catalog/recipes/${id}/recipe.yaml`);
    }
    if (manifest?.version && !isSemver(manifest.version)) {
      errors.push(`recipe ${id}: version "${manifest.version}" is not semver`);
    }

    const extraFiles = [];
    for (const ef of manifest?.extraFiles ?? []) {
      const efRel = norm(ef);
      if (!exists(efRel)) { errors.push(`recipe ${id}: extraFiles missing ${efRel}`); continue; }
      extraFiles.push(fileRef(efRel, tag));
    }

    const version = manifest?.version ?? fileVersion(rel, tag);
    const asset = {
      id,
      type: 'recipe',
      version: normalizeSemver(version, version),
      title: manifest?.title ? bilingual(manifest.title) : { en: id, zh: '' },
      description: isFallback
        ? { en: 'Default preset used when a note names no template.', zh: '笔记未指定模板时使用的默认预设。' }
        : bilingual(manifest?.description),
      sourcePath: norm(rel),
      url: rawUrl(rel, tag),
      sha256: sha256File(abs(rel)),
      requires,
      systemDeps: parsed.systemDeps,
      extraFiles,
      tier: manifest?.tier ?? 'core',
      reviewed: manifest?.tier === 'community' ? Boolean(manifest?.reviewed) : true,
    };
    if (isFallback) asset.internal = true;
    if (manifest) {
      asset.readmePath = `catalog/recipes/${id}/README.md`;
      asset.previewPath = `catalog/recipes/${id}/preview.png`;
    }
    if (manifest?.provenance) asset.provenance = manifest.provenance;
    add(asset);
  }

  // strict bijection: every catalog recipe folder must map to a real defaults file
  for (const id of Object.keys(manifests)) {
    if (!exists(path.join('defaults', `${id}.yaml`))) {
      errors.push(`catalog/recipes/${id}/ has no matching defaults/${id}.yaml`);
    }
  }

  // every asset must be documented so the plugin can show its purpose
  for (const a of assets) {
    if (!a.description || !a.description.en) {
      (strict ? errors : warnings).push(`asset "${a.id}" has no description — add it to catalog/assets.yaml`);
    }
  }
  // every assets.yaml entry must point at a real file
  for (const key of Object.keys(docs)) {
    if (!exists(key)) errors.push(`catalog/assets.yaml: "${key}" has no matching file`);
  }

  // curated CSL styles: resolved from the official CSL repo (CC BY-SA 3.0); a few are
  // also bundled offline. The plugin uses `url` (official) or `offlineUrl` (ours).
  const cslStyles = [];
  const cslDef = loadCslStyles(path.join(ROOT, 'catalog'));
  if (cslDef?.styles) {
    const base = cslDef.source?.base ?? '';
    const license = cslDef.source?.license ?? 'CC-BY-SA-3.0';
    for (const [id, s] of Object.entries(cslDef.styles)) {
      const entry = { id, title: bilingual(s.title), url: `${base}${id}.csl`, license, offline: !!s.offline };
      if (s.offline) {
        const rel = `csl/${id}.csl`;
        if (!exists(rel)) errors.push(`csl style "${id}" is offline:true but ${rel} is missing`);
        else { entry.offlineUrl = rawUrl(rel, tag); entry.sha256 = sha256File(abs(rel)); }
      }
      cslStyles.push(entry);
    }
  }

  // bundles produced by pack-bundle
  let bundles = [];
  if (exists(path.join('dist', 'bundles.json'))) {
    bundles = JSON.parse(fs.readFileSync(abs(path.join('dist', 'bundles.json')), 'utf8'));
  } else {
    warnings.push('no dist/bundles.json — run pack-bundle to populate bundles[]');
  }

  const index = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    repo: REPO,
    tag,
    assets,
    cslStyles,
    bundles,
  };
  return { index, errors, warnings };
}

function argVal(args, name) {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const tag = argVal(args, '--tag') || '0.0.0';
  const { index, errors, warnings } = buildIndex({ tag, strict: args.includes('--strict') });
  for (const w of warnings) console.error(`warn:  ${w}`);
  for (const e of errors) console.error(`error: ${e}`);
  if (errors.length) { console.error(`\n${errors.length} error(s).`); process.exit(1); }
  if (args.includes('--check')) {
    console.error(`ok — ${index.assets.length} assets, ${index.bundles.length} bundles`);
  } else {
    const out = argVal(args, '--out');
    const json = JSON.stringify(index, null, 2);
    if (out) {
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, json + '\n');
      console.error(`wrote ${out} (${index.assets.length} assets, ${index.bundles.length} bundles)`);
    } else {
      process.stdout.write(json + '\n');
    }
  }
}
