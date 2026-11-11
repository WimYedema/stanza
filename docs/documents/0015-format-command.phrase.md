---
phrase-format: 1
title: "ADR 0015: The format command"
---

<!-- phrase: #vtds4kmw8z -->
# ADR 0015: The format command

Status: Accepted. Assigning IDs is an option of `format`: ADR 0020.

<!-- phrase: #snx5cwamwn -->
## Context

ADR 0003 defines a canonical file as one that parses and serializes to the same text, rejects non-canonical files in the visual editor, and leaves a command-line `format` command to follow. The parser is lenient and the serializer strict (ADR 0005), so formatting is a parse followed by a serialize. The architecture says that unsupported content is reported and never repaired or dropped silently.

<!-- phrase: #2v2ga85707 -->
## Decision

<!-- phrase: #j371d0wr8b -->
### Command

`phrase format [path] [--check]`. The path is a project directory (default `.`) or a single `.phrase.md` file. For a directory, all documents are formatted, found as `validate` finds them. A single file is formatted without a project file, so a document can be fixed before the project is in order, and the project file need not be valid for a directory either.

<!-- phrase: #7gcypyxmb9 -->
### What formatting does

A document is read as LF text without a BOM, parsed, and serialized. The file is written only if the result differs from the text on disk. CRLF line endings and a BOM therefore count as not canonical. Unchanged files are not touched.

<!-- phrase: #7s6wr8gkha -->
### Documents that are not rewritten

Each parse diagnostic marks something the model cannot hold: HTML blocks, unknown annotation keys, widths on something that is not a table, an annotation without a block, and so on. Rewriting such a document would drop that content. A document with any parse diagnostic, warning or error, is reported with its diagnostics, left byte for byte as it was, and counted as refused.

<!-- phrase: #s9m0prxqgh -->
### Check mode and exit codes

With `--check`, nothing is written and the documents that are not canonical are listed. Exit code 1 means a document was refused or, with `--check`, a document is not canonical. Exit code 2 means a file could not be read or the usage was wrong.

<!-- phrase: #1dbrxy8kg3 -->
### Scope

Only documents are formatted. The project file and the stylesheet have decoders but no serializers, and rewriting them would lose the comments of the author. This command does not assign missing IDs. That adds identity, is not a pure function of the text, and needs the IDs of all documents to stay unique, so whether it becomes an option of this command or a command of its own is decided when it is taken up.

<!-- phrase: #zd5cp8qtpm -->
### Code

`formatDocuments` and `formatProject` are in the `project` package, next to loading and building, so other hosts can reuse them. The storage port of ADR 0014 gains a fourth operation, `writeText(path, text)`, because the isomorphic packages have no text encoder of their own. The shared file discovery moved into one module that loading and formatting both use.

<!-- phrase: #0heb9n626q -->
## Consequences

- A hand-edited document can be made canonical, so the visual editor accepts it.
- `format --check` can run in a CI job, since formatting needs no randomness and gives the same result every time.
- A document with an unsupported construct cannot be formatted until the construct is removed or supported. This is deliberate.
- The stylesheet and project file keep whatever layout their authors give them.

<!-- phrase: #swcqj169gk -->
## Alternatives considered

- **Formatting with the loss reported afterwards.** A rewrite that drops content cannot be undone without Git.
- **Assigning IDs in the same command.** A reasonable follow-up, but it changes the file in a way that is not canonical formatting, and it needs the IDs of all documents to stay unique.
- **Formatting the YAML files too.** The decoders do not keep comments, so it would need a YAML serializer that does.
