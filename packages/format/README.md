# @phrase/format

Text adapter: the Markdown dialect and the YAML files, to and from `core` types. Depends on `markdown-it` and `yaml`.

- Documents: `parse.ts` (to the model, with diagnostics; `blockStartLines` gives the line of each block), `adopt.ts` (an ordinary Markdown file as a document, with a report), `serialize.ts` (canonical form), `annotation.ts` (`{...}` attributes), `front-matter.ts`, `check.ts` (is a text canonical), `assign-ids.ts` (IDs in text).
- Project and stylesheet files: `project.ts`, `stylesheet.ts` (styles, tokens), `stylesheet-pages.ts` (page templates, header/footer slots, cover), `yaml-decode.ts`.
- Comment-preserving stylesheet edits: `edit-stylesheet.ts` (`setProperty`, `unsetProperty`), `declare-variant.ts`, `slot-source.ts`.
- `fixtures.test.ts` round-trips `fixtures/format/*.phrase.md`; add a fixture there for a new dialect feature.

ADRs: `docs/INDEX.md` (format and domain, stylesheet and pages).
