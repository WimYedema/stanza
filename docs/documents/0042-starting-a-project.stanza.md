---
stanza-format: 1
title: "ADR 0042: Starting a project"
---

<!-- stanza: #0fzb7p72k4 -->
# ADR 0042: Starting a project

Status: Accepted

<!-- stanza: #sj9j2wm9bk -->
## Context

A project is a folder with `phrase.yaml`, a stylesheet and documents (ADR 0007, 0014). Until now it had to be written by hand or copied from the example, which stops the first success criterion of the vision: creating a local project and authoring in it without entering markup.

<!-- stanza: #q9jbww9eb6 -->
## Decision

<!-- stanza: #5qdnwzkesq -->
### The command

"Phrase: New Project" asks for a folder with the open dialog and for a title with an input box, whose suggestion is the name of the folder and which cannot be empty. It writes the project and opens the first document in the Phrase editor. Cancelling either question writes nothing.

When the folder is not inside a workspace folder of the window, the project of a document is not found (ADR 0025), so the command offers to open the folder and names the file to open there, instead of opening a document that would be refused.

<!-- stanza: #cn8kk176b9 -->
### What is written

The logic is `createProject` in the `project` package, over the storage port (ADR 0014), so that the command line or a browser host can use it. It writes three files and nothing else:

- `phrase.yaml`: the format version, the title and the path of the stylesheet.
- `styles/default.yaml`: the default stylesheet.
- `documents/<title as a file name>.phrase.md`: a first document with the title as metadata, a heading 1 with an ID and a line of text. It is made with the serializer, so that it is in canonical form, and the ID comes from random bytes that the host supplies, as for the editor (ADR 0024).

It writes nothing and says which files are in the way when any of the three exists. Other files in the folder are left alone. An empty title is refused, spaces in a title are normalised, and the file name is the title in lower case letters and digits joined by hyphens (`document` when nothing is left).

<!-- stanza: #51k9k2ae5d -->
### The default stylesheet

It is the plain look of the example project, as text with comments, so that it can be edited by hand or in the style editor:

- Calibri and Consolas as the font tokens, and four color tokens.
- `body`, headings 1 to 6 with numbering on the first three levels, `code`, the two list styles, the table cell, header and footer, and the table of contents levels.
- the character style `marker`.
- a plain table and a grid table, with labels that say which is which (ADR 0034).
- an A4 page with the title in the header and "Page x of y" in the footer, and page numbers in the table of contents.

There are no cover page, no project defaults for authors or classification, and no second page template. A test loads the result, checks the first document and builds a DOCX from it, so the default cannot fall out of step with the validation or the exporter.

<!-- stanza: #jr88ah9e4y -->
## Consequences

- A person can start from nothing, and what they get builds and exports without errors.
- The default look is a decision that people will change; it lives in one file of the `project` package.
- Adding more documents still means making files by hand, until the item on a command for new documents.

<!-- stanza: #027eve23nf -->
## Alternatives considered

- **Copying the example project.** It has two documents, custom metadata fields and a Letter template that a new project does not need, and it is a fixture of the tests.
- **A wizard with choices of look.** One default is enough to start, and the style editor changes it.
- **Writing the stylesheet from the fixture at build time.** A string in the package has no build step, and the test keeps it valid.
