# ADR 0004: Domain document model

Status: Accepted

## Context

`core` holds the canonical document model. It must express only semantic content, be convertible to and from ProseMirror and Markdown without loss, and make invalid states hard to write. The types are in `packages/core/src/document.ts`.

## Decision

### Shape

A `Document` is plain readonly data: `meta` and a list of `blocks`. There are no classes and no source positions.

Blocks are a discriminated union:

| Block | Content |
|---|---|
| `heading` | level 1 to 6, inline content |
| `paragraph` | inline content |
| `list` | kind `bulleted` or `numbered`, items |
| `table` | header cells (required), rows, optional relative column `widths` |
| `code` | optional language, verbatim text |
| `phrase` | a fenced `phrase-<kind>` block, kind and verbatim text |

Headings occur only at the top level. A list item holds paragraphs, lists, tables, code, and phrase blocks. Table cells hold inline content only. The types enforce this.

Every block may carry an optional `id` (ADR 0001) and an optional `style` name. A missing `style` means the default style for that kind. The model holds names only; resolving them is the stylesheet's job, and validation checks they exist.

### Inline content

Inline content is a flat list of text runs, each with a list of marks, as in ProseMirror. Marks are `strong`, `emphasis`, `code`, `link` (with `href`), and `style` (a character style by name). The serializer works out the nesting that Markdown needs.

### Normal form

`normalizeInlines` and `normalizeDocument` bring content to the one form Markdown can express:

- no empty runs;
- marks unique and ordered: link, style, strong, emphasis, code;
- whitespace at the edges of a marked run moved out of the marks, and whitespace-only runs unmarked;
- adjacent runs with equal marks merged.

The parser and the editor conversion both normalize, so they agree and serialization is deterministic.

### Metadata

`DocumentMeta` has `title`, `authors`, `classification`, and `fields`. Fields are project-specific entries with kebab-case keys and values that are a string or a list of strings. Any key is accepted in the model. A project can later declare its fields so that validation flags undeclared ones.

The serialization order is `phrase-format`, then `title`, `authors`, `classification`, then the custom fields alphabetically.

The file format version (`phrase-format`) is handled by the parser and migrations and is not part of the model.

### Release identity is not metadata

The version and date of a published document are not stored in the document, because Git already records them. They come from build information supplied by the host and derived from Git where available. The rules are decided with the build information backlog work.

### Diagnostics

`core` has a minimal `Diagnostic` type (severity, code, message, optional line or node ID). The parser returns a document together with diagnostics, and reports what it cannot represent instead of dropping it. The validation work extends the type.

### Left out for now

Cross-references, figures and images, hard line breaks, table column alignment, header-less tables, and list start numbers. Each can be added as a new variant when its backlog item arrives. Table alignment is not planned: the vision keeps alignment out of content, so it belongs to table styles.

## Consequences

- The model is small, JSON-serializable, and easy to compare in tests.
- Because the model equals what Markdown can express, no document is valid in the model but unwritable in the file.
- Optional IDs let the parser represent hand-written files so that tooling can report and fix them.
- Constructs outside the model are diagnostics, which keeps the "no silent repair" rule.

## Alternatives considered

- **Nested inline tree like Markdown's.** Closer to the syntax, but it needs flattening for the editor and has several representations of the same content.
- **Required IDs.** Cannot represent a hand-written file without IDs, so it could not be reported or repaired.
- **Version and date in front matter.** Duplicates information Git holds and can drift from it.
