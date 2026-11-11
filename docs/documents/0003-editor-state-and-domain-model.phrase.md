---
phrase-format: 1
title: "ADR 0003: Editor state and the domain model"
---

<!-- phrase: #22k4faa4fq -->
# ADR 0003: Editor state and the domain model

Status: Accepted. The `format` command: ADR 0015. The editor schema is checked against the vocabulary of `core`, not generated from it: ADR 0022. The VS Code host, with the buffer normalised for line endings and the history of VS Code for undo: ADR 0025.

<!-- phrase: #sq0bbxkxey -->
## Context

The editor is Tiptap on ProseMirror, running in a VS Code webview bound to a Markdown file (ADR 0002, ADR 0001). The canonical content is the domain model in `core`, not a ProseMirror document. Two risks follow: duplicating editing logic in a command layer, and letting the editor's model drift from the domain's vocabulary.

<!-- phrase: #mp17vjen1c -->
## Decision

<!-- phrase: #sjj7bpepxz -->
### Which model is authoritative

While a document is open, the ProseMirror document is authoritative for the editing session. The editor package converts it to the domain model and serializes it on every change. When the file changes outside the editor, for example after a Git checkout, the editor parses the file, converts it to ProseMirror, and replaces its state.

There is no domain command layer. Editor transactions are not a persistence API, and domain commands are not translated into transactions.

<!-- phrase: #bjcvd31tn5 -->
### Editing rules

Rules about what an edit may do are pure functions in `core`, for example whether a mark may apply in a given style. The editor adapter calls them. They are driven by declarations in the style definitions themselves, such as which variants a style offers, so the rules ultimately live in the stylesheet, not in code.

The node and mark vocabulary is declared once in `core`. The editor builds its ProseMirror schema from that declaration, so the two cannot drift apart.

<!-- phrase: #9fhz34ab2k -->
### Writing changes to the file

The editor sends the new serialized text. The extension computes a line diff against the current document text and applies only the changed ranges to the open VS Code document. It never replaces the whole document.

<!-- phrase: #q6fbcmzhr6 -->
### Non-canonical files

A file is canonical when parsing and serializing it gives the same text. Opening a file never rewrites it. Initially, a non-canonical file is rejected by the visual editor: it is reported as a diagnostic and can still be opened as text. A command-line `format` command and an offer to format on open can follow later.

<!-- phrase: #j2144w1ag0 -->
### Diagnostics

`core` diagnostics are the single source. The extension maps them to VS Code's Problems panel, and the editor can show them inline.

<!-- phrase: #7rx1g7c122 -->
### Undo and redo

Undo and redo use VS Code's text history. The webview forwards the commands and re-renders when the document changes, mapping the selection afterwards. If that proves unworkable, ProseMirror's own history inside the webview is the fallback. This is settled during the editor integration (backlog: VS Code custom text editor).

<!-- phrase: #tz3z3hht69 -->
### Paste

Pasted content is normalised at the editor boundary. Supported semantic structure is kept. Direct-formatting attributes are removed and unsafe HTML is sanitised.

<!-- phrase: #604k7ckaq8 -->
## Consequences

- Editing logic is not duplicated. ProseMirror edits, and `core` validates what results.
- Every change round-trips through conversion and serialization, so conversion must be fast enough to run on each change, and deterministic.
- Minimal text edits keep VS Code's undo, cursor, and Git behavior sensible.
- Rejecting non-canonical files at first is strict, but avoids surprising rewrites. A hand-edited file needs the CLI formatter or a manual fix before the visual editor accepts it.
- Moving rules into style definitions makes the stylesheet schema more important (backlog: typed stylesheet).

<!-- phrase: #nwaky1j88k -->
## Alternatives considered

- **Domain model authoritative, with a command layer.** Duplicates ProseMirror's editing logic and needs a transaction mapping.
- **ProseMirror JSON as the canonical format.** Rejected by the product constraints: it couples storage to the editor.
- **Replacing the whole document on each change.** Breaks undo, moves cursors, and makes every save a full rewrite.
