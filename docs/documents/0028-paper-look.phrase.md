---
phrase-format: 1
title: "ADR 0028: The paper look in the editor"
---

<!-- phrase: #djwrnt21kb -->
# ADR 0028: The paper look in the editor

Status: Accepted

<!-- phrase: #wkyw85h6s0 -->
## Context

The editor showed the text on a white strip with fixed padding. People who come from Word expect a page, and the header, footer and cover of a template (ADR 0016, 0017, 0019) had no place in the editor at all. ARCHITECTURE.md says that editing is continuous and does not reproduce Word's pagination, and the vision does not ask for identical pages. This record adds the look of a page without changing that.

<!-- phrase: #507fg8kake -->
## Decision

<!-- phrase: #x47vcgnwtf -->
### A view, not a layout

The webview draws a sheet with the size and margins of the page template of the document, the header in the top margin, the footer in the bottom margin, and the cover as a sheet of its own above the body. The body is one sheet that grows with the text, so there are no page breaks and no pagination. Everything that is drawn comes from the stylesheet and the metadata and is not part of the document.

<!-- phrase: #v8vf7bx1v2 -->
### Which template and which values

The template is the one that the effective metadata names in `page-template`, or the default one when it names none or one that does not exist (which validation reports as `unknown-page-template`). The effective metadata is the document's own with the defaults of the project applied (`applyDefaults`, now taking only the defaults). The host sends the defaults with `init` and again, as `defaults`, when they change, so the webview does not read the project file.

Values are those of the exporter: `slotValue`, `slotText` and `coverBlocks` moved from the DOCX adapter to `core` so that both use them. A token with no value shows its label. A cover paragraph, row or table that would be empty is left out, as in the export.

- `section` shows the first level 1 heading with its number (`1 Introduction`). Word shows the heading of the page, so with more pages the footer would differ.
- `page` and `pages` are Word fields. They show their label, the text that Word shows before it updates the field, with a dotted underline and a title that says so. They are never computed here.
- A header or footer whose three slots are empty is not drawn, as in the export.

<!-- phrase: #60s9jk1jan -->
### The page

The sheet has the width, minimum height and padding of the template, in points, written as rules of a style element with the nonce, so the content security policy stays as it is. The header and footer sit at 1.25 cm from the edge of the page, as in the export (ADR 0016), or at half the margin when the margin is smaller. Their text carries the class of the paragraph style of the header or footer, so it looks like the output. The cover has no header or footer, like the cover section of the export.

The cover, header and footer are not editable. They belong to the template and the metadata, which are edited elsewhere.

<!-- phrase: #mtv2wq7qk8 -->
### The view controls

Two controls at the right of the toolbar: **Sheet** switches between the sheet and the plain page of before (no margins, header, footer or cover), and the zoom has the steps 50, 75, 100, 125, 150 and 200 percent. Zoom uses the CSS `zoom` property, so the layout follows. 100% is the real size of the paper at 96 dpi. The choice is kept with the state of the webview (`setState`), so it comes back when the editor is shown again. The default is the sheet at 100%.

<!-- phrase: #cnasccrewe -->
## Consequences

- A person sees where the header, footer and cover go, with real values, before building a DOCX.
- The footer of a long document sits at the end of the one sheet, and a header only at the top. People who look for page breaks will not find them. Approximate break guides are a separate item, after a spike.
- The sheet is wider than a narrow editor pane at 100%; the page scrolls sideways, or the zoom is lowered.
- CSS `zoom` needs the standardised behaviour of Chromium 128 and later for clicks to land where they are drawn. Older versions of VS Code may place the cursor wrongly at a zoom other than 100%.
- A template with a header taller than its margin overlaps the text. Word would push the text down. This is not handled.

<!-- phrase: #dkzwedr291 -->
## Alternatives considered

- **Pagination with page breaks.** Not asked for, and it needs a layout step with estimates that look more precise than they are. A spike comes first.
- **`transform: scale` for zoom.** Keeps old Chromium versions right but leaves the layout box at full size, so the page needs extra sizing.
- **Computing `page` and `pages`.** A wrong number that looks sure is worse than a placeholder that is marked.
- **Reading the project file in the webview.** The host already reads the project, and the webview has no file access.
