# Phrase

## Files

- `docs/documents/product-vision.phrase.md` explains the product problem, vision, principles, target users, scope, and non-goals.
- `docs/documents/architecture.phrase.md` defines the proposed technical boundaries, domain model, storage, rendering, publication, testing, and initial vertical slices.
- `docs/BACKLOG.md` lists the prioritized work items with relative sizes.
- `docs/documents/spike-findings.phrase.md` records what the DOCX round-trip and TOC spikes showed (the throwaway tooling is in Git history only).
- `docs/INDEX.md` lists the ADRs by topic and package.
- `docs/` is a Phrase project: the vision, the architecture, the spike findings and the ADRs are Phrase documents in `docs/documents/` (ADR 0064).

## Development

Requires Node 22 or later.

```text
npm install
npm run check    build, typecheck tests, test, lint, format check, docs check
npm test         tests only
npm run docs:fix canonical form and IDs for the documents in docs/documents/
```

Packages live in `packages/`. Architecture decisions are recorded in `docs/documents/`.

## Install the VS Code extension

```text
npm run build
npm run package --workspace phrase-vscode
code --install-extension phrase.vsix --force
```

This writes `phrase.vsix` at the root (ignored by Git) and installs it. `*.phrase.md` files then open in the Phrase editor, and "Open With" on a project's stylesheet offers Phrase Styles. Reload the window after installing a new version. The packaging tool is fetched by `npx` when it runs and is not a dependency of the project.

To start a project, run "Phrase: New Project" from the Command Palette, pick a folder and give a title. It writes `phrase.yaml`, a default stylesheet in `styles/default.yaml` and a first document in `documents/`, and opens the document. The folder should be open as a workspace folder, so that the editor finds the project.

## Command line

Build first (`npm run build`), then run the tool on a project, a directory with a `phrase.yaml`:

```text
node packages/cli/dist/main.js validate fixtures/example-project
node packages/cli/dist/main.js build fixtures/example-project --date 2026-03-04
```

`validate` checks the project file, the stylesheet, and every `.phrase.md` document. `build` checks first and then writes one DOCX per document into `build/` in the project. Add `build/` to the `.gitignore` of a project. The date written into the files comes from `--date` and never from the clock, so the same project and date always give the same files. `phrase --help` lists the options and the exit codes.
