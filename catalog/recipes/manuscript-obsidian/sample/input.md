---
title: Quotas, Compliance and the Water Below
authors:
  - name: Ada Lovelace
    affiliation: [1, 2]
    corresponding: ada@example.org
  - name: Alan Turing
    affiliation: [2]
    corresponding: alan@example.org
  # Springer Nature 的结构化写法：同一份笔记要能同时导 Word 和 Nature-LaTeX 投稿包，
  # 所以两套姓名字段都得认。少了这一位，fnm/sur 的作者会整行消失而没人发现。
  - fnm: Grace
    spfx: van
    sur: Hopper
    affil: [3]
affiliations:
  - index: 1
    name: Institute of Analytical Engines, Example University, Example City, Country.
  - index: 2
    name: Department of Computing, Example Institute, Example City, Country.
  # 结构化机构：按 ORG_FIELDS 的顺序逗号拼成一行
  - index: 3
    orgdiv: Department of Naval Computing
    orgname: Example Naval Institute
    city: Example City
    country: Country
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
