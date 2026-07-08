# PaperBell manuscript (PDF, Windows fonts)

**Produces:** PDF via XeLaTeX

![preview](preview.png)

> Preview is a placeholder — replace `preview.png` with a real render of the sample output.

## When to use

Same as `paperbell`, on a machine without the macOS Songti/Heiti fonts.

## Requirements

- **System tools:** pandoc, xelatex (MiKTeX / TeX Live), pandoc-crossref
- **Assets:** resolved automatically from `defaults/paperbell-windows.yaml` (its `requires` closure of filters/templates). System tools are prompt-only — the plugin never downloads them.

## How to select it in the plugin

Set the note’s `_longform.template` (or the **Run Pandoc Export** step’s preset dropdown) to `paperbell-windows`. Leave a note’s template blank to fall back to `undefined`.

## Customization

Edit the `metadata:` font names in `defaults/paperbell-windows.yaml` to match your installed fonts.

## Attribution

Uses `templates/paperbell.latex`, derived from the Eisvogel template (BSD-3-Clause). See the repository `NOTICE`.

