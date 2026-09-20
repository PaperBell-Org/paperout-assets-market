# Manuscript (DOCX)

**Produces:** DOCX · English-journal submission layout — Times New Roman 12 pt, double-spaced, justified body, centred title, no first-line indent, 1-inch margins, line numbers running continuously across pages

![preview](preview.png)

> Preview is a placeholder — replace `preview.png` with a real render of the sample output.

## When to use

Turning an Obsidian/Longform draft into a Word file you can submit, or send to co-authors to mark up. Use `paperbell` instead when you want the typeset PDF, and `demo-obsidian` when you want the Chinese-thesis Word layout.

## What formatting you get

Everything below lives in `templates/manuscript-reference.docx` — the filters only tag each block with a style name, so this table *is* the layout. To retarget a journal, edit these styles in Word rather than touching any Lua.

**Page and body**

| | |
| --- | --- |
| Paper | US Letter (8.5 × 11 in), 1-inch margins on all four sides |
| Body font | Times New Roman 12 pt, black |
| Line spacing | Double — body, abstract, headings and references alike |
| Body alignment | **Justified**; no first-line indent, no extra space between paragraphs |
| Line numbers | On by default, every line, **continuous across pages** (not restarting each page), so "line 137" means one place in the whole file. `lineno: false` turns them off |
| Bullets / numbered lists | Single-spaced and tight (`Compact`), so a list does not cost a page |

**Title block**

| Element | Style | Formatting |
| --- | --- | --- |
| Title | `Title` | **Centred**, bold, 14 pt, single-spaced |
| Authors | `Author` | Left, 12 pt, single-spaced; affiliation numbers as superscripts, `*` marks corresponding authors |
| Affiliations | `Affiliation` | Left, 10.5 pt, single-spaced, one per line, leading superscript index |
| Correspondence | `Corresponding` | Left, 10.5 pt; one shared line for all corresponding addresses |
| "Abstract" heading | `Abstract Title` | Left, bold, 12 pt |
| Abstract text | `Abstract` | Justified, 12 pt, double-spaced |
| Keywords | `Keywords` | Left, 12 pt, single-spaced |

**Sections, figures, tables, references**

| Element | Style | Formatting |
| --- | --- | --- |
| Section headings | `heading 1` / `2` / `3` | Left, black, bold at 14 / 13 pt and bold-italic at 12 pt — distinguished by weight, not colour or size jumps |
| Figure | `Figure` / `Captioned Figure` | Centred |
| Figure caption | `Image Caption` | Left, **10.5 pt** (half a point below body), above-space 6 pt, below 12 pt, `Figure 1: …` |
| Table caption | `Table Caption` | Left, **10.5 pt**, bold, kept with its table, `Table 1: …` |
| Tables | `Table` | Three-line (booktabs-style): rule above, rule under the header row, rule below; columns normalised to full text width |
| References | `Bibliography` | Left (not justified — long DOIs in a justified line open ugly gaps), double-spaced, 0.5-inch hanging indent, under a `References` heading |

Cross-references read `Figure 1` / `Figures 1, 2` / `Table 1`, matching what a journal expects; equation references stay at pandoc-crossref's `eq. 1`.

Two things the master cannot decide on its own: whether figures and tables sit inline or at the end (`figures-at-end` / `tables-at-end`, see Options), and the paper size — changing that means editing the master's `sectPr` **and** `docxPage` in `defaults/manuscript-obsidian.yaml` together, see Customization.

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

Springer Nature's structured fields are read too — `fnm:`/`spfx:`/`sur:`/`sfx:` on an author, `orgdiv:`/`orgname:`/`street:`/`city:`/`postcode:`/`state:`/`country:` on an affiliation — so the same note also exports through `nature-latex`. `name:` wins when both spellings are present; a structured affiliation is joined into one comma-separated line. The full schema, shared by every manuscript route, is in **[catalog/manuscript-frontmatter.md](../../manuscript-frontmatter.md)**.

Looser shapes work too, so a note written for plain pandoc still gets a title block: `author: Your Name` (or `author: [A, B]`) is used when there is no `authors:`; `authors: [A, B]` and `affiliations: [Dept A, Dept B]` may be plain strings; `keywords: one two` may be a scalar. Anything absent is simply omitted. `date:` is not rendered — a submission title block does not carry one. `bibliography` and `csl` are injected by the plugin at run time — do not set them in the note or in the defaults file.

## Options

| Frontmatter | Effect |
| --- | --- |
| `lineno: false` | Turn line numbers off (they are on by default, matching the PDF route) |
| `figures-at-end: true` | Move all figures to the end of the document |
| `tables-at-end: true` | Move all tables to the end of the document |

## Customization

All layout lives in `templates/manuscript-reference.docx`, not in the filters — the filters only tag each block with a style name (`Title`, `Author`, `Affiliation`, `Corresponding`, `Abstract Title`, `Abstract`, `Keywords`, plus pandoc's own `Body Text`, `Image Caption`, `Table Caption`, `Bibliography`, `Table`); the table above lists what each of those styles is set to. To match a particular journal's house style, open that file in Word, edit those styles, and save it — or point `reference-doc:` at your own copy.

The committed master is generated, not hand-edited: `node scripts/mk-manuscript-reference.mjs` rebuilds it from pandoc's default reference doc plus the patches in that script, and `--check` (run in CI) asserts the committed file still holds what the script produces. If you change the shipped master, change the script.

One coupling to know about if you change the **page setup**: line numbers are implemented as an injected OOXML section, and that section is the one that governs the body, so it has to carry the page size and margins itself. They live in `defaults/manuscript-obsidian.yaml` under `docxPage:` and must match the master's `sectPr` — change one, change the other, or a line-numbered export silently falls back to Word's local default paper size.

## Attribution

Original to this project unless noted in the repository `NOTICE`.
