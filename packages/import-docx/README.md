# @stanza/import-docx

`importDocx(bytes)` reads a Word file into the `core` model plus a report of what could not be represented. One-time, content-only import.

- Reading: `docx-package.ts` (zip), `xml.ts` (saxes), `styles.ts`, `numbering.ts`.
- Writing the model: `import-docx.ts` entry, `blocks.ts`, `block-writer.ts` (lists, shared by body and cells), `paragraph.ts`, `table.ts`, `context.ts`, `report.ts`.
- `review.ts` (ADR 0084): `readReview(bytes)` reads the Stanza bookmarks and the comments of a reviewed DOCX and places each comment by block ID, with its durable ID, UTC time, replies, resolved state, reactions and quoted text; `review-parts.ts` reads the comment parts, the revision stamp and the embedded source. It reads only; nothing is applied. Tested on the real files in `fixtures/review-round-trip/`.
- `docx.testing.ts` builds DOCX files for tests.

ADRs: `docs/INDEX.md` (Word import).
