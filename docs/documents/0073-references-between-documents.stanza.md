---
stanza-format: 1
title: "ADR 0073: References between documents"
---

<!-- stanza: #jmssbz0b24 -->
# ADR 0073: References between documents

Status: Accepted. Builds on ADR 0068, ADR 0009 and ADR 0072.

<!-- stanza: #yyjrzmy2a5 -->
## Context

A reference is a link to `#<id>` (ADR 0068), checked against its own document. IDs are unique across the whole project (ADR 0001), so a block can be referred to from another document, and moves between documents without breaking the links. The documents of a project are built as separate DOCX files (ADR 0014).

<!-- stanza: #daw4r4r0nr -->
## Decision

- **No new syntax.** A reference to a block of another document is the same `#id` link. It holds no path and no title.
- **The check looks at the whole project.** `validateDocument` and `checkDocumentText` take the IDs of the project (`projectIds`). A reference is broken only when no document of the project has the block, and the message says "this project". A document checked alone still says "this document". The loader reads every document before checking any, so that the IDs are all known. A document that the list leaves out (ADR 0072) counts, since it is checked.
- **The project index** (`indexProjectReferences`) has the targets and the references of all documents, each with its document. `resolveProjectReference`, `findProjectIncoming` and `findProjectBroken` work on it as the ones of ADR 0068 do on one document.
- **In DOCX a reference to another document is a link to its file**, as Word writes it: the file in the relationship, the bookmark of ADR 0009 as the anchor. The path is relative and follows from the paths of the documents, since the outputs mirror them. The exporter gets the blocks of the other documents with their file (`otherTargets`); without them the document stands alone. When the target document is not built, the link is written all the same, with the warning `reference-to-unbuilt-document`.
- **The text of a reference stays as written.** Computed text is a later item.

<!-- stanza: #1r9pbeger4 -->
## Consequences

- Deleting a heading breaks the references to it in every document, each reported in its own file.
- The links work in Word only while the DOCX files sit in the same folder structure as they were built, and the file link has not been tried in Word.
- Not done here: offering the headings of other documents when a reference is made in the editor, following a reference to its target, and listing what points at a block.
