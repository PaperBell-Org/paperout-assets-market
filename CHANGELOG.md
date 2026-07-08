# Changelog

Notable changes to the published assets and tooling. Versions are the release tags.

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
