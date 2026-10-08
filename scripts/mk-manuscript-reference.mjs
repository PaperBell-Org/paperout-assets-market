#!/usr/bin/env node
// Generate `templates/manuscript-reference.docx` — the Word style master for the
// `manuscript-obsidian` recipe — deterministically from pandoc's default
// reference.docx, vendored at scripts/reference-base/ (see BASE_REFERENCE_DOCX in
// scripts/lib/docx.mjs). No pandoc is needed to run this script or its --check.
//
//   node scripts/mk-manuscript-reference.mjs            # write the file
//   node scripts/mk-manuscript-reference.mjs --check    # assert the committed file matches
//   node scripts/mk-manuscript-reference.mjs --help
//
// Why derive instead of committing a hand-saved Word file: a .docx is an opaque
// binary in review. Here the only reviewable artifact is the XML below, and --check
// (run in CI) proves the committed file still holds exactly what this source produces.
// The CLI, the content comparison and the shared styles.xml steps (docDefaults, theme
// fonts, themed heading colour) live in scripts/lib/docx.mjs.
//
// Base choice: pandoc's default master already defines every style name the docx
// filters address (Title, Author, Abstract, Abstract Title, Image Caption, Table
// Caption, Bibliography, Body Text, First Paragraph, Compact, Figure, Table) on a
// clean English baseline. `templates/demo-reference.docx` is a Chinese-thesis layout
// with Word-generated style ids and is the wrong starting point for a journal
// submission.
//
// Target: Times New Roman 12 pt, double-spaced, justified body, centred title, no
// first-line indent, 1-inch margins, captions half a point below body size — what an
// English-language journal expects of a submitted manuscript, and what leaves a
// co-author room to write in the margin. The exact list the master applies is
// documented in catalog/recipes/manuscript-obsidian/README.md; keep the two in sync.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMaster, runMasterGenerator } from './lib/docx.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
export const OUT = path.join(ROOT, 'templates', 'manuscript-reference.docx');

const TNR = 'Times New Roman';
const DOUBLE = '<w:spacing w:after="0" w:line="480" w:lineRule="auto"/>';
const SINGLE = '<w:spacing w:after="0" w:line="240" w:lineRule="auto"/>';

// ---------------------------------------------------------------- styles.xml ----

// Paragraph styles we redefine outright, keyed by styleId. Everything not listed
// inherits from Normal and therefore picks up the body settings for free.
const STYLES = {
  Normal: `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/>` +
    `<w:pPr>${DOUBLE}<w:jc w:val="both"/></w:pPr>` +
    `<w:rPr><w:rFonts w:ascii="${TNR}" w:hAnsi="${TNR}" w:eastAsia="${TNR}" w:cs="${TNR}"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style>`,

  // Pandoc's body style adds 9 pt of space above and below every paragraph. With
  // double spacing that reads as ragged gaps, so zero it out.
  BodyText: `<w:style w:type="paragraph" w:styleId="BodyText"><w:name w:val="Body Text"/><w:basedOn w:val="Normal"/>` +
    `<w:link w:val="BodyTextChar"/><w:qFormat/><w:pPr><w:spacing w:before="0" w:after="0" w:line="480" w:lineRule="auto"/></w:pPr></w:style>`,

  // Lists stay single-spaced and tight — double-spaced bullets waste a page each.
  Compact: `<w:style w:type="paragraph" w:customStyle="1" w:styleId="Compact"><w:name w:val="Compact"/><w:basedOn w:val="BodyText"/>` +
    `<w:qFormat/><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/><w:contextualSpacing/></w:pPr></w:style>`,

  Title: `<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/>` +
    `<w:next w:val="Author"/><w:link w:val="TitleChar"/><w:uiPriority w:val="10"/><w:qFormat/>` +
    `<w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="0" w:after="240" w:line="240" w:lineRule="auto"/><w:contextualSpacing/><w:jc w:val="center"/></w:pPr>` +
    `<w:rPr><w:b/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:style>`,

  Author: `<w:style w:type="paragraph" w:customStyle="1" w:styleId="Author"><w:name w:val="Author"/><w:basedOn w:val="Normal"/>` +
    `<w:next w:val="Affiliation"/><w:qFormat/>` +
    `<w:pPr><w:keepNext/><w:keepLines/>${SINGLE}<w:jc w:val="left"/></w:pPr>` +
    `<w:rPr><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style>`,

  // New: neither pandoc's master nor demo-reference.docx has a style for the
  // numbered affiliation list, so it used to fall back to body text.
  Affiliation: `<w:style w:type="paragraph" w:customStyle="1" w:styleId="Affiliation"><w:name w:val="Affiliation"/>` +
    `<w:basedOn w:val="Normal"/><w:next w:val="Affiliation"/><w:qFormat/>` +
    `<w:pPr><w:keepLines/>${SINGLE}<w:jc w:val="left"/></w:pPr>` +
    `<w:rPr><w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr></w:style>`,

  Corresponding: `<w:style w:type="paragraph" w:customStyle="1" w:styleId="Corresponding"><w:name w:val="Corresponding"/>` +
    `<w:basedOn w:val="Affiliation"/><w:next w:val="AbstractTitle"/><w:qFormat/>` +
    `<w:pPr><w:spacing w:before="120" w:after="240" w:line="240" w:lineRule="auto"/></w:pPr></w:style>`,

  AbstractTitle: `<w:style w:type="paragraph" w:customStyle="1" w:styleId="AbstractTitle"><w:name w:val="Abstract Title"/>` +
    `<w:basedOn w:val="Normal"/><w:next w:val="Abstract"/><w:qFormat/>` +
    `<w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="240" w:after="0" w:line="240" w:lineRule="auto"/><w:jc w:val="left"/></w:pPr>` +
    `<w:rPr><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style>`,

  Abstract: `<w:style w:type="paragraph" w:customStyle="1" w:styleId="Abstract"><w:name w:val="Abstract"/>` +
    `<w:basedOn w:val="Normal"/><w:next w:val="Keywords"/><w:qFormat/>` +
    `<w:pPr><w:spacing w:before="0" w:after="240" w:line="480" w:lineRule="auto"/></w:pPr></w:style>`,

  Keywords: `<w:style w:type="paragraph" w:customStyle="1" w:styleId="Keywords"><w:name w:val="Keywords"/>` +
    `<w:basedOn w:val="Normal"/><w:next w:val="BodyText"/><w:qFormat/>` +
    `<w:pPr><w:spacing w:before="0" w:after="240" w:line="240" w:lineRule="auto"/><w:jc w:val="left"/></w:pPr></w:style>`,

  // Pandoc's headings are 20/16/14 pt in a themed accent blue. A manuscript wants
  // black Times at modest sizes, distinguished by weight rather than colour.
  Heading1: heading(1, 'Heading1Char', 28, '<w:b/>'),
  Heading2: heading(2, 'Heading2Char', 26, '<w:b/>'),
  Heading3: heading(3, 'Heading3Char', 24, '<w:b/><w:i/>'),

  ImageCaption: `<w:style w:type="paragraph" w:customStyle="1" w:styleId="ImageCaption"><w:name w:val="Image Caption"/>` +
    `<w:basedOn w:val="Caption"/>` +
    `<w:pPr><w:spacing w:before="120" w:after="240" w:line="240" w:lineRule="auto"/><w:jc w:val="left"/></w:pPr>` +
    `<w:rPr><w:i w:val="0"/><w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr></w:style>`,

  // Bold + keepNext so a table caption reads as a caption and stays with its table;
  // that contrast is what tells figure captions and table captions apart on the page.
  TableCaption: `<w:style w:type="paragraph" w:customStyle="1" w:styleId="TableCaption"><w:name w:val="Table Caption"/>` +
    `<w:basedOn w:val="Caption"/>` +
    `<w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120" w:line="240" w:lineRule="auto"/><w:jc w:val="left"/></w:pPr>` +
    `<w:rPr><w:i w:val="0"/><w:b/><w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr></w:style>`,

  // Notes under a table (xlsx_table.lua's `notes:` field): small, single-spaced and
  // tight to the table above, with the usual paragraph gap before the text resumes.
  TableNote: `<w:style w:type="paragraph" w:customStyle="1" w:styleId="TableNote"><w:name w:val="Table Note"/>` +
    `<w:basedOn w:val="Normal"/><w:next w:val="BodyText"/><w:qFormat/>` +
    `<w:pPr><w:spacing w:before="60" w:after="240" w:line="240" w:lineRule="auto"/><w:jc w:val="left"/></w:pPr>` +
    `<w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:style>`,

  Figure: `<w:style w:type="paragraph" w:customStyle="1" w:styleId="Figure"><w:name w:val="Figure"/>` +
    `<w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="240" w:after="0" w:line="240" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr></w:style>`,

  Bibliography: `<w:style w:type="paragraph" w:styleId="Bibliography"><w:name w:val="Bibliography"/><w:basedOn w:val="Normal"/>` +
    `<w:next w:val="Bibliography"/><w:qFormat/>` +
    `<w:pPr>${DOUBLE}<w:ind w:left="720" w:hanging="720"/><w:jc w:val="left"/></w:pPr></w:style>`,

  // Three-line (booktabs) table: rule above the header, under the header, and at the
  // foot — the convention in most journals, and what the PDF chain already produces.
  Table: `<w:style w:type="table" w:default="1" w:styleId="Table"><w:name w:val="Table"/><w:basedOn w:val="TableNormal"/>` +
    `<w:semiHidden/><w:unhideWhenUsed/><w:qFormat/>` +
    `<w:tblPr><w:tblInd w:w="0" w:type="dxa"/>` +
    `<w:tblBorders><w:top w:val="single" w:sz="12" w:space="0" w:color="000000"/><w:bottom w:val="single" w:sz="12" w:space="0" w:color="000000"/></w:tblBorders>` +
    `<w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr>` +
    `<w:tblStylePr w:type="firstRow"><w:tcPr><w:tcBorders><w:bottom w:val="single" w:sz="8" w:space="0" w:color="000000"/></w:tcBorders><w:vAlign w:val="bottom"/></w:tcPr></w:tblStylePr></w:style>`,
};

function heading(level, charStyle, sz, emphasis) {
  return `<w:style w:type="paragraph" w:styleId="Heading${level}"><w:name w:val="heading ${level}"/>` +
    `<w:basedOn w:val="Normal"/><w:next w:val="BodyText"/><w:link w:val="${charStyle}"/>` +
    `<w:uiPriority w:val="9"/><w:qFormat/>` +
    `<w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="240" w:after="120" w:line="480" w:lineRule="auto"/>` +
    `<w:jc w:val="left"/><w:outlineLvl w:val="${level - 1}"/></w:pPr>` +
    `<w:rPr>${emphasis}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr></w:style>`;
}

// New style ids that do not exist in the base master and must be inserted.
const ADDED = ['Affiliation', 'Corresponding', 'Keywords', 'TableNote'];

// patchStylesXml (scripts/lib/docx.mjs) also pins every theme-font attribute to Times
// and drops pandoc's themed heading colour (0F4761) from the headings and their linked
// character styles. Styles this script does not rewrite keep pandoc's colours —
// Hyperlink (4F81BD), TOC Heading (365F91) and the dark greys of Heading 6–9, their
// character styles and Subtitle Char (595959, 272727); body text, captions and
// Heading 1–5 are black.
// test/docx.test.mjs pins that list, so a new colour cannot slip in unnoticed.
const DOC_DEFAULTS =
  '<w:docDefaults><w:rPrDefault><w:rPr>' +
  `<w:rFonts w:ascii="${TNR}" w:hAnsi="${TNR}" w:eastAsia="${TNR}" w:cs="${TNR}"/>` +
  '<w:sz w:val="24"/><w:szCs w:val="24"/>' +
  '<w:lang w:val="en-US" w:eastAsia="en-US" w:bidi="ar-SA"/>' +
  '</w:rPr></w:rPrDefault><w:pPrDefault><w:pPr>' + DOUBLE + '</w:pPr></w:pPrDefault></w:docDefaults>';

// ------------------------------------------------------------- document.xml ----

// US Letter with 1-inch margins. Pandoc's master ships a sectPr with no page size or
// margins at all, so Word falls back to its own locale defaults — which is how the
// same file ends up A4 on one machine and Letter on another.
const SECT_PR =
  '<w:sectPr><w:footnotePr><w:numRestart w:val="eachSect"/></w:footnotePr>' +
  '<w:pgSz w:w="12240" w:h="15840"/>' +
  '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>' +
  '</w:sectPr>';

// ------------------------------------------------------------------- main ----

export function build() {
  return buildMaster({ docDefaults: DOC_DEFAULTS, font: TNR, styles: STYLES, added: ADDED, sectPr: SECT_PR });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runMasterGenerator({ name: 'mk-manuscript-reference', out: OUT, build });
}
