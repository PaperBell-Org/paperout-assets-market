---
papertitle: Quotas, Compliance and the Water Below
authors:
  - name: Ada Lovelace
  - name: Alan Turing
journal: Journal of Irreproducible Water
type: author-response
title: Response to Reviewers
abstract: |
  The manuscript abstract. A draft letter often carries it in frontmatter, and it
  must not leak into the letter itself.
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

> [!reviewer] Reviewer #1 (Remarks to the Author)
> The model specification is not clear enough to reproduce, and the authors should
> say how basin-specific slopes are pooled {difficulty=medium status=todo}
>
> ---
> **中文翻译：** 模型设定不够清楚，无法复现。

> [!response]
> We have rewritten the specification and now state the pooling explicitly [@knuth1984].
>
> The revised passage is quoted below, pulled from the manuscript itself so it cannot
> drift from what we submitted.

```manuscript
@model-spec
```

> [!reviewer] Reviewer #2
> Please give the exact interval used.

> [!response]
> Done — 95% intervals throughout. The distribution is shown below; this figure is the
> letter's own, not one from the manuscript.
>
> ![Posterior intervals for each basin.](fig.png)

> [!manuscript] page=5, sline=158, eline=160
> Estimates are reported with 95% intervals.

%% 这条草稿批注不应出现在导出的 Word 里 %%
