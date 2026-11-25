---
stanza-format: 1
title: "ADR 0089: Cover rows and images"
---

<!-- stanza: #2mwdtjbmtr -->
# ADR 0089: Cover rows and images

Status: Accepted. Backlog item 221, refining ADR 0019. The title block of ADR 0090 uses its entries and images; the image diagnostics were renamed there. Decided with the product owner on 2026-11-25.

<!-- stanza: #a6xwra81zp -->
## Context

A cover of ADR 0019 is a list of paragraphs and tables written from the top of the page. A corporate cover puts its parts in places: a logo near the top corner, the title and subtitle low on the page, a metadata line at the bottom. Word templates do this with a layout table, or with text boxes and shapes anchored to the page. The cover of ADR 0019 cannot put anything lower on the page than the content above it pushes it, and it has no images.

The vision excludes text boxes, floating shapes and per-page layout. It allows a cover page as part of a page template. The product knows the page size and the margins, so it can compute where things go and write them with ordinary Word constructs.

<!-- stanza: #d3972h2rfn -->
## Decision

<!-- stanza: #xtfch6gdzf -->
### Rows

A `cover` can be a map with `rows`, in place of the list of ADR 0019. The rows divide the cover page from top to bottom:

```yaml
cover:
  margins: { top: 36, left: 48, right: 48, bottom: 48 }
  rows:
    - height: 96
      content:
        - image: assets/logo.png
          width: 120
          style: cover-logo
    - height: 2fr
      valign: bottom
      content:
        - style: cover-title
          text: '[Untitled](stanza:title)'
        - style: cover-subtitle
          text: '[](stanza:field:subtitle)'
    - height: 1fr
```

- `height` is a number in points, a share written `<n>fr`, or left out. A share divides what the rows in points leave of the height of the cover page between its margins, in proportion. A row without a height grows with its content.
- Shares and rows without a height cannot be mixed in one cover (`cover-share-with-auto`), since the height that is left is then not known. Rows in points that are together taller than the cover page are an error (`cover-too-tall`).
- `valign` is `top` (the default), `center` or `bottom`: where the content sits in its row.
- `content` is a list of the entries of ADR 0019, and of image entries. A row without content, or whose entries are all empty, is still written, since it holds the place of the rows below. A cover whose entries are all empty is not written, as before.
- The list form of ADR 0019 stays valid and its output does not change.

<!-- stanza: #x37mgjxk22 -->
### Images

An image entry is `{ image, width, style }`.

- `image` is the path of a PNG or JPEG file, relative to the project root, like the other paths of the project file. The format is read from the content of the file, not from its name. A file that is missing or that is not a PNG or JPEG is an error (`image-not-found`, `image-unsupported`).
- `width` is the width in points. Left out, the image has its size in pixels at 96 per inch. The height follows from the aspect ratio of the image, which is always kept. An image wider than its row is made as wide as the row, with a warning (`image-too-wide`).
- `style` is the paragraph style of the paragraph that holds the image, `body` by default. Its alignment places the image left, centred or right, and its spacing gives the room around it, so the image has no position of its own. A style with `exactly` line spacing would cut the image off, and is a warning (`image-line-spacing`).

An image in a row in points that is taller than the row is a warning (`image-too-tall`): Word would cut it off. Text that does not fit its row is cut off by Word as well, and the product cannot see it, because it does not measure text.

The images are read by the project when it loads, and given to the exporter with the document. The exporter embeds them and gives the same bytes for the same files.

<!-- stanza: #0b840jk5ww -->
### Margins

A cover with rows can have its own `margins`, since a logo often sits closer to the edge of the page than the body text. A side that is left out takes the margin of the template. The checks of ADR 0016 apply.

<!-- stanza: #vbbpx4jqcg -->
### Export

- The cover is its own section, as in ADR 0019, with the size of the template and the margins of the cover.
- The rows are one borderless table as wide as the text area, with one column. A row in points or a share has an exact height in twips; a row without a height has none and grows. The shares are rounded to twips, and the last share row takes what rounding leaves. Each cell has its vertical alignment, and no cell margins, so the content starts at the margins of the cover.
- The table, its rows and its cells carry these properties themselves: borders, width, cell margins, row heights and vertical alignment. They are layout that the stylesheet computes, as the tab stops of ADR 0017 are, and not formatting of content. This is the fourth place with explicit properties in the output, after ADR 0008, ADR 0012 and ADR 0017.
- Word ends a section with a paragraph, and one after a table that fills the page would make an empty second page. The paragraph that ends the cover section is given a line of 1 pt with no spacing, and the shares leave 2 pt of the page for it.
- An image is an inline picture in a paragraph of its style. Its name is the name of its file, and it is marked as decorative, so that Word's accessibility check does not ask for alternative text. The drawing IDs that the library numbers across exports are numbered again from 1 in each package, as the bookmarks are.
- Word ends a table cell with a paragraph, so a cover table at the end of a row is followed by an empty paragraph of `body`, and sits that much above the bottom of a row aligned to the bottom.

<!-- stanza: #th67d3ss98 -->
### Subtitle

There is no `subtitle` token. A subtitle is a custom field, `[](stanza:field:subtitle)`, declared by the project as any other field.

<!-- stanza: #6011w4g8as -->
### Format

The stylesheet stays at format version 1, since the map form and image entries are additions. The document format does not change.

<!-- stanza: #cbkkjb2e42 -->
## Consequences

- A cover can place a logo, a title and a subtitle roughly where a corporate cover has them, with named styles only.
- The cover is a table in Word. A reviewer who clicks on it sees table cells, which is how Word templates build covers too.
- Text that is longer than its row is cut off in Word without a diagnostic.
- The editor draws the cover on its sheet with the same rows, heights, alignment, margins and images (item 222). The host sends the images that the project read as data URLs, so the webview reads no files, and a missing image shows as its path. Text is laid out by the browser, so where it breaks lines may differ from Word.

<!-- stanza: #773wjwfk0f -->
## Alternatives considered

- **Text boxes or frames at positions on the page.** Closer to how Word's own covers are built, but they are floating content, which the vision excludes, and Word for the web and other readers handle them worse than tables.
- **Spacer paragraphs between the entries.** No table, but the positions would depend on the line height of the spacers, and the rows would no longer add up to the page.
- **The image position in the image entry.** A left, centre or right on the entry would be a second way to align, beside the paragraph style.
- **Image paths relative to the stylesheet.** Shorter when the images sit next to it, but the project file and the documents already use paths from the project root.

<!-- stanza: #3dnndpccvn -->
## Not covered

Columns and areas (item 225), background colors (item 226), a background image (item 227), the title block (ADR 0090) and SVG images.
