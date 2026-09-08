#!/usr/bin/env node
// Generate `templates/response-letter-reference.docx` — the Word style master for the
// `response-letter-docx` recipe — deterministically from pandoc's own default
// reference.docx. Same convention as scripts/mk-manuscript-reference.mjs: the
// reviewable artifact is the patch list below, and --check (run in CI) asserts the
// committed binary still holds exactly what this source produces.
//
//   node scripts/mk-response-letter-reference.mjs            # write the file
//   node scripts/mk-response-letter-reference.mjs --check    # assert it matches
//
// The look is derived from the PDF route (templates/responseletter.sty), which is the
// house style people already read: the three roles a response letter has to keep apart
// are separated by type style, label and box — italic reviewer comment, upright labelled
// response, shaded and framed manuscript quote — not by colour, so the letter survives
// greyscale printing and journal systems that strip colour. Only labels and headings
// carry the primary colour.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readZip, writeZip, patchEntry, entriesEqual } from './lib/docx.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT = path.join(ROOT, 'templates', 'response-letter-reference.docx');
const check = process.argv.includes('--check');

const SERIF = 'Times New Roman';
const SANS = 'Arial';

// Palette, read out of templates/responseletter.sty ("Colour palette").
const PRIMARY = '1F3A5F';   // rlprimary — headings, labels, head rule
const TEXT = '1A1A1A';      // rltext    — body
const MSFRAME = '8A949E';   // rlmsframe — manuscript box frame and title bar fill
const MSBG = 'FCFCFD';      // rlmsbg    — manuscript box background

// \parskip 0.6\baselineskip, \parindent 0pt → space after, single line spacing, no indent.
const BODY_SPACING = '<w:spacing w:before="0" w:after="120" w:line="240" w:lineRule="auto"/>';
// RC:/AR: labels hang in the left margin (1 cm = 567 twips).
const HANG = '<w:ind w:left="567" w:hanging="567"/>';

const sans = (sz, extra = '') =>
  `<w:rFonts w:ascii="${SANS}" w:hAnsi="${SANS}" w:cs="${SANS}"/>${extra}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/>`;

function para(id, name, body, { added = false } = {}) {
  const custom = added ? ' w:customStyle="1"' : '';
  return `<w:style w:type="paragraph"${custom} w:styleId="${id}"><w:name w:val="${name}"/>${body}</w:style>`;
}

function charStyle(id, name, rPr) {
  return `<w:style w:type="character" w:customStyle="1" w:styleId="${id}"><w:name w:val="${name}"/>` +
    `<w:basedOn w:val="DefaultParagraphFont"/><w:uiPriority w:val="1"/><w:qFormat/>` +
    `<w:rPr>${rPr}</w:rPr></w:style>`;
}

function heading(level, charLink, sz, before, after) {
  return para(`Heading${level}`, `heading ${level}`,
    `<w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:link w:val="${charLink}"/>` +
    `<w:uiPriority w:val="9"/><w:qFormat/>` +
    `<w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="${before}" w:after="${after}" w:line="240" w:lineRule="auto"/>` +
    `<w:jc w:val="left"/><w:outlineLvl w:val="${level - 1}"/></w:pPr>` +
    `<w:rPr>${sans(sz, '<w:b/>')}<w:color w:val="${PRIMARY}"/></w:rPr>`);
}

const STYLES = {
  // 11 pt serif on a tight single-spaced body: a response letter is read on screen and
  // printed to be annotated, not double-spaced like a manuscript.
  Normal: para('Normal', 'Normal',
    `<w:qFormat/><w:pPr>${BODY_SPACING}<w:jc w:val="left"/></w:pPr>` +
    `<w:rPr><w:rFonts w:ascii="${SERIF}" w:hAnsi="${SERIF}" w:eastAsia="${SERIF}" w:cs="${SERIF}"/>` +
    `<w:color w:val="${TEXT}"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>`),

  BodyText: para('BodyText', 'Body Text',
    `<w:basedOn w:val="Normal"/><w:link w:val="BodyTextChar"/><w:qFormat/><w:pPr>${BODY_SPACING}</w:pPr>`),

  Compact: para('Compact', 'Compact',
    `<w:basedOn w:val="BodyText"/><w:qFormat/>` +
    `<w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/><w:contextualSpacing/></w:pPr>`,
    { added: true }),

  // ── letterhead (\makeletterhead) ──────────────────────────────────────────
  LetterKicker: para('LetterKicker', 'Letter Kicker',
    `<w:basedOn w:val="Normal"/><w:next w:val="Title"/><w:qFormat/>` +
    `<w:pPr><w:keepNext/><w:spacing w:before="0" w:after="160" w:line="240" w:lineRule="auto"/></w:pPr>` +
    `<w:rPr>${sans(28, '<w:b/>')}<w:color w:val="${PRIMARY}"/></w:rPr>`,
    { added: true }),

  Title: para('Title', 'Title',
    `<w:basedOn w:val="Normal"/><w:next w:val="Author"/><w:link w:val="TitleChar"/>` +
    `<w:uiPriority w:val="10"/><w:qFormat/>` +
    `<w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="0" w:after="160" w:line="240" w:lineRule="auto"/>` +
    `<w:contextualSpacing/><w:jc w:val="left"/></w:pPr>` +
    `<w:rPr><w:b/><w:sz w:val="40"/><w:szCs w:val="40"/></w:rPr>`),

  Author: para('Author', 'Author',
    `<w:basedOn w:val="Normal"/><w:next w:val="Journal"/><w:qFormat/>` +
    `<w:pPr><w:keepNext/><w:spacing w:before="0" w:after="60" w:line="240" w:lineRule="auto"/></w:pPr>`),

  // The 1 pt rule under the letterhead is this paragraph's bottom border, so it needs
  // no empty spacer paragraph. A letter with no journal simply has no rule.
  Journal: para('Journal', 'Journal',
    `<w:basedOn w:val="Normal"/><w:next w:val="Legend"/><w:qFormat/>` +
    `<w:pPr><w:keepNext/><w:spacing w:before="0" w:after="120" w:line="240" w:lineRule="auto"/>` +
    `<w:pBdr><w:bottom w:val="single" w:sz="8" w:space="4" w:color="${PRIMARY}"/></w:pBdr></w:pPr>` +
    `<w:rPr><w:i/></w:rPr>`,
    { added: true }),

  Legend: para('Legend', 'Legend',
    `<w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>` +
    `<w:pPr><w:spacing w:before="0" w:after="240" w:line="240" w:lineRule="auto"/><w:jc w:val="right"/></w:pPr>` +
    `<w:rPr><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr>`,
    { added: true }),

  Heading1: heading(1, 'Heading1Char', 26, 320, 120),
  Heading2: heading(2, 'Heading2Char', 22, 240, 80),
  Heading3: heading(3, 'Heading3Char', 22, 200, 80),

  // ── the three roles ───────────────────────────────────────────────────────
  ReviewerComment: para('ReviewerComment', 'Reviewer Comment',
    `<w:basedOn w:val="Normal"/><w:next w:val="AuthorResponse"/><w:qFormat/>` +
    `<w:pPr><w:spacing w:before="0" w:after="120" w:line="240" w:lineRule="auto"/>${HANG}</w:pPr>` +
    `<w:rPr><w:i/></w:rPr>`,
    { added: true }),

  ReviewerCommentCont: para('ReviewerCommentCont', 'Reviewer Comment Cont',
    `<w:basedOn w:val="ReviewerComment"/><w:next w:val="ReviewerCommentCont"/><w:qFormat/>` +
    `<w:pPr><w:ind w:left="567" w:firstLine="0"/></w:pPr>`,
    { added: true }),

  AuthorResponse: para('AuthorResponse', 'Author Response',
    `<w:basedOn w:val="Normal"/><w:next w:val="AuthorResponseCont"/><w:qFormat/>` +
    `<w:pPr><w:spacing w:before="0" w:after="120" w:line="240" w:lineRule="auto"/>${HANG}</w:pPr>`,
    { added: true }),

  // Continuation paragraphs carry no AR: label but stay aligned with the labelled one.
  AuthorResponseCont: para('AuthorResponseCont', 'Author Response Cont',
    `<w:basedOn w:val="AuthorResponse"/><w:next w:val="AuthorResponseCont"/><w:qFormat/>` +
    `<w:pPr><w:ind w:left="567" w:firstLine="0"/></w:pPr>`,
    { added: true }),

  // The framed manuscript box: a filled title bar plus a shaded, bordered body.
  ManuscriptQuoteTitle: para('ManuscriptQuoteTitle', 'Manuscript Quote Title',
    `<w:basedOn w:val="Normal"/><w:next w:val="ManuscriptQuote"/><w:qFormat/>` +
    `<w:pPr><w:keepNext/><w:spacing w:before="160" w:after="0" w:line="240" w:lineRule="auto"/>` +
    `<w:shd w:val="clear" w:color="auto" w:fill="${MSFRAME}"/>` +
    `<w:pBdr><w:top w:val="single" w:sz="4" w:space="2" w:color="${MSFRAME}"/>` +
    `<w:left w:val="single" w:sz="4" w:space="4" w:color="${MSFRAME}"/>` +
    `<w:right w:val="single" w:sz="4" w:space="4" w:color="${MSFRAME}"/></w:pBdr></w:pPr>` +
    `<w:rPr>${sans(18, '<w:b/>')}<w:color w:val="FFFFFF"/></w:rPr>`,
    { added: true }),

  ManuscriptQuote: para('ManuscriptQuote', 'Manuscript Quote',
    `<w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>` +
    `<w:pPr><w:spacing w:before="0" w:after="160" w:line="240" w:lineRule="auto"/>` +
    `<w:shd w:val="clear" w:color="auto" w:fill="${MSBG}"/>` +
    `<w:pBdr><w:left w:val="single" w:sz="4" w:space="4" w:color="${MSFRAME}"/>` +
    `<w:bottom w:val="single" w:sz="4" w:space="2" w:color="${MSFRAME}"/>` +
    `<w:right w:val="single" w:sz="4" w:space="4" w:color="${MSFRAME}"/></w:pBdr></w:pPr>` +
    `<w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>`,
    { added: true }),

  Bibliography: para('Bibliography', 'Bibliography',
    `<w:basedOn w:val="Normal"/><w:next w:val="Bibliography"/><w:qFormat/>` +
    `<w:pPr>${BODY_SPACING}${HANG}</w:pPr>`),

  ImageCaption: para('ImageCaption', 'Image Caption',
    `<w:basedOn w:val="Caption"/>` +
    `<w:pPr><w:spacing w:before="120" w:after="240" w:line="240" w:lineRule="auto"/><w:jc w:val="left"/></w:pPr>` +
    `<w:rPr><w:i w:val="0"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr>`),

  TableCaption: para('TableCaption', 'Table Caption',
    `<w:basedOn w:val="Caption"/>` +
    `<w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120" w:line="240" w:lineRule="auto"/><w:jc w:val="left"/></w:pPr>` +
    `<w:rPr><w:i w:val="0"/><w:b/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr>`),

  // Character styles for the hanging labels, so the filter never hard-codes a colour.
  RCLabel: charStyle('RCLabel', 'RC Label', `${sans(22, '<w:b/>')}<w:color w:val="${PRIMARY}"/>`),
  ARLabel: charStyle('ARLabel', 'AR Label', `${sans(22, '<w:b/>')}<w:color w:val="${PRIMARY}"/>`),
  // "Manuscript" stays bold; the "· Page 5, Line 158–160" half does not.
  ManuscriptLocator: charStyle('ManuscriptLocator', 'Manuscript Locator',
    `${sans(18)}<w:b w:val="0"/><w:color w:val="FFFFFF"/>`),
};

// Style ids that do not exist in pandoc's base master and must be inserted.
const ADDED = [
  'Compact', 'LetterKicker', 'Journal', 'Legend',
  'ReviewerComment', 'ReviewerCommentCont', 'AuthorResponse', 'AuthorResponseCont',
  'ManuscriptQuoteTitle', 'ManuscriptQuote',
  'RCLabel', 'ARLabel', 'ManuscriptLocator',
];

const DOC_DEFAULTS =
  '<w:docDefaults><w:rPrDefault><w:rPr>' +
  `<w:rFonts w:ascii="${SERIF}" w:hAnsi="${SERIF}" w:eastAsia="${SERIF}" w:cs="${SERIF}"/>` +
  `<w:color w:val="${TEXT}"/><w:sz w:val="22"/><w:szCs w:val="22"/>` +
  '<w:lang w:val="en-US" w:eastAsia="en-US" w:bidi="ar-SA"/>' +
  '</w:rPr></w:rPrDefault><w:pPrDefault><w:pPr>' + BODY_SPACING + '</w:pPr></w:pPrDefault></w:docDefaults>';

function patchStyles(xml) {
  let out = xml;
  out = replaceOne(out, /<w:docDefaults>[\s\S]*?<\/w:docDefaults>/, DOC_DEFAULTS, 'docDefaults');

  // Theme fonts resolve to Aptos/Calibri via theme1.xml; pin them so a style we did
  // not rewrite still lands in the right family.
  out = replaceAll(out, /w:asciiTheme="(?:major|minor)HAnsi"/g, `w:ascii="${SERIF}"`, 'ascii theme font');
  out = replaceAll(out, /w:hAnsiTheme="(?:major|minor)HAnsi"/g, `w:hAnsi="${SERIF}"`, 'hAnsi theme font');
  out = replaceAll(out, /w:eastAsiaTheme="(?:major|minor)EastAsia"/g, `w:eastAsia="${SERIF}"`, 'eastAsia theme font');
  out = replaceAll(out, /w:cstheme="(?:major|minor)Bidi"/g, `w:cs="${SERIF}"`, 'cs theme font');
  // Pandoc's themed heading colour; the letter uses its own primary instead.
  out = replaceAll(out, /<w:color w:val="0F4761"[^/]*\/>/g, '', 'themed heading colour');

  for (const [id, body] of Object.entries(STYLES)) {
    if (ADDED.includes(id)) continue;
    const re = new RegExp(`<w:style\\b[^>]*w:styleId="${id}"[^>]*>[\\s\\S]*?<\\/w:style>`);
    out = replaceOne(out, re, body, `style ${id}`);
  }

  const additions = ADDED.map((id) => STYLES[id]).join('');
  out = replaceOne(out, /<\/w:styles>/, additions + '</w:styles>', 'styles close tag');
  return out;
}

// US Letter; margins mirror the PDF's geometry (22 mm top/bottom, 25 mm left/right).
const SECT_PR =
  '<w:sectPr><w:footnotePr><w:numRestart w:val="eachSect"/></w:footnotePr>' +
  '<w:pgSz w:w="12240" w:h="15840"/>' +
  '<w:pgMar w:top="1247" w:right="1417" w:bottom="1247" w:left="1417" w:header="720" w:footer="720" w:gutter="0"/>' +
  '</w:sectPr>';

function patchDocument(xml) {
  return replaceOne(xml, /<w:sectPr>[\s\S]*?<\/w:sectPr>/, SECT_PR, 'sectPr');
}

// A patch that matches nothing is the failure mode that produces a plausible-looking
// but wrong master, so every replacement asserts it fired — the global ones too.
function replaceOne(haystack, re, replacement, what) {
  if (!re.test(haystack)) throw new Error(`patch target not found: ${what}`);
  return haystack.replace(re, () => replacement);
}

function replaceAll(haystack, re, replacement, what) {
  if (!re.test(haystack)) throw new Error(`patch target not found: ${what}`);
  return haystack.replace(re, () => replacement);
}

function build() {
  const base = execFileSync('pandoc', ['--print-default-data-file', 'reference.docx'], {
    maxBuffer: 64 * 1024 * 1024,
  });
  const entries = readZip(base);
  patchEntry(entries, 'word/styles.xml', patchStyles);
  patchEntry(entries, 'word/document.xml', patchDocument);
  return entries;
}

try {
  execFileSync('pandoc', ['--version'], { stdio: 'ignore' });
} catch {
  console.error('mk-response-letter-reference: pandoc not found — it supplies the base reference.docx.');
  process.exit(2);
}

const builtEntries = build();
const rel = path.relative(ROOT, OUT);

function committedEntries() {
  if (!fs.existsSync(OUT)) return null;
  try {
    return readZip(fs.readFileSync(OUT));
  } catch (e) {
    console.error(`mk-response-letter-reference: ${rel} is not readable as a .docx — ${e.message}`);
    process.exit(1);
  }
}

const current = committedEntries();
const matches = current !== null && entriesEqual(current, builtEntries);

if (check) {
  if (current === null) {
    console.error(`mk-response-letter-reference: ${rel} is missing — run this script without --check.`);
    process.exit(1);
  }
  if (!matches) {
    console.error(
      `mk-response-letter-reference: ${rel} does not match this script.\n` +
        '  Re-run `node scripts/mk-response-letter-reference.mjs` and commit the result.\n' +
        '  (A pandoc version change in the base reference.docx can also cause this.)'
    );
    const names = new Set([...current.map((e) => e.name), ...builtEntries.map((e) => e.name)]);
    for (const name of names) {
      const a = current.find((x) => x.name === name);
      const b = builtEntries.find((x) => x.name === name);
      if (!a) console.error(`  only in rebuild: ${name}`);
      else if (!b) console.error(`  only in committed: ${name}`);
      else if (!a.data.equals(b.data)) console.error(`  differs: ${name}`);
    }
    if (current.length !== builtEntries.length) {
      console.error(`  part count: committed ${current.length}, rebuilt ${builtEntries.length}`);
    }
    process.exit(1);
  }
  console.error(`mk-response-letter-reference: committed master matches (${builtEntries.length} parts)`);
} else if (matches) {
  console.error(`mk-response-letter-reference: ${rel} already up to date — left unchanged`);
} else {
  const buf = writeZip(builtEntries);
  fs.writeFileSync(OUT, buf);
  console.error(`mk-response-letter-reference: wrote ${rel} (${buf.length} bytes, ${builtEntries.length} parts)`);
}
