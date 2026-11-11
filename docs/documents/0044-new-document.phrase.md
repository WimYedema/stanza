---
phrase-format: 1
title: "ADR 0044: Adding a document to a project"
---

<!-- phrase: #yp9ymy7tpq -->
# ADR 0044: Adding a document to a project

Status: Accepted

<!-- phrase: #8m9cj8pp0x -->
## Context

A project holds several documents (ADR 0007, 0014), but only the first is written for the person (ADR 0042). More documents meant files made by hand, with front matter and an ID typed in.

<!-- phrase: #z93nbggzyq -->
## Decision

"Phrase: New Document" in the VS Code extension adds a document to a project and opens it in the Phrase editor.

<!-- phrase: #2jqsp0cx73 -->
### Which project

The project of the file in front. When that file is in none, or no file is in front, the only project of the workspace is used, or the one that is picked from several. With no project the command says so and writes nothing.

<!-- phrase: #8jgtf2hmbj -->
### What is written

The logic is `addDocument` in the `project` package, over the storage port, next to `createProject`. It asks for a title, which cannot be empty, and writes one file, `documents/<title as a file name>.phrase.md`, with the same rules for the file name as the first document. The content is the one of the first document of a new project: the title as metadata, a heading 1 with an ID from random bytes that the host supplies (ADR 0024), and a line of text, in canonical form through the serializer.

The folder is always `documents/` of the project root. Documents elsewhere in the project are found as before (ADR 0014); this command does not guess a folder from the open file.

<!-- phrase: #gh3m0kv2w8 -->
### When nothing is written

A file of that name that exists already is never replaced and no other name is made up; the message names the file and asks for another title. An empty title is refused. A write that fails is reported with its reason.

<!-- phrase: #zymf8gy1ry -->
## Consequences

- A project can grow by several documents without hand-written files.
- Two titles that give the same file name collide, and the person changes one.
- The ID of the new heading is random, so it is unique in the project by the odds only; the project check for repeated IDs still reports a clash.

<!-- phrase: #6xkf3jezqb -->
## Alternatives considered

- **A free name made by numbering (`notes-2`).** It hides that the title is taken and gives files that do not match their titles.
- **The folder of the open document.** It spreads documents about on a guess; `documents/` is where the project starts them.
