# Changelog

Notable changes to the published assets and tooling. Versions are the release tags.

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
