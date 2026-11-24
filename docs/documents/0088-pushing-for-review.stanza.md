---
stanza-format: 1
title: "ADR 0088: Pushing a document for review"
---

<!-- stanza: #bkxvqr9zgf -->
# ADR 0088: Pushing a document for review

Status: Accepted. Backlog item 139. Builds on ADR 0084 (the stamp and `review pull`) and ADR 0085 (the protection by destination). Decided with the product owner on 2026-11-24.

<!-- stanza: #8haae6h5fd -->
## Context

A review round starts with a DOCX in a place where reviewers can open it: a folder that the OneDrive client syncs with SharePoint, or any folder that is shared otherwise. Until now the author builds the project and copies the file by hand. The remote areas of items 132 to 136, which will name such folders in the project file, do not exist yet.

A file in SharePoint has a link, sharing and a version history. Reviewers comment in it, in Word desktop or in the browser, and the author pulls the comments into a review document (ADR 0084). When the document changes, the next round needs the new text in front of the reviewers.

Two ways are possible: replace the file that is there, or put a new file next to it. A new file needs a new link and new sharing, and leaves the old one where reviewers go on commenting by mistake. Replacing keeps the link, the sharing and co-authoring, and SharePoint keeps the old version with its comments in the version history. But a replaced file loses the comments that are in it, and the OneDrive client keeps both copies, one named after the computer, when the file changed in SharePoint while it is replaced.

<!-- stanza: #3nbb6bkhra -->
## Decision

- **`stanza review push <document> <destination> [project]`** and the VS Code command **Stanza: Push for Review**, on the document of the editor, build one document and write it to a destination outside the project: a folder, where the file is named as in `build/` (`<name>.docx`), or the path of a `.docx`. VS Code asks for the folder and remembers it per document. When the remote areas exist, the `exchange` area becomes the destination (item 139 follows them then).
- **The file is built as a build does:** stamped, with its source (ADR 0084), with the protection of the project or `--protection` (ADR 0085), and with `--date` for its date. A document with errors is not pushed.
- **A file that is there is replaced, by default.** It keeps its link, sharing and version history.
- **But not when that loses something.** Before replacing, the push reads the file that is there:
  - **Saved since it was pushed:** the exporter writes the same time as created and as modified, and Word changes only the modified time when it saves. A file saved since is replaced only when a review document of this document was pulled from that save or a later one (the time of the last save in its opening paragraph, ADR 0084). Otherwise the push refuses and says to pull first, with the number of comments in the file. This covers new comments, replies, resolved threads and edits alike.
  - **Of another document,** by its stamp or bookmarks, or **not a DOCX of this project:** refused, since the destination is probably wrong.
  - `--force` replaces the file anyway; VS Code asks first.
- **`--new` writes a new file** beside it, `<name>-<date>.docx` with a number when the name is taken, for a round whose file must stay as it was, such as one sent for approval. The date is the day of the push.
- **A file that is open in Word,** and so cannot be written on Windows, is reported, as in a build.
- **Nothing goes back into the file:** the open comments of the reviewers are not in the new file. They are in the review document and beside their text in the editor (ADR 0086).

<!-- stanza: #wamybvzr04 -->
### In the editor

Added on 2026-11-24 at the request of the product owner, so that a round is two buttons where the document is edited.

- **A review group in the toolbar** of the Stanza editor: **Push**, with a menu to push to another folder, to push as a new file and to open the review folder; and **Pull**.
- **Push** goes to the remembered folder without a dialog; only the first push asks for one. The question when the file there may not be replaced is the same as for the command.
- **Pull** takes the file that was pushed to the review folder, so push and pull always work on the same file, and asks for a file only when there is none. It stays in the document, where the comments show beside their text, and offers to open the review document.
- **Where the round stands**, beside the buttons: not pushed; pushed, with no changes; changed since the push, when the document is not the one the file was built from, by the content hash of its stamp; a number of new comments, when the file was saved since and that save was not pulled, which comes before the rest; or that the file there is of another document. The button that is due is drawn as the primary action. The host works this out (`reviewRoundStatus` in `project`) when the editor opens, when the document or the project changes, after a push or a pull, and when the file in the folder changes, which it watches, since OneDrive writes it when reviewers save.
- **The commands stay:** Push for Review and Pull Review Comments are in the palette and in the menu of the editor's title bar. From the palette, Pull asks for a file and opens the review document, as before.

<!-- stanza: #dbcykzn66e -->
## Consequences

- One file per document in the review folder, with one link for the whole review, and its rounds in the version history of SharePoint.
- A push cannot silently drop comments that were not pulled. Within the same minute as a pull, a later save is not told apart, since the review document gives the time to the minute.
- Reviewers see a file without their earlier comments after a push; the author answers them from the review document. Whether to carry open threads into the new file is left open, since it would be the first thing that goes from Git into a DOCX.
- The rule depends on Word leaving the created time alone. The files of the spike of item 203 show that Word desktop and Word for the web both do; Word for the web writes the times with seven decimals, so they are compared as times, not as text.
- Tests: pushing to a folder and to a path; replacing a file that was not saved, one that was pulled, and refusing one that was saved and not pulled, one of another document and one that is not of the project; `--force` and `--new` with a taken name; a document with errors.

<!-- stanza: #ja9te4sas2 -->
## Alternatives considered

- **A new file for every push.** Every round needs a new link and new sharing, and old files collect comments that are never pulled.
- **Pulling as part of the push.** The author would not see what came back before it disappears from the file, and a pull writes a review document, which is a decision of its own.
- **Comparing the comments of the file with the review documents.** A review document names a thread by the Word comment ID of its first comment, not its replies, its resolved state or edits to the text; the time of the last save covers all of them.
