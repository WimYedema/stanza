# Stanza for VS Code: development notes

VS Code extension with two custom editors (document, style editor), bundled by `build.mjs` into `dist/extension.cjs` (host) and webview bundles. `README.md` in this folder is the Marketplace page; keep it written for users.

- `src/host/`: runs in VS Code. `extension.ts` registers; `go-to-heading-command.ts` with `headings.ts` (the quick pick of headings, `Ctrl+Shift+O` in the editor); `go-to-line-command.ts` with `lines.ts` (`Ctrl+G`, a line of the Markdown text); `make-reference-command.ts` (`Ctrl+Shift+K` and the context menu of the editor, which only asks the webview to open its list); `stanza-tree.ts` with `outline.ts` (the Stanza view in the Explorer: project, documents, headings); `provider.ts` (document editor), `styles-provider.ts` (style editor), `*-command.ts` (commands, such as `add-agent-instructions-command.ts`), `export-on-save.ts`, `diagnostics.ts`, `quick-fix.ts`, `storage.ts`. `vscode-fake.testing.ts` fakes the VS Code API in tests.
- `src/shared/`: message types between host and webview (`protocol.ts`, `styles-protocol.ts`).
- `src/webview/`: runs in the webview. Document view: `main.ts`, `view.ts`, `toolbar.ts`, `sheet.ts`, `style-info.ts`, `notices.ts`, `reveal.ts` (scroll to a block), `reference-picker.ts` (the list of headings for a reference), `reference-navigation.ts` (Ctrl/Cmd-click on a reference), `changes.ts` (the bar for changes from outside). Style editor: `styles-*.ts` (`styles-main.ts` entry, `styles-panel.ts` the panel, `styles-controls.ts` one control per property type, `styles-properties.ts` property state helpers).

Design decisions per feature: link resolution ADR 0077 and 0082, startup ADR 0078 and 0101 (timings in `startup-times.ts` and `load-start.ts`), document list ADR 0079, document properties ADR 0080. See `docs/INDEX.md`. Open items: GitHub block-ID anchors (backlog item 189), checking remote link targets (item 151), generated version and revision metadata (item 29).

## Measuring responsiveness

The budgets and the reference setup are in ADR 0101; results go in `docs/BENCHMARKS.md`. All of these need `npm run build` first, and none is part of `npm run check`.

- `npm run bench` times the parts that need no editor (configuration, loading a project, parsing, conversion, CSS) on `docs/` and on a generated project.
- `node scripts/bench/make-corpus.mjs <folder> [--seed 1]` writes that generated project: 500 documents of made-up text and one of 3,000 blocks. The same seed gives the same files.
- `node scripts/bench/responsiveness.mjs <document> [--out file.json]` starts VS Code once on the project of the document and runs **Stanza: Measure Responsiveness** in it: the shortest, a typical and the longest document opened 20 times cold and 20 times warm, then typing, Enter, a style and Strong 20 times each, against the budgets. In a normal window the command shows with the setting `stanza.development.measure`. The measured changes are never sent to the buffer, so the files stay as they are. `STANZA_MEASURE_RESULTS` makes the extension start it on its own and quit when done.
- `node scripts/bench/first-open.mjs <document> [--runs 20] [--out file.json]` measures the first open in a new VS Code window, step by step. `STANZA_TIMING_FILE` makes the extension write a time stamp at each step and quit once the document is editable.

The two VS Code scripts start the installed `code` with a new profile, the built-in extensions and this one (`scripts/bench/vscode.mjs`). Leave the windows alone while they run.

## Releasing

1. Bump `version` in `package.json` here and add a section to `CHANGELOG.md`.
2. `npm run check` at the root, then `npm run package` and install `packages/vscode/stanza.vsix` to try it.
3. Commit, then tag and push: `git tag v0.1.1 && git push origin v0.1.1`.

The release workflow (`.github/workflows/release.yml`) checks that the tag matches the version, runs the check, and publishes a pre-release to the Marketplace with OIDC trusted publishing, so no token is stored. The `ienfald` publisher must trust this repository for that.

## Icon

`media/icon.svg` is the source of the Marketplace icon `media/icon.png` (256 × 256, transparent corners). After changing the SVG, render it again with a Chromium browser, for example on Windows:

```text
msedge --headless --hide-scrollbars --force-device-scale-factor=1 --default-background-color=00000000 --window-size=256,256 --screenshot=icon.png media/icon.svg
```
