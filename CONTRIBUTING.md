# Contributing to paperout-assets-market

Thank you for sharing a recipe, filter, template, or citation style! This repo is the
source of truth for assets the PaperBell / Longform plugin downloads and runs on real
users' machines — so contributions go through a light but strict quality gate. Read
this before opening a PR.

## The flow

1. **Fork** this repo and create a branch.
2. **Add your files** (see [What can I contribute](#what-can-i-contribute)).
3. **Run the checks locally**: `npm ci && npm run validate && npm test`.
4. **Open a PR.** CI runs the same checks plus a security scan and (for recipes) a real
   Pandoc build of your sample. A maintainer reviews and merges.
5. Merged assets are published on the next tagged **release**.

## What can I contribute

| You want to add… | Put the file in… | Also required |
| --- | --- | --- |
| A Lua filter | `filters/<name>.lua` | must pass the security scan (below) |
| A LaTeX/Word template | `templates/<name>.{tex,latex,sty,docx}` | register `.sty`/`.tex` siblings as the recipe's `extraFiles` |
| A citation style | `csl/<name>.csl` | — |
| A **complete recipe** (a full export preset) | `defaults/<id>.yaml` **and** `catalog/recipes/<id>/…` | sample + golden (below) |

A filter/template/csl only becomes downloadable once a **recipe** references it. Adding
a recipe is what makes assets shippable.

## Normalization invariants (enforced by CI)

Your `defaults/*.yaml` **must**:

1. Reference every resource via `${USERDATA}/filters|templates|defaults/...` and set
   `data-dir: ${.}/..`. **No machine-absolute paths** (`/Users/…`, `C:\…`,
   `.config/pandoc`, …) — they break on every other machine.
2. Keep `bibliography:` and `csl:` **commented out** — the plugin injects
   `--bibliography` / `--csl` at run time; an active one here conflicts.
3. Not declare template `.sty`/`.tex` siblings in the yaml — they are found via
   `TEXINPUTS`. Instead list them as the recipe's `extraFiles` so they get packaged.
4. Never commit **personal identity assets** (logos, signatures). Ship a placeholder
   plus a README explaining replacement — see `templates/cover_letter/`.

`requires` is **auto-derived** from your yaml (`template:`, `filters:`, `crossrefYaml`,
any uncommented `csl:`). Never hand-write it. Bare filter tokens `citeproc` and
`pandoc-crossref` are recorded as `systemDeps` (prompt-only, not downloaded).

## Quality-control contract

Because a filter's Lua and a template's LaTeX execute on the user's computer, every
contribution must clear these gates:

### 1. Every recipe ships a build-tested sample + golden
Add `catalog/recipes/<id>/sample/input.md` — a minimal note that exercises the recipe —
and an `expected.fingerprint`. CI builds the sample with real Pandoc; **a recipe that
can't build is not merged.** The fingerprint is a golden: if a change to a *shared*
filter/template alters any downstream recipe's output, CI turns red and you must update
the golden deliberately (and explain why in the PR). This is how we stop one edit from
silently changing everyone else's output.

Generate/refresh a fingerprint with `npm run build:recipe -- <id> --update-golden`.

### 2. No dangerous APIs
The security scan (`npm run scan:security`) blocks, in Lua:
`os.execute`, `io.popen`, `os.remove`, `os.rename`, `loadstring`/`load` of external
input, and external `require`; and in LaTeX: `\write18`, `--shell-escape`, and
absolute-path `\input`. If your asset genuinely needs one, a maintainer must review it
and add an explicit, commented allowlist entry — it will not pass silently.

### 3. Unique ids
Filter/template/csl/recipe ids are globally unique. A new file must not shadow an
existing one; to change an existing shared asset, see below.

### 4. You add; you don't overwrite
External contributions may **only add** files by default. Modifying or deleting an
existing **core** asset is scope-gated: CI (`check:pr-scope`) flags it, and it needs a
`core-change` label + maintainer approval. This protects existing recipes.

## Trust tiers

- **core** — officially maintained, fully tested. Default-trusted by the plugin.
- **community** — your contribution: CI-checked and reviewed, but the plugin shows users
  a note that it's community-provided and its Lua runs on their machine. `provenance`
  (author, PR, reviewer) is recorded in `index.json`.

## Versioning

Bump the `version` (semver) in your `recipe.yaml` / `bundle.yaml` when behavior changes
— the plugin uses it for update detection. Leaf files (filters/templates/csl) are
versioned automatically from the git tag that last modified them.

## Per-recipe README template

Copy this into `catalog/recipes/<id>/README.md`:

```markdown
# <Recipe title>

**Produces:** <PDF / DOCX / …>  ·  <one-line what it looks like>

![preview](preview.png)

## When to use
<the writing scenario this preset targets>

## Requirements
- Filters/templates: <auto-listed from requires — you can summarize>
- System tools: pandoc, xelatex, pandoc-crossref (install: `brew install …`)

## How to select it in the plugin
<frontmatter `template:` value, or the Run Pandoc Export step's preset dropdown>

## Customization
<fonts, options, what to tweak — e.g. macOS `Songti SC` vs the -windows variant>

## Personal assets
<if any: which placeholders to replace and how>

## Attribution / license
<if derived from a third-party template, credit it here and in the repo NOTICE>
```

## Licensing of contributions

By opening a pull request you agree to license your contribution under this
repository's **MIT** license (inbound = outbound) — so anyone, including the
closed-source PaperBell plugin and its users, can freely download and use it.

If you vendor a third-party asset, it must be under a license compatible with free
redistribution (e.g. MIT, BSD, Apache-2.0, CC-BY / CC-BY-SA, Public Domain). Keep its
original license header, and add an entry to the repository `NOTICE`. Do not submit
assets you don't have the right to redistribute.

## Questions

Open an issue. For anything touching core assets or the build scripts, describe the
motivation in the PR so review is fast.
