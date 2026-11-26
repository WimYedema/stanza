---
stanza-format: 1
title: "ADR 0094: Importing a cover from a Word template"
---

<!-- stanza: #vrm3kwq3qc -->
# ADR 0094: Importing a cover from a Word template

Status: Accepted. Backlog item 223, after ADR 0089 to 0093. Decided with the product owner on 2026-11-26.

<!-- stanza: #t7rpkmk2vn -->
## Context

A corporate cover already exists as a Word template. Building it again in the style editor takes the colors, fonts, sizes and the logo from the template by eye, and places its parts by trial. A real template (a technical report template, which is not part of the repository) showed how such a cover is built: ordinary paragraphs with named styles, empty paragraphs as spacing, a table of metadata, a paragraph border as a rule, the logo and an address in a table in a different first-page header, and the classification in the first-page footer. Its placeholders are plain text in square brackets, such as `[Document title]`; the covers of Word's gallery use content controls bound to document properties instead.

The import of ADR 0043 takes the content of a document and leaves its look to the stylesheet. A cover is the opposite: its look is what is wanted.

<!-- stanza: #n2vqsjhktj -->
## Decision

<!-- stanza: #wwckb3kqey -->
### Command

`stanza import cover <file> [project] [--name <template>]` reads a `.dotx` or `.docx` once and adds to the project:

- **a page template** named `--name` (by default the file name in kebab-case), with the page size and margins of the template and a cover grid (ADR 0092). A template of that name that exists already is a refusal: the import adds, it does not replace.
- **paragraph and table styles** for the cover, named after the Word styles with the template name before them, such as `report-proceduretitle`, and **color and font tokens** for their colors and fonts, reusing a token of the same value.
- **the images** of the first page and the first-page header, in `assets/<template>/`.
- **a report** of what was converted, what was approximated and what was left out, and the custom fields that the cover shows, for the project file.

Word is never a build input. The stylesheet edits are those of the style editor, each checked so that the stylesheet has no new error.

<!-- stanza: #v9f1m8752n -->
### What the cover is

The cover is the first page of the template: the body up to the first page break or section break, after the first-page header (or the default header), with the first-page footer (or the default footer) at the bottom. The body pages, with their headers and footers, are not imported (item 216).

<!-- stanza: #s8ctxp5hwr -->
### From the flow to a grid

A paragraph in a **frame** (`framePr`, in its style or its own properties) is at the place the frame gives: a distance from the page, the margins or the text, or aligned to the top, centre or bottom. Templates use frames to put the class and title of a cover at fixed places, and the import puts them there. For the paragraphs in the flow, Word does not store where they land, so the import estimates it from the styles: a paragraph is as high as its spacing and its lines at its line spacing, and an empty paragraph is spacing. A paragraph in a table cell or the header is read the same way. In order from the top:

- The header is first, then a spacer row up to the top margin of the page, then the blocks of the body, then a share row (`1fr`) that takes what is left, then the footer at the bottom. All other rows have heights in points, so the cover adds up as ADR 0089 requires.
- **Paragraphs with text** that follow each other without an empty paragraph between them are one row. **Empty paragraphs** are spacer rows of their estimated height.
- **An empty paragraph with only a top or bottom border is a rule:** a row of the border's width with the border's color as its background (ADR 0093).
- **A picture** is an image entry with its width in the template.
- **A table without visible borders** is layout: its columns become columns of the grid, and each cell an area. **A table with borders** is a cover table of a label and a value: the first cell is the label and the other cells, joined, the value. A row with more cells is reported as approximated.
- **Text boxes** are put in the flow where they are anchored, and reported; one at the right or in the centre of the page keeps that side as its alignment. A text box that a sensitivity label put there (Office marks it as a classification shape) becomes the `classification` token.
- **A paragraph that starts with a tab** to a centre or right tab stop is aligned there, and spaces and tabs at the ends of a line are dropped.

<!-- stanza: #c5vepsjnft -->
### Placeholders

A text in square brackets is a placeholder: `[Document title]` and `[Title]` become `title`, `[Author name(s)]` and the like `authors`, `[Classification]` `classification`, `[Version]` `version`, and any other `[Text]` the field `field:text` in kebab-case. A content control bound to a document property becomes the token of that property (title, author, subject as `field:subtitle`, and the others as fields named after the property). The label of a token is the placeholder text, so that an unfilled cover shows what to fill in, as the template does.

<!-- stanza: #6kxw88m89a -->
### Styles

A style is the look a paragraph has in the template: its Word style with the styles it is based on and the document defaults, and the direct formatting of the paragraph and its first run. Paragraphs that look the same share one style. The properties read are the font, size, bold, italic, color, alignment, spacing before and after, line spacing and left indent. Theme fonts and theme colors are read from the theme. Borders, shading of paragraphs, small caps, tabs and frames are left out and reported, except the rules above.

<!-- stanza: #cav9hbfbm5 -->
## Consequences

- A cover can be brought from a corporate template in one step, then adjusted in the style editor (ADR 0091).
- The positions are estimates: a long title that wraps, or a font that is not installed, moves what is below it, and the cover may need a row height changed.
- The template is read once; changing it later means importing again under another name.

<!-- stanza: #22pty5mped -->
## Alternatives considered

- **Laying out the page with Word, or with a layout engine, to get exact positions.** It would need Word or a renderer at import time, which the product does not depend on.
- **Keeping the template and copying its first page into every build.** Word would be a build input, and the cover could not be previewed or edited (ADR 0019).
- **Snapping anchored text boxes and shapes to the grid.** That is item 229, for covers built like Word's gallery.

<!-- stanza: #kqw19ywk9q -->
## Not covered

Anchored shapes and text boxes as areas (item 229), headers and footers of the body pages (item 216), the styles of the body, a different first page in the body, and updating a template that was imported.
