---
phrase-format: 1
title: "ADR 0058: Page layout in the editor, spike findings"
---

<!-- phrase: #esvdn7cfpc -->
# ADR 0058: Page layout in the editor, spike findings

Status: Proposed. The findings stand; whether and how to show pages is undecided.

<!-- phrase: #98kg70vm27 -->
## Context

ADR 0028 draws one sheet without page breaks and leaves approximate guides to a spike. The spike compared the page Word gives each paragraph (Word through COM, `Range.Information`) for two real documents (17 and 40 pages) with a model on block heights measured in the editor.

<!-- phrase: #63gxtmdvj3 -->
## Findings

- The editor is 13% too short per line: CSS `line-height: 1.15` multiplies the font size (12.65 pt), Word's "multiple" multiplies the font's natural line height (Calibri about 1.22, so 15.4 pt). With that fixed, distances between paragraphs and list items match Word to 0.1 pt.
- Table rows are 2.5 to 4 pt taller than in Word; the cause is not found.
- Model (pairs of lines stay together, headings keep with the next block, rows do not split), line height fixed: 17 of 17 pages and 91% of blocks on the right page for the first document; 42 of 40 and 49% for the table-heavy one. With rows trimmed by 3.5 pt (fitted on these two): 40 of 40, 87%, all blocks within one page.
- Started from Word's own page start, a model break falls within one block of Word's in most cases, and within six in the table-heavy document.
- paged.js 0.4.3 threw `Cannot read properties of null (reading 'getAttribute')` in 18 of 20 runs on the editor's markup, also cleaned to plain HTML. Its one clean run gave 18 pages for 17 and 52% of blocks on the right page. Rejected.

<!-- phrase: #pr2gkv6png -->
## Open decision

A paged view is nice for the feel of the end result (header, footer), but it invites a layout focus that does not help writing. It is left undecided, on the backlog under Later. The options, with what the spike says:

- **Guides over the one sheet.** A pure function in `core` takes the measured geometry of the blocks, the keep rules of their styles and the text height of the page template, and returns where pages start. The webview draws dashed "Page N, approximate" lines. Content and layout do not change.
- **A read-only layout view**, made on request or after a pause in editing, with header and footer on every page. It is a one-way render that can split paragraphs freely, so the editor needs no link between two models. It overlaps with "Open in Word", which gives the real layout.
- **Spacer widgets in the editor.** An inline widget with `display: block` can draw footer, gap and header in the middle of a paragraph without changing the model. Untested; the cursor and hit-testing at the gap are the risks.

Rejected: splitting paragraphs in the editor's model (every consumer of the 1:1 block mapping would have to change, and a split moves the break it was made for), and paged.js.

The line height and table row findings hold for any option and also bring the sheet closer to Word.

<!-- phrase: #a0c5w4zjyr -->
## Consequences

- Any page view is approximate: another font moves the breaks, and it never reaches the DOCX.
- No measuring tooling is kept; Word's COM interface repeats it.
