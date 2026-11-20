# @stanza/import-docx

`importDocx(bytes)` reads a Word file into the `core` model plus a report of what could not be represented. One-time, content-only import.

- Reading: `docx-package.ts` (zip), `xml.ts` (saxes), `styles.ts`, `numbering.ts`.
- Writing the model: `import-docx.ts` entry, `blocks.ts`, `block-writer.ts` (lists, shared by body and cells), `paragraph.ts`, `table.ts`, `context.ts`, `report.ts`.
- `review.ts` (ADR 0084): `readReview(bytes)` reads the Stanza bookmarks and the comments of a reviewed DOCX and places each comment by block ID. It reads only; nothing is applied.
- `docx.testing.ts` builds DOCX files for tests.

ADRs: `docs/INDEX.md` (Word import).
