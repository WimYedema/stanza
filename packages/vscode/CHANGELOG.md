# Changelog

## 0.3.0

Cover pages: a cover laid out like a corporate one, made in the style editor, started from a preset or imported from a Word template.

- A cover can be divided into rows of a height, or into a grid of columns, rows and named areas, with a logo or other images, margins of its own, background colors for rows and areas, and a background image behind the whole page.
- A title block at the top of the first page, for documents without a cover: a logo, the title and a table of metadata above the text.
- Headers and footers can be grids too, with a logo or several lines, at a distance from the edge of the page that you choose.
- The style editor's **Page layout** tab shows the two parts of a layout, **Cover page** and **Body pages**, each with its own preview. Columns, rows and areas are set in the panel, and areas are made by dragging across the cells of the preview; arrows in the preview show what a size field sets.
- Start a cover from one of five presets: classic, title in the lower third, bands, side band, or a controlled document with a table of its number, version, status, date and classification.
- `stanza import cover` imports the cover, header and footer of a Word template (`.dotx` or `.docx`): its layout, frames, tables, text boxes, coloured shapes and pictures, with placeholders and content controls as the title, authors and other values.
- Validating a document warns when its text, such as a long abstract, is too long for its area of the cover, which Word would cut off without a sign.
- The editor shows the cover and title block of a document as they will look.
- A change that would lose what was made, such as switching a cover to none, asks first.

## 0.2.0

The review round in Word: push a document to a review folder, pull the comments back, and work through them beside the text.

- **Stanza: Push for Review** and `stanza review push` build a document and write it to a review folder, replacing the file there unless it was saved in Word and not pulled, or writing a new one beside it.
- **Stanza: Pull Review Comments** writes the comments of a reviewed DOCX into a review document in `reviews/`: one heading per thread, linked to the commented text, with replies, resolved state and reactions, and the changes reviewers made to the text, which are never applied.
- Review comments in the editor: the comments of a document's reviews are shown beside the commented text, as cards or as markers in a narrow editor, and can be resolved, reopened and opened in their review document.
- Review buttons in the Stanza editor: **Push** to the document's review folder, **Pull** from the file pushed there, and a status that says which is due, such as new comments from reviewers.
- A push says how many comments leave the file it replaces, and VS Code asks first, with a choice not to ask again.
- Pulled review comments keep their bold, italic, code and links; a mention stays the reviewer's name, without the address.
- Every exported DOCX records the document, the Git commit and whether it had uncommitted changes, and carries its own source, hidden in the file.
- `review-protection: none` in `stanza.yaml` exports documents without the protection for comments, so that reviewers in Word for the web can comment.
- Building no longer stops when one of the files is open in Word: that file is reported and the others are written.
- Inline code and code blocks in the Stanza editor keep the colours of the stylesheet in a dark theme, as the rest of the page does.

## 0.1.0

First public release, as an alpha pre-release.

- Visual editor for `*.stanza.md` documents, bound to the Markdown file.
- Style editor for a project's stylesheet ("Open With" → Stanza Styles).
- DOCX export into the project's `build/` folder on save, and "Open in Word".
- Stanza view in the Explorer with the project's documents and headings, and commands to keep the document list in order.
- New Project, New Document, Import Word Document and Adopt Markdown File commands.
- References between documents by block ID, with diagnostics and quick fixes.
- Project link schemes such as `jira://PROJ-123`.
- A document properties panel for title, authors, classification and custom metadata.
