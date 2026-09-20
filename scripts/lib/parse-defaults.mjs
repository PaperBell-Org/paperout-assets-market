// Parse a Pandoc `defaults/*.yaml` into the dependency information the market needs.
//
// A recipe declares its dependencies implicitly, via the resource references
// already present in its defaults file:
//   - template:        ${USERDATA}/templates/<x>        (LaTeX/PDF recipes)
//   - reference-doc:   ${.}/../templates/<x>.docx       (Word recipes)
//   - filters: [ ${USERDATA}/filters/<x>.lua, ${.}/../filters/<x>.lua, citeproc, ... ]
//   - metadata.crossrefYaml: ${USERDATA}/defaults/crossref.yaml
//   - csl: (must be commented out; if active, it is a dependency)
//   - to:              ${USERDATA}/writers/<x>.lua        (custom Lua writers)
//
// Two portable prefixes appear in the wild and both are valid (no machine paths):
//   ${USERDATA}/foo   and   ${.}/../foo   → repo-relative `foo`.
// Bare filter tokens (`citeproc`, `pandoc-crossref`) are Pandoc/system deps, not files.

import fs from 'node:fs';
import YAML from 'yaml';
import { CONSUMPTION_DIRS } from './catalog.mjs';

export const KNOWN_SYSTEM_DEPS = new Set(['citeproc', 'pandoc-crossref']);

const USERDATA_PREFIX = /^\$\{USERDATA\}\//;
const DOTDOT_PREFIX = /^\$\{\.\}\/\.\.\//;

/** True if a reference uses a portable data-dir variable (not a machine path). */
export function isPortableRef(ref) {
  const s = String(ref).trim();
  return s.startsWith('${USERDATA}/') || s.startsWith('${.}/');
}

/**
 * True if a value looks like a resource path rather than a bare name.
 *
 * Deliberately looser than isPortableRef(): a machine-absolute `to:` or filter entry
 * must still reach rawRefs so `checkDefaults` can reject it (invariant #2). Gate on
 * portability here and a non-portable reference is silently ignored instead of failing
 * the build — exactly the bug that invariant exists to catch.
 */
function looksLikePath(value) {
  const s = String(value).trim();
  return s.includes('/') || s.includes('$');
}

/** Strip a portable prefix, returning the repo-relative path (or the input trimmed). */
export function stripVar(ref) {
  return String(ref).trim().replace(USERDATA_PREFIX, '').replace(DOTDOT_PREFIX, '');
}

function refToRequire(ref, requires, rawRefs) {
  if (typeof ref !== 'string' || !ref.trim()) return;
  rawRefs.push(ref);
  const rel = stripVar(ref);
  if (new RegExp(`^(${CONSUMPTION_DIRS.join('|')})/`).test(rel)) requires.add(rel);
}

/** Recursively check whether a key resolves to a non-null value anywhere top-level or under metadata. */
function activeValue(doc, key) {
  if (doc && doc[key] != null) return doc[key];
  if (doc && doc.metadata && doc.metadata[key] != null) return doc.metadata[key];
  return undefined;
}

/**
 * @returns {{
 *   doc: object, requires: string[], systemDeps: string[], rawRefs: string[],
 *   dataDir: string|null, hasActiveBibliography: boolean, hasActiveCsl: boolean
 * }}
 */
export function parseDefaults(yamlText) {
  const doc = YAML.parse(yamlText) ?? {};
  const requires = new Set();
  const systemDeps = new Set();
  const rawRefs = [];

  // template (latex/tex) and reference-doc (docx) both point at templates/
  refToRequire(doc.template, requires, rawRefs);
  refToRequire(doc['reference-doc'], requires, rawRefs);

  // `to:` is normally a format name (docx, latex, beamer) — but Pandoc 3 also accepts
  // a path to a custom Lua writer, and that writer is as load-bearing as the template:
  // miss it here and the file is neither packed into the bundle nor installed by the
  // plugin, so the recipe arrives broken. Only treat it as a path when it looks like
  // one; a bare format name stays a format name (it is NOT a system dep).
  const to = typeof doc.to === 'string' ? doc.to.trim() : '';
  if (to && looksLikePath(to)) refToRequire(to, requires, rawRefs);

  // filters list: portable refs → files; bare tokens → system deps
  const filters = Array.isArray(doc.filters) ? doc.filters : [];
  for (const item of filters) {
    const s = typeof item === 'string'
      ? item.trim()
      : item && typeof item === 'object' && item.path ? String(item.path).trim() : '';
    if (!s) continue;
    if (isPortableRef(s)) {
      refToRequire(s, requires, rawRefs);
    } else if (!looksLikePath(s)) {
      systemDeps.add(s); // citeproc, pandoc-crossref, ...
    }
  }

  // `citeproc: true` as a top-level defaults key (Pandoc native form)
  if (doc.citeproc === true) systemDeps.add('citeproc');

  // crossref config include
  refToRequire(activeValue(doc, 'crossrefYaml'), requires, rawRefs);

  // an ACTIVE csl (should be commented out; if present, it is a real dependency)
  const csl = activeValue(doc, 'csl');
  if (typeof csl === 'string') refToRequire(csl, requires, rawRefs);

  return {
    doc,
    requires: [...requires],
    systemDeps: [...systemDeps],
    rawRefs,
    dataDir: doc['data-dir'] ?? null,
    hasActiveBibliography: activeValue(doc, 'bibliography') != null,
    hasActiveCsl: typeof csl === 'string',
  };
}

export function parseDefaultsFile(filePath) {
  return parseDefaults(fs.readFileSync(filePath, 'utf8'));
}
