// Minimal, dependency-free, DETERMINISTIC zip reader/writer for .docx assets, plus the
// shared half of the Word reference-master generators (scripts/mk-*-reference.mjs).
//
// A .docx is a zip. We derive the Word masters in templates/ from pandoc's default
// reference.docx — vendored under scripts/reference-base/ — by patching two XML parts,
// so we need to read a zip and write one back with a fixed entry order and fixed
// timestamps.
//
// Note what is NOT guaranteed: byte-identical output across machines. Deflate is not
// a fixed function — zlib's exact bit stream varies between versions, so the same
// entries compressed on macOS and on a CI runner differ in bytes while decompressing
// to identical content. Callers that need to verify a committed .docx must therefore
// compare ENTRY CONTENT (see entriesEqual), not file hashes.
//
// Scope: stored/deflated entries, no zip64, no encryption — everything pandoc emits.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const LOCAL_SIG = 0x04034b50;
const CDIR_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;

// Fixed MS-DOS timestamp: 1980-01-01 00:00:00, the earliest the format can express.
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/**
 * Read a zip into an ordered list of `{ name, data }`, preserving central-directory
 * order so a re-write keeps the original layout.
 * @param {Buffer} buf
 * @returns {{name: string, data: Buffer}[]}
 */
export function readZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a zip: no end-of-central-directory record');

  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries = [];

  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== CDIR_SIG) throw new Error(`bad central directory entry at ${p}`);
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);

    if (buf.readUInt32LE(localOff) !== LOCAL_SIG) throw new Error(`bad local header for ${name}`);
    const lNameLen = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const start = localOff + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(start, start + compSize);

    if (method !== 0 && method !== 8) throw new Error(`unsupported compression method ${method} for ${name}`);
    const data = method === 0 ? Buffer.from(raw) : zlib.inflateRawSync(raw);
    if (crc32(data) !== crc) throw new Error(`CRC mismatch for ${name}`);
    entries.push({ name, data });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/**
 * Write entries back to a zip deterministically: fixed timestamps, fixed compression
 * level, input order preserved. Same input bytes always produce the same output bytes.
 * @param {{name: string, data: Buffer}[]} entries
 * @returns {Buffer}
 */
export function writeZip(entries) {
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const deflated = zlib.deflateRawSync(data, { level: zlib.constants.Z_BEST_COMPRESSION });
    // Never let "compression" grow the entry; fall back to stored.
    const useDeflate = deflated.length < data.length;
    const payload = useDeflate ? deflated : data;
    const method = useDeflate ? 8 : 0;
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL_SIG, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28); // extra
    chunks.push(local, nameBuf, payload);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(CDIR_SIG, 0);
    cd.writeUInt16LE(20, 4); // version made by
    cd.writeUInt16LE(20, 6); // version needed
    cd.writeUInt16LE(0, 8);
    cd.writeUInt16LE(method, 10);
    cd.writeUInt16LE(DOS_TIME, 12);
    cd.writeUInt16LE(DOS_DATE, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(payload.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30); // extra
    cd.writeUInt16LE(0, 32); // comment
    cd.writeUInt16LE(0, 34); // disk
    cd.writeUInt16LE(0, 36); // internal attrs
    cd.writeUInt32LE(0, 38); // external attrs
    cd.writeUInt32LE(offset, 42);
    central.push(cd, nameBuf);

    offset += local.length + nameBuf.length + payload.length;
  }

  const cdBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(EOCD_SIG, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...chunks, cdBuf, eocd]);
}

/**
 * Compare two zips by content: same entry names in the same order, same bytes in each.
 * This is the meaningful equality for a generated .docx — it ignores which zlib build
 * did the compressing.
 */
export function entriesEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].name !== b[i].name) return false;
    if (!a[i].data.equals(b[i].data)) return false;
  }
  return true;
}

/**
 * Explain how two entry lists differ, one line per finding: part count, parts present
 * on one side only, parts whose bytes differ, and — when the shared names appear in a
 * different order — the two orders. Empty exactly when entriesEqual(a, b).
 * @param {{name: string, data: Buffer}[]} committed
 * @param {{name: string, data: Buffer}[]} rebuilt
 * @returns {string[]}
 */
export function diffEntries(committed, rebuilt) {
  const out = [];
  if (committed.length !== rebuilt.length) {
    out.push(`part count: committed ${committed.length}, rebuilt ${rebuilt.length}`);
  }
  const a = new Map(committed.map((e) => [e.name, e]));
  const b = new Map(rebuilt.map((e) => [e.name, e]));
  for (const name of new Set([...a.keys(), ...b.keys()])) {
    if (!a.has(name)) out.push(`only in rebuild: ${name}`);
    else if (!b.has(name)) out.push(`only in committed: ${name}`);
    else if (!a.get(name).data.equals(b.get(name).data)) out.push(`differs: ${name}`);
  }
  const orderA = committed.map((e) => e.name).filter((n) => b.has(n));
  const orderB = rebuilt.map((e) => e.name).filter((n) => a.has(n));
  if (orderA.some((n, i) => n !== orderB[i])) {
    out.push(`part order differs:\n    committed: ${orderA.join(', ')}\n    rebuilt:   ${orderB.join(', ')}`);
  }
  return out;
}

/** Replace one entry's bytes, erroring if the part is missing (a silent no-op patch is worse). */
export function patchEntry(entries, name, fn) {
  const e = entries.find((x) => x.name === name);
  if (!e) throw new Error(`zip has no entry ${name}`);
  e.data = Buffer.from(fn(e.data.toString('utf8')), 'utf8');
  return entries;
}

// ------------------------------------------------------- reference masters ----

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));

/**
 * The base every Word master is patched from: pandoc's default reference.docx,
 * vendored so that a master is a function of this repository alone, not of whichever
 * pandoc is on PATH. Upgrading it is a deliberate, reviewable commit — see
 * scripts/vendor-pandoc-reference.mjs. It lives under scripts/ rather than templates/
 * because build-index.mjs publishes every .docx under templates/ as a user-facing asset.
 */
export const BASE_REFERENCE_DOCX = path.join(ROOT, 'scripts', 'reference-base', 'pandoc-reference-3.10.1.docx');

/** A fresh copy of the vendored base's entries. */
export function readBaseReference(file = BASE_REFERENCE_DOCX) {
  return readZip(fs.readFileSync(file));
}

/**
 * Regex replacement that throws when it matches nothing — a patch that silently misses
 * is the failure mode that produces a plausible-looking but wrong master. A /g regex
 * replaces every hit, any other regex the first.
 */
export function replaceAsserted(haystack, re, replacement, what) {
  re.lastIndex = 0; // .test() advances lastIndex on /g and /y regexes
  if (!re.test(haystack)) throw new Error(`patch target not found: ${what}`);
  re.lastIndex = 0;
  return haystack.replace(re, () => replacement);
}

// Theme-font attributes resolve through theme1.xml (Aptos/Calibri in pandoc's base).
const THEME_FONT_ATTR = /\bw:(?:asciiTheme|hAnsiTheme|eastAsiaTheme|cstheme)="[^"]*"/i;

/**
 * Patch a base styles.xml into a master. The order of the steps is part of the output,
 * which is why both generators share it:
 *   1. replace <w:docDefaults> with `docDefaults`;
 *   2. pin the four theme-font attributes to `font`, so a style we do not rewrite still
 *      lands in the right family — and assert none survives;
 *   3. drop pandoc's themed heading colour (0F4761);
 *   4. replace every style in `styles` that is not listed in `added`, by styleId;
 *   5. append the `added` styles, in that order, before </w:styles>.
 * Every replacement asserts it fired.
 */
export function patchStylesXml(xml, { docDefaults, font, styles, added }) {
  for (const id of added) {
    if (!(id in styles)) throw new Error(`added style ${id} has no definition`);
  }

  let out = replaceAsserted(xml, /<w:docDefaults>[\s\S]*?<\/w:docDefaults>/, docDefaults, 'docDefaults');

  out = replaceAsserted(out, /w:asciiTheme="(?:major|minor)HAnsi"/g, `w:ascii="${font}"`, 'ascii theme font');
  out = replaceAsserted(out, /w:hAnsiTheme="(?:major|minor)HAnsi"/g, `w:hAnsi="${font}"`, 'hAnsi theme font');
  out = replaceAsserted(out, /w:eastAsiaTheme="(?:major|minor)EastAsia"/g, `w:eastAsia="${font}"`, 'eastAsia theme font');
  out = replaceAsserted(out, /w:cstheme="(?:major|minor)Bidi"/g, `w:cs="${font}"`, 'cs theme font');
  const leftover = out.match(THEME_FONT_ATTR);
  if (leftover) throw new Error(`theme font attribute survived patching: ${leftover[0]}`);

  out = replaceAsserted(out, /<w:color w:val="0F4761"[^/]*\/>/g, '', 'themed heading colour');

  for (const [id, body] of Object.entries(styles)) {
    if (added.includes(id)) continue;
    const re = new RegExp(`<w:style\\b[^>]*w:styleId="${id}"[^>]*>[\\s\\S]*?<\\/w:style>`);
    out = replaceAsserted(out, re, body, `style ${id}`);
  }

  const additions = added.map((id) => styles[id]).join('');
  return replaceAsserted(out, /<\/w:styles>/, additions + '</w:styles>', 'styles close tag');
}

/** Replace document.xml's body-level <w:sectPr> (page size and margins). */
export function patchSectPr(xml, sectPr) {
  return replaceAsserted(xml, /<w:sectPr>[\s\S]*?<\/w:sectPr>/, sectPr, 'sectPr');
}

/**
 * Build a master from the vendored base: patch word/styles.xml and word/document.xml,
 * copy every other part verbatim.
 */
export function buildMaster({ docDefaults, font, styles, added, sectPr, base = BASE_REFERENCE_DOCX }) {
  const entries = readBaseReference(base);
  patchEntry(entries, 'word/styles.xml', (xml) => patchStylesXml(xml, { docDefaults, font, styles, added }));
  patchEntry(entries, 'word/document.xml', (xml) => patchSectPr(xml, sectPr));
  return entries;
}

/**
 * The CLI every reference-master generator shares.
 *
 *   (no args)  rebuild; write `out` unless its content already matches
 *   --check    exit 1 unless the committed file holds exactly what `build` produces
 *   --help     print usage and exit without writing
 *
 * Unknown arguments are an error (exit 2) instead of silently meaning "write".
 * Comparison is by entry content, not file bytes (see entriesEqual), so regenerating
 * on another machine never produces a diff that says nothing. In write mode a
 * committed file that cannot be read is reported and overwritten, so a corrupt master
 * can be regenerated without deleting it first.
 *
 * @param {{name: string, out: string, build: () => {name: string, data: Buffer}[],
 *          argv?: string[], log?: (msg: string) => void, root?: string}} opts
 * @returns {number} the exit code
 */
export function runMasterGenerator({ name, out, build, argv = process.argv.slice(2), log = console.error, root = ROOT }) {
  const script = `scripts/${name}.mjs`;
  const rel = path.relative(root, out);
  const usage =
    `usage: node ${script} [--check]\n` +
    `  (no args)  rebuild ${rel} from the vendored base; write it if its content changed\n` +
    '  --check    exit 1 unless the committed file matches what this script builds\n' +
    '  --help     show this message';

  if (argv.includes('--help') || argv.includes('-h')) {
    log(usage);
    return 0;
  }
  const unknown = argv.filter((a) => a !== '--check');
  if (unknown.length) {
    log(`${name}: unknown argument(s): ${unknown.join(' ')}\n${usage}`);
    return 2;
  }
  const check = argv.includes('--check');

  const built = build();

  let current = null;
  let unreadable = null;
  if (fs.existsSync(out)) {
    try {
      current = readZip(fs.readFileSync(out));
    } catch (e) {
      unreadable = e.message;
    }
  }

  if (check) {
    if (unreadable !== null) {
      log(`${name}: ${rel} is not readable as a .docx — ${unreadable}\n  Re-run \`node ${script}\` and commit the result.`);
      return 1;
    }
    if (current === null) {
      log(`${name}: ${rel} is missing — run this script without --check.`);
      return 1;
    }
    const diff = diffEntries(current, built);
    if (diff.length) {
      log(
        `${name}: ${rel} does not match this script.\n` +
          `  Re-run \`node ${script}\` and commit the result.\n` +
          diff.map((d) => `  ${d}`).join('\n')
      );
      return 1;
    }
    log(`${name}: committed master matches (${built.length} parts)`);
    return 0;
  }

  if (unreadable !== null) log(`${name}: ${rel} is not readable as a .docx (${unreadable}) — overwriting it`);
  if (current !== null && entriesEqual(current, built)) {
    log(`${name}: ${rel} already up to date — left unchanged`);
    return 0;
  }
  const buf = writeZip(built);
  fs.writeFileSync(out, buf);
  log(`${name}: wrote ${rel} (${buf.length} bytes, ${built.length} parts)`);
  return 0;
}
