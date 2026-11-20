---
stanza-format: 1
title: "ADR 0060: Adopting a Markdown file as a Phrase document"
---

<!-- stanza: #htygrqrgtn -->
# ADR 0060: Adopting a Markdown file as a Phrase document

Status: Accepted

<!-- stanza: #yjmdvmh45z -->
## Context

People have ordinary Markdown files (notes, READMEs, wikis) that they want to continue as Phrase documents. The dialect (ADR 0001) is Markdown-based, and its reader already reports what it cannot hold, but it refuses a file without front matter and ignores reference links.

<!-- stanza: #3s47t4zy0j -->
## Decision

- **Reading** (`adoptMarkdown` in `format`). The reader of the dialect, on a body with no front matter needed, and with reference links switched on so that `[a][b]` becomes an ordinary link and the definitions drop out. A file that already has `phrase-format` in its front matter is refused: it is a Phrase document (`phrase format` is for it). Other front matter is read as YAML; a `title` that is text is kept, and the other keys are left out and named in the report.
- **The report** is the findings of the reader, grouped by code with a count and the first lines, in the shape of the Word import report (ADR 0043). Content that is gone is a `warning`: thematic breaks, raw HTML (block and inline), unknown blocks. What is kept in another form is `info`: block quotes (their content stays as ordinary blocks), hard breaks (a space), images (the alt text), link titles, column alignment, list start numbers, fence words after the language, reference links turned into links, front matter keys left out.
- **Writing** (`adoptMarkdownDocument` in `project`, like ADR 0047): `documents/<name>.phrase.md` from the name of the Markdown file, a number when the name is taken, never over an existing file or the original. The title is the front matter title, else the file name. IDs are assigned and the serializer writes the canonical form. The project has to be in order. Checking against the project happens after writing; its errors are shown and the document stays. The code shared with the Word import (free name, IDs, writing, checking) is one function.
- **Hosts.** `phrase adopt <file.md> [project]` with the exit codes of `phrase import`; "Phrase: Adopt Markdown File" in VS Code, which asks for the file, opens the new document in the Phrase editor and writes the report to the Phrase output.

<!-- stanza: #12040n11kk -->
## Consequences

- A Markdown file becomes a document with one command and a list of what to look at.
- The report names lines of the source, which the Word import cannot do.
- GitHub extras that the reader does not know (strikethrough, task lists, footnotes) stay as literal text and are not reported.
