---
stanza-format: 1
title: "ADR 0008: DOCX export mapping"
---

<!-- stanza: #68jaj6yfhm -->
# ADR 0008: DOCX export mapping

Status: Accepted

<!-- stanza: #dape2247tj -->
## Context

The stylesheet (ADR 0006) decides appearance, and the document carries only style names and semantic marks (ADR 0004). The DOCX exporter has to turn that into named Word styles, in line with ADR 0002. Word differs from the stylesheet in three ways that need decisions: it has no per-paragraph-style variants of a mark, a run can have only one character style, and bold and italic are toggle properties that Word combines with an exclusive or across a paragraph style and a character style. The spike with the `docx` library (docs/SPIKE_FINDINGS.md) showed what the library covers.

<!-- stanza: #12n91qkh5a -->
## Decision

<!-- stanza: #x6c5j6rccw -->
### Package

`packages/export-docx` (`@phrase/export-docx`) imports `@phrase/core` and `docx` only and uses no Node built-ins, so it can run in a browser host. `exportDocx(document, stylesheet, options)` returns `{ bytes, diagnostics }`. It validates the stylesheet and the document itself and returns no bytes when there are errors. Content the exporter does not support yet (lists, tables, `phrase` blocks) is an error with code `docx-unsupported-block`.

<!-- stanza: #t3rnxc65pc -->
### Word style IDs

`body` becomes `Normal` and `heading-N` becomes `HeadingN`, with Word's built-in names (`heading 1`), so outline and table-of-contents features work. Every other name becomes PascalCase, with the kebab-case name written in title case as the display name. Two names that map to the same ID are an error (`style-id-collision`).

<!-- stanza: #ebb6hqja0q -->
### Styles

Each style is written with its own properties and `w:basedOn`, not the flattened result, so the cascade in Word matches the stylesheet. All declared paragraph and character styles are written, used or not.

<!-- stanza: #7a8sf3tsam -->
### Marks

For each combination actually used of paragraph style, marks and character styles, the exporter generates one character style. Its ID is the paragraph style's ID followed by the names of the marks and character styles in canonical order, such as `Heading1Emphasis` or `NormalStrongEmphasis`. It holds only the text properties that differ from the paragraph style's own, as resolved by `resolveTextProps`. A run with no differences gets no character style. Runs never carry direct formatting, with the exception below.

<!-- stanza: #mbrk3fs6xk -->
### Toggle properties

Writing only differences avoids the exclusive-or in nearly all cases. The one case it cannot express is a variant that switches bold or italic off in a style that has it on. For that case the run gets an explicit run property. The code is in one function, with a test, so the workaround stays visible and can be removed if the model changes.

<!-- stanza: #3hqf26p97f -->
### Property mapping

Sizes become half-points and spacing becomes twips. `multiple` line spacing becomes the `auto` rule at 240 times the factor. Color tokens resolve to hex, and the first font family is used. `highlight` and paragraph `background` become shading, because Word's highlight has only sixteen named colors.

`page-break-before` is the exception to "properties live in styles": the library cannot write it into a style, so the paragraphs of a style that sets it carry it. This is the second place where the output has explicit properties, and like the first it is a single mapping with a test.

<!-- stanza: #ck3hykp635 -->
### Determinism

The caller passes the timestamp in the options, which must lie between 1980 and 2099 as the zip format requires. The exporter writes it into the core properties and the zip entries and renumbers the random relationship IDs that the library gives hyperlinks, so the same inputs give identical bytes.

<!-- stanza: #52g2qyhwnh -->
## Consequences

- Documents opened in Word show named styles, and editing a style there changes every paragraph that uses it.
- A mark combination used in the document adds a generated character style. The set is small and deterministic.
- The workarounds for switching off a toggle property and for `page-break-before` are the only explicit properties in the output.
- Exporting needs the stylesheet's own properties, so `docx` option objects are built from the stylesheet and not from resolved values.

<!-- stanza: #gkkhwrh1r9 -->
## Alternatives considered

- **Direct run formatting for marks.** Simple, but it repeats properties and hides the style in Word.
- **One character style per mark, unchanged by paragraph style.** Cannot express variants, which differ by paragraph style.
- **Writing styles from resolved values.** Loses the inheritance a Word user sees.
