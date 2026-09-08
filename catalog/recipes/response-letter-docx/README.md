# Response to reviewers (Word)

**Produces:** DOCX · PaperBell house style — letterhead, italic reviewer comments, labelled responses, framed manuscript quotes

![preview](preview.png)

> Preview is a placeholder — replace `preview.png` with a real render of the sample output.

## When to use

When the journal wants the point-by-point response as an editable `.docx`. Use `response-letter` instead for the typeset PDF — the two routes are deliberately the same look, so a letter can go either way without rewriting.

## What formatting you get

The look is derived from the PDF route (`templates/responseletter.sty`), which is the house style. The three roles a response letter exists to keep apart are separated by **type style, label and box — not by colour**, so the letter survives greyscale printing and journal systems that strip colour. Only the labels and headings are coloured.

Everything lives in `templates/response-letter-reference.docx`; the filter only names styles, so this table is the layout. To restyle for a journal, edit these styles in Word.

**Page and body**

| | |
| --- | --- |
| Paper | US Letter, 22 mm top/bottom margins, 25 mm left/right (matching the PDF's `geometry`) |
| Body | Times New Roman 11 pt, near-black `1A1A1A`, single-spaced, left-aligned, no indent, 6 pt between paragraphs |
| Accent | `1F3A5F` on headings and the `RC:` / `AR:` labels only |

**Letterhead** (emitted from metadata; nothing to write by hand)

| Element | Style | Formatting |
| --- | --- | --- |
| Kicker | `Letter Kicker` | Arial bold 14 pt, accent. "Author Response to Reviews of", or "Reviewer Comments to the Manuscript" when `type: reviewer-comments`; override with `lettertitle:` |
| Paper title | `Title` | Times bold 20 pt, from `papertitle:` (falls back to `title:`) |
| Authors | `Author` | Body weight, from `authors:` (a list of names or of `{name:}` maps) |
| Journal | `Journal` | Italic, from `journal:` (or `target:`), with the 1 pt accent head rule as its bottom border; `doi:` appended in monospace |
| Legend | `Legend` | 9 pt, right-aligned: **RC:** *Reviewer Comment*, **AR:** Author Response, ▢ Manuscript text |

`title`, `abstract` and `date` are cleared after the letterhead is built, so pandoc's own template cannot print the manuscript's abstract into the letter.

**The three roles**

| Element | Style | Formatting |
| --- | --- | --- |
| Reviewer comment | `Reviewer Comment` | *Italic*, 1 cm hanging indent, led by a bold accent `RC:` label (`RC Label` character style) |
| … its later paragraphs | `Reviewer Comment Cont` | Same, unlabelled, aligned with the first |
| Author response | `Author Response` | Upright, 1 cm hanging indent, led by a bold accent `AR:` label (`AR Label`) |
| … its later paragraphs | `Author Response Cont` | Same, unlabelled, aligned with the first |
| Manuscript quote — title bar | `Manuscript Quote Title` | Arial bold 9 pt, white on a `8A949E` fill: `Manuscript` plus the locator in `Manuscript Locator` (not bold) |
| Manuscript quote — text | `Manuscript Quote` | 10 pt on `FCFCFD`, framed left/right/bottom in `8A949E` |
| Reviewer / topic headings | `heading 1` / `2` / `3` | Arial bold, accent |
| References | `Bibliography` | 1 cm hanging indent, under a `References` heading |

The locator on the title bar is built the same way the PDF builds it: `Manuscript · Page 5, Line 158–160`, `Manuscript · Figure 2`, `Supplementary Information`, or just `Manuscript` when nothing is known.

## How to write the letter

````markdown
> [!reviewer] Reviewer #1
> The model specification is not clear enough to reproduce.
>
> ---
> **中文翻译：** 模型设定不够清楚。          <- dropped on export

> [!response]
> We have rewritten the specification.
>
> A second paragraph stays aligned under the first.

```manuscript
@model-spec                                  <- pulled live from the manuscript
```

> [!manuscript] page=5, sline=158, eline=160
> Or paste the revised text and give the locator by hand.
````

Callout aliases: `reviewer` / `rc` / `quote` / `comment` / `question` for comments, `response` / `ar` / `reply` for responses, `manuscript` / `ms` / `revision` for manuscript text. A bare `**Response:**` paragraph also works.

Everything that exists only for the draft is stripped on export: `**中文翻译：**` paragraphs, `%% … %%` and `<!-- … -->` comments, `#TODO` lines, *Evidence* notes, `{difficulty=… status=…}` markers and `![[embeds]]`.

The letter's own figures are written as ordinary markdown images; they are numbered by Word, not by the manuscript's numbering.

### Quoting the manuscript instead of pasting it

Wrap the span in the manuscript scene:

```markdown
<!--ms:model-spec-->Responses are estimated with a hierarchical model …<!--/ms:model-spec-->
```

then reference it by id in a ` ```manuscript ` fence. `manuscript_include.lua` pulls the **current** text at export time, so a quote cannot drift from what you submitted, and citations inside it resolve into the letter's own bibliography. Ids are looked up in the sibling `source/` folder.

## Requirements

- **System tools:** pandoc
- **Assets:** resolved automatically from `defaults/response-letter-docx.yaml` (its `requires` closure of filters/templates). System tools are prompt-only — the plugin never downloads them.

## How to select it in the plugin

Set the note's `_longform.template` (or the **Run Pandoc Export** step's preset dropdown) to `response-letter-docx`. Leave a note's template blank to fall back to `undefined`.

## Customization

All layout is in `templates/response-letter-reference.docx` — open it in Word, edit the styles named above, save. The filter never sets a font or a colour, so nothing needs recompiling.

The committed master is generated, not hand-edited: `node scripts/mk-response-letter-reference.mjs` rebuilds it from pandoc's default reference doc plus the patches in that script, and `--check` (run in CI) asserts the committed file still holds what the script produces. If you change the shipped master, change the script.

## Known gaps

- ` ```xlsx-table ` blocks are not rendered on this route. `xlsx_table.lua` only builds LaTeX, so adding it to the docx chain would make tables vanish rather than appear — the fence currently stays visible as a code block.
- The letter's own figures are not renumbered `R1`, `R2`, … the way the PDF does; pandoc-crossref is not on this chain.
- Draft mode (difficulty/status badges, `\note`, the Chinese gloss) is PDF-only by design: the Word file is the one you submit.

## Attribution

Original to this project unless noted in the repository `NOTICE`.
