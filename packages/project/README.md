# @phrase/project

Use cases over a `ProjectStorage` port (`storage.ts`); no direct file access. `memory-storage.testing.ts` is the in-memory storage for tests.

- Load and check: `load.ts` (`loadProjectConfiguration` for local startup checks; `loadProject` parses each document once and can reuse configuration from the same snapshot, ADR 0078; includes checked reference filename hints), `diagnostics.ts`, `files.ts`, `format.ts` (selected-file formatting reserves IDs across the project and explicitly fixes stale paths with `fixReferences`; ADRs 0076, 0077).
- Output: `build.ts`, `export-document.ts`, `reference-links.ts` (DOCX destinations by definitive ID, or file-only href).
- Creating: `new-project.ts` with `default-stylesheet.ts`, `new-document.ts`, `import-word.ts`, `adopt-markdown.ts`, `agent-instructions.ts` (the AGENTS.md text with CLI setup, batch workflow and embedded syntax reference, ADRs 0061, 0076); `store-document.ts` is what the last two share (free name, IDs, writing, checking).
- `document-list.ts` (ADR 0079): explicitly initialize the outline from discovery; preflight and append new/imported/adopted documents to an existing list. No implicit outline creation. A failed list write reports that the new file may already exist; there is no multi-file transaction.
- `style-usage.ts`: which documents and blocks use each style.

ADRs: `docs/INDEX.md` (project and CLI).
