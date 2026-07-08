# Response to reviewers (Word)

**Produces:** DOCX

![preview](preview.png)

> Preview is a placeholder — replace `preview.png` with a real render of the sample output.

## When to use

When the journal wants the response as an editable .docx.

## Requirements

- **System tools:** pandoc
- **Assets:** resolved automatically from `defaults/response-letter-docx.yaml` (its `requires` closure of filters/templates). System tools are prompt-only — the plugin never downloads them.

## How to select it in the plugin

Set the note’s `_longform.template` (or the **Run Pandoc Export** step’s preset dropdown) to `response-letter-docx`. Leave a note’s template blank to fall back to `undefined`.

## Customization

Uses Pandoc’s default docx styling; supply a reference-doc if you need house styles.

## Attribution

Original to this project unless noted in the repository `NOTICE`.

