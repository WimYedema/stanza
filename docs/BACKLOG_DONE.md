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
