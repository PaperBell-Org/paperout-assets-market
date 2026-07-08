# Generic manuscript (PDF)

**Produces:** PDF via XeLaTeX

![preview](preview.png)

> Preview is a placeholder — replace `preview.png` with a real render of the sample output.

## When to use

A straightforward PDF without the full PaperBell manuscript machinery.

## Requirements

- **System tools:** pandoc, xelatex, pandoc-crossref
- **Assets:** resolved automatically from `defaults/pdf.yaml` (its `requires` closure of filters/templates). System tools are prompt-only — the plugin never downloads them.

## How to select it in the plugin

Set the note’s `_longform.template` (or the **Run Pandoc Export** step’s preset dropdown) to `pdf`. Leave a note’s template blank to fall back to `undefined`.

## Customization

Swap the CSL via the note frontmatter `csl:`; fonts live in `defaults/pdf.yaml`.

## Attribution

Uses `templates/paperbell.latex`, derived from the Eisvogel template (BSD-3-Clause). See the repository `NOTICE`.

