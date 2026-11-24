# Stanza

> **Alpha pre-release.** Expect rough edges and breaking changes. Keep your documents in Git.

A visual editor for structured documents that live in Git. A Stanza document is a Markdown file (`*.stanza.md`); Stanza opens it as a page with styles, numbering and references, and writes a Word file (DOCX) next to it in the project's `build/` folder on every save. The Markdown file stays the source, so documents diff, review and merge like code.

Everything runs locally. No account or network connection is needed, and nothing leaves your machine.

## Getting started

1. Open a folder as a workspace.
2. Run **Stanza: New Project** from the Command Palette, pick a folder and give a title. This writes `stanza.yaml`, a default stylesheet in `styles/default.yaml` and a first document in `documents/`, and opens the document.
3. Edit. Save to write the DOCX into `build/`, or use **Open in Word** in the editor title bar.

Already have content? Use **Stanza: Import Word Document** for a `.docx`, or **Stanza: Adopt Markdown File** for an existing Markdown file.

`*.stanza.md` files open in the Stanza editor by default. To edit a stylesheet visually, right-click it and choose **Open With → Stanza Styles**, or run **Stanza: Edit Styles**.

## Commands

| Command                            | Shortcut in the editor |
| ---------------------------------- | ---------------------- |
| Stanza: New Project                |                        |
| Stanza: New Document               |                        |
| Stanza: Import Word Document       |                        |
| Stanza: Adopt Markdown File        |                        |
| Stanza: Push for Review            |                        |
| Stanza: Pull Review Comments       |                        |
| Stanza: Edit Styles                |                        |
| Stanza: Initialize Document List   |                        |
| Stanza: Add Agent Instructions     |                        |
| Stanza: Go to Heading              | `Ctrl+Shift+O`         |
| Stanza: Go to Line                 | `Ctrl+G`               |
| Stanza: Make Reference             | `Ctrl+Shift+K`         |
| Stanza: Open in Word               | editor title bar       |

## Settings

- `stanza.exportOnSave` (default `true`): write the DOCX of a document into the build folder of its project when the document is saved.

Add `build/` to the `.gitignore` of a project.

## Following links

Hover a Stanza link for its destination and the Ctrl/Cmd-click hint. Holding Ctrl (Cmd on macOS) underlines the hovered link and shows a pointer. Ordinary clicks remain editing actions.

Both `#id` and `relative-file.stanza.md#id` resolve by a project-wide block ID, so links keep working when headings are renamed or documents move. A stale filename shows a warning in Problems with a quick fix for the path; navigation and DOCX export already use the actual location. For bulk fixes, the Stanza command line has `stanza format . --fix-references`.

File-only `.stanza.md` links open that document. Missing or duplicate IDs and Markdown title fragments produce errors rather than guesses.

## Project link schemes

Declare URL templates in the project's `stanza.yaml`:

```yaml
link-schemes:
  jira: https://example.atlassian.net/browse/{id}
```

Use the **Link** button with `jira://PROJ-123`. The Markdown keeps `[ticket](jira://PROJ-123)`; the editor and the DOCX use `https://example.atlassian.net/browse/PROJ-123`. Ctrl/Cmd-click opens the address in the browser, and hover shows it.

Scheme names are lowercase and may not be built-in schemes. Templates must be HTTP(S), without credentials, with exactly one `{id}` after the host. Unknown schemes and missing IDs appear in Problems and block export. Pasted links with an unsupported destination keep their text and lose the link, with a notice.

## Document properties

Expand **Document properties** above the page, or use **Metadata** in the toolbar. The panel is part of the editor, not of the printed document.

Edit title, authors, classification, page template and custom properties. The panel shows which values are set in the document, which are inherited from `stanza.yaml` (with **Override** and **Use project default**), and which known fields are not set yet. Showing defaults never writes them.

Custom properties are plain text (also multiline) or lists of text. Values are never reinterpreted: `0012` and `true` stay text. **Open project metadata definition** opens `stanza.yaml`.

**Apply** makes one undoable edit; **Cancel** discards the draft. Save as usual to keep the change. If the document changes on disk while you have a draft, you are asked to reload or cancel rather than overwrite the newer version.

## Maintaining the document list

The `documents` list in `stanza.yaml` sets the order of the documents in a project. Run **Stanza: Initialize Document List**, from the Command Palette or the project's context menu in the Stanza view, to create it from the documents that exist.

New Document, Import Word Document and Adopt Markdown File add to the list. In the Stanza view in the Explorer, right-click a document for **Move Document Up**, **Move Document Down** or **Move Document to Group**. These change the list only, not file names or content.

Problems offers quick fixes to add an unlisted document or, after you confirm, to remove an entry whose file is gone. Changes to `stanza.yaml` are undoable and are not saved automatically; a notification offers **Save project file**.

## Opening documents

A large project opens in two steps: the document is shown read-only at once, and becomes editable when the project-wide checks are done. Opening a document never reformats or rewrites it. The **Stanza** output channel reports how long both steps took; the timings stay on your machine.

## Reviewing in Word

Run **Stanza: Push for Review** on a document to build it and write it to a review folder, such as one that OneDrive syncs with SharePoint (or `stanza review push <document> <folder>`). The next push replaces the file there, so its link and history stay, unless reviewers saved it since and you have not pulled that version yet; then you choose to replace it anyway or to write a new file beside it. You can also send the DOCX from `build/` yourself; reviewers comment in Word as usual. Every DOCX records which document and Git revision it was built from, and carries its own source, so the comments can be traced back. Run **Stanza: Pull Review Comments** with the commented file: it writes a review document in `reviews/`, with one heading per comment thread, linked to the commented text, and with replies, resolved state and reactions. Changes that reviewers made to the text are listed, never applied. Only display names are written, never email addresses. Review documents are checked like other documents and are not built.

The editor shows the open comments of every review of a document beside the commented text, as cards next to the page, or as numbered markers in its margin when the editor is narrow. Click a highlight or a card to link the two. **Resolve** and **Reopen** change only the status line in the review document and save it; when the review document has unsaved changes of its own, Stanza asks first. **Open in review** goes to the thread in the review document, and the **Resolved** button in the toolbar shows the resolved comments too. A comment whose text was rewritten stays at its block, marked as changed; one whose block is gone is listed above the page.

Exported documents are protected so that reviewers can only comment. Word for the web cannot comment on a protected document, so for review in SharePoint or OneDrive in the browser, set `review-protection: none` in `stanza.yaml` (or build with `stanza build --protection none`). Changes that reviewers then make to the text are listed by the pull, never applied.

## Known limitations

- GitHub's own anchors for block IDs are not supported yet.
- Links to outside addresses are not checked for existence.
- Version, date and revision from Git are shown as unavailable in the document properties until they are generated.
- **Open in Word** is not available in remote or web sessions.
- The text of a pulled comment is plain text; its bold, italic and links are not kept yet.

## License

MIT. Source and issues: [github.com/WimYedema/stanza](https://github.com/WimYedema/stanza).
