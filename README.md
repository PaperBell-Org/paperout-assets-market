# paperout-assets-market

A public **asset market** of Obsidian → Pandoc document-export *recipes*: the Lua
filters, LaTeX / Word templates, CSL styles, and Pandoc `defaults` files that turn
a Longform / PaperBell manuscript into a typeset PDF or Word document.

- The **PaperBell / Longform Obsidian plugin** is the *consumer*: it downloads assets
  from this repo on demand and runs the export workflow.
- **Contributors** add their own recipes/filters/templates here via fork + pull request.
- A future **frontend** (separate repo) reads this repo to show, visually, what each
  recipe produces.

This repo is the **single source of truth** for published assets.

---

## What's in here

Two cleanly separated trees.

### 1. Consumption tree — what lands on a user's disk

```
defaults/    Pandoc defaults *.yaml (one per recipe + shared includes)
filters/     Lua filters (*.lua)
templates/   LaTeX / Word templates (*.tex, *.latex, *.sty, *.docx)
csl/         Citation styles (*.csl)
preamble.sty shared LaTeX preamble
```

These four dirs are byte-for-byte what a user gets in their vault under
`PaperBell/pandoc/`. Every `defaults/*.yaml` references its resources via
`${USERDATA}/...` and sets `data-dir: ${.}/..`, so the toolchain self-locates
wherever it is downloaded (see the invariants in [CONTRIBUTING.md](CONTRIBUTING.md)).

### 2. Catalog tree — metadata for humans & the frontend (never packaged)

```
catalog/
  assets.yaml             # bilingual title + description for every leaf asset
  csl-styles.yaml         # curated citation styles resolved from the official CSL repo
  recipes/<id>/
    recipe.yaml            # version, bilingual title/description
    README.md             # how to use this recipe
    preview.png           # what it produces (for the frontend)
    sample/
      input.md            # minimal note used to build-test the recipe
      expected.fingerprint# golden output fingerprint
  bundles/<id>/
    bundle.yaml           # which recipes/files a downloadable bundle contains
```

Every asset in `index.json` carries a bilingual `title` and `description` (from
`catalog/assets.yaml` for filters/templates/csl, or `recipe.yaml` for recipes), so the
plugin can show what each asset does when a user opens it.

### Citation styles (CSL)

CSL styles are **not maintained here** — `index.json` exposes a `cslStyles` list curated
in `catalog/csl-styles.yaml`, resolved on demand from the official
[Citation Style Language](https://github.com/citation-style-language/styles) project
(CC BY-SA 3.0). Each entry has an official `url`; a few high-use styles (`apa`, `nature`,
`pnas`) are also bundled offline (`offline: true`, with an `offlineUrl` + `sha256`) so
export works without a network. The plugin fetches a style to the user's disk for
`pandoc --csl`.

Keeping metadata out of the four asset dirs keeps the packaged zips clean and gives
the frontend one predictable tree to read.

---

## How users get assets

Nothing is downloaded by hand. Each git tag publishes a **GitHub Release** carrying
`index.json` plus one zip per bundle.

- **Whole toolchain (as today).** Paste the stable URL
  `…/releases/latest/download/full.zip` into the plugin's *Pandoc assets URL* and
  download. Files land under `PaperBell/pandoc/` with the `defaults/ filters/
  templates/ csl/` layout — identical to the current setup.
- **Per recipe (new).** The plugin fetches
  `…/releases/latest/download/index.json`, lists every recipe/bundle and its
  `version`, and installs a chosen recipe by resolving its `requires` dependency
  closure (each file fetched from a `raw.githubusercontent.com/…/<tag>/…` URL, or the
  recipe's bundle zip). `sha256` verification and `semver` update-detection reuse the
  plugin's existing downloader.

> The per-recipe install logic is implemented on the plugin side; this repo's job is
> to publish a well-formed `index.json` and the bundle zips.

## Where users read the docs

Every recipe's docs live in `catalog/recipes/<id>/README.md` (+ `preview.png`), read
from three places: this GitHub repo directly, the future frontend gallery, and inside
the plugin (which shows `title`/`description` and links back to the README).

---

## Contributing

See **[CONTRIBUTING.md](CONTRIBUTING.md)** for the fork + PR flow, the normalization
invariants your `defaults/*.yaml` must obey, and the **quality-control contract**
(every recipe ships a build-tested sample + golden fingerprint; dangerous Lua/LaTeX
APIs are blocked; core assets are protected from accidental changes).

Assets carry a trust tier: **core** (officially maintained) or **community**
(contributed, CI-checked, but the plugin flags them as unverified since their Lua runs
on your machine).

## License

This repository's own recipes, filters, templates, scripts, and docs are **MIT**
(see [LICENSE](LICENSE)) — free to download, use, modify, and redistribute, including
by closed-source software (such as the PaperBell plugin) that consumes these assets.

Some vendored files keep their upstream licenses — Eisvogel (BSD-3-Clause), the CSL
citation styles (CC BY-SA 3.0), the R Markdown `latex-div` filter (Public Domain),
moderncv (LPPL). See [NOTICE](NOTICE); those terms are preserved in the published
bundles too.

## Repository layout for maintainers

```
scripts/            build-index / pack-bundle / validate / scan-security /
                    check-pr-scope / build-recipe (+ shared lib/)
.github/workflows/  validate (PR) · build-test (PR+nightly) · release (tag)
.github/CODEOWNERS  protects core assets
```
