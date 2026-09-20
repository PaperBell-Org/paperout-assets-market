# Manuscript frontmatter — the shared schema

One manuscript note should export to **every** manuscript route without edits:

| Route | Recipe |
| --- | --- |
| Word (English journal layout) | `manuscript-obsidian` |
| Springer Nature LaTeX submission sources | `nature-latex` |
| Typeset PDF | `paperbell`, `pdf` |

That only holds if the routes read the *same* keys. This file is the single definition;
`catalog/recipes/*/README.md` points here rather than restating it.

> Why this file exists: `nature-latex` was added reading `fnm:`/`sur:` and
> `orgdiv:`/`orgname:`, which `manuscript-docx.lua` did not know. The same note produced a
> full author block in the LaTeX zip and a **missing** one in Word — a silent, half-broken
> export. Both filters now read this schema; keep them that way.

## Title

```yaml
title: Reservoir storage buffers drought propagation in a semi-arid basin
shorttitle: Reservoirs buffer drought propagation   # running head; LaTeX only, falls back to `title`
```

## Authors

Two spellings of a name are accepted. **`name:` wins when both are present.**

```yaml
authors:
  # Flat — the original form. Nature-LaTeX splits it on its LAST space into \fnm{}/\sur{}.
  - name: Ada Lovelace
    affiliation: [1, 2]        # scalar or list; `affil:` is accepted as an alias
    corresponding: ada@example.org   # an email, or `true` for the star with no address

  # Structured — Springer Nature's own fields. Use this when the last-space split would
  # get your name wrong, or when you need spfx/sfx.
  - fnm: Grace
    spfx: van                  # surname prefix, e.g. "van der"
    sur: Hopper
    sfx: IV                    # suffix
    email: grace@example.org
    affil: [3]
    equalcont: These authors contributed equally to this work.   # LaTeX only
```

`author:` (singular) is also read, for notes that only ever used Pandoc's standard key.

## Affiliations

Same rule: **`name:` wins**, otherwise the structured fields are used.

```yaml
affiliations:
  # Flat — one string, printed as-is
  - index: 1
    name: Institute of Analytical Engines, Example University, Example City, Country

  # Structured — Springer Nature's fields
  - index: 3
    orgdiv: Department of Naval Computing
    orgname: Example Naval Institute
    street: 1 Example Road
    city: Example City
    postcode: "100101"
    state: Example State
    country: Country
```

`index:` is the superscript number authors refer to; it falls back to the list position.

**Structured affiliations in Word** have no `\orgdiv`/`\orgaddress` equivalent, so they are
joined into one line, comma-separated, in this fixed order:

```
orgdiv, orgname, street, city, postcode, state, country
```

That order lives in `ORG_FIELDS` in `filters/manuscript-docx.lua`. Nature-LaTeX maps each
field to its own SN macro instead, so the two routes show the same information in the form
each format expects — its address fields are `ADDRESS_FIELDS` in
`writers/latex-submission.lua`. Adding a field means editing both tables and this
paragraph.

## Abstract and keywords

```yaml
abstract: |
  Multi-paragraph is fine. Citations inside the abstract resolve.
keywords: [drought propagation, reservoir operation, semi-arid hydrology]
```

## Per-route switches

These are read by one route and ignored by the others, so they are safe to leave in a note.

| Key | Route | Effect |
| --- | --- | --- |
| `lineno:` | all | Line numbers. Default on. |
| `figures-at-end:` / `tables-at-end:` | Word, LaTeX | Move floats to the end. |
| `sn-refstyle:` | `nature-latex` | Reference style / `.bst`. Default `sn-nature`. |
| `sn-options:` | `nature-latex` | Takes over the `sn-jnl` documentclass options. |
| `nocite:` | all | Entries in the reference list that the text does not cite. |

## If you add a manuscript route

Read these keys through the same two rules — `name:` wins, structured fields are the
fallback — and add a case to that recipe's `sample/input.md` covering **both** spellings.
`manuscript-obsidian`'s sample carries a flat author, a structured author and one of each
affiliation for exactly this reason: without it, a route that silently drops one spelling
passes CI.
