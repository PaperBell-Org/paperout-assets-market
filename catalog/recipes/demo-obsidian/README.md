# Manuscript demo (Word)

**Produces:** DOCX

![preview](preview.png)

> Preview is a placeholder — replace `preview.png` with a real render of the sample output.

## When to use

A demo/preview of the Word export pipeline from an Obsidian note.

## Requirements

- **System tools:** pandoc, pandoc-crossref
- **Assets:** resolved automatically from `defaults/demo-obsidian.yaml` (its `requires` closure of filters/templates). System tools are prompt-only — the plugin never downloads them.

## How to select it in the plugin

Set the note’s `_longform.template` (or the **Run Pandoc Export** step’s preset dropdown) to `demo-obsidian`. Leave a note’s template blank to fall back to `undefined`.

## Customization

Word styles come from `templates/demo-reference.docx` — edit it to restyle the output.

## Attribution

Original to this project unless noted in the repository `NOTICE`.

