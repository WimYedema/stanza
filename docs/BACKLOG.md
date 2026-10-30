# Backlog

Prioritized, highest first. Format: `N. [size] - description`.

Sizes are relative effort: XS, S, M, L, XL. They are not time estimates.

## Done

1. [S] - Choose one or two real Word documents as the spike corpus (typical content, with a TOC, tables, and figures). Keep them out of the repository if they are confidential.
2. [S] - Measure the corpus: which named styles are used and how much direct formatting exists in the DOCX XML.
3. [M] - Convert the corpus to Markdown plus an extracted stylesheet, and render it back to DOCX with named styles. Inspect the result in Word. Throwaway tooling, not a product feature.
4. [XS] - Test how Word treats a generated TOC field, with and without page numbers, including the field-update prompt.
5. [S] - Write up the spike findings and revise the vision and publication constraints accordingly.
6. [S] - ADR: native Markdown dialect (IDs, style attributes, deterministic serialization rules, one sentence per line or not, table column widths with autofit as default and optional relative weights, blocks nested in list items).
7. [S] - ADR: host environment (VS Code extension first, browser later) and dependency policy, including whether Pandoc is allowed in the product.
8. [S] - ADR: editor state versus domain model (convert at save and load). Update the architecture document: Markdown storage, remove the Tiptap conversion idea, add the VS Code host.
9. [S] - Repository scaffold: strict TypeScript, test runner, lint, and a package boundary so the domain imports nothing else.
10. [M] - Domain document model, Markdown parser and serializer, deterministic round-trip tests.
11. [S] - Tooling to assign missing IDs without changing unrelated content.
12. [M] - Typed stylesheet: named paragraph, character, and table styles, inheritance, contextual variants, user-defined character styles, cycle and missing-base diagnostics.
13. [S] - Validation and diagnostics model: unknown style, missing variant, unsupported or direct formatting, broken reference.
14. [S] - Metadata model: document metadata as YAML front matter and shared settings in a project file, validated.
15. [S] - Verify the `docx` library covers our needs: table styles, autofit and relative column widths, repeated header rows, TOC cached entries, bookmark names. Escalate if it falls short.
16. [L] - DOCX adapter, first slice: paragraphs, headings, strong, emphasis, code, links, named styles, structural tests.
17. [S] - DOCX: bookmarks named after node IDs on referenceable nodes.
18. [M] - DOCX: lists (bulleted and numbered, nested, several paragraphs per item) with fixed Word numbering definitions generated from the list styles.
19. [M] - Heading numbering: hierarchical decimal numbers computed in `core` from a `numbered` style property, written as literal text in the DOCX export.
20. [M] - DOCX: tables, with table styles written as XML and `page-break-before` written into paragraph styles.
22. [S] - Table column widths: autofit by default, optional relative weights attribute, in the dialect and the exporters. The dialect half was done with item 10; the exporter half was done with item 20.
21. [S] - DOCX: code blocks and tables inside list items (continuation indent, table indent and width).
26. [S] - CLI: validate and build commands, reproducible output (dates from metadata or release). The date comes from `--date`, with a fixed placeholder until the build info item.
27. [S] - CLI: format command that rewrites a file to canonical form, and a check that reports non-canonical files.
23. [M] - Page templates: named templates in the stylesheet with page size (A4 or Letter) and margins, selected by a document's `page-template` front matter entry or the project default, and the page geometry of the export taken from the template.
49. [M] - Header and footer slots for page templates: left, centre and right text with tokens (title, version, classification, page, pages, section) written as `phrase:` links, page numbers as Word fields.
25. [M] - Table of contents block with depth: entries as linked paragraphs, page numbers as page-number fields marked for update (Word prompts on open), or no page numbers.
24. [M] - Cover page: a page template whose slots are filled from document metadata (title, document class lines, metadata table, classification), with the body starting on a new page by template rule.

## Phase 3: Pipeline (CLI, no editor)

48. [S] - CLI: assign missing IDs, as an option of `format` (`--assign-ids`) that formats first and then gives every referenceable block without an ID a new one, unique across the project. With `--check`, a missing ID counts as a change. ADR 0015 leaves flag versus separate command open; this item decides it.
28. [S] - GitHub Actions workflow running build, test, and lint on pull requests. Low priority: local checks are sufficient for now.
29. [S] - Build info: version, date, and revision from Git (tag, commit date, draft marker), with overrides from the project file and CLI flags, feeding the header and cover tokens. Low priority: tokens stay empty until then.

## Phase 4: Collections and references

30. [M] - Project model: multiple documents, shared stylesheet, document order.
31. [M] - Reference index: resolve, find incoming, find broken. Cross-document references with computed display text.
32. [M] - Numbering across a project (headings, figures, tables, appendices).

## Phase 5: Editor and review

33. [S] - Compile the typed stylesheet to scoped browser CSS.
34. [L] - Tiptap schema and editor adapter: semantic commands, paste normalisation, no direct formatting.
35. [S] - Unique-ID handling for new nodes in the editor.
36. [M] - VS Code custom text editor hosting the editor in a webview, bound to the Markdown file.
37. [S] - Style picker and the "variant missing" diagnostic with an explicit option to configure it.
38. [L] - Import Word comments anchored by bookmark IDs. Report comments whose anchor no longer exists.
39. [M] - Show imported comments next to the content in the editor.

## Later

40. [L] - PDF adapter (ADR first; Typst is the leading candidate).
41. [S] - Semantic change summary by stable ID.
42. [M] - Glossary of referenceable terms.
43. [M] - Landscape sections.
44. [L] - Images, captions, and boxes: figures with captions, and boxes (framed or call-out blocks, such as the cover title of ADR 0006) with placement. Needs a design discussion first: box placement and floating content are outside the vision today, so a vision update and an ADR come before any code.
45. [S] - Table of figures and tables.
46. [M] - Minimal bibliography with a fixed citation style.
47. [M] - Browser host (VS Code web or standalone) behind the storage port.
