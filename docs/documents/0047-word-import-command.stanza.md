---
stanza-format: 1
title: "ADR 0047: Importing a Word document into a project"
---

<!-- stanza: #85bywzx0w8 -->
# ADR 0047: Importing a Word document into a project

Status: Accepted

<!-- stanza: #0804gebkk3 -->
## Context

ADR 0043 describes what the import carries over, and says that the command line and VS Code write one new document into a project, never over an existing file, assign IDs, and show the report like other diagnostics. The reading itself is in `import-docx` (ADR 0045, 0046). This record settles how a document is written into a project, and how the two hosts show the result.

<!-- stanza: #a5cek4a340 -->
## Decision

<!-- stanza: #t121fsg07m -->
### The logic

`importWordDocument` in the `project` package takes the storage of a project, the bytes of the Word file and its name, and writes one document. The hosts read the Word file themselves, since it is outside the project and the storage port reads text only. Like `createProject`, it takes random bytes from the host (ADR 0042).

The project has to be in order: the project file and the stylesheet load without errors. Otherwise nothing is written and the reason is given, because the new IDs have to be unique across the project and the new document is checked against its stylesheet. Documents that have errors of their own do not stop it.

<!-- stanza: #d04ec2a8p1 -->
### The new document

- **Where and what name.** `documents/<name>.phrase.md`, where the name is made from the name of the Word file with the rules of the first document (ADR 0042). A name that is taken gets a number (`name-2`, `name-3`), so that importing the same file again makes a new document and never changes an existing one. This differs from "New Document" (ADR 0044) on purpose: there the person typed the title and a clash is theirs to resolve, while here the file name is a by-product.
- **Title.** From the Word file (ADR 0045), else the name of the file.
- **IDs.** Every heading and table gets a new ID that is unused in the project (ADR 0020, 0024).
- **Canonical form.** The text is written by the serializer.

<!-- stanza: #axepgcwdj8 -->
### Checking

The new document is written first and checked against the project afterwards. Errors that the project finds, such as a required metadata field that a Word file cannot supply, are shown and make the command line exit with 1, but the document is kept: the content is the point, and the person fixes the metadata in the editor.

<!-- stanza: #a58da9b2aq -->
### The report

The report of ADR 0043 is turned into lines of text by `describeImport`, shared by both hosts: severity, message, count when it is more than one, the first places, and a summary of the Word styles that were used.

- **Command line.** `phrase import <file.docx> [project]` prints what was written, the report lines indented under it, then the project's diagnostics for the new document in the usual form. Exit codes follow ADR 0014: 0 when written without errors, 1 when the project finds errors in the new document, 2 for wrong usage, a Word file that cannot be read or is not a DOCX, or a folder that is not a project in order.
- **VS Code.** "Phrase: Import Word Document" asks for the project when the editor in front is in none, then for a `.docx` file, writes the document, opens it in the Phrase editor, and writes the report to the Phrase output. A message names the new document and has a button that shows the output. The Problems panel is not used, since it is refreshed on every edit and the report is about the import, not the document.

The command works wherever the workspace file system does, so in a remote window too.

<!-- stanza: #md64cdr1a8 -->
## Consequences

- A person can start from a Word file with one command, and the content is there with a list of what to look at.
- An import that the project flags with errors still writes the file, so a failed check leaves a document to fix, not a document to redo.
- The report is read in the output, not next to the text. Putting it at the places in the document would need places in the document model that the import does not have.

<!-- stanza: #v3gwebjqff -->
## Alternatives considered

- **Refusing when the name is taken.** It makes importing again impossible without renaming the Word file.
- **Not writing a document that has errors.** The errors of an import are mostly about metadata, and a refusal would throw away content that is fine.
- **Showing the report in the Problems panel.** It would vanish at the next edit.
