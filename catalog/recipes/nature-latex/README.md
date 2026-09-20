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
├── main.tex        \documentclass[referee,lineno,pdflatex,sn-nature]{sn-jnl}
├── references.bib  only the entries this manuscript cites
├── sn-jnl.cls      the Springer Nature document class
├── sn-nature.bst   the reference style your `sn-refstyle` selected
└── figures/
    ├── basin.png
    └── panel.png
```

Unzip it and compile:

```bash
pdflatex main && bibtex main && pdflatex main && pdflatex main
```

**BibTeX, not biber** — `sn-jnl.cls` loads `natbib` and issues its own
`\bibliographystyle`, so the whole chain is classic BibTeX.

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

## How to select it in the plugin

Pick **Nature-LaTeX (submission sources)** in the export menu. The output is
`submission.zip`.

## Frontmatter the title block reads

The same keys as `manuscript-obsidian`, so one note exports to Word and to submission
sources without edits. Springer Nature's structured fields are also accepted, and win when
both are present.

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

Author fields: `fnm`, `sur`, `spfx` (surname prefix, e.g. *van der*), `sfx` (e.g. *IV*),
`email`, `corresponding`, `equalcont`, `affiliation` (or `affil`).
Affiliation fields: `orgdiv`, `orgname`, `street`, `city`, `postcode`, `state`, `country`,
plus `index` for the superscript number.

## Options

| Frontmatter | Default | Effect |
|---|---|---|
| `sn-refstyle:` | `sn-nature` | Reference style. One of `sn-nature`, `sn-basic`, `sn-mathphys-num`, `sn-mathphys-ay`, `sn-aps`, `sn-vancouver-num`, `sn-vancouver-ay`, `sn-apa`, `sn-chicago`. Selects both the documentclass option and the `.bst` packed into the zip. |
| `sn-options:` | `[referee, lineno, pdflatex, <sn-refstyle>]` | Takes over the documentclass option list entirely, e.g. `[pdflatex, sn-basic, twocolumn]`. If you set this, keep an `sn-*` style in the list or the class emits no `\bibliographystyle` and your references vanish. |
| `lineno:` | `true` | Line numbers, via the class's `lineno` option. `false` drops it. |
| `figures-at-end:` / `tables-at-end:` | `false` | Move floats to the end under their own headings. |
| `nocite:` | — | Entries that belong in the reference list without being cited in the text. |

The default option set is the **review** form: `referee` gives double line spacing and
`lineno` numbers the lines, which is what most journals want for an initial submission. For
something closer to the typeset article, set `sn-options: [pdflatex, sn-nature]`.

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
