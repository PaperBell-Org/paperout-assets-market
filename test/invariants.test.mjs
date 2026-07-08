import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkDefaults } from '../scripts/lib/invariants.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = (f) => fs.readFileSync(path.join(ROOT, 'defaults', f), 'utf8');

describe('checkDefaults', () => {
  it('passes every migrated recipe yaml', () => {
    for (const f of ['paperbell.yaml', 'cover_letter.yaml', 'demo-obsidian.yaml', 'response-letter.yaml']) {
      expect(checkDefaults(f, read(f)), f).toEqual([]);
    }
  });

  it('rejects an absolute machine path', () => {
    const bad = 'data-dir: ${.}/..\ntemplate: /Users/me/templates/x.latex\n';
    const errs = checkDefaults('bad.yaml', bad);
    expect(errs.some((e) => /absolute machine path|non-portable/.test(e))).toBe(true);
  });

  it('rejects an active (uncommented) bibliography', () => {
    const bad = 'data-dir: ${.}/..\nbibliography: ${USERDATA}/../../mybib.bib\n';
    expect(checkDefaults('bad.yaml', bad).some((e) => /bibliography/.test(e))).toBe(true);
  });

  it('rejects an active (uncommented) csl', () => {
    const bad = 'data-dir: ${.}/..\ncsl: ${USERDATA}/csl/nature.csl\n';
    expect(checkDefaults('bad.yaml', bad).some((e) => /csl/.test(e))).toBe(true);
  });

  it('rejects a wrong data-dir', () => {
    const bad = 'data-dir: /absolute/path\n';
    expect(checkDefaults('bad.yaml', bad).some((e) => /data-dir/.test(e))).toBe(true);
  });
});
