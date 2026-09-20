// Load the human/frontend-facing catalog (recipe + bundle manifests).

import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

/**
 * The consumption tree — the directories that land byte-for-byte in a user's vault
 * under PaperBell/pandoc/.
 *
 * Kept here because adding a directory used to mean remembering several independent
 * hardcoded copies of this list, and `writers/` was in fact missed in one of them:
 * check-pr-scope's PROTECTED set, which is what stops an outside PR from modifying a
 * core asset without maintainer review. Three consumers now share this array verbatim.
 *
 * NOT shared: build-index's dir→asset-type→extension mapping and scan-security's
 * per-directory rule set. Those genuinely differ per directory, and adding a leaf dir
 * should still cost one explicit, readable line in each.
 */
export const CONSUMPTION_DIRS = ['defaults', 'filters', 'writers', 'templates', 'csl'];

/** defaults that are NOT user-facing recipes. */
export const INTERNAL_DEFAULTS = {
  crossref: 'include', // shared pandoc-crossref config, referenced via crossrefYaml
  undefined: 'recipe', // fallback preset used when a note names no template (no catalog folder)
};

export function repoRoot() {
  // scripts/lib/catalog.mjs → repo root
  return path.resolve(new URL('../..', import.meta.url).pathname);
}

export function loadRecipeManifests(catalogDir) {
  const dir = path.join(catalogDir, 'recipes');
  const out = {};
  if (!fs.existsSync(dir)) return out;
  for (const id of fs.readdirSync(dir)) {
    const recipeYaml = path.join(dir, id, 'recipe.yaml');
    if (!fs.existsSync(recipeYaml)) continue;
    const manifest = YAML.parse(fs.readFileSync(recipeYaml, 'utf8')) ?? {};
    out[id] = { id, ...manifest, dir: path.join(dir, id) };
  }
  return out;
}

/** Load catalog/assets.yaml → { <repo-relative-path>: { title, description } } (bilingual). */
export function loadAssetDocs(catalogDir) {
  const fp = path.join(catalogDir, 'assets.yaml');
  if (!fs.existsSync(fp)) return {};
  return YAML.parse(fs.readFileSync(fp, 'utf8')) ?? {};
}

/** Load catalog/csl-styles.yaml (curated CSL styles resolved from the official repo). */
export function loadCslStyles(catalogDir) {
  const fp = path.join(catalogDir, 'csl-styles.yaml');
  if (!fs.existsSync(fp)) return null;
  return YAML.parse(fs.readFileSync(fp, 'utf8'));
}

export function loadBundleDefs(catalogDir) {
  const dir = path.join(catalogDir, 'bundles');
  const out = {};
  if (!fs.existsSync(dir)) return out;
  for (const id of fs.readdirSync(dir)) {
    const bundleYaml = path.join(dir, id, 'bundle.yaml');
    if (!fs.existsSync(bundleYaml)) continue;
    const def = YAML.parse(fs.readFileSync(bundleYaml, 'utf8')) ?? {};
    out[id] = { id, ...def, dir: path.join(dir, id) };
  }
  return out;
}
