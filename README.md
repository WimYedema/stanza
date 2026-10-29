# Phrase

## Files

- `docs/PRODUCT_VISION.md` explains the product problem, vision, principles, target users, scope, and non-goals.
- `docs/ARCHITECTURE.md` defines the proposed technical boundaries, domain model, storage, rendering, publication, testing, and initial vertical slices.
- `docs/BACKLOG.md` lists the prioritized work items with relative sizes.
- `docs/SPIKE_FINDINGS.md` records what the DOCX round-trip and TOC spikes showed.

## Development

Requires Node 22 or later.

```text
npm install
npm run check    build, typecheck tests, test, lint, format check
npm test         tests only
```

Packages live in `packages/`. Architecture decisions are recorded in `docs/adr/`.

## Command line

Build first (`npm run build`), then run the tool on a project, a directory with a `phrase.yaml`:

```text
node packages/cli/dist/main.js validate fixtures/example-project
node packages/cli/dist/main.js build fixtures/example-project --date 2026-03-04
```

`validate` checks the project file, the stylesheet, and every `.phrase.md` document. `build` checks first and then writes one DOCX per document into `build/` in the project. Add `build/` to the `.gitignore` of a project. The date written into the files comes from `--date` and never from the clock, so the same project and date always give the same files. `phrase --help` lists the options and the exit codes.
