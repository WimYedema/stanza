# Stanza: notes for Claude

Stanza is a VS Code editor and toolchain for documents in a Markdown dialect, with a typed stylesheet, built to DOCX. Principles (`docs/documents/product-vision.stanza.md`): no direct formatting (looks come from named styles and tokens), deterministic output (same input, same bytes; no clock, a build gets its timestamp), offline (validate and build never fetch).

## Commands

- Run tests and checks from PowerShell after `Set-Location 'C:\Users\wimye\git\phrase'`. From a lowercase `c:\` path every Vitest file fails with "reading 'config'"; that is not a broken install.
- `npm run check` before every commit: build, typecheck tests, tests, lint, prettier, docs check.
- `npx vitest run <file>` for one test file. The CLI runs from `packages/cli/dist/main.js`, so `npm run build` after source changes.
- `npm run examples` builds the example projects; `npm run docs:fix` assigns IDs in `docs/`.
- `node scripts/cover-rows.mjs <project or stylesheet>` prints where the cover rows of each page template sit on the page and what is in them; check a cover layout with it before rendering anything in Word.

## Packages

`core` model, validation, no IO · `format` YAML and Markdown parse and write, stylesheet text edits · `css` browser CSS · `export-docx` DOCX through the `docx` library · `import-docx` Word to Stanza, and covers from templates · `project` storage port, loading, build, import commands · `cli` · `editor` ProseMirror editor · `vscode` extension host and webview.

## Documentation

- Start at `docs/INDEX.md`: it names the ADRs per topic. Read the whole chain on a line; later ADRs refine earlier ones.
- ADRs are Stanza documents, `docs/documents/NNNN-slug.stanza.md`, with a `Status:` line naming the backlog item and "Decided with the product owner on <date>" when that is so. After writing one, run `npm run docs:fix` and add it to `docs/INDEX.md`.
- `docs/BACKLOG.md` holds open items, `N. [size] - text`; search it rather than reading it whole. A new item takes the highest number in `BACKLOG.md` and `BACKLOG_DONE.md` plus one. A finished item moves to `docs/BACKLOG_DONE.md` as one line ending "Done YYYY-MM-DD".
- The product owner sets priorities and decides ADRs; propose, then ask.
- Prose: plain English, short sentences, no marketing words, as in the existing ADRs.

## Rules

- Never commit `docs/reviews/`. Stage explicit paths, not `git add -A`.
- Never commit anything taken from a real organisation's template or documents (logos, names, addresses, text); a real template is tested from the scratchpad only. Examples and fixtures use made-up names and logos.
- `examples/` are showcases and tests (`packages/project/src/examples.test.ts`); see `examples/README.md` for adding one and for making `imported-report` again after an import change.
- Commit messages: a subject naming the item or ADR, then a body that says what changed and why.
