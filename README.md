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

## Contributor guide / 贡献者指引

Add a recipe, filter, template, or citation style via fork + pull request. Full rules
are in **[CONTRIBUTING.md](CONTRIBUTING.md)**; this is the hands-on walkthrough.

通过 fork + PR 贡献配方、过滤器、模板或引用样式。完整规则见
**[CONTRIBUTING.md](CONTRIBUTING.md)**;下面是手把手流程。

### English

**1. Set up**

```bash
# fork on GitHub, then:
git clone https://github.com/<you>/paperout-assets-market
cd paperout-assets-market
npm ci
```

**2. Pick what to add** (easiest → most involved)

- **A citation style** — add an id under `styles:` in `catalog/csl-styles.yaml` with a
  bilingual title. Any id that exists at the root of the
  [official CSL repo](https://github.com/citation-style-language/styles) works
  (e.g. `nature-genetics`). No file to vendor.
- **A filter / template** — drop the file in `filters/<name>.lua` or
  `templates/<name>.tex`, then add an entry in `catalog/assets.yaml` with a `version`
  (start at `1.0.0`) and a bilingual `title` + `description`.
- **A full recipe** (a complete export preset) — add `defaults/<id>.yaml` (obeying the
  invariants below) plus `catalog/recipes/<id>/` with `recipe.yaml` (bilingual
  title/description + `version`), `README.md`, `preview.png` (a placeholder is fine),
  and `sample/input.md` (a minimal note that exercises it). Then generate its golden.

**3. Validate locally**

```bash
npm run validate         # invariants + every asset documented + index builds
npm run scan:security    # blocks dangerous Lua/LaTeX APIs
npm test                 # unit tests
# only if you added a recipe (needs pandoc + pandoc-crossref):
npm run build:recipe -- <id> --update-golden   # builds the sample, writes the golden fingerprint
```

**4. Open the PR.** CI runs the same checks plus a build-test. Adding new files is fine;
modifying an existing **core** file needs a maintainer's `core-change` label.

**Quality rules (CI enforces these)**

- No dangerous APIs (`os.execute`, `io.popen`, `\write18`, …) without maintainer review.
- Every asset needs a bilingual `title` + `description` — CI fails otherwise.
- `defaults/*.yaml`: reference resources only via `${USERDATA}/…` (or `${.}/../…`), set
  `data-dir: ${.}/..`, and keep `bibliography:` / `csl:` commented out.
- Bump only the **changed** asset's own `version`.
- Never commit personal identity assets (logos/signatures) — ship a placeholder.

Assets carry a trust tier: **core** (officially maintained) or **community**
(contributed; CI-checked, but the plugin flags it as unverified since its Lua runs on
the user's machine).

### 中文

**1. 准备环境**

```bash
# 先在 GitHub 上 fork,然后:
git clone https://github.com/<你>/paperout-assets-market
cd paperout-assets-market
npm ci
```

**2. 选择要贡献的类型**(从易到难)

- **引用样式(CSL)** —— 在 `catalog/csl-styles.yaml` 的 `styles:` 下加一个 id 和双语标题。
  只要该 id 存在于[官方 CSL 库](https://github.com/citation-style-language/styles)根目录
  即可(如 `nature-genetics`),无需上传文件。
- **过滤器 / 模板** —— 把文件放进 `filters/<名字>.lua` 或 `templates/<名字>.tex`,然后在
  `catalog/assets.yaml` 加一条:`version`(从 `1.0.0` 起)+ 双语 `title` + `description`。
- **完整配方**(一套导出预设) —— 加 `defaults/<id>.yaml`(遵守下面的不变量)+
  `catalog/recipes/<id>/`,内含 `recipe.yaml`(双语标题/说明 + `version`)、`README.md`、
  `preview.png`(占位图即可)、`sample/input.md`(一份能跑通该配方的最小笔记),然后生成 golden。

**3. 本地自检**

```bash
npm run validate         # 不变量 + 每个资产都有说明 + index 能构建
npm run scan:security    # 拦截危险的 Lua/LaTeX API
npm test                 # 单元测试
# 仅当你加了配方(需要 pandoc + pandoc-crossref):
npm run build:recipe -- <id> --update-golden   # 构建 sample,写入 golden 指纹
```

**4. 开 PR。** CI 会跑同样的检查外加构建测试。**新增**文件没问题;**修改**已有的 core
文件需要维护者打 `core-change` 标签。

**质量红线(CI 强制)**

- 未经维护者审查,不得使用危险 API(`os.execute`、`io.popen`、`\write18` 等)。
- 每个资产必须有双语 `title` + `description`,否则 CI 失败。
- `defaults/*.yaml`:资源引用只能用 `${USERDATA}/…`(或 `${.}/../…`),设 `data-dir: ${.}/..`,
  且 `bibliography:` / `csl:` 保持注释掉。
- 只 bump **发生变化的**那个资产自己的 `version`。
- 绝不提交个人身份资产(logo/签名)—— 用占位图代替。

资产带信任分级:**core**(官方维护)或 **community**(社区贡献;经 CI 检查,但插件会提示未审核,
因为其 Lua 会在用户本机运行)。

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
