# Beamer slides (PDF)

**Produces:** PDF (Beamer) via XeLaTeX

![preview](preview.png)

> Preview is a placeholder — replace `preview.png` with a real render of the sample output.

## When to use

Turning notes into a slide deck.

## Requirements

- **System tools:** pandoc, xelatex
- **Assets:** resolved automatically from `defaults/beamer.yaml` (its `requires` closure of filters/templates). System tools are prompt-only — the plugin never downloads them.

## How to select it in the plugin

Set the note’s `_longform.template` (or the **Run Pandoc Export** step’s preset dropdown) to `beamer`. Leave a note’s template blank to fall back to `undefined`.

## Customization

Theme/fonts via `variables:` in `defaults/beamer.yaml` (`theme`, `fonttheme`).

## Attribution

Original to this project unless noted in the repository `NOTICE`.

