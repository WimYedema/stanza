# Changelog

## Unreleased

- A push says how many comments leave the file it replaces, and VS Code asks first, with a choice not to ask again.
- Review buttons in the Stanza editor: **Push** to the document's review folder, **Pull** from the file pushed there, and a status that says which is due, such as new comments from reviewers.
- **Stanza: Push for Review** and `stanza review push` build a document and write it to a review folder, replacing the file there unless it was saved in Word and not pulled, or writing a new one beside it.
- Review comments in the editor: the comments of a document's reviews are shown beside the commented text, as cards or as markers in a narrow editor, and can be resolved, reopened and opened in their review document.
- `review-protection: none` in `stanza.yaml` exports documents without the protection for comments, so that reviewers in Word for the web can comment.
- Building no longer stops when one of the files is open in Word: that file is reported and the others are written.
- Every exported DOCX records the document, the Git commit and whether it had uncommitted changes, and carries its own source, hidden in the file.
- **Stanza: Pull Review Comments** writes the comments of a reviewed DOCX into a review document in `reviews/`: one heading per thread, linked to the commented text, with replies, resolved state and reactions, and the changes reviewers made to the text, which are never applied.

## 0.1.0

First public release, as an alpha pre-release.

- Visual editor for `*.stanza.md` documents, bound to the Markdown file.
- Style editor for a project's stylesheet ("Open With" → Stanza Styles).
- DOCX export into the project's `build/` folder on save, and "Open in Word".
- Stanza view in the Explorer with the project's documents and headings, and commands to keep the document list in order.
- New Project, New Document, Import Word Document and Adopt Markdown File commands.
- References between documents by block ID, with diagnostics and quick fixes.
- Project link schemes such as `jira://PROJ-123`.
- A document properties panel for title, authors, classification and custom metadata.
