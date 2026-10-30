# ADR 0025: The VS Code editor

Status: Accepted. The behavior of undo and redo in VS Code is to be confirmed by trying it (see Undo and redo). Allowing a mark in a style, and saving the stylesheet with the document: ADR 0026.

## Context

ADR 0002 and ADR 0003 put the visual editor in a VS Code webview, bound to the Markdown file, with the text of the file as the one source of truth: the extension applies only the changed lines to the open document, and VS Code does saving, dirty marks and history. The editor package of ADR 0022 to 0024 runs in a DOM and knows nothing of VS Code. This record covers the extension that joins the two.

## Decision

### Package

`packages/vscode`, a package called `phrase-vscode` (an extension name cannot be scoped), with two bundles that `esbuild` makes from the same sources: `dist/extension.cjs` for the extension host (CommonJS, `vscode` external) and `dist/webview.js` for the webview. The `tsc` runs only to check types. Its folders have their own import rules, which ESLint enforces: `src/host` may import `vscode`, `core`, `format` and `project`, and not the editor; `src/webview` may import `core`, `css`, `format` and the editor, and not `vscode` or Node; `src/shared` has the messages and imports nothing. The extension is for use from a checkout: it is not published and no `.vsix` is made. `npm run build` builds it after the libraries, and `.vscode/launch.json` starts an Extension Development Host on the example project.

### Binding

A custom text editor for `*.phrase.md`, offered by default, and "Reopen Editor With… Text Editor" always gives the plain text. One editor serves a document, and it keeps its state when its tab is hidden.

### Project

The project of a document is in the nearest folder above it with a `phrase.yaml`, not going above its workspace folder. `loadProject` runs over a `ProjectStorage` on `vscode.workspace.fs` that reads the text of open documents as they are, so unsaved changes are checked too. A file with no project shows a message and a button to open it as text, since there is no stylesheet.

### Messages

The host sends raw text, and the webview parses it with `format` and starts the editor, so the host holds no editor code:

- `init`: the document, the stylesheet, and the IDs of the other documents of the project (the `usedIds` of ADR 0024).
- `external-text`: the document changed in another way.
- `stylesheet` and `used-ids`: sent again when the files of the project change.
- `refused`: the file cannot be edited visually, with the reasons.

The webview sends `ready`, `change` with the whole text, `format` and `open-as-text`. What the webview sends is untrusted, so the host checks every message (`parseWebviewMessage`), and the webview checks what it receives.

### Writing to the file

On a change the webview serializes with `format` and sends the whole text after a pause of 300 ms, so that typing is one step of the history for each pause. A text waiting to be sent is sent at once when the page is hidden or closed. The host finds the lines that differ, from the first line that is not the same to the last, and applies only that range with a `WorkspaceEdit`. It never replaces the whole document. A line is compared with its line ending, so a final newline counts. Saving, the dirty mark and revert are VS Code's.

Everything that happens to a session goes through one queue, in order, because the change that VS Code reports for an edit of the webview must be recognised as its own and not sent back. It is recognised by its text.

### Line endings

The buffer is normalised to `\n` for checking and comparing, and VS Code gives an inserted `\n` the line ending of the file. A file with CRLF line endings, which a Windows working copy often has, is therefore edited as it is and keeps its line endings. This differs from the command line, where CRLF on disk is not canonical (ADR 0015), since there the file itself is read and here the buffer is.

### Changes from outside

When the document changes in another way, such as a Git checkout, the text editor, or undo and redo, the host sends the text. The webview replaces its content and puts the cursor back at the same block and the same number of characters into it (`getPosition` and `setPosition` of the editor), or as near as it can.

### Files that the editor does not take

A file is taken only if it reads without a diagnostic and is what the serializer writes (ADR 0003). Otherwise the webview shows the reasons, with the line, and two buttons: "Open as text", and "Format and open" when the only problem is the form of the text. That button applies the canonical text as an edit and then opens it. A file is never changed by being opened. Errors in the project file or the stylesheet are shown in the same way. A text that becomes canonical later, for example after it is fixed in the text editor, opens by itself.

### Problems panel

One diagnostics collection holds everything `loadProject` finds in every project that is open: reading, validation, metadata and duplicate IDs. It is made again 300 ms after changes to a document or to the files of the project. A diagnostic with a line points at that line, and the others at the start of the file. Notices of the editor, such as a refused command, show in the webview and not in the panel.

### Undo and redo

VS Code's history of the document (ADR 0003): the webview has no history of its own, `Ctrl+Z` and `Ctrl+Y` are left to VS Code, and the webview stops the browser from also undoing the page. This is to be confirmed by trying it in VS Code. If the key does not reach the history from the webview, ProseMirror's history in the webview is the fallback that ADR 0003 names.

### The page

The page has a content security policy with a nonce: no remote resources, scripts only from `dist`, and styles only with the nonce, including the style elements that the editor adds (the editor takes the nonce as an option). Links in the document do not navigate. The webview shows the toolbar of the preview as it is, a button for each command and a line for notices, so that the editor can be used; item 52 replaces it.

### Dependencies

Only `@types/vscode`, for development. There is no test framework that starts VS Code. The parts that can be tested are in modules that do not import `vscode`, and are tested in Node: the line diff, the checks of messages, the review of a text, the storage, the search for the project, the diagnostics and the page. The webview is tried in a browser with a stand-in for the VS Code API and the real page and policy.

## Consequences

- The visual editor and the text editor show the same file, and each one's changes appear in the other.
- The host side is small and hard to get wrong, but only a real VS Code shows how it all behaves, so the first use is a check for the person who runs it.
- Projects with CRLF working copies work without change.
- Typing sends the text of the whole document, which is fine for documents of this size.

## Alternatives considered

- **The host parses and sends a model.** More code in the host, and the editor would need a second route to the model.
- **Replacing the whole document on each change.** Cursor, undo and Git would all suffer (ADR 0003).
- **Several changed ranges.** One range is correct and simple, and a change that touches two distant places is rare.
- **A test run of VS Code.** It downloads a whole editor and needs a display.

## Not covered

Commands of the extension (build, format, assign IDs), a real toolbar (item 52), a webview in the browser (item 47), and the settings of the extension.
