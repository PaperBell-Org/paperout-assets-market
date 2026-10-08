# cover_letter/: your letterhead, signature and reviewer list

The `cover_letter` preset looks for its personal assets in this folder. In your
vault it is:

```
PaperBell/pandoc/templates/cover_letter/
```

That is the plugin's default assets folder (`PaperBell/pandoc`) plus
`templates/cover_letter/`. If you set a different **Pandoc assets folder** in
Longform settings, use `<that folder>/templates/cover_letter/`.

| File | Used for | Shipped as |
|---|---|---|
| `letterhead.pdf` | logo / letterhead at the top of the letter | blank placeholder |
| `signature.png` | handwritten signature above the date | blank placeholder |
| `reviewers.csv` | recommended-reviewers table (only when the note sets `reviewers: true`) | not shipped: copy `reviewers.example.csv` |

The placeholders are blank images, so the letter compiles before you add your
own. **If a file is missing, the letter still builds**: the logo, the signature
or the reviewer table is left out, and the LaTeX log gets a `cover_letter`
warning. (A missing `reviewers.csv` with `reviewers: true` prints a one-line
reminder where the table would go.)

## Your letterhead / logo

- **Format:** PDF (vector) is best. PNG or JPG also work.
- **Size:** it is scaled to `LogoScale` × the text width (default `0.80`), so the
  aspect ratio matters more than the pixel count. A wide banner works best; for a
  square logo, lower `LogoScale` (e.g. `"0.25"`).
- Replace `letterhead.pdf` with your file, or keep your own file name and point
  `LogoPath` at it (see below).

## Your signature

- **Format:** PNG with a **transparent background** (a white background shows as
  a box on tinted paper or when printed).
- **Size:** it is drawn **1 cm tall** (`\includegraphics[height=1cm]`), with the
  width following the aspect ratio. Crop it tight around the ink. About 300–600 px
  tall is plenty.
- Replace `signature.png` with your file, or point `SignaturePath` at your own
  file name.

## Using your own file names

Edit `variables:` in `PaperBell/pandoc/defaults/cover_letter.yaml`:

```yaml
variables:
  LogoPath: "my-institute-logo.pdf"   # looked up in templates/cover_letter/
  LogoScale: "0.80"
  SignaturePath: "my-signature.png"
```

A bare file name is looked up in this folder. An absolute path also works.
Remove the `LogoPath` or `SignaturePath` line to turn that element off for good.

The same `variables:` block holds your identity: `AuthorInstitution`,
`AuthorAddress`, and the optional `AuthorPhone` and `AuthorOrcid`. They ship as
obvious placeholders (`Your Institution`, `Street 1, 00000 City, Country`).
Replace them with your own. Values in `variables:` override the note's
frontmatter, so set them there, not in the note. Name and email come from the
project's `metadata.json` (or the note's `AuthorName` / `AuthorEmail`).

## Recommended reviewers (`reviewers: true`)

Copy `reviewers.example.csv` to `reviewers.csv` in this folder and edit it. The
header row must be exactly:

```
reviewer,email,institute,reason,link
```

- `reviewer` is the name, shown as a link to `link` (e.g. a profile page).
- `institute` and `reason` are free text.
- A value containing a comma must be wrapped in braces:
  `{Department of Examples, Example University}`.
- Only the first `MaxReviewers` rows are shown (default `5`; set it in
  `variables:`).

Then add `reviewers: true` to the cover-letter note's frontmatter.

## Updates will overwrite your changes

The plugin currently writes every file in a bundle or recipe as-is when you
install, re-install or update `cover_letter`. That includes `letterhead.pdf`,
`signature.png`, `reviewers.example.csv` and `defaults/cover_letter.yaml`. Two
habits keep your copies safe:

1. **Give your files your own names** (e.g. `my-signature.png`), not the
   shipped `letterhead.pdf` / `signature.png`. The bundle never ships those names,
   so it never overwrites them. `reviewers.csv` is never shipped either.
2. **Keep a copy of your `variables:` block** (`LogoPath`, `SignaturePath`,
   identity). Updating replaces `defaults/cover_letter.yaml`, so paste the block
   back in afterwards.

Uninstalling `cover_letter` deletes the files it shipped, but leaves your own
files alone.
