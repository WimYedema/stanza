---
phrase-format: 1
title: "ADR 0002: Host environment and dependency policy"
---

<!-- phrase: #6jps6cyntz -->
# ADR 0002: Host environment and dependency policy

Status: Accepted. Package list extended by ADR 0014. The `vscode` package is called `phrase-vscode` and is bundled by `esbuild`: ADR 0025.

<!-- phrase: #b2qjj8ze19 -->
## Context

The product is local-first. Its first user is a developer who works in VS Code and Git, and published documents go to Word users. Core authoring, validation, rendering, and export must not need a backend, an account, or a network connection. A browser version is wanted later.

The spike (`docs/SPIKE_FINDINGS.md`) showed that Pandoc can produce the documents but brings its own quirks and cannot run in a browser or web extension.

<!-- phrase: #amzcdx37w9 -->
## Decision

<!-- phrase: #vkpazyqv7x -->
### Host

Build in this order:

1. A command-line tool (Node) for validation and build.
1. A VS Code extension with a custom text editor that hosts the Tiptap editor in a webview and is bound to the Markdown file.
1. A browser host later, through VS Code for the Web or a standalone page.

Electron is not planned. If a standalone app is ever needed, it wraps the same packages.

Commit support comes from VS Code's built-in Git. The command line and a browser host have no Git integration.

<!-- phrase: #d1wqbypf09 -->
### Packages

A monorepo with these packages:

<!-- phrase: #x6gmjy7p23 -->
| Package | Contents | Environment |
| --- | --- | --- |
| `core` | Domain model, styles, references, validation | Isomorphic, no dependencies |
| `format` | Markdown parser and serializer (ADR 0001) | Isomorphic |
| `export-docx` | DOCX adapter | Isomorphic |
| `cli` | Commands | Node |
| `editor` | Tiptap integration | DOM |
| `vscode` | Extension | VS Code |

`core`, `format`, and `export-docx` use no Node built-ins and no DOM. File access goes through the `ProjectStorage` port. A lint rule enforces package boundaries.

<!-- phrase: #v8qhwyv0t4 -->
### File naming

Documents use the extension `.phrase.md`, so the custom editor can claim them by name pattern. GitHub still renders them as Markdown.

<!-- phrase: #a3kxe3j7vf -->
### Dependency policy

1. Core features need no network at runtime. No dependency may call a remote service, require an account, or send telemetry. Network use during development, such as installing packages, is fine.
1. Only permissive licenses (MIT, Apache-2.0, BSD, ISC). No GPL or AGPL.
1. The product requires no external executables. Pandoc, LibreOffice, and a Typst executable are not product dependencies. Development-only tools may use them.
1. Third-party library types stay inside their adapter.
1. The lockfile is committed. The exporter version is recorded in build metadata so output can be reproduced.
1. A new dependency that processes document content needs a written justification.

<!-- phrase: #gccfynxafj -->
### Pandoc

Not a product dependency. The spike tooling that uses it is development-only and is removed when superseded.

<!-- phrase: #ea5wr1ywqj -->
### DOCX writer

The `docx` npm library (MIT), isolated in `export-docx`. It supports declarative paragraph and character styles, numbering, bookmarks, headers and footers, page numbers, and a table of contents field with cached entries. Open questions are table styles and autofit layout; the backlog item on verifying the library covers them. It does not read DOCX, so importing Word comments needs separate code.

<!-- phrase: #6gj56t7zs6 -->
## Consequences

- The same core runs in the CLI, the extension, and later the browser.
- No Pandoc quirks, and no binary to distribute or pin.
- We implement the mapping from our model to the library ourselves.
- Without Git in the browser host, committing there is out of scope.
- If the `docx` library cannot meet the table or layout needs, we generate the missing parts ourselves or reconsider the library. That would be escalated before work continues.

<!-- phrase: #m946h69jmc -->
## Alternatives considered

- **Pandoc as the exporter.** Fast to start, but see the spike findings: direct formatting for bold and italic, forced cell styles, unreliable widths, its own numbering, and a binary dependency.
- **Electron.** Needs our own Git UI, file handling, and packaging.
- **Browser only.** The File System Access API is limited to Chromium, and there is no Git.
- **Own OOXML writer.** More control, but contradicts the rule against building a DOCX package writer when a maintained one exists.
