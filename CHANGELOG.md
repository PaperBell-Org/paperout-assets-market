# Changelog

Notable changes to the published assets and tooling. Versions are the release tags.

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
