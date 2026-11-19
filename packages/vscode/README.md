# phrase-vscode

VS Code extension with two custom editors (document, style editor), bundled by `build.mjs` into `dist/extension.cjs` (host) and webview bundles.

- `src/host/`: runs in VS Code. `extension.ts` registers; `go-to-heading-command.ts` with `headings.ts` (the quick pick of headings, `Ctrl+Shift+O` in the editor); `go-to-line-command.ts` with `lines.ts` (`Ctrl+G`, a line of the Markdown text); `make-reference-command.ts` (`Ctrl+Shift+K` and the context menu of the editor, which only asks the webview to open its list); `phrase-tree.ts` with `outline.ts` (the Phrase view in the Explorer: project, documents, headings); `provider.ts` (document editor), `styles-provider.ts` (style editor), `*-command.ts` (commands, such as `add-agent-instructions-command.ts`), `export-on-save.ts`, `diagnostics.ts`, `quick-fix.ts`, `storage.ts`. `vscode-fake.testing.ts` fakes the VS Code API in tests.
- `src/shared/`: message types between host and webview (`protocol.ts`, `styles-protocol.ts`).
- `src/webview/`: runs in the webview. Document view: `main.ts`, `view.ts`, `toolbar.ts`, `sheet.ts`, `style-info.ts`, `notices.ts`, `reveal.ts` (scroll to a block), `reference-picker.ts` (the list of headings for a reference), `reference-navigation.ts` (Ctrl/Cmd-click on a reference), `changes.ts` (the bar for changes from outside). Style editor: `styles-*.ts` (`styles-main.ts` entry, `styles-panel.ts` the panel, `styles-controls.ts` one control per property type, `styles-properties.ts` property state helpers).

## Following links

Hover a Phrase link for its destination and the Ctrl/Cmd-click hint. Holding Ctrl (Cmd on macOS) underlines the hovered link and shows a pointer; clicking immediately shows an opening status. Ordinary clicks remain editing actions.

Both `#id` and `relative-file.phrase.md#id` resolve by immutable project-wide ID. A stale filename warns in Problems and offers an explicit path quick fix; navigation and DOCX export use the actual ID location without changing source. The quick fix edits the unsaved buffer and requires canonical source so unrelated formatting is not rewritten. For bulk fixes, run `phrase format . --fix-references` (also accepts `--file` and `--check`).

File-only `.phrase.md` links open that document within the project. Missing or duplicate IDs and Markdown title fragments produce actionable errors rather than guessing. Links use URI-encoded relative path segments. Unchanged navigation uses the last validated project snapshot; pending editor changes are flushed first and project edits invalidate the snapshot.

GitHub block-ID anchors are not implemented yet (backlog item 189).

## Maintaining the document list

Run **Phrase: Initialize Document List** from the Command Palette or the project context menu in the Phrase view to create a missing `documents` entry in `phrase.yaml`. It includes discovered documents in their current path order and never replaces an existing outline.

New Document, Import Word Document and Adopt Markdown File append to an existing list; without a list, discovery still applies. In the Phrase view, right-click a listed document for **Move Document Up**, **Move Document Down** (within its group), or **Move Document to Group** (project root or an existing nested group). These actions change the outline, not filenames, content or block IDs. Creating groups remains a text edit.

Problems offers quick fixes to add an unlisted document or, after confirmation, remove a missing entry. Missing targets are not guessed or repaired automatically. Comments and unrelated project settings are preserved; the edited outline may be re-laid out. Invalid YAML and layouts with anchors/aliases are refused explicitly.

Project-file edits are undoable and use the current buffer, including unsaved settings. A notification reminds you to save `phrase.yaml` and offers **Save project file**; it is not saved automatically. Diagnostics and the tree use the edited buffer immediately. See ADR 0079.

## Opening documents

Editors, navigation, diagnostics and the project tree share versioned project snapshots and in-flight loads. Unsaved changes, dirty-buffer restoration, buffer closure and filesystem changes invalidate them. Explicit refreshes after commands force fresh validation; invalidated loads cannot publish stale results.

A cold open checks configuration and the active document first, then displays a read-only preview while project-wide checks finish. Editing commands and input transactions are gated until the project IDs arrive; unreadable project documents keep editing disabled. Warm opens reuse the shared snapshot. Opening does not format or rewrite source.

The local Phrase output channel reports `Phrase startup: visible ... ms, editable ... ms (...)`. These are painted milestones measured from webview navigation, not just parsing time. No timing data leaves the machine. Hardware, document size and VS Code webview startup still affect the durations.

ADRs: `docs/INDEX.md` (VS Code extension, reference location hints in ADR 0077, startup in ADR 0078).
