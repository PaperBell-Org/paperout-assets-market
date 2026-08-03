# Changelog

Notable changes to the published assets and tooling. Versions are the release tags.

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
