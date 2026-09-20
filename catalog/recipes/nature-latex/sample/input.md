---
title: Reservoir storage buffers drought propagation in a semi-arid basin
shorttitle: Reservoirs buffer drought propagation
authors:
  # 结构化写法：SN 自己的字段，直接映射成 \fnm{} \sur{} 和 \affil 编号
  - fnm: Shuang
    sur: Song
    email: song@example.edu
    corresponding: true
    affiliation: [1]
  # 两种拼法都写：schema 规定 `name:` 赢。这一条锁住的是那条规则本身 ——
  # 两条链一旦在优先级上分家，同一份笔记就会在 Word 和投稿包里得到不同的作者名。
  - name: Bob A. Jones
    fnm: MUSTNOT
    sur: APPEAR
    affiliation: [2]
    equalcont: These authors contributed equally to this work.
affiliations:
  # 结构化机构
  - index: 1
    orgdiv: Department of Hydrology
    orgname: Example University
    city: Beijing
    postcode: "100101"
    country: China
  # 扁平机构：整串进 \orgname{}
  - index: 2
    name: Institute of Water & Soil Research, Example City, Elsewhere
abstract: |
  Reservoir operation reshapes how meteorological drought propagates into
  hydrological drought [@song2021]. We show that storage buffers the
  propagation lag by roughly a third.
keywords:
  - drought propagation
  - reservoir operation
  - semi-arid hydrology
nocite: "@archive2018"
references:
  - id: song2021
    type: article-journal
    title: Reservoir storage and drought propagation in dryland basins
    author:
      - family: Song
        given: Shuang
    container-title: Nature Water
    issued: { date-parts: [[2021, 5, 14]] }
    DOI: 10.1000/example.2021.001
  - id: jones2019
    type: article-journal
    title: Baseflow recession under managed flow regimes
    author:
      - family: Jones
        given: Bob
    container-title: Water Resources Research
    issued: { date-parts: [[2019]] }
  - id: archive2018
    type: book
    title: A data archive cited only through nocite
    author:
      - family: Lee
        given: Ann
    publisher: Example Press
    issued: { date-parts: [[2018]] }
  # 这条谁都不引 —— golden 要证明它不出现在 references.bib 里
  - id: uncited2005
    type: article-journal
    title: An entry that must never reach the submission bib
    author:
      - family: Ghost
        given: Nobody
    container-title: Journal of Irrelevance
    issued: { date-parts: [[2005]] }
---

# Introduction

Managed storage changes drought propagation in ways that unmanaged catchments
do not show [@song2021]. Earlier recession work assumed a natural regime
[@jones2019]. ==This clause is highlighted in the note== and must survive as
plain text. ^intro-claim

%% 这条批注只写给自己看，不该出现在投给期刊的 .tex 里 %%

::: hidden
这个 Div 也不该出现在输出里。
:::

# Results

The basin outline is shown in [@fig:basin], and the same outline is reused in
[@fig:panel] together with the per-reservoir panel. Together [@fig:basin;
@fig:panel] establish the study extent.

![Study basin outline.](流域 示意图.png){#fig:basin width=70%}

![The same outline, reused to test figure de-duplication.](流域 示意图.png){#fig:panel width=50%}

![Per-reservoir storage panel.](panel.png){#fig:storage width=60%}

Storage anomalies are summarised in [@tbl:storage], and the propagation lag
follows [@eq:lag].

| Reservoir | Capacity (hm³) | Mean storage (%) |
|:----------|---------------:|-----------------:|
| Upper     |            420 |               63 |
| Lower     |            180 |               71 |

: Reservoir capacity and mean storage over the study period. {#tbl:storage}

$$
L = \frac{S_{\max} - S_t}{Q_{\text{in}}}
$$ {#eq:lag}

# Discussion

Contact the corresponding author at song@example.edu; the dataset DOI is
10.1000/example.2021.001. Neither should be reflowed or spaced as CJK text.
