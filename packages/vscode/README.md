# phrase-vscode

VS Code extension with two custom editors (document, style editor), bundled by `build.mjs` into `dist/extension.cjs` (host) and webview bundles.

- `src/host/`: runs in VS Code. `extension.ts` registers; `go-to-heading-command.ts` with `headings.ts` (the quick pick of headings, `Ctrl+Shift+O` in the editor); `go-to-line-command.ts` with `lines.ts` (`Ctrl+G`, a line of the Markdown text); `make-reference-command.ts` (`Ctrl+Shift+K` and the context menu of the editor, which only asks the webview to open its list); `phrase-tree.ts` with `outline.ts` (the Phrase view in the Explorer: project, documents, headings); `provider.ts` (document editor), `styles-provider.ts` (style editor), `*-command.ts` (commands, such as `add-agent-instructions-command.ts`), `export-on-save.ts`, `diagnostics.ts`, `quick-fix.ts`, `storage.ts`. `vscode-fake.testing.ts` fakes the VS Code API in tests.
- `src/shared/`: message types between host and webview (`protocol.ts`, `styles-protocol.ts`).
- `src/webview/`: runs in the webview. Document view: `main.ts`, `view.ts`, `toolbar.ts`, `sheet.ts`, `style-info.ts`, `notices.ts`, `reveal.ts` (scroll to a block), `reference-picker.ts` (the list of headings for a reference), `changes.ts` (the bar for changes from outside). Style editor: `styles-*.ts` (`styles-main.ts` entry, `styles-panel.ts` the panel, `styles-controls.ts` one control per property type, `styles-properties.ts` property state helpers).

ADRs: `docs/INDEX.md` (VS Code extension).
