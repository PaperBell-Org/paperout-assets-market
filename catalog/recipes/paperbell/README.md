# PaperBell manuscript (PDF)

**Produces:** PDF via XeLaTeX

![preview](preview.png)

> Preview is a placeholder — replace `preview.png` with a real render of the sample output.

## When to use

The main preset for a full manuscript export with cross-refs, line numbers and citations.

## Requirements

- **System tools:** pandoc, xelatex (MacTeX / TeX Live), pandoc-crossref
- **Assets:** resolved automatically from `defaults/paperbell.yaml` (its `requires` closure of filters/templates). System tools are prompt-only — the plugin never downloads them.

## How to select it in the plugin

Set the note’s `_longform.template` (or the **Run Pandoc Export** step’s preset dropdown) to `paperbell`. Leave a note’s template blank to fall back to `undefined`.

## Customization

Uses macOS CJK fonts (`Songti SC` / `Heiti SC`). On Windows/Linux use the `paperbell-windows` recipe or edit the `metadata:` fonts in `defaults/paperbell.yaml`.

## Attribution

Uses `templates/paperbell.latex`, derived from the Eisvogel template (BSD-3-Clause). See the repository `NOTICE`.

