# @phrase/project

Use cases over a `ProjectStorage` port (`storage.ts`); no direct file access. `memory-storage.testing.ts` is the in-memory storage for tests.

- Load and check: `load.ts` (`loadProject`), `diagnostics.ts`, `files.ts`, `format.ts`.
- Output: `build.ts`, `export-document.ts`.
- Creating: `new-project.ts` with `default-stylesheet.ts`, `new-document.ts`, `import-word.ts`, `adopt-markdown.ts`, `agent-instructions.ts` (the AGENTS.md text, ADR 0061); `store-document.ts` is what the last two share (free name, IDs, writing, checking).
- `style-usage.ts`: which documents and blocks use each style.

ADRs: `docs/INDEX.md` (project and CLI).
