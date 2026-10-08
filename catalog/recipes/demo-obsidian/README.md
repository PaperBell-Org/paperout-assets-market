# Manuscript demo (Word)

**Produces:** DOCX

![preview](preview.png)

> Preview is a placeholder: Word output needs LibreOffice to render. Run `npm run mk:previews demo-obsidian` on a machine that has `soffice`.

## When to use

A demo/preview of the Word export pipeline from an Obsidian note.

## Requirements

- **System tools:** pandoc, pandoc-crossref
- **Assets:** resolved automatically from `defaults/demo-obsidian.yaml` (its `requires` closure of filters/templates). System tools are prompt-only — the plugin never downloads them.

## How to select it in the plugin

Set the note’s `_longform.template` (or the **Run Pandoc Export** step’s preset dropdown) to `demo-obsidian`. Leave a note’s template blank to fall back to `undefined`.

## Tables from spreadsheets

` ```xlsx-table ` fences (the ones the PDF routes turn into booktabs tables) render here as native Word tables: `caption:` is the caption, `label: tbl:x` lets pandoc-crossref number it, and cells and notes are read as markdown so citations resolve. `notes:` is styled `Table Note`, which `demo-reference.docx` does not define, so Word shows it in the body style; add a `Table Note` style to the master to make it smaller.

## Customization

Word styles come from `templates/demo-reference.docx` — edit it to restyle the output.

## Attribution

Original to this project unless noted in the repository `NOTICE`.

