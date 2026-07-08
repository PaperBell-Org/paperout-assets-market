// Parse a Pandoc `defaults/*.yaml` into the dependency information the market needs.
//
// A recipe declares its dependencies implicitly, via the resource references
// already present in its defaults file:
//   - template:        ${USERDATA}/templates/<x>        (LaTeX/PDF recipes)
//   - reference-doc:   ${.}/../templates/<x>.docx       (Word recipes)
//   - filters: [ ${USERDATA}/filters/<x>.lua, ${.}/../filters/<x>.lua, citeproc, ... ]
//   - metadata.crossrefYaml: ${USERDATA}/defaults/crossref.yaml
//   - csl: (must be commented out; if active, it is a dependency)
//
// Two portable prefixes appear in the wild and both are valid (no machine paths):
//   ${USERDATA}/foo   and   ${.}/../foo   → repo-relative `foo`.
// Bare filter tokens (`citeproc`, `pandoc-crossref`) are Pandoc/system deps, not files.

import fs from 'node:fs';
import YAML from 'yaml';

export const KNOWN_SYSTEM_DEPS = new Set(['citeproc', 'pandoc-crossref']);

const USERDATA_PREFIX = /^\$\{USERDATA\}\//;
const DOTDOT_PREFIX = /^\$\{\.\}\/\.\.\//;

/** True if a reference uses a portable data-dir variable (not a machine path). */
export function isPortableRef(ref) {
  const s = String(ref).trim();
  return s.startsWith('${USERDATA}/') || s.startsWith('${.}/');
}

/** Strip a portable prefix, returning the repo-relative path (or the input trimmed). */
export function stripVar(ref) {
  return String(ref).trim().replace(USERDATA_PREFIX, '').replace(DOTDOT_PREFIX, '');
}

function refToRequire(ref, requires, rawRefs) {
  if (typeof ref !== 'string' || !ref.trim()) return;
  rawRefs.push(ref);
  const rel = stripVar(ref);
  if (/^(filters|templates|defaults|csl)\//.test(rel)) requires.add(rel);
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

  // filters list: portable refs → files; bare tokens → system deps
  const filters = Array.isArray(doc.filters) ? doc.filters : [];
  for (const item of filters) {
    const s = typeof item === 'string'
      ? item.trim()
      : item && typeof item === 'object' && item.path ? String(item.path).trim() : '';
    if (!s) continue;
    if (isPortableRef(s)) {
      refToRequire(s, requires, rawRefs);
    } else if (!s.includes('/') && !s.includes('$')) {
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
