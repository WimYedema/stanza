# @phrase/core

Domain: types, validation, resolution and numbering. Pure functions; no I/O, no dependencies. Tests sit next to the source; shared builders are `stylesheet.testing.ts`.

- Model: `document.ts` (blocks, inlines), `table-cell.ts`, `normalize.ts`, `ids.ts`, `document-ids.ts`, `assign-ids.ts`, `vocabulary.ts` (block and mark attributes, known `phrase-*` kinds).
- Checks: `document-validation.ts`, `style-validation.ts`, `diagnostic.ts` (all findings are `Diagnostic`).
- Stylesheet: `stylesheet.ts` (types), `style-resolution.ts` (inheritance, variants), `style-properties.ts` (the property list, single source), `style-name.ts`, `style-references.ts`, `default-styles.ts`, `word-style-names.ts`.
- Pages: `page-template.ts`, `slot-values.ts`, `cover.ts`, `toc.ts`, `heading-numbering.ts`, `heading-levels.ts`.
- References: `references.ts`, `project-references.ts`, `reference-links.ts` (ID-authoritative filename hints, safe relative paths and explicit stale-path fixes; ADR 0077).
- `link-schemes.ts`: typed project URL templates, offline resolution and actionable link diagnostics (ADR 0082). Short destinations remain in content.

ADRs: see `docs/INDEX.md` (format and domain, stylesheet and pages).
