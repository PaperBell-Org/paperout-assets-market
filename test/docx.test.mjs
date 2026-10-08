import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  readZip,
  writeZip,
  entriesEqual,
  diffEntries,
  replaceAsserted,
  patchStylesXml,
  readBaseReference,
  runMasterGenerator,
} from '../scripts/lib/docx.mjs';
import * as manuscript from '../scripts/mk-manuscript-reference.mjs';
import * as responseLetter from '../scripts/mk-response-letter-reference.mjs';

const entry = (name, text) => ({ name, data: Buffer.from(text, 'utf8') });
const clone = (entries) => entries.map((e) => ({ name: e.name, data: Buffer.from(e.data) }));

describe('writeZip / readZip', () => {
  const entries = [
    entry('[Content_Types].xml', '<Types/>'),
    entry('word/styles.xml', '<w:styles>' + '<w:style/>'.repeat(500) + '</w:styles>'), // deflated
    entry('a', 'x'), // too small to gain from deflate → stored
    { name: 'word/media/bin', data: Buffer.from([0, 255, 1, 254, 2, 253]) },
    entry('ünïcödé/名前.xml', '<x/>'),
    entry('empty', ''),
  ];

  it('round-trips names, order and bytes', () => {
    const back = readZip(writeZip(entries));
    expect(back.map((e) => e.name)).toEqual(entries.map((e) => e.name));
    expect(entriesEqual(back, entries)).toBe(true);
  });

  it('is deterministic', () => {
    expect(writeZip(entries).equals(writeZip(clone(entries)))).toBe(true);
  });

  it('round-trips the vendored pandoc base unchanged', () => {
    const base = readBaseReference();
    expect(base).toHaveLength(16);
    expect(entriesEqual(readZip(writeZip(base)), base)).toBe(true);
  });

  it('rejects a corrupted entry (CRC check)', () => {
    const buf = writeZip([entry('a.txt', 'hello world, stored as-is')]);
    const i = buf.indexOf('hello');
    buf[i] ^= 0xff;
    expect(() => readZip(buf)).toThrow(/CRC mismatch for a\.txt/);
  });

  it('rejects something that is not a zip', () => {
    expect(() => readZip(Buffer.from('not a zip at all, just some bytes'))).toThrow(/not a zip/);
  });
});

describe('diffEntries', () => {
  const a = [entry('x', '1'), entry('y', '2'), entry('z', '3')];

  it('is empty for equal lists', () => {
    expect(diffEntries(a, clone(a))).toEqual([]);
  });

  it('names a part whose bytes differ — any part, not only styles/document', () => {
    const b = clone(a);
    b[2].data = Buffer.from('changed');
    expect(diffEntries(a, b)).toEqual(['differs: z']);
  });

  it('reports count and one-sided parts', () => {
    expect(diffEntries(a, a.slice(0, 2))).toEqual(['part count: committed 3, rebuilt 2', 'only in committed: z']);
    expect(diffEntries(a.slice(1), a)).toEqual(['part count: committed 2, rebuilt 3', 'only in rebuild: x']);
  });

  it('reports a reordering that entriesEqual rejects', () => {
    const b = [a[1], a[0], a[2]];
    expect(entriesEqual(a, b)).toBe(false);
    const d = diffEntries(a, b);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatch(/^part order differs:\n {4}committed: x, y, z\n {4}rebuilt: {3}y, x, z$/);
  });
});

describe('replaceAsserted', () => {
  it('replaces the first hit of a plain regex, every hit of a /g one', () => {
    expect(replaceAsserted('a-a-a', /a/, 'b', 't')).toBe('b-a-a');
    expect(replaceAsserted('a-a-a', /a/g, 'b', 't')).toBe('b-b-b');
  });

  it('throws when nothing matches, global or not', () => {
    expect(() => replaceAsserted('abc', /z/, '', 'plain')).toThrow('patch target not found: plain');
    expect(() => replaceAsserted('abc', /z/g, '', 'global')).toThrow('patch target not found: global');
  });

  it('is not fooled by a /g regex whose lastIndex was advanced', () => {
    const re = /a/g;
    re.test('xxa'); // lastIndex = 3
    expect(replaceAsserted('a', re, 'b', 't')).toBe('b');
  });

  it('inserts the replacement literally ($ is not a pattern)', () => {
    expect(replaceAsserted('x', /x/, '$&$1', 't')).toBe('$&$1');
  });
});

describe('patchStylesXml', () => {
  const xml =
    '<w:styles><w:docDefaults>old</w:docDefaults>' +
    '<w:style w:styleId="Normal"><w:rFonts w:asciiTheme="minorHAnsi" w:hAnsiTheme="minorHAnsi" w:eastAsiaTheme="minorEastAsia" w:cstheme="minorBidi"/></w:style>' +
    '<w:style w:styleId="Heading1"><w:color w:val="0F4761" w:themeColor="accent1"/></w:style>' +
    '</w:styles>';
  const opts = {
    docDefaults: '<w:docDefaults>new</w:docDefaults>',
    font: 'Serif',
    styles: { Heading1: '<w:style w:styleId="Heading1">H</w:style>', Extra: '<w:style w:styleId="Extra"/>' },
    added: ['Extra'],
  };

  it('applies defaults, theme fonts, colour, replacements and additions', () => {
    expect(patchStylesXml(xml, opts)).toBe(
      '<w:styles><w:docDefaults>new</w:docDefaults>' +
        '<w:style w:styleId="Normal"><w:rFonts w:ascii="Serif" w:hAnsi="Serif" w:eastAsia="Serif" w:cs="Serif"/></w:style>' +
        '<w:style w:styleId="Heading1">H</w:style><w:style w:styleId="Extra"/></w:styles>'
    );
  });

  it('fails on a theme-font attribute it does not know how to pin', () => {
    const odd = xml.replace('</w:styles>', '<w:rFonts w:asciiTheme="majorBidi"/></w:styles>');
    expect(() => patchStylesXml(odd, opts)).toThrow(/theme font attribute survived patching: w:asciiTheme="majorBidi"/);
  });

  it('fails when the themed heading colour is gone from the base', () => {
    expect(() => patchStylesXml(xml.replace('0F4761', '123456'), opts)).toThrow(/themed heading colour/);
  });

  it('fails when a style to replace is missing', () => {
    expect(() => patchStylesXml(xml, { ...opts, styles: { ...opts.styles, Nope: '<x/>' } })).toThrow(/style Nope/);
  });

  it('fails when an added style has no definition', () => {
    expect(() => patchStylesXml(xml, { ...opts, added: ['Extra', 'Ghost'] })).toThrow(/added style Ghost/);
  });
});

describe('runMasterGenerator', () => {
  let dir;
  let out;
  let logs;
  const built = [entry('a.xml', '<a/>'), entry('b.xml', '<b/>')];
  const run = (argv) =>
    runMasterGenerator({ name: 'mk-test', out, build: () => clone(built), argv, log: (m) => logs.push(m), root: dir });

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docx-test-'));
    out = path.join(dir, 'master.docx');
    logs = [];
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('--help prints usage and writes nothing', () => {
    expect(run(['--help'])).toBe(0);
    expect(logs.join('\n')).toMatch(/^usage: node scripts\/mk-test\.mjs/);
    expect(fs.existsSync(out)).toBe(false);
  });

  it('rejects an unknown argument instead of writing', () => {
    expect(run(['--dry-run'])).toBe(2);
    expect(logs[0]).toMatch(/unknown argument\(s\): --dry-run/);
    expect(fs.existsSync(out)).toBe(false);
  });

  it('--check fails on a missing file', () => {
    expect(run(['--check'])).toBe(1);
    expect(logs[0]).toMatch(/master\.docx is missing/);
  });

  it('writes, then leaves an up-to-date file alone, then --check passes', () => {
    expect(run([])).toBe(0);
    expect(logs.pop()).toMatch(/wrote master\.docx/);
    const mtime = fs.statSync(out).mtimeMs;
    expect(run([])).toBe(0);
    expect(logs.pop()).toMatch(/already up to date/);
    expect(fs.statSync(out).mtimeMs).toBe(mtime);
    expect(run(['--check'])).toBe(0);
    expect(logs.pop()).toMatch(/committed master matches \(2 parts\)/);
  });

  it('--check reports every differing part', () => {
    fs.writeFileSync(out, writeZip([entry('a.xml', '<a/>'), entry('b.xml', '<B/>'), entry('c.xml', '')]));
    expect(run(['--check'])).toBe(1);
    expect(logs[0]).toMatch(/does not match this script/);
    expect(logs[0]).toMatch(/part count: committed 3, rebuilt 2/);
    expect(logs[0]).toMatch(/differs: b\.xml/);
    expect(logs[0]).toMatch(/only in committed: c\.xml/);
  });

  it('--check fails on a corrupt file; write mode overwrites it', () => {
    fs.writeFileSync(out, 'garbage');
    expect(run(['--check'])).toBe(1);
    expect(logs.pop()).toMatch(/not readable as a \.docx/);
    expect(run([])).toBe(0);
    expect(logs.join('\n')).toMatch(/overwriting it/);
    expect(entriesEqual(readZip(fs.readFileSync(out)), built)).toBe(true);
  });
});

// The fingerprint goldens hash only word/document.xml, so they never see the styles a
// master defines. These pin the properties each recipe's README promises.
describe('committed Word masters', () => {
  const part = (entries, name) => entries.find((e) => e.name === name).data.toString('utf8');
  const style = (xml, id) => xml.match(new RegExp(`<w:style\\b[^>]*w:styleId="${id}"[^>]*>[\\s\\S]*?</w:style>`))?.[0];

  for (const [label, mod] of [['manuscript', manuscript], ['response letter', responseLetter]]) {
    it(`${label}: the committed file is what its generator builds from the vendored base`, () => {
      expect(diffEntries(readZip(fs.readFileSync(mod.OUT)), mod.build())).toEqual([]);
    });

    it(`${label}: no theme fonts survive`, () => {
      const styles = part(mod.build(), 'word/styles.xml');
      expect(styles).not.toMatch(/w:(?:asciiTheme|hAnsiTheme|eastAsiaTheme|cstheme)=/i);
      expect(styles).not.toMatch(/0F4761/);
    });
  }

  // Text colours (<w:color>, not border colours). The four pandoc leftovers are styles
  // neither generator rewrites: Hyperlink, TOC Heading, and the greys of Heading 6–9,
  // their character styles and Subtitle Char.
  const PANDOC_LEFTOVERS = ['272727', '365F91', '4F81BD', '595959'];
  const textColours = (mod) =>
    [...new Set([...part(mod.build(), 'word/styles.xml').matchAll(/<w:color w:val="([0-9A-Fa-f]{6})"/g)].map((m) => m[1]))].sort();

  it('manuscript: no text colour beyond the pandoc leftovers', () => {
    expect(textColours(manuscript)).toEqual(PANDOC_LEFTOVERS);
  });

  it('response letter: only the letter palette plus the pandoc leftovers', () => {
    expect(textColours(responseLetter)).toEqual([...PANDOC_LEFTOVERS, '1A1A1A', '1F3A5F', 'FFFFFF'].sort());
  });

  it('manuscript: Times New Roman 12 pt, double-spaced, justified, US Letter with 1-inch margins', () => {
    const entries = readZip(fs.readFileSync(manuscript.OUT));
    const styles = part(entries, 'word/styles.xml');
    const defaults = styles.match(/<w:docDefaults>[\s\S]*?<\/w:docDefaults>/)[0];
    expect(defaults).toContain('w:ascii="Times New Roman"');
    expect(defaults).toContain('<w:sz w:val="24"/>');
    expect(defaults).toContain('w:line="480"');
    const normal = style(styles, 'Normal');
    expect(normal).toContain('<w:jc w:val="both"/>');
    expect(normal).toContain('w:line="480"');
    expect(style(styles, 'Title')).toContain('<w:jc w:val="center"/>');
    for (const id of ['Affiliation', 'Corresponding', 'Keywords']) expect(style(styles, id)).toBeTruthy();
    const doc = part(entries, 'word/document.xml');
    expect(doc).toContain('<w:pgSz w:w="12240" w:h="15840"/>');
    expect(doc).toMatch(/<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/);
  });

  it('response letter: 11 pt serif body and the three role styles', () => {
    const entries = readZip(fs.readFileSync(responseLetter.OUT));
    const styles = part(entries, 'word/styles.xml');
    const normal = style(styles, 'Normal');
    expect(normal).toContain('w:ascii="Times New Roman"');
    expect(normal).toContain('<w:sz w:val="22"/>');
    expect(style(styles, 'ReviewerComment')).toContain('<w:i/>');
    expect(style(styles, 'AuthorResponse')).toBeTruthy();
    expect(style(styles, 'ManuscriptQuote')).toContain('w:fill="FCFCFD"');
    const doc = part(entries, 'word/document.xml');
    expect(doc).toMatch(/<w:pgMar w:top="1247" w:right="1417" w:bottom="1247" w:left="1417"/);
  });
});
