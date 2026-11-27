# Backlog: done

One line per finished item, in completion order. Detail is in the ADR named on the line, or in Git history. Do not load this file unless you need the history.

1. [S] - Spike corpus chosen (kept out of the repository).
2. [S] - Corpus measured: styles used, direct formatting in the DOCX XML.
3. [M] - Corpus converted to Markdown plus stylesheet and rendered back to DOCX (throwaway tooling).
4. [XS] - Word's treatment of a generated TOC field tested.
5. [S] - Spike findings written up (`SPIKE_FINDINGS.md`).
6. [S] - ADR 0001: Markdown dialect.
7. [S] - ADR 0002: host environment and dependency policy.
8. [S] - ADR 0003: editor state versus domain model.
9. [S] - Repository scaffold: strict TypeScript, tests, lint, package boundaries.
10. [M] - Domain model, Markdown parser and serializer, round-trip tests (ADR 0004, 0005).
11. [S] - Tooling to assign missing IDs.
12. [M] - Typed stylesheet with inheritance, variants, diagnostics (ADR 0006).
13. [S] - Validation and diagnostics model.
14. [S] - Metadata model: front matter and project file (ADR 0007).
15. [S] - `docx` library coverage verified.
16. [L] - DOCX adapter, first slice (ADR 0008).
17. [S] - DOCX bookmarks named after node IDs (ADR 0009).
18. [M] - DOCX lists (ADR 0010).
19. [M] - Heading numbering (ADR 0011).
20. [M] - DOCX tables (ADR 0012).
22. [S] - Table column widths: autofit and relative weights.
21. [S] - DOCX: code blocks and tables in list items (ADR 0013).
26. [S] - CLI: validate and build (ADR 0014).
27. [S] - CLI: format command and check (ADR 0015).
23. [M] - Page templates (ADR 0016).
49. [M] - Header and footer slots (ADR 0017).
25. [M] - Table of contents block (ADR 0018).
24. [M] - Cover page (ADR 0019).
48. [S] - CLI: `format --assign-ids` (ADR 0020).
33. [S] - Stylesheet compiled to scoped browser CSS (ADR 0021).
34. [L] - Editor schema and adapter, `editor` package (ADR 0022).
50. [M] - Editor semantic commands and paste normalisation (ADR 0023).
35. [S] - Unique IDs for new nodes in the editor (ADR 0024).
36. [M] - VS Code custom text editor with webview (ADR 0025).
37. [M] - Style picker and the variant-missing diagnostic with explicit configure option (ADR 0026).
52. [M] - Editor toolbar and shortcuts (ADR 0027).
55. [S] - Paper look: sheet at page size, header and footer in margins (ADR 0028).
56. [M] - Toolbar v2: groups, kind-and-style list, heading depth rule (ADR 0029).
64. [S] - DOCX review protection, comments only (ADR 0030).
66. [S] - Phrase blocks shown plainly in the editor (ADR 0031).
65. [S] - Export on save, setting `phrase.exportOnSave` (ADR 0032).
57. [S] - Style property list in `core` as single source (ADR 0033).
58. [S] - Style `label` (ADR 0034).
59. [M] - Comment-preserving stylesheet text edits (ADR 0035).
67. [M] - Style editor shell (ADR 0036).
68. [L] - Style editor paragraph panel (ADR 0037).
69. [S] - Style editor groups by family (ADR 0038).
70. [S] - Style editor character styles and custom paragraph styles (ADR 0039).
71. [M] - Style editor table styles (ADR 0040).
75. [S] - Style editor collapsible groups (ADR 0041).
80. [M] - "Phrase: New Project" (ADR 0042).
85. [S] - "Phrase: Open in Word".
81. [S] - "Phrase: New Document" (ADR 0044).
82. [L] - Word import, text content (ADR 0043, 0045).
83. [M] - Word import, tables and TOC (ADR 0046).
84. [S] - Word import, CLI and VS Code commands (ADR 0047).
86. [M] - Rich table cells, model (ADR 0048).
87. [M] - Rich table cells, format (ADR 0048).
88. [M] - Rich table cells, DOCX (ADR 0048).
90. [S] - Word import keeps paragraphs and lists in cells (ADR 0048).
96. [S] - Gap cursor before and after a first or last table.
97. [S] - Word import: double line breaks end a paragraph (ADR 0049).
72. [S] - Style editor, theme panel (ADR 0050).
73. [M] - Style editor, page templates (ADR 0051).
61. [M] - Style usage index in `project` (ADR 0052).
74. [M] - Style editor, add and delete styles (ADR 0053).
62. [S] - Style definition and usage in the document view (ADR 0054).
104. [S] - State line and style line merged (ADR 0055).
54. [S] - Cursor after undo and redo (ADR 0056).
51. [S] - Heading numbers and inline diagnostics in the editor (ADR 0057).
89. [M] - Rich table cells, editor (ADR 0048).
105. [L] - Context diet: shorter instructions, `BACKLOG_DONE.md`, `docs/INDEX.md`, package READMEs, spikes removed, two files split. ADR archiving and test trimming judged not worthwhile.
63. [M] - Spike: page break guides. Findings in ADR 0058; paged.js rejected; whether to show pages is left open as item 108.
98. [M] - Banded table rows (ADR 0059): `banded-rows` with `odd` and `even` in a table style, in the CSS, in a Word table style band and in the style editor.
94. [M] - Adopting a Markdown file as a Phrase document (ADR 0060): `phrase adopt` and "Phrase: Adopt Markdown File" write a new `.phrase.md` with front matter, IDs and canonical form, never over the original, and report what the dialect cannot hold.
110. [S] - Go to heading: "Phrase: Go to Heading" (`Ctrl+Shift+O` in the document editor) lists the headings with their numbers and scrolls the editor to the chosen one, under the bar at the top.
109. [S] - Find in the document editor: the find widget of VS Code is switched on for the webview (`Ctrl+F`), tried by the product owner in VS Code.
111. [M] - Phrase tree view in the Explorer: project, documents, headings with numbers, from the loaded project so that several documents work; a click opens the document at that heading, also when its editor is not open yet.
112. [S] - Agent instructions (ADR 0061): "Phrase: New Project" writes `AGENTS.md` into the project when there is none, and "Phrase: Add Agent Instructions" does so for an existing project; it states the rules of the dialect and the loop of `phrase format` and `phrase validate`, and never replaces a file.
113. [M] - Show what an agent changed (ADR 0062): blocks that are new or different after a change from outside are tinted until dismissed, with a bar that counts them, steps to the next one and dismisses; undo and redo are not marked.
114. [S] - Chat links and the Problems panel (ADR 0063): VS Code gives a custom editor no line when a file is opened from a link, so the link cannot scroll the Phrase editor. "Phrase: Go to Line" (`Ctrl+G` in the editor) takes a line or a pasted link such as `notes.phrase.md#L42` and scrolls to its block.
95. [S] - The documentation of this repository is a Phrase project (ADR 0064): `docs/` has `phrase.yaml`, its own stylesheet and `documents/` with the vision, the architecture, the spike findings and all ADRs, adopted with `phrase adopt` (no words lost); `npm run docs:check` is part of `npm run check`.
77. [M] - Colors and fonts only from theme tokens (ADR 0065): a hex color or a family list in a style is the error `raw-color` or `raw-font`, which names the token to use; the default stylesheet, the example project and `docs/` moved their raw values into tokens.
78. [S] - Style editor, theme values in the panel (ADR 0066): colors and fonts, also the color of a border, are picked from a list of the theme tokens with a swatch or a font sample; the row says "Theme: mono"; a value that is not a token shows as "Custom" with a warning; a note says the values come from the theme. Replaces the text fields and datalists of item 68.
79. [S] - Style editor, link to the theme (ADR 0067): a color or font row has an arrow that selects its token, the one set or the one from a base, in the Theme tab.
116. [M] - In-document references, ADR and core (ADR 0068): a reference is a link to `#<id>`; `indexReferences`, `resolveReference`, `findIncoming` and `findBroken` in `core`; the error `broken-reference`. The DOCX hyperlink is item 117.
117. [S] - References in DOCX (ADR 0009, ADR 0068): a link to `#<id>` is an internal hyperlink to the bookmark `phrase_<id>`, in paragraphs, headings, list items and table cells; a link to a block that is not there does not export.
118. [M] - Editor, make a reference (ADR 0069, ADR 0070): the command `set-reference`, the pure `suggestReferences` (the best match for the selected text first, by the text of the headings alone), a list of headings in the editor from a toolbar button, `Ctrl+Shift+K`, the palette and the context menu. With nothing selected it inserts the text of the heading.
120. [S] - Editor, typing shorthand (ADR 0071): typing `@` at the start of a block or after a space opens the list of headings, and choosing one replaces the `@` by a reference in one step. `@` inside a word is only text; Escape leaves the `@`. Only an editor shorthand; the file holds the ordinary link.
30. [M] - Project model (ADR 0072): an optional `documents` outline in `phrase.yaml` with order and groups, `outlinePaths` in `core`, `listed` and `outline` on the loaded project, errors for missing or repeated documents, a warning for a document the list leaves out (checked, not built), and the groups and order in the Phrase view. One stylesheet and unique IDs across the project were there already.
31. [M] - Cross-document references (ADR 0073): a reference to a block of another document is the same `#id` link, checked against the IDs of the whole project (`projectIds`, the loader reads all documents first); `indexProjectReferences`, `resolveProjectReference`, `findProjectIncoming` and `findProjectBroken` in `core`; in DOCX a link to the file of that document at the bookmark, with a warning when that document is not built. Text stays as written (item 122).
128. [S] - Stylesheets from before ADR 0065 (ADR 0074): `moveValuesToTokens` in `format` moves raw colors and fonts of styles into tokens with comment-preserving edits, `phrase format --fix-stylesheet [--check]`, a hint in `validate` and `build`, and a quick fix `use-tokens` on the stylesheet in VS Code. Found when a project used the old default.
129. [S] - Editor, make a link to a web address (ADR 0075): a "Link" toolbar button with a field for the address (`https`, `mailto` or `#id`), shown with the address of the link at the cursor, which it changes as a whole; an empty field takes the link off. `set-link` accepts a cursor in a link; `getLinkHref` on the editor. No shortcut yet. Added at the request of the product owner.
188. [M] - Agent editing workflow (ADR 0076): documented local CLI setup; repeated `--file` selection for validation and formatting with project-wide ID/reference context and ID-safe assignment; `validate --max-diagnostics` bounds displayed findings without hiding totals or failures; available fix suggestions; generated instructions clarify IDs, links and syntax and prescribe coherent-batch checks without unrelated repairs. Existing `AGENTS.md` files are preserved.
190. [M] - Faster document startup (ADR 0078): shared versioned project snapshots and in-flight loads across editors, navigation, diagnostics and the tree; one parse per document per project load; locally checked read-only previews before project-wide checks finish; editing gated on complete project IDs; unsaved/file-event invalidation and stale-load rejection; local painted visible/editable startup timings.
123. [S] - Document-list maintenance (ADR 0079): explicit initialization from discovery; new/imported/adopted documents appended to existing outlines; comment-preserving project-buffer edits; quick fixes for unlisted/missing documents with confirmed removal; document context actions to reorder within groups and move to existing nested groups or the project root, without moving files or changing block IDs.
187. [M] - Document metadata editor (ADR 0080): collapsible top-of-document properties; explicit, inherited, missing and read-only system/generated values; text/list custom fields with declaration diagnostics; staged Apply/Cancel, guarded undoable unsaved-buffer edits, preserved body/IDs/selection and explicit stale-draft handling; no new persisted format or build-info generation.
146. [S] - Document metadata values in body text, design (ADR 0081): plain-text inline metadata references, explicit missing-value diagnostics, format-2 compatibility and migration; staged implementation in items 199 and 200.
179. [S] - Project link schemes (ADR 0082): typed `link-schemes` HTTP(S) templates, shared offline resolution and actionable diagnostics; editor commands, paste, live rendered destinations and Ctrl/Cmd-click; deterministic DOCX relationships while retaining authored short links and existing format-1 content.
202. [M] - Rename to Stanza (ADR 0083): packages, CLI, extension and persisted names; `legacy-format` for Phrase files; `stanza migrate [--check]` renames and rewrites a project with IDs unchanged; `docs/` migrated with it. Added at the request of the product owner.
28. [S] - GitHub Actions workflow `.github/workflows/check.yml`: `npm ci` and `npm run check` on Node 22 for pull requests and pushes to master.
138. [M] - Revision stamp in the DOCX (ADR 0084, "The stamp"): custom properties `stanza-document`, `stanza-commit`, `stanza-dirty` and `stanza-content-hash` (SHA-256 in `core` over the source with normalised line endings), and the source embedded as a custom XML part; revisions from `git` in the CLI and from VS Code's Git on export on save, through a `SourceRevisions` port in `project`.
140. [L] - `stanza review pull` and "Stanza: Pull Review Comments" (ADR 0084): a new review document in `reviews/` with a `reviews` field, one heading per thread linked to its block with position, quote, status, replies and reactions, display names only; the reviewed version from the embedded source or Git, with untracked edits found by exporting it again and tracked changes reported, never applied; `stanza review inspect` shows the same without writing.
212. [S] - A locked output file does not stop a build: `buildProject` reports a file it cannot write (`output-not-written`, naming Word when the file is open elsewhere) and writes the others; the CLI says how many were written and exits with 1.
211. [S] - Protection by destination (ADR 0085, refining ADR 0030): `review-protection: comments | none` in the project file and `stanza build --protection`, followed by build, export on save and Open in Word; with `none` the pull of ADR 0084 reports every change to the text.
141. [L] - Review comments in the editor (ADR 0086): the threads of every review document of the open document, placed by anchor, quote and position and highlighted; margin cards beside the sheet at their text, numbered markers with a popover when the desk is narrow, linked both ways; changed-text and orphaned threads shown as such; a toolbar toggle for resolved threads; Open in review; Resolve and Reopen as an undoable edit of the status line that always saves, asking first when the review document has unsaved changes, and refused when the thread changed.
139. [S] - `stanza review push` and "Stanza: Push for Review" (ADR 0088): build one document and write it to a review folder or a `.docx` path outside the project, replacing the file there so that its link and history stay, unless it was saved in Word since it was pushed and that save was not pulled, or it is of another document; `--force` replaces anyway and `--new` writes a new file named with the day. VS Code remembers the folder per document and asks before replacing. In the Stanza editor, a review group in the toolbar pushes to the remembered folder and pulls from the file pushed there, with a status of the round (new comments, changed since push) from a watcher of that file. The `exchange` area follows as item 217.
214. [S] - Review comments with their formatting (ADR 0084): `readReview` reads the paragraphs of a comment with bold, italic, code and links as the import reads a paragraph, with the links of the comments part; a `mailto:` link, as a mention is, keeps only its text. `review pull` writes them so; the editor reads a comment label only by the time forms of ADR 0084, so a comment paragraph that starts in bold is not taken for a new comment, and an author is no longer cut at the comma of "time zone unknown".
203. [S] - Spike, the review round trip in Word and SharePoint: three rounds on 2026-11-21 and 2026-11-22 with a personal account (section "Review round trip in Word" of `spike-findings`, fixtures in `packages/import-docx/fixtures/review-round-trip/`): bookmarks survive desktop Word and Word for the web, how comment ranges, replies, resolved state and mentions are stored, Word for the web cannot comment on a protected file (ADR 0085), custom file properties and a custom XML part survive. Informed items 138 and 140. Closed on 2026-11-25; the checks left are item 233.
221. [M] - Cover in rows (ADR 0089, refining ADR 0019): a page template's `cover` can be `rows` with heights in points, shares (`fr`) or growing, a vertical alignment and content; image entries (PNG/JPEG from the project, width, paragraph style, aspect ratio kept, decorative); cover margins of its own. Exported as one borderless layout table with exact row heights and a 1 pt section end; images read by the project at load, with errors for missing or unsupported files and warnings for images too wide or too tall. The list form is unchanged. Example projects in `examples/` (corporate-report, classic-cover, plain-memo), built by the tests. Done 2026-11-25.
232. [S] - Title block (ADR 0090): a page template's `title-block`, a list of cover entries (paragraphs, tables, images) written at the start of the body before its content and table of contents, with or without a cover; image width limited to the body text; shown at the top of the page sheet in the editor. The image diagnostics are renamed `image-*`. The `plain-memo` example shows it. Done 2026-11-25.
222. [M] - Cover preview in the editor: the cover sheet draws rows with the exported heights, their alignment, the cover margins and the images; the title block shows its images too. The host sends the images the project read as data URLs (`images` message) after `init` and when they change, and watches PNG and JPEG files; a missing image shows as its path. Done 2026-11-25.
193. [M] - Cover and title block in the style editor (ADR 0091, refining ADR 0051): the Pages panel edits the kind of cover (none, list, rows), the cover margins, rows (height, alignment, move, remove) and entries (paragraph, table, image from the project's PNG and JPEG files), and the title block; each change writes the whole block again with `coverSource`/`entriesSource` and the new edit `setBlock`. The desk previews the cover and title block with sample metadata. `unsetProperty` no longer removes a comment that follows a block list. Done 2026-11-25.
224. [S] - Spike, cover corpus: the 19 covers of Word's gallery (with Element and Insight) rendered and classified in `spike-findings` ("Cover corpus"). The rows of ADR 0089 place the text of all; columns and colors (225, 226) reproduce 11 and approximate 8; a background image (227) brings it to 18. Rules are thin rows or columns with a color; rotated text, several tables and a second cover page are not needed, so item 231 became the diagnostic for text that does not fit. The imec template is still to be checked. Done 2026-11-25.
225. [M] - Cover columns and areas (ADR 0092): a cover with `areas` is a grid of `columns` (points or `fr`) and `rows`, with named rectangular areas as in CSS grid template areas and their content in `area`; exported as the layout table with `gridSpan` and `vMerge`, drawn as a CSS grid in the editor and the style editor (where it is shown, and edited in the text until item 230). A cover of rows is a grid of one column. Image warnings use the size of the area. The `technical-note` example shows it. Done 2026-11-25.
226. [S] - Cover area backgrounds (ADR 0093): a `background` color token on a cover row and on a grid area, written as cell shading and drawn in the previews; a thin row or column with a color is a rule; with cover margins of 0 bands run to the page edges. The Pages panel sets the background of a row. The `banded-cover` example and the strip of `technical-note` show it. Done 2026-11-26.
223. [M] - Import a cover from a Word template (ADR 0094): `stanza import cover <file> [project] [--name]` adds a page template with the page of the template and its first page as a cover grid: the first-page header and footer, layout tables as columns, frames at their place, rules from paragraph borders, tables with borders as cover tables, placeholders in brackets and bound content controls as tokens, a sensitivity-label text box as the classification; plus the paragraph and table styles, color and font tokens and images it needs, with a report. Checked against a real technical report template (not in the repository); tests use a made-up look-alike built by the tests. Done 2026-11-26.
216. [M] - Header and footer grids (ADR 0095): a header or footer can be a grid of areas with entries (paragraphs with tokens and the page fields, tables, images) in place of its three slots, with rows that grow or have points, and both forms have a `distance` from the edge. Written as the layout table of the cover with a 1 pt end paragraph; pictures in headers and footers are numbered and decorative. Previewed in the band at its distance; the Pages panel sets the distance. A template revision is the `version` token or a field, not `REVNUM`. The `technical-note` example shows it. Done 2026-11-26.
234. [S] - Import the header and footer of a template (ADR 0094, ADR 0095): `stanza import cover` also brings the default header and footer of the body pages as grids at the distances of the template; tabs and positional tabs part a line into columns; Word fields become tokens (page fields, REVNUM as the version, dates as `date`, document properties); labels are names of values, not the template's own values. Checked against the real technical report template: cover and body pages match its layout. Done 2026-11-26.
235. [S] - Example `imported-report`: a project whose cover, body header and footer come from a made-up Word template with `stanza import cover`; a test checks that importing the template into its base stylesheet gives its stylesheet exactly. It showed that a cover table had no room for its cell padding; the import now counts it. Done 2026-11-26.
230. [M] - Grid editing in the style editor (ADR 0096): the Pages panel edits a cover grid and a header or footer grid (kind, columns and rows, areas with name, alignment, background and entries), and the preview draws the cells, where a drag makes an area, adds cells to one or clears them; the grid changes are functions of `core`, and `headerFooterSource` writes a header or footer. The panel now draws itself again after every change, keeping the focus, which fixes a second change undoing the first. The cover background image stays with item 227. Done 2026-11-27.
227. [S] - Cover background image (ADR 0097): `background-image` on a cover of rows or a grid, a PNG or JPEG stretched to the whole cover page behind everything; a warning when its proportions differ from the page's by more than 2%. In Word a page-anchored picture behind the text, in the paragraph that ends the cover section, so it takes no line. Shown in the preview and the editor, set in the style editor. Example `background-cover`. Done 2026-11-27.
