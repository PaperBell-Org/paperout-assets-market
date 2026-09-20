# Changelog

Notable changes to the published assets and tooling. Versions are the release tags.

## Unreleased

New recipe **`nature-latex`** (Nature-LaTeX): a manuscript exports to a Springer Nature
LaTeX *submission package* — a zip holding `main.tex` on the official `sn-jnl` class, a
`references.bib` containing only the entries the manuscript actually cites, each figure as
its own file, the class, and the `.bst` for the selected reference style. It closes the
gap left by the existing routes, which produce a PDF or a Word file and throw the LaTeX
source away.

- **Pure assets, no plugin change.** The whole package is produced by a single Pandoc
  invocation. Pandoc 3's custom writers can return binary output (`ByteStringWriter`) and
  `pandoc.zip` builds the archive — the same module `filters/xlsx_table.lua` already uses.
  Entries are written with a fixed 1980-01-01 timestamp, so the zip is byte-reproducible
  and can carry a golden fingerprint.

- **New `writers/` asset directory**, and `writers/latex-submission.lua` (1.0.0) in it — a
  custom **writer**, not a filter. It goes in the defaults' `to:` key and must never appear
  in `filters:`; the file header says so at length, because putting it in `filters:` fails
  silently. `index.json` gives it `type: "writer"`, and `build-index`, `pack-bundle`,
  `parse-defaults`, `scan-security` and the CI luacheck step all learned the directory —
  a writer executes on the user's machine exactly like a filter, and `includeAll` would
  otherwise have dropped it from the `full` bundle without a word.

- **Every manuscript route now reads one frontmatter schema**, written down in
  `catalog/manuscript-frontmatter.md`. `nature-latex` was added reading Springer Nature's
  `fnm:`/`sur:` and `orgdiv:`/`orgname:` fields, which `filters/manuscript-docx.lua`
  (→ 1.2.0) did not know: the same note produced a full author block in the LaTeX zip and
  a **missing** one in Word, with a bare affiliation number left behind — a half-broken
  export nothing would have caught. The Word filter now reads both spellings (`name:`
  wins) and joins a structured affiliation into one comma-separated line in a fixed field
  order. `manuscript-obsidian`'s sample gained a structured author and a structured
  affiliation so a route that drops one spelling can no longer pass CI; its golden moves
  for that reason.

- **Only the cited references.** `pandoc.utils.references()` already returns exactly the
  cited plus `nocite` entries, so no key filtering is needed. The bibliography is written
  through Pandoc's **biblatex** writer and then has `date = {2021-05-14}` rewritten to
  `year = {2021}`: the BibTeX writer would have been the obvious choice but it drops `doi`,
  and `sn-nature.bst` uses it. Citation keys that resolve to nothing are reported on
  stderr — in a BibTeX chain a bad key does not render as `[?]`, it silently vanishes.

- **New `filters/crossref-latex.lua`** (1.0.0), and cross-references stay live because of
  it. `pandoc-crossref` decides how to behave from the target format Pandoc passes it as
  `argv[1]`, which for a custom writer is the writer's *path* — so it never recognises
  LaTeX and degrades: it bakes `Figure 1: ` into captions (which `\caption` then repeats),
  freezes `[@fig:x]` into the literal text `Figure 1`, and fakes equation numbers with
  `\qquad{(1)}` while putting `\label` outside the equation, where `\ref` picks up the
  wrong counter. No metadata key overrides this (`-M format`, `crossrefFormat` and
  `outputFormat` were all tested). The shim runs crossref through
  `pandoc.utils.run_json_filter(doc, 'pandoc-crossref', {'latex'})`, pinning that argument,
  and crossref then emits correct `\caption{}`, `\ref{}` and `equation` environments
  natively. Use it in place of the bare `pandoc-crossref` token on any chain whose `to:`
  is a Lua writer.

- **`scripts/build-index.mjs` learns an explicit `systemDeps` in `recipe.yaml`.** System
  dependencies are normally derived from a bare filter token, which is what tells the
  plugin to prompt for the `pandoc-crossref` install. Invoking it through the shim removes
  that token, so the prompt would have silently disappeared; the recipe now declares the
  dependency and the two sets are merged. Unknown names fail the build rather than
  producing a prompt for a binary that does not exist.

- **New `templates/nature-latex.latex`** (1.0.0), derived from Pandoc's default LaTeX
  template with all six partials **inlined**. Inlining is not tidiness: partials resolve
  against the data-dir's `templates/` first, and this repo already ships a
  `templates/fonts.latex` that predates Pandoc splitting out `font-settings.latex` — left
  as partial calls, the font setup would be loaded twice. Six changes from the default, each
  annotated in place; the important ones are that `natbib` and `\bibliographystyle` are
  removed (`sn-jnl.cls` loads and sets them itself, so a second load is an option clash)
  and the title block is replaced with SN's `\author*`/`\affil*`/`\abstract`/`\keywords`.

- **Vendored `templates/nature/`** — `sn-jnl.cls` plus all nine `.bst` files, LPPL 1.3c,
  redistributed unmodified (see NOTICE). `.gitattributes` marks them `-text`: upstream ships
  CR-only line endings and non-UTF-8 bytes, and normalizing them corrupts the class. Each
  export packs only the class and the one `.bst` in use. The option-to-style mapping is a
  lookup table, not string concatenation — `sn-apa` asks for `sn-apacite`, and `sn-aps` asks
  for `sn-APS` while the shipped file is `sn-aps.bst`, so the export writes it into the zip
  under the name the class asks for.

- **`scripts/lib/parse-defaults.mjs`** now derives a requirement from `to:` when it looks
  like a path. Without it the writer named in `to:` is in no recipe's `requires`, so
  `pack-bundle` leaves it out of the bundle and the plugin never installs it — the recipe
  would arrive broken with every other dependency resolved. A bare `to: docx` is still just
  a format name.

- **`scripts/build-recipe.mjs`** gains a zip branch. It used to route anything that was not
  `docx` through a fresh `-t latex` run, which for this recipe bypasses the writer entirely
  and would have left the zip layout, figure packaging, bibliography extraction and `.bst`
  selection completely untested. The new branch runs the real export and fingerprints the
  sorted entry list plus a hash of each entry's content — entry content, not zip bytes, for
  the reason `scripts/lib/docx.mjs` already documents about deflate.

## 1.0.9 — 2026-09-08

The Word response letter (`response-letter-docx`) now tells the reviewer's words, the
authors' reply and the revised manuscript apart, and pulls manuscript quotes live from
the manuscript. Closes #19 and #21.

- **New `templates/response-letter-reference.docx`** (1.0.0), generated by
  `scripts/mk-response-letter-reference.mjs` on the same convention as the manuscript
  master (`--check` wired into CI, compared by zip entry content). Its look is derived
  from the PDF route's `templates/responseletter.sty`, which is the house style people
  already read: Times New Roman 11 pt single-spaced body, `1F3A5F` on headings and
  labels only, and the three roles separated by **type style, label and box rather
  than colour** — italic `Reviewer Comment` with a hanging `RC:` label, upright
  `Author Response` with an `AR:` label, and a `Manuscript Quote` shaded `FCFCFD` and
  framed `8A949E` under a filled title bar. That survives greyscale printing and
  journal systems that strip colour. Continuation styles keep unlabelled paragraphs
  aligned; `RC Label`, `AR Label` and `Manuscript Locator` are character styles, so
  the filter never sets a font or a colour.

- **`filters/responseletter-docx.lua` → 1.1.0.** It used to emit `pandoc.BlockQuote`
  for a reviewer comment *and* for a manuscript quote, so both landed as `BlockText` —
  in Word, the same indented block, with nothing to tell the two apart. Every block now
  names a style from the master. The manuscript box gets the PDF's locator bar
  (`Manuscript · Page 5, Line 158–160`, `· Figure 2`, or a named page), built from the
  same `page` / `sline` / `eline` / `fig` / `src` keys the PDF uses, and it also
  handles the `Div{.manuscript}` that `manuscript_include.lua` produces.

- **The letter now has a letterhead**, emitted from metadata the way `\makeletterhead`
  does: kicker (derived from `type`, or `lettertitle`), paper title, authors, journal
  with the accent head rule as its bottom border, and the RC/AR/manuscript legend.
  `title`, `abstract` and `date` are cleared afterwards — with no letterhead and
  `standalone: true`, pandoc's stock template was printing the *manuscript's* abstract
  at the top of the response letter.

- **` ```manuscript ` blocks resolve.** `defaults/response-letter-docx.yaml` gains
  `manuscript_include.lua` (first, as the PDF chain documents) and
  `manuscript_cite.lua`. A fence containing `@model-spec` used to print the literal string
  `@model-spec`; it now pulls the current text out of the manuscript scene, with its
  citations resolved into the letter's own bibliography. `reference-section-title` adds
  the `References` heading the route was missing — which in turn pins the filter order:
  `citeproc` has to run *after* the letter filter, because the header it inserts for
  that title would otherwise read as "the author wrote their own section headings" and
  suppress every derived `Reviewer #N` heading. Caught by rendering the sample, not by
  the golden, and now written down next to the chain.

  `xlsx_table.lua` is deliberately **not** added: it only builds LaTeX `RawBlock`s,
  which the docx writer drops, so adding it would delete ` ```xlsx-table ` tables
  instead of rendering them. Tracked in #22.

- **A real sample and golden.** The old sample was a reviewer comment and a response
  and nothing else — which is why the collapsed styling went unnoticed. The new one
  carries both roles, a manuscript quote pulled by id from a sibling `source/` scene, a
  hand-written quote with a page/line locator, a citation shared between response and
  manuscript text, a Chinese translation, a `%%` draft note and a
  `{difficulty=… status=…}` marker, so the golden covers both what is rendered and what
  is stripped.

- **Figures, tables and lists inside a callout are no longer dropped.** Both callout
  branches only kept `Para` blocks, and pandoc turns an image that stands alone in a
  paragraph into a `Figure` — so a figure inside a `> [!response]` vanished from the
  Word file without a warning. Non-paragraph blocks now pass through in document
  order; draft-only aids are still stripped. Found by adding the letter-local figure
  the spec asked for to the sample, which now covers it.

- The recipe README documents the whole style sheet, how to write each callout, how to
  quote the manuscript by id, and the three known gaps (xlsx tables, `R1`/`R2` figure
  numbering, draft mode being PDF-only). Its `RC Label` / `AR Label` character styles
  deliberately carry no font size: the same styles label 11 pt body paragraphs and the
  9 pt legend line, so they have to inherit the size of the line they sit on.

- **`filters/manuscript_include.lua` → 1.0.1.** Its figure-renumbering step emits
  `RawBlock('latex', …)`, which the docx writer drops silently. Now that the filter is
  on a Word chain too, that path is guarded by `FORMAT:match('latex')` so it is
  visibly LaTeX-only rather than a no-op someone might assume works. Pulled-in figures
  still render in Word; they just do not carry the manuscript's own numbering (#22).

- Versions: `templates/response-letter-reference.docx` 1.0.0 (new),
  `filters/responseletter-docx.lua` 1.1.0, `filters/manuscript_include.lua` 1.0.1,
  recipe and bundle `response-letter-docx` 1.1.0, bundle `response-letter` 1.0.2
  (it ships `manuscript_include.lua`), bundle `full` 1.0.4.

## 1.0.8 — 2026-09-08

Typography pass on the Word manuscript route, plus the recipe README now states what
the master actually applies rather than leaving it to be read out of the .docx.

- **`templates/manuscript-reference.docx` → 1.1.0.** Body text is now **justified**
  (`Normal` was left-aligned; `Body Text`, `First Paragraph`, `Compact`, the headings
  and `Abstract` inherit it). The **title is centred**. Figure and table captions drop
  from 11 pt to **10.5 pt**, half a point below the 12 pt body and the same size the
  master already uses for affiliations. The title block (`Author`, `Affiliation`,
  `Corresponding`, `Keywords`) stays left-aligned, and so does `Bibliography` — a
  justified reference list opens gaps around long DOIs. As always the file is
  regenerated by `scripts/mk-manuscript-reference.mjs`, so the reviewable change is
  the patch list in that script.

- **`filters/lineno-docx.lua` → 1.0.2.** Line numbers run **continuously across
  pages** (`w:restart="continuous"`) instead of restarting at 1 on every page, so a
  co-author's "line 137" points at one place in the whole file. The `w:start`
  attribute is now omitted rather than set: renderers disagree about it (LibreOffice
  treats it as an offset, so `w:start="1"` numbered the first line 2), and Word's own
  line-numbering dialog writes no attribute when numbering starts at 1. Verified in a
  render: page 1 ends at line 23, page 2 starts at 24.

- **`catalog/recipes/manuscript-obsidian/README.md`** gains a "What formatting you
  get" section: paper size, margins, body font and spacing, alignment, line-number
  behaviour, and a per-style table for the title block, headings, figures, tables and
  references. Since the filters only tag blocks with style names, that table *is* the
  layout.

- **Display name is now `Manuscript (DOCX)` / `手稿 (DOCX)`** (was `Manuscript
  (Word)`). The recipe **id stays `manuscript-obsidian`**, so existing installs,
  notes that name the preset in `_longform.template`, and the
  `manuscript-obsidian.zip` download URL are all unaffected.

- `scripts/build-index.mjs` skips Word/LibreOffice owner files (`~$foo.docx`), and
  `.gitignore` covers them. They appear beside a `.docx` that is open in an editor,
  and validation used to fail with "asset templates/~$nuscript-reference.docx has no
  description" on any machine where a maintainer had the master open.

- Versions: `templates/manuscript-reference.docx` 1.1.0, `filters/lineno-docx.lua`
  1.0.2, recipe `manuscript-obsidian` 1.2.0, bundles `manuscript-obsidian` 1.2.0 /
  `demo-obsidian` 1.0.2 (it ships `lineno-docx.lua`) / `full` 1.0.3.

## 1.0.7 — 2026-09-08

The Word manuscript route (`manuscript-obsidian`) was shipped at `tier: core` but was
really a copy of the `demo-obsidian` demo route: it borrowed the demo's Chinese-thesis
Word master, never used any of that master's named styles, and its build sample was
byte-identical to the demo's — so no golden ever exercised the one filter that made it
different. This release finishes it.

- **New `templates/manuscript-reference.docx`** (1.0.0) — an English-journal submission
  master: Times New Roman 12 pt, double-spaced, left-aligned, no first-line indent,
  1-inch margins, three-line tables, and named styles for the whole title block
  (`Title`, `Author`, `Affiliation`, `Corresponding`, `Abstract Title`, `Abstract`,
  `Keywords`). It is **generated**, not hand-saved: `scripts/mk-manuscript-reference.mjs`
  derives it from pandoc's own default reference doc plus a set of reviewable XML
  patches, and `--check` (wired into CI) asserts the committed file still holds what
  that source produces — comparing zip entry content rather than bytes, since deflate
  output is not stable across zlib builds. `templates/demo-reference.docx` is unchanged and
  `demo-obsidian` keeps using it.

- **`filters/manuscript-docx.lua` → 1.1.0.** Fixes a crash: the guard on
  `meta.abstract.t == "MetaBlocks"` is dead on pandoc 3.x (Lua receives a `Blocks` list
  with no `.t`), so any note with a block-scalar `abstract: |` died with
  `object has no __toinline metamethod`. Metadata is now dispatched on
  `pandoc.utils.type`. Every emitted block is wrapped in a `custom-style` div naming a
  style in the reference doc, instead of a bare `Header(1)` and `custom-style: Normal`
  — so layout is now entirely the master's job. Also joins multi-affiliation authors
  properly (`affiliation: [1, 2]` rendered as `12`), joins several corresponding
  authors onto one `* Correspondence:` line instead of repeating a starred line each,
  and no longer prints a `Correspondence:` line for a `corresponding:` value that is
  not an address. It also stopped dropping content for the looser frontmatter shapes
  people actually write: `authors: [Ada, Alan]` as plain strings used to render an
  author line of just `", "`, `affiliations: [Dept A, Dept B]` produced empty
  paragraphs, a scalar `keywords: water governance` came out as
  `Keywords: water;  ; governance`, and a note carrying only pandoc's standard
  `author:` lost its byline entirely (the key was cleared but never rendered).

- **`filters/cjk_format.lua` → 1.0.1.** Rule (e) ("space after Latin punctuation") had
  no CJK-context guard, so in all-Latin text it rewrote `song@gea.mpg.de` →
  `song@gea. mpg. de` and `doi:10.1038/x` → `doi: 10.1038/x`. Every English manuscript
  exported through the docx route shipped broken corresponding-author emails. The rule
  now applies only to strings that actually contain a Han character, and emails, URLs
  and DOIs are skipped outright. Mixed CJK/Latin typesetting is unchanged.

- **`defaults/manuscript-obsidian.yaml`** — points at the new master; adds `div.lua` and
  `block_ids.lua` (hidden divs, `%% … %%` drafting notes and trailing `^blockid`s used
  to print verbatim into the file you send a co-author); adds `lineno_default.lua` so
  line numbers are on by default and still switchable with `lineno: false`, matching the
  PDF route and the description the recipe already advertised; extends `from:` with
  `mark`, `tex_math_single_backslash` and `autolink_bare_uris` to match the PDF route;
  adds `reference-section-title: References` so the Word bibliography gets a heading
  like the PDF route's; and spells the cross-reference prefixes as lists
  (`[Figure, Figures]` / `[Table, Tables]`) so `[@fig:a; @fig:b]` renders "Figures 1, 2"
  instead of "Figure 1, 2". `figures-at-end` stays opt-in.

  Note on `crossrefYaml`: pandoc expands `${USERDATA}` only in path-typed keys
  (`template`, `reference-doc`, `filters`, `csl`), not in `metadata:` values, so
  `crossrefYaml: ${USERDATA}/defaults/crossref.yaml` never resolves and pandoc-crossref
  silently falls back to its built-ins — on this route and on the PDF routes alike. The
  prefixes above are what actually takes effect; equation references stay at
  pandoc-crossref's default `eq. 1`, matching the PDF route's current behaviour
  (`eqnPrefixTemplate` only does variable substitution when read from crossref's own
  YAML file, so it cannot be set through metadata). Tracked separately.

- **`filters/lineno-docx.lua` → 1.0.1.** The section it injects for line numbering is
  the document's *first* `sectPr`, so it governs the body and the reference doc's own
  `sectPr` only governs the empty trailing section — and OOXML section properties do
  not inherit backwards. It carried only `lnNumType`, so a line-numbered export threw
  away the master's paper size and margins and let Word re-page the manuscript by its
  local default (A4 plus Chinese-locale margins on a Chinese Word). That branch was
  nearly unreachable before, but this release turns line numbers on by default, which
  would have made it the normal case and quietly broken the "1-inch margins" this
  recipe promises. The injected section now carries `pgSz`/`pgMar`, taken from the new
  `docxPage` metadata in each docx route's defaults (values mirror that route's
  master), and line numbering starts at 1 rather than 0. `demo-obsidian` gets the same
  metadata, so `lineno: true` there keeps `demo-reference.docx`'s 3 cm margins.

- **`scripts/build-recipe.mjs`** — pass `--resource-path <sampleDir>`. Pandoc resolved
  sample images against the repo root, so a figure beside `sample/input.md` degraded to
  alt text with only a warning and exit 0; no recipe golden could cover figures. All
  nine existing goldens are byte-identical with the flag.

- **New `manuscript-obsidian` sample and golden.** Covers authors, multi-affiliation
  superscripts, corresponding email, block-scalar abstract, keywords, a citation (inline
  CSL-JSON, no bib file needed), two numbered figures with a real PNG and a plural
  cross-reference, a captioned table, an equation, `==highlight==`, and the email/DOI and
  Obsidian-syntax cases above. The
  golden moved deliberately; `demo-obsidian`'s did not.

- `package.json` gains `check:versions`; `validate.yml` gains the master `--check` step.

- **Releases now publish an unversioned alias for every bundle** (`full.zip` beside
  `full-1.0.2.zip`). The README has always told users to paste
  `…/releases/latest/download/full.zip` into the plugin, and that file never existed —
  the assets were only ever `<id>-<version>.zip`, so anyone who worked around it by
  pinning the versioned URL would have started getting 404s the moment a bundle version
  moved, which is exactly what this release does to `full`, `manuscript-obsidian` and
  `demo-obsidian`. `index.json` keeps pointing at the versioned name, which is what the
  `sha256` is pinned to.

## 1.0.6 — 2026-08-03

- Tooling: bump the CI toolchain to **pandoc 3.10.1 + pandoc-crossref 0.3.25** (was 3.8.2 /
  0.3.22b) so validation runs the pandoc version users actually run — 3.8.2 emits the older
  empty `\LTcaptype{}` for uncaptioned tables and could not reproduce the `No counter 'none'
  defined` class of bug fixed in 1.0.5. All recipe goldens were regenerated with the new pair
  and are byte-identical to the previous ones (no sample exercises the differing construct).
  **No published asset changed** — every asset/bundle keeps its version; this release tag is
  purely a publish snapshot.

## 1.0.5 — 2026-08-02

- Fix `! LaTeX Error: No counter 'none' defined.` when exporting a document whose **first
  table has no caption**. Pandoc ≥ 3.9 wraps uncaptioned tables in `\def\LTcaptype{none}`,
  which references a `none` counter that pandoc's *own* default template provides but our
  custom templates did not. Added `\newcounter{none}` next to the `longtable` load in every
  shipped template that loads it — `paperbell.latex`, `eisvogel.latex`, `scribe.tex`,
  `cover_letter.latex`, `cover_letter_template.latex`, `responseletter.sty` — each bumped to
  `1.0.1`, along with the bundles that carry them (`paperbell`, `paperbell-windows`, `pdf`,
  `cover_letter`, `response-letter`, `full`). Backward compatible: older pandoc emits
  `\LTcaptype{}` and never touches the counter. (Captioned tables never reproduced this,
  which is why it shipped unnoticed.)
- **Who this reaches:** the plugin only offers updates for assets it recorded in
  `installed.json`. Users who installed via the legacy "paste a zip URL" path or a vault
  sync have the files on disk but are **not** tracked, so they will not be offered this fix —
  they must (re)install from the marketplace once. For a correctness fix, that is most users.

## 1.0.4 — 2026-07-08

- Docs-only publish snapshot: added the bilingual (EN + ZH) contributor guide to the README.
  No asset content changed; all assets stayed at their own versions.

## 1.0.3 — 2026-07-08

- Per-asset independent versioning: every asset/recipe/bundle carries its **own** semver
  `version` (in `catalog/assets.yaml` and the manifests), decoupled from the release tag.
  Assets reset to their true `1.0.0` (content unchanged since 1.0.0); the release tag is
  now just a publish snapshot. Fixes all assets reporting the repo version. `check-versions`
  now asserts semver validity instead of matching the tag.

## 1.0.2 — 2026-07-08

- Add `cslStyles` to `index.json` — curated citation styles resolved on demand from the
  official [CSL project](https://github.com/citation-style-language/styles) (CC BY-SA
  3.0); `apa`/`nature`/`pnas` are also bundled offline. CSL content is no longer
  maintained in-repo beyond those offline defaults (`catalog/csl-styles.yaml`).

## 1.0.1 — 2026-07-08

- Document every asset: bilingual (EN + ZH) `title`/`description` for all 49 leaf assets
  (`catalog/assets.yaml`) and the recipes, injected into `index.json`; `validate` now
  fails if any asset is undocumented.

## 1.0.0 — 2026-07-08

Initial release.

### Assets
- 9 user-facing recipes: `paperbell`, `paperbell-windows`, `pdf`, `cover_letter`,
  `response-letter`, `response-letter-docx`, `demo-obsidian`, `manuscript-obsidian`,
  `beamer`.
- 32 Lua filters, 12 LaTeX/Word templates, 4 CSL styles, a shared `crossref` include,
  and `preamble.sty`.
- `full` bundle (legacy all-in-one) plus one bundle per recipe.

### Tooling
- `build-index` / `pack-bundle` / `validate` with a shared `lib/`; each recipe's
  `requires` closure is auto-derived from its `defaults/*.yaml`.
- Quality control: static security scan, PR-scope gate, and golden-fingerprint
  regression (`build-recipe`).
- CI: `validate` (PR smoke), `build-test` (nightly full render), `release` (tag).
- MIT license for the project's own assets; `NOTICE` preserves vendored licenses
  (Eisvogel BSD-3, CSL CC BY-SA 3.0, latex-div Public Domain, moderncv LPPL).
