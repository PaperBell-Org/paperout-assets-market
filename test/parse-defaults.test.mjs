import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDefaults, stripVar } from '../scripts/lib/parse-defaults.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = (f) => fs.readFileSync(path.join(ROOT, 'defaults', f), 'utf8');

describe('parseDefaults', () => {
  it('derives paperbell requires (16 filters + template + crossref = 18)', () => {
    const p = parseDefaults(read('paperbell.yaml'));
    expect(p.requires).toHaveLength(18);
    expect(p.requires).toContain('templates/paperbell.latex');
    expect(p.requires).toContain('defaults/crossref.yaml');
    expect(p.requires.filter((r) => r.startsWith('filters/'))).toHaveLength(16);
    expect(p.systemDeps.sort()).toEqual(['citeproc', 'pandoc-crossref']);
    expect(p.hasActiveCsl).toBe(false); // csl is commented out
    expect(p.hasActiveBibliography).toBe(false);
  });

  it('resolves ${.}/../ prefixed refs and reference-doc (demo-obsidian docx)', () => {
    const p = parseDefaults(read('demo-obsidian.yaml'));
    expect(p.requires).toContain('templates/demo-reference.docx');
    expect(p.requires).toContain('filters/demo-docx.lua');
    expect(p.systemDeps.sort()).toEqual(['citeproc', 'pandoc-crossref']);
  });

  it('treats top-level `citeproc: true` as a system dep (beamer)', () => {
    const p = parseDefaults(read('beamer.yaml'));
    expect(p.systemDeps).toContain('citeproc');
  });

  it('stripVar handles both portable prefixes', () => {
    expect(stripVar('${USERDATA}/filters/x.lua')).toBe('filters/x.lua');
    expect(stripVar('${.}/../filters/x.lua')).toBe('filters/x.lua');
  });
});
