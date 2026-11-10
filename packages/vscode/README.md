# phrase-vscode

VS Code extension with two custom editors (document, style editor), bundled by `build.mjs` into `dist/extension.cjs` (host) and webview bundles.

- `src/host/`: runs in VS Code. `extension.ts` registers; `provider.ts` (document editor), `styles-provider.ts` (style editor), `*-command.ts` (commands), `export-on-save.ts`, `diagnostics.ts`, `quick-fix.ts`, `storage.ts`. `vscode-fake.testing.ts` fakes the VS Code API in tests.
- `src/shared/`: message types between host and webview (`protocol.ts`, `styles-protocol.ts`).
- `src/webview/`: runs in the webview. Document view: `main.ts`, `view.ts`, `toolbar.ts`, `sheet.ts`, `style-info.ts`, `notices.ts`. Style editor: `styles-*.ts` (`styles-main.ts` entry, `styles-panel.ts` the panel, `styles-controls.ts` one control per property type, `styles-properties.ts` property state helpers).

ADRs: `docs/INDEX.md` (VS Code extension).
