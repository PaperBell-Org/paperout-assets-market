// Normalization invariants every `defaults/*.yaml` must satisfy so the toolchain
// is portable and consumable by the plugin. Source of truth: sync-pandoc-assets.sh
// plus the asset-market design. Returns an array of human-readable error strings
// (empty = valid).

import { parseDefaults } from './parse-defaults.mjs';

// Absolute / machine-specific path markers that must never appear in ACTIVE values.
const ABS_PATH = /(\/(?:Users|home)\/|\b[A-Za-z]:\\|\.config\/pandoc\b)/;

function walkStrings(node, fn) {
  if (typeof node === 'string') fn(node);
  else if (Array.isArray(node)) node.forEach((n) => walkStrings(n, fn));
  else if (node && typeof node === 'object') Object.values(node).forEach((n) => walkStrings(n, fn));
}

/**
 * @param {string} name  file name for error messages (e.g. "paperbell.yaml")
 * @param {string} yamlText
 * @returns {string[]} errors
 */
export function checkDefaults(name, yamlText) {
  const errors = [];
  let p;
  try {
    p = parseDefaults(yamlText);
  } catch (e) {
    return [`${name}: not valid YAML — ${e.message}`];
  }

  // 1. data-dir must be the portable ${.}/.. so the toolchain self-locates.
  const dd = p.dataDir == null ? '' : String(p.dataDir).trim();
  if (dd !== '${.}/..') {
    errors.push(`${name}: data-dir must be "\${.}/.." (got ${JSON.stringify(p.dataDir)})`);
  }

  // 2. every resource reference uses a portable variable prefix.
  for (const ref of p.rawRefs) {
    const s = ref.trim();
    if (!(s.startsWith('${USERDATA}/') || s.startsWith('${.}/'))) {
      errors.push(`${name}: non-portable resource reference ${JSON.stringify(ref)} (use \${USERDATA}/... or \${.}/../...)`);
    }
  }

  // 3. no absolute machine paths anywhere in active (parsed) values — comments are
  //    excluded automatically because YAML.parse drops them.
  walkStrings(p.doc, (s) => {
    if (ABS_PATH.test(s)) errors.push(`${name}: absolute machine path in active value ${JSON.stringify(s)}`);
  });

  // 4. bibliography / csl must be commented out — the plugin injects --bibliography/--csl.
  if (p.hasActiveBibliography) {
    errors.push(`${name}: bibliography: must be commented out (plugin injects --bibliography)`);
  }
  if (p.hasActiveCsl) {
    errors.push(`${name}: csl: must be commented out (plugin injects --csl)`);
  }

  return errors;
}
