# stanza-vscode

VS Code extension with two custom editors (document, style editor), bundled by `build.mjs` into `dist/extension.cjs` (host) and webview bundles.

- `src/host/`: runs in VS Code. `extension.ts` registers; `go-to-heading-command.ts` with `headings.ts` (the quick pick of headings, `Ctrl+Shift+O` in the editor); `go-to-line-command.ts` with `lines.ts` (`Ctrl+G`, a line of the Markdown text); `make-reference-command.ts` (`Ctrl+Shift+K` and the context menu of the editor, which only asks the webview to open its list); `stanza-tree.ts` with `outline.ts` (the Stanza view in the Explorer: project, documents, headings); `provider.ts` (document editor), `styles-provider.ts` (style editor), `*-command.ts` (commands, such as `add-agent-instructions-command.ts`), `export-on-save.ts`, `diagnostics.ts`, `quick-fix.ts`, `storage.ts`. `vscode-fake.testing.ts` fakes the VS Code API in tests.
- `src/shared/`: message types between host and webview (`protocol.ts`, `styles-protocol.ts`).
- `src/webview/`: runs in the webview. Document view: `main.ts`, `view.ts`, `toolbar.ts`, `sheet.ts`, `style-info.ts`, `notices.ts`, `reveal.ts` (scroll to a block), `reference-picker.ts` (the list of headings for a reference), `reference-navigation.ts` (Ctrl/Cmd-click on a reference), `changes.ts` (the bar for changes from outside). Style editor: `styles-*.ts` (`styles-main.ts` entry, `styles-panel.ts` the panel, `styles-controls.ts` one control per property type, `styles-properties.ts` property state helpers).

## Following links

Hover a Stanza link for its destination and the Ctrl/Cmd-click hint. Holding Ctrl (Cmd on macOS) underlines the hovered link and shows a pointer; clicking immediately shows an opening status. Ordinary clicks remain editing actions.

Both `#id` and `relative-file.stanza.md#id` resolve by immutable project-wide ID. A stale filename warns in Problems and offers an explicit path quick fix; navigation and DOCX export use the actual ID location without changing source. The quick fix edits the unsaved buffer and requires canonical source so unrelated formatting is not rewritten. For bulk fixes, run `stanza format . --fix-references` (also accepts `--file` and `--check`).

File-only `.stanza.md` links open that document within the project. Missing or duplicate IDs and Markdown title fragments produce actionable errors rather than guessing. Links use URI-encoded relative path segments. Unchanged navigation uses the last validated project snapshot; pending editor changes are flushed first and project edits invalidate the snapshot.

GitHub block-ID anchors are not implemented yet (backlog item 189).

## Project link schemes

Declare URL templates in the project's `stanza.yaml`:

```yaml
link-schemes:
  jira: https://example.atlassian.net/browse/{id}
```

Use the **Link** button with `jira://PROJ-123`. The Markdown keeps `[ticket](jira://PROJ-123)`; the editor's link destination and DOCX export use `https://example.atlassian.net/browse/PROJ-123`. Ctrl/Cmd-click opens that address in the system browser. Hover shows the resolved address. Project-setting changes refresh destinations without rewriting documents or moving the cursor.

Scheme names are lowercase URI scheme names, not built-in/reserved schemes. Templates must be HTTP(S), without credentials, with exactly one `{id}` after the authority. IDs are non-empty, decoded once and encoded as one URL component; whitespace, control characters and malformed escapes are errors. Unknown schemes and missing IDs appear in diagnostics and block export. Commands and paste follow the project's schemes and the active style's link variant. Unsupported pasted destinations are removed with a notice; their visible text is kept.

Resolution, validation and export remain offline; checking whether a remote address exists is separate work (item 151). See ADR 0082.

## Document properties

Expand **Document properties** above the page, or use **Metadata** in the toolbar to reveal and focus it. The panel is editor chrome, not printable document content.

Edit title, authors, classification, page template and custom properties. It distinguishes explicit values, inherited `stanza.yaml` defaults (with **Override** / **Use project default**), and known built-in or project-declared fields not yet set. Displaying defaults or absent fields never writes them. Required, mismatched and undeclared custom properties show the existing metadata diagnostics; undeclared values remain editable.

Properties use compact label/value rows. Small `+` and `-` buttons add or remove properties and list items; inherited values use `+` to override and `-` to return to the project default. Each icon has an action-specific tooltip and accessible name.

Custom properties support plain text (including multiline text) or ordered lists of text. Numbers, booleans and dates are not inferred: `0012` and `true` stay text. Use a non-reserved kebab-case name. Empty text and empty lists differ from absence. **Open project metadata definition** opens `stanza.yaml` without silently changing declarations.

**Apply** makes one undoable edit to the current buffer after flushing body typing; **Cancel** discards the draft. Save normally to persist. Body nodes, IDs and position stay intact. External document changes or changed metadata settings invalidate a dirty draft: explicitly reload or cancel rather than overwrite newer source. The host also checks the expected source and refuses edits that change body content. Startup previews and in-flight Apply operations are read-only.

System `stanza-format` is read-only. Git/build version, date and revision are shown as unavailable until item 29 implements generation; they are not invented or written as overrides. See ADR 0080. The persisted format remains version 1.

## Maintaining the document list

Run **Stanza: Initialize Document List** from the Command Palette or the project context menu in the Stanza view to create a missing `documents` entry in `stanza.yaml`. It includes discovered documents in their current path order and never replaces an existing outline.

New Document, Import Word Document and Adopt Markdown File append to an existing list; without a list, discovery still applies. In the Stanza view, right-click a listed document for **Move Document Up**, **Move Document Down** (within its group), or **Move Document to Group** (project root or an existing nested group). These actions change the outline, not filenames, content or block IDs. Creating groups remains a text edit.

Problems offers quick fixes to add an unlisted document or, after confirmation, remove a missing entry. Missing targets are not guessed or repaired automatically. Comments and unrelated project settings are preserved; the edited outline may be re-laid out. Invalid YAML and layouts with anchors/aliases are refused explicitly.

Project-file edits are undoable and use the current buffer, including unsaved settings. A notification reminds you to save `stanza.yaml` and offers **Save project file**; it is not saved automatically. Diagnostics and the tree use the edited buffer immediately. See ADR 0079.

## Opening documents

Editors, navigation, diagnostics and the project tree share versioned project snapshots and in-flight loads. Unsaved changes, dirty-buffer restoration, buffer closure and filesystem changes invalidate them. Explicit refreshes after commands force fresh validation; invalidated loads cannot publish stale results.

A cold open checks configuration and the active document first, then displays a read-only preview while project-wide checks finish. Editing commands and input transactions are gated until the project IDs arrive; unreadable project documents keep editing disabled. Warm opens reuse the shared snapshot. Opening does not format or rewrite source.

The local Stanza output channel reports `Stanza startup: visible ... ms, editable ... ms (...)`. These are painted milestones measured from webview navigation, not just parsing time. No timing data leaves the machine. Hardware, document size and VS Code webview startup still affect the durations.

ADRs: `docs/INDEX.md` (VS Code extension, reference location hints in ADR 0077, startup in ADR 0078).
