---
title: Quotas, Compliance and the Water Below
authors:
  - name: Ada Lovelace
    affiliation: [1, 2]
    corresponding: ada@example.org
  - name: Alan Turing
    affiliation: [2]
    corresponding: alan@example.org
affiliations:
  - index: 1
    name: Institute of Analytical Engines, Example University, Example City, Country.
  - index: 2
    name: Department of Computing, Example Institute, Example City, Country.
abstract: |
  A block-scalar abstract, on purpose: this is the shape that used to crash the
  filter, so the golden now covers it.

  It runs to a second paragraph and carries a citation [@knuth1984], which proves
  citeproc still sees metadata inserted into the body by the filter.
keywords: [reproducibility, pandoc, docx]
references:
  - id: knuth1984
    type: book
    title: The TeXbook
    author:
      - family: Knuth
        given: Donald E.
    issued:
      year: 1984
    publisher: Addison-Wesley
---

## Introduction

Prior work established the baseline [@knuth1984]. See @fig:demo, @tbl:demo and
@eq:demo for the cross-reference paths, and [@fig:demo; @fig:extra] for the plural
prefix. ==Highlighted text== exercises the `mark` extension. ^para-one

Addresses must survive the CJK typesetting filter untouched: write to
ada@example.org, or resolve doi:10.5555/example.2024 directly.

%% A private drafting note that must never reach a collaborator. %%

::: {.hidden}
A hidden div that must not appear in the Word file either.
:::

## Results

![A demo figure caption.](fig.png){#fig:demo}

![A second figure, so a plural cross-reference has something to point at.](fig.png){#fig:extra}

: A demo table caption. {#tbl:demo}

| Quantity | Value |
|----------|-------|
| Alpha    | 1     |
| Beta     | 2     |

$$ E = mc^2 $$ {#eq:demo}
