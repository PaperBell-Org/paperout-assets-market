# Nature-LaTeX (submission sources)

**Produces:** `.zip` · a Springer Nature LaTeX submission package — one `main.tex` on the
official `sn-jnl` class, a `references.bib` containing only what you actually cited, and
every figure as its own file.

![preview](preview.png)

## When to use

When a Springer Nature journal — including the Nature Portfolio titles — asks for LaTeX
**source files** rather than a PDF or a Word file. The export gives you, in one step, the
package their submission system expects:

```
submission.zip
├── main.tex        \documentclass[pdflatex,sn-nature]{sn-jnl}
├── references.bib  only the entries this manuscript cites
├── sn-jnl.cls      the Springer Nature document class
├── sn-nature.bst   the reference style your `sn-refstyle` selected
└── figures/
    ├── basin.png
    └── panel.png
```

Unzip it and compile:

```bash
xelatex main && bibtex main && xelatex main && xelatex main
```

**BibTeX, not biber** — `sn-jnl.cls` loads `natbib` and issues its own
`\bibliographystyle`, so the whole chain is classic BibTeX.

**XeLaTeX, not pdfLaTeX, if the manuscript contains any CJK** — Chinese authors
commonly sign bilingually (`Shuang Song 宋爽`), which puts CJK inside `\sur{}`, and
pdfLaTeX cannot typeset it (`Unicode character 宋 not set up for use with LaTeX`).
A manuscript with no CJK anywhere still compiles with `pdflatex`.

The three things this saves you doing by hand: pulling the cited subset out of a
thousand-entry `mybib.bib`, copying figures out of your Obsidian attachments folder and
renaming them to something LaTeX will accept, and keeping `main.tex` a single file with no
`\input` (which Springer Nature explicitly requires).

For the same manuscript as a Word file, use `manuscript-obsidian`; for a typeset PDF, use
`paperbell` or `pdf`. All three read the same frontmatter.

## Requirements

- Pandoc ≥ 3.0 (needs `pandoc.zip` and custom binary writers) and `pandoc-crossref`.
- A LaTeX installation **only if you want to compile locally** — the export itself runs no
  TeX at all. The zip is self-contained: it ships the class and the `.bst`.
- For a manuscript containing CJK: XeLaTeX, and a Chinese font. The font is declared
  **only when the document actually contains CJK** — an English-only manuscript gets no
  font metadata at all and still compiles with `pdflatex`. Set `CJKmainfont:` in the note
  to choose one; the default is `Songti SC`, and the template falls back to
  `Noto Serif CJK SC` then `SimSun` so the zip compiles on your co-authors' and the
  journal's machines too, where a missing font is a hard XeLaTeX error.

  The chain is deliberately short: a failed font probe costs ~1.9 s and is not cached, so
  every extra candidate is ~5.8 s added to the three-pass build on a machine that has to
  walk past it.

## How to select it in the plugin

Set the note's `_longform.template` (or the **Run Pandoc Export** step's preset dropdown)
to `nature-latex`. Leave a note's template blank to fall back to `undefined`.

The step's **Template / preset** dropdown outranks its **Format** dropdown: with a preset
selected, `Format` is ignored and the preset decides the output. This recipe writes a
`.zip` through a custom Lua writer, so selecting it is what produces the submission
package — there is no "zip" entry in the Format dropdown to pick instead.

The output file is `submission.zip`.

## Frontmatter the title block reads

The same keys as `manuscript-obsidian`, so one note exports to Word and to submission
sources without edits. Springer Nature's structured fields are also accepted; `name:` wins
when both spellings are present. The full schema, shared by every manuscript route, is in
**[catalog/manuscript-frontmatter.md](../../manuscript-frontmatter.md)** — this section is
just the Nature-LaTeX view of it.

```yaml
title: Reservoir storage buffers drought propagation in a semi-arid basin
shorttitle: Reservoirs buffer drought propagation   # running head; falls back to `title`
authors:
  # structured — maps straight onto \fnm{} \sur{} \email{}
  - fnm: Shuang
    sur: Song
    email: song@example.edu
    corresponding: true        # gets the \author* star
    affiliation: [1]
  # flat — the manuscript-obsidian form; the name is split on its last space
  - name: Bob A. Jones
    affiliation: [2]
    equalcont: These authors contributed equally to this work.
affiliations:
  # structured — each field becomes its own SN macro
  - index: 1
    orgdiv: Department of Hydrology
    orgname: Example University
    street: 11A Datun Road          # optional
    city: Beijing
    postcode: "100101"              # optional
    state: Beijing                  # optional
    country: China
  # flat — the whole string goes into \orgname{}
  - index: 2
    name: Institute of Water & Soil Research, Example City, Elsewhere
abstract: |
  Reservoir operation reshapes how meteorological drought propagates ...
keywords: [drought propagation, reservoir operation, semi-arid hydrology]
```

**Bilingual names.** `name: Shuang Song 宋爽` splits as `\fnm{Shuang} \sur{Song 宋爽}` —
the CJK part rides with the surname rather than becoming it, because Springer Nature reads
`\fnm`/`\sur` as given-name/surname metadata. A name that is entirely CJK (`宋爽`) is not
split. Non-ASCII that is *not* CJK (`Jürgen Renn`) splits normally. Write `fnm:`/`sur:`
explicitly if you want different behaviour.

Author fields: `fnm`, `sur`, `spfx` (surname prefix, e.g. *van der*), `sfx` (e.g. *IV*),
`email`, `corresponding`, `equalcont`, `affiliation` (or `affil`).
Affiliation fields: `orgdiv`, `orgname`, `street`, `city`, `postcode`, `state`, `country`,
plus `index` for the superscript number. Every one of these is also understood by the Word
route, so writing them costs you nothing there.

## Options

**The default is the typeset form** — single-spaced, no line numbers, figures and tables
collected at the end. That is what the journal prints, so it is what you check before
uploading. Nothing to set; it is what you get.

| Frontmatter | Default | Effect |
|---|---|---|
| `referee:` | `false` | Double line spacing, via the class's `referee` option. |
| `lineno:` | `false` | Line numbers, via the class's `lineno` option. |
| `figures-at-end:` / `tables-at-end:` | `true` | Collect floats at the end under their own headings. `false` leaves them in place. |
| `sn-refstyle:` | `sn-nature` | Reference style. One of `sn-nature`, `sn-basic`, `sn-mathphys-num`, `sn-mathphys-ay`, `sn-aps`, `sn-vancouver-num`, `sn-vancouver-ay`, `sn-apa`, `sn-chicago`. Selects both the documentclass option and the `.bst` packed into the zip. |
| `sn-options:` | `[pdflatex, <sn-refstyle>]` | Takes over the documentclass option list entirely, e.g. `[pdflatex, sn-basic, twocolumn]`. If you set this, keep an `sn-*` style in the list or the class emits no `\bibliographystyle` and your references vanish. |
| `nocite:` | — | Entries that belong in the reference list without being cited in the text. |

### Sending it out for review instead

Many journals want an initial submission double-spaced and line-numbered. Two keys:

```yaml
---
referee: true
lineno: true
---
```

That yields `\documentclass[referee,lineno,pdflatex,sn-nature]{sn-jnl}`. Floats stay at the
end unless you also set `figures-at-end: false`.

## What you get, and what to check

- **Only cited references.** Entries in your library that this manuscript does not cite
  never reach `references.bib`. A citation key that resolves to nothing is reported on
  stderr during export — worth reading, because in a BibTeX chain a bad key does not show
  up as `[?]`, it just silently disappears from the reference list.
- **Live cross-references.** `[@fig:basin]` becomes `\ref{fig:basin}`, not a frozen
  "Figure 1", so the numbering survives the journal reflowing your figures. This needs
  `filters/crossref-latex.lua` in the chain rather than the bare `pandoc-crossref`
  token — see that file's header for why.
- **Figures renamed for LaTeX.** `流域 示意图.png` becomes `figures/basin.png` (the
  crossref id is used when the original name has no usable ASCII left). The same image
  cited twice is packed once.
- **DOIs preserved.** The bibliography is written through Pandoc's biblatex writer and then
  converted to BibTeX's `year =`, because Pandoc's BibTeX writer drops `doi` — and
  `sn-nature.bst` uses it.

## Known gaps

1. **Nature Portfolio / eJP submissions want the `.bbl` inlined.** Springer Nature's own
   template says that when submitting to a Nature Portfolio journal through eJP, you should
   paste the contents of your `.bbl` file into `main.tex` and delete the `\bibliography`
   command. The export cannot run BibTeX, so it cannot produce a `.bbl` — compile once
   locally, then do that last step by hand.
2. **No callouts.** `callout.lua` and `preamble.lua` are deliberately not in this chain:
   they pull tcolorbox, tikz and algorithm into the preamble, which a submission source file
   has no use for and which only widens the surface for a failed compile on the journal's
   TeX installation. Obsidian callouts come through as plain blockquotes.
3. **Figures inside raw LaTeX are not packed.** An `\includegraphics` that reaches the
   output as a raw LaTeX block — from `xlsx_table.lua` or a `tikz` fence — is invisible to
   the figure collector, so its file is not copied into the zip and its path is not
   rewritten.
4. **`sn-aps` has an upstream naming bug.** The class asks for `\bibliographystyle{sn-APS}`
   while the shipped file is `sn-aps.bst`. The export packs it under the name the class
   asks for, so it works on case-sensitive filesystems too.

## Attribution / license

`templates/nature/sn-jnl.cls` and `templates/nature/bst/*.bst` are the **Springer Nature
LaTeX template package**, version 3.1 (December 2024), redistributed unmodified under the
LaTeX Project Public License 1.3c. See [NOTICE](../../../NOTICE).

`templates/nature-latex.latex` is derived from Pandoc's own default LaTeX template.
