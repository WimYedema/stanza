# Documentation index

Read the ADR for the topic you work on; later ADRs refine earlier ones, so read the whole chain named on a line. File names are `docs/documents/NNNN-*.stanza.md`. Other files: `docs/documents/architecture.stanza.md` (boundaries), `docs/documents/product-vision.stanza.md`, `docs/BACKLOG.md` (open work), `docs/BACKLOG_DONE.md` (history), `docs/documents/spike-findings.stanza.md`. The documents are Stanza documents (ADR 0064); this index and the backlog files are plain Markdown.

## Format and domain (`core`, `format`)

- 0001, 0005, 0024: the Markdown dialect, its normal form, IDs of new blocks.
- 0003, 0004: editor state versus domain model; the document model.
- 0048: tables with paragraphs and lists in cells (`stanza-table`).
- 0018: `stanza-toc` block. 0011: heading numbering. 0068: references inside a document.
- 0007: project file and metadata. 0020: assigning IDs.
- 0082: project link-scheme templates, offline URL resolution, editor and DOCX destinations.
- 0081: plain metadata values as semantic inline references, document format 2 and staged implementation.
- 0033, 0034: style property list; style labels.

## Stylesheet and pages (`core`, `format`, `css`)

- 0006: typed stylesheet (read first). 0035: comment-preserving text edits. 0059: banded table rows. 0065: colors and fonts only from tokens. 0074: move raw colors and fonts into tokens (`format --fix-stylesheet`, quick fix).
- 0016, 0017, 0019: page templates, header and footer slots, cover page.
- 0021: browser CSS.

## DOCX export (`export-docx`)

- 0008: mapping (read first). 0009: bookmarks. 0010, 0013: lists, blocks in list items. 0012: tables.
- 0030, 0085: review protection; 0085 makes it the setting `review-protection` (`comments` or `none`), since Word for the web cannot comment on a protected file.

## Word import (`import-docx`, `project`)

- 0043: scope. 0045: reading. 0046: tables and TOC. 0047: command. 0049: line breaks. 0060: adopting a Markdown file (same pipeline, other source).
- 0084: pulling review comments from a reviewed DOCX into a review document (`review pull`), the reviewed version and anchors for a margin view.

## Project and CLI (`project`, `cli`)

- 0002: host and dependencies. 0014: project package and CLI. 0015: format command. 0072: the list of documents (order, groups).
- 0042, 0044: new project, new document. 0052: style usage index. 0061: AGENTS.md for coding agents. 0064: the documentation as a Stanza project.
- 0076: agent editing workflow, selected-file checks and formatting, bounded validation diagnostics.
- 0077: reference filename hints, stale-path diagnostics and explicit fixes, Ctrl/Cmd-click navigation.
- 0078: shared project snapshots, staged document startup and local startup timings.
- 0079: document-list initialization and maintenance, outline moves and quick fixes.
- 0083: the rename from Phrase to Stanza, the `legacy-format` diagnostic and `stanza migrate`. In older ADRs, Phrase means Stanza.

## Editor (`editor`)

- 0022: schema and adapter (read first). 0023: commands and paste. 0026: style choice and variants. 0062: marks for changes from outside. 0063: opening at a line (Go to Line). 0069, 0070, 0071: making a reference (0070: by the text of headings only; 0071: typing @). 0073: references between documents. 0075: a link to a web address, the Link button.
- 0031: stanza blocks. 0029: heading depth rule.

## VS Code extension (`vscode`)

- 0025: custom editor (read first). 0032: export on save. 0056: cursor after external change.
- 0080: top-of-document properties, explicit/inherited/missing/system metadata, staged buffer edits and stale-draft checks.
- Document view: 0027 toolbar and keys, 0028 paper look, 0058 page layout findings (open), 0054 and 0055 style cards and state line, 0057 heading numbers and diagnostics.
- 0086: review comments beside their text, margin cards and markers, resolving from the editor.
- Style editor: 0036 shell, 0037 paragraph panel, 0038 groups, 0039 character styles, 0040 table styles, 0041 collapsible groups, 0050 theme, 0051 page templates, 0053 add and delete, 0066 token pickers, 0067 link to the token.
