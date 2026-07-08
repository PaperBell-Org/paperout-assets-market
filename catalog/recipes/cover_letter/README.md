# Cover letter (PDF)

**Produces:** PDF via XeLaTeX (moderncv)

![preview](preview.png)

> Preview is a placeholder — replace `preview.png` with a real render of the sample output.

## When to use

Writing a journal cover letter alongside a manuscript.

## Requirements

- **System tools:** pandoc, xelatex, the moderncv LaTeX class (in most TeX distributions)
- **Assets:** resolved automatically from `defaults/cover_letter.yaml` (its `requires` closure of filters/templates). System tools are prompt-only — the plugin never downloads them.

## How to select it in the plugin

Set the note’s `_longform.template` (or the **Run Pandoc Export** step’s preset dropdown) to `cover_letter`. Leave a note’s template blank to fall back to `undefined`.

## Customization

Author identity (institution, address, ORCID) is set in `variables:` of `defaults/cover_letter.yaml`.

## Personal assets

Ships **placeholders** for the letterhead logo (`MPI-GEA_logo.pdf`) and signature (`Song_signature.png`). Replace them with your own, keeping the filenames — or change `LogoPath`/`SignaturePath` in the defaults. See `templates/cover_letter/README.md`.

## Attribution

Original to this project unless noted in the repository `NOTICE`.

