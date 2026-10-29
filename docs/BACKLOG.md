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

## Phase 3: Pipeline (CLI, no editor)

19. [M] - Heading numbering: hierarchical decimal numbers computed in `core` from a `numbered` style property, written as literal text in the DOCX export.
20. [M] - DOCX: tables. Also write styles as XML through `externalStyles` (table styles need it), and use that to put `page-break-before` into paragraph styles, replacing the per-paragraph workaround of ADR 0008 (new ADR, since 0008 is accepted).
21. [S] - DOCX: code blocks inside list items (continuation indent).
22. [S] - Table column widths: autofit by default, optional relative weights attribute, in the dialect and the exporters.
23. [M] - DOCX: images and captions.
24. [M] - Page templates, header and footer slots with tokens (including classification), page numbers.
25. [M] - Cover page: a page template whose slots are filled from document metadata (title, document class lines, metadata table, classification), with the body starting on a new page by template rule.
26. [M] - Table of contents block with depth: entries as linked paragraphs, page numbers as page-number fields marked for update (Word prompts on open), or no page numbers.
27. [S] - CLI: validate and build commands, reproducible output (dates from metadata or release).
28. [S] - CLI: format command that rewrites a file to canonical form, and a check that reports non-canonical files.
29. [S] - GitHub Actions workflow running build, test, and lint on pull requests. Low priority: local checks are sufficient for now.
30. [S] - Build info: version, date, and revision from Git (tag, commit date, draft marker), with overrides from the project file and CLI flags, feeding the header and cover tokens. Low priority: tokens stay empty until then.

## Phase 4: Collections and references

31. [M] - Project model: multiple documents, shared stylesheet, document order.
32. [M] - Reference index: resolve, find incoming, find broken. Cross-document references with computed display text.
33. [M] - Numbering across a project (headings, figures, tables, appendices).

## Phase 5: Editor and review

34. [S] - Compile the typed stylesheet to scoped browser CSS.
35. [L] - Tiptap schema and editor adapter: semantic commands, paste normalisation, no direct formatting.
36. [S] - Unique-ID handling for new nodes in the editor.
37. [M] - VS Code custom text editor hosting the editor in a webview, bound to the Markdown file.
38. [S] - Style picker and the "variant missing" diagnostic with an explicit option to configure it.
39. [L] - Import Word comments anchored by bookmark IDs. Report comments whose anchor no longer exists.
40. [M] - Show imported comments next to the content in the editor.

## Later

41. [L] - PDF adapter (ADR first; Typst is the leading candidate).
42. [S] - Semantic change summary by stable ID.
43. [M] - Glossary of referenceable terms.
44. [M] - Landscape sections.
45. [S] - Table of figures and tables.
46. [M] - Minimal bibliography with a fixed citation style.
47. [M] - Browser host (VS Code web or standalone) behind the storage port.
