# Stanza

## Files

- `docs/documents/product-vision.stanza.md` explains the product problem, vision, principles, target users, scope, and non-goals.
- `docs/documents/architecture.stanza.md` defines the proposed technical boundaries, domain model, storage, rendering, publication, testing, and initial vertical slices.
- `docs/BACKLOG.md` lists the prioritized work items with relative sizes.
- `docs/documents/spike-findings.stanza.md` records what the DOCX round-trip and TOC spikes showed (the throwaway tooling is in Git history only).
- `docs/INDEX.md` lists the ADRs by topic and package.
- `docs/` is a Stanza project: the vision, the architecture, the spike findings and the ADRs are Stanza documents in `docs/documents/` (ADR 0064).

## Development

Requires Node 22 or later; CI uses Node 24.

```text
npm install
npm run check    build, typecheck tests, test, lint, format check, docs check
npm test         tests only
npm run docs:fix canonical form and IDs for the documents in docs/documents/
```

Packages live in `packages/`. Architecture decisions are recorded in `docs/documents/`.

On Windows, run the tests from a path with an uppercase drive letter (`C:\...`). The VS Code terminal can start in `c:\...`, and Vitest then loads itself twice and every test file fails with `Cannot read properties of undefined (reading 'config')`. `cd C:\path\to\stanza` first.

## Install the VS Code extension

Stanza is available as an **alpha pre-release** on the Marketplace: search for "Stanza" in the Extensions view and install the pre-release, or run:

```sh
code --install-extension ienfald.stanza --pre-release
```

To publish a new version, bump `version` in `packages/vscode/package.json`, add it to `packages/vscode/CHANGELOG.md` and push a matching tag (`v0.1.1`); the release workflow checks and publishes it.

### From source

```sh
npm install
npm run package
code --install-extension packages/vscode/stanza.vsix --force
```

This builds everything and writes `packages/vscode/stanza.vsix` (ignored by Git). `*.stanza.md` files then open in the Stanza editor, and "Open With" on a project's stylesheet offers Stanza Styles. Reload the window after installing a new version.

To start a project, run "Stanza: New Project" from the Command Palette, pick a folder and give a title. It writes `stanza.yaml`, a default stylesheet in `styles/default.yaml` and a first document in `documents/`, and opens the document. The folder should be open as a workspace folder, so that the editor finds the project.

## Command line

Build first (`npm run build`), then run the tool on a project, a directory with a `stanza.yaml`:

```text
node packages/cli/dist/main.js validate fixtures/example-project
node packages/cli/dist/main.js build fixtures/example-project --date 2026-03-04
```

`validate` checks the project file, the stylesheet, and every `.stanza.md` document. `build` checks first and then writes one DOCX per document into `build/` in the project. Add `build/` to the `.gitignore` of a project. The date written into the files comes from `--date` and never from the clock, so the same project and date always give the same files. `stanza --help` lists the options and the exit codes.

The extension does not install a CLI on PATH. After building, optionally run `npm link --workspace @stanza/cli` in this checkout to make `stanza` available, or invoke Node with the absolute path to `packages/cli/dist/main.js` from any project folder. These local invocations need no network after setup; do not fetch a similarly named package from a registry.

For surgical edits, repeat `--file` with project-relative document paths on `validate` or project-directory `format`. Use `format --check` to check layout without writing and `validate --max-diagnostics 50` to bound output without changing totals or failure status. See [the CLI workflow](packages/cli/README.md) for examples and the scope of each check.
