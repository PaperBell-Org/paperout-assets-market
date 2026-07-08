# Response to reviewers (PDF)

**Produces:** PDF via XeLaTeX

![preview](preview.png)

> Preview is a placeholder — replace `preview.png` with a real render of the sample output.

## When to use

Responding to peer review, keeping reviewer comments and your responses visually distinct.

## Requirements

- **System tools:** pandoc, xelatex
- **Assets:** resolved automatically from `defaults/response-letter.yaml` (its `requires` closure of filters/templates). System tools are prompt-only — the plugin never downloads them.

## How to select it in the plugin

Set the note’s `_longform.template` (or the **Run Pandoc Export** step’s preset dropdown) to `response-letter`. Leave a note’s template blank to fall back to `undefined`.

## Customization

Draft vs final is passed at export time (`--metadata=draft:true/false`); document type (`author-response` / `reviewer-comments`) via note frontmatter.

## Attribution

Original to this project unless noted in the repository `NOTICE`.

