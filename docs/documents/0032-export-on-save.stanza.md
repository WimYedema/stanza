---
stanza-format: 1
title: "ADR 0032: Export on save"
---

<!-- stanza: #fcwt21bppz -->
# ADR 0032: Export on save

Status: Accepted

<!-- stanza: #wd8yh68r2h -->
## Context

The editor reads and writes Markdown, and the reason for the product is the Word document that comes out of it. Building by hand with the command line after every save is a step that gets forgotten, and the DOCX that a reviewer opens is then out of date. The exporter and the command line exist (ADR 0014, 0008), and the extension reads the project as it is open (ADR 0025).

<!-- stanza: #e9qsdt7tgv -->
## Decision

When a `*.phrase.md` document of a project is saved, the extension writes its DOCX to `build/`, at the path the command line uses (`documents/a.phrase.md` gives `build/documents/a.docx`). The setting `phrase.exportOnSave`, on by default, turns it off. It is a save of the file in any editor, so it also covers a document saved from the visual editor.

<!-- stanza: #mc1p4dftnq -->
### What is exported

`exportDocument` in the `project` package takes a project that was loaded and the path of one document. It reads what is open, as the editor does, so the DOCX matches what the person sees, also when the stylesheet has an edit that is not saved yet (ADR 0026). It applies the project defaults and uses the same exporter as the build.

The date written into the file is the fixed date of the command line (`DEFAULT_BUILD_DATE`, now shared), so the same text gives the same bytes. It is replaced when the build information item arrives.

<!-- stanza: #kjdzmawt7w -->
### When nothing is written

- **Errors stop it.** An error in the project file, the stylesheet or the document itself stops the export. An error in another document does not, since this file does not depend on it. Nothing is written, so the DOCX of an earlier export stays as it was and is not half replaced.
- **Where the errors show.** The errors of loading are in the Problems panel as always. What the exporter itself finds is shown in a second collection, `phrase-export`, replaced at the next export of the document. A line in the status bar says that the document was not exported and why.
- **A file that cannot be written.** If writing fails, as when Word has the DOCX open, an error message says so, with the reason and the advice to close the file in Word and save again. A DOCX that Word has locked is not replaced silently or retried.
- **Not in a project.** A document with no `phrase.yaml` above it is left alone. The editor already says why.

Exports run one at a time in the order of the saves. A successful export says so in the status bar for a few seconds and asks for nothing.

<!-- stanza: #15phytnb92 -->
### Not in this record

Saving the stylesheet or the project file does not export the documents that use it. That is the build command of the extension (backlog), where all documents are written at once. The output folder is `build/` and is not configurable.

<!-- stanza: #v6zm9kgb9t -->
## Consequences

- The DOCX next to the document is as old as the last save, not older, without a step to remember.
- Changing a style and saving the stylesheet leaves the DOCX files as they were until each document is saved or the project is built.
- Every save of a document loads the project once more and exports one document. For a large project this may need a closer look.
- The `build/` folder is ignored by Git, so exports leave nothing to commit.

<!-- stanza: #4bzs9r6r13 -->
## Alternatives considered

- **Exporting the whole project on every save.** Simple, but it writes files that did not change, and a document with an error elsewhere would keep a good document from being exported.
- **Exporting from the text on disk.** It would miss an unsaved edit of the stylesheet, which the editor already shows.
- **Retrying a locked file.** It hides the problem that someone has the old version open.
