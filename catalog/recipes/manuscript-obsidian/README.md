# Manuscript (Word)

**Produces:** DOCX · English-journal submission layout — Times New Roman 12 pt, double-spaced, left-aligned, no first-line indent, 1-inch margins, line numbers on

![preview](preview.png)

> Preview is a placeholder — replace `preview.png` with a real render of the sample output.

## When to use

Turning an Obsidian/Longform draft into a Word file you can submit, or send to co-authors to mark up. Use `paperbell` instead when you want the typeset PDF, and `demo-obsidian` when you want the Chinese-thesis Word layout.

## Requirements

- **System tools:** pandoc, pandoc-crossref
- **Assets:** resolved automatically from `defaults/manuscript-obsidian.yaml` (its `requires` closure of filters/templates). System tools are prompt-only — the plugin never downloads them.

## How to select it in the plugin

Set the note's `_longform.template` (or the **Run Pandoc Export** step's preset dropdown) to `manuscript-obsidian`. Leave a note's template blank to fall back to `undefined`.

Note that the step's **Template / preset** dropdown outranks its **Format** dropdown: with a preset selected, `Format: docx` is ignored and the preset decides the output format. This recipe is `to: docx`, so selecting it is what produces Word.

## Frontmatter the title block reads

```yaml
title: Your Title
authors:
  - name: First Author
    affiliation: [1, 2]        # scalar or list; a list renders as "1,2"
    corresponding: you@example.org
  - name: Second Author
    affiliation: [2]
affiliations:
  - index: 1
    name: Department, University, City, Country.
  - index: 2
    name: Other Institute, City, Country.
abstract: |                    # single-line string or block scalar, both supported
  Your abstract, which may cite [@key].
keywords: [one, two, three]
```

Looser shapes work too, so a note written for plain pandoc still gets a title block: `author: Your Name` (or `author: [A, B]`) is used when there is no `authors:`; `authors: [A, B]` and `affiliations: [Dept A, Dept B]` may be plain strings; `keywords: one two` may be a scalar. Anything absent is simply omitted. `date:` is not rendered — a submission title block does not carry one. `bibliography` and `csl` are injected by the plugin at run time — do not set them in the note or in the defaults file.

## Options

| Frontmatter | Effect |
| --- | --- |
| `lineno: false` | Turn line numbers off (they are on by default, matching the PDF route) |
| `figures-at-end: true` | Move all figures to the end of the document |
| `tables-at-end: true` | Move all tables to the end of the document |

## Customization

All layout lives in `templates/manuscript-reference.docx`, not in the filters — the filters only tag each block with a style name (`Title`, `Author`, `Affiliation`, `Corresponding`, `Abstract Title`, `Abstract`, `Keywords`, plus pandoc's own `Body Text`, `Image Caption`, `Table Caption`, `Bibliography`, `Table`). To match a particular journal's house style, open that file in Word, edit those styles, and save it — or point `reference-doc:` at your own copy.

The committed master is generated, not hand-edited: `node scripts/mk-manuscript-reference.mjs` rebuilds it from pandoc's default reference doc plus the patches in that script, and `--check` (run in CI) asserts the committed file still holds what the script produces. If you change the shipped master, change the script.

One coupling to know about if you change the **page setup**: line numbers are implemented as an injected OOXML section, and that section is the one that governs the body, so it has to carry the page size and margins itself. They live in `defaults/manuscript-obsidian.yaml` under `docxPage:` and must match the master's `sectPr` — change one, change the other, or a line-numbered export silently falls back to Word's local default paper size.

## Attribution

Original to this project unless noted in the repository `NOTICE`.
