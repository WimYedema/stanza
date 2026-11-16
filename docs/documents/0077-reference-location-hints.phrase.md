---
phrase-format: 1
title: "ADR 0077: Reference location hints"
---

<!-- phrase: #8hrhdtvdkq -->
# ADR 0077: Reference location hints

Status: Accepted. Refines ADRs 0068 and 0073.

<!-- phrase: #4cfeq4xfqf -->
## Decision

- A reference may be `#id` or `relative-file.phrase.md#id`. The ID is definitive across the project; the relative path is only a checked location hint. Keep `#id` valid, especially within a document. Cross-document links written with a path use the target's current relative path.
- Resolve by ID, never by title or filename. Missing IDs and duplicate IDs are errors, never guesses. A stale path is a warning with an explicit quick fix. Navigation and DOCX export use the actual target without rewriting source.
- File-only relative `.phrase.md` links identify a document, not a referenceable object. Check that the file exists within the project; navigation opens it and DOCX links to its output. Paths cannot escape the project. Encode path segments in links.
- Title fragments remain unsupported and actionable errors. Web and mail links keep their existing behavior.
- A quick fix changes the stale path in its document; `format --fix-references` explicitly fixes stale paths in the selected documents or project. Refuse lossy rewrites. Opening, validating and exporting never repair source.
- Ctrl/Cmd-click shows hover and modifier hints, acknowledges navigation immediately and uses the current project snapshot, not validation on every click. Flush pending edits first; refresh snapshots when project files change.

<!-- phrase: #5020gx79a7 -->
## Format

Document format stays at 1: the link mark already holds an href and both existing references and file links round-trip unchanged. No persisted shape changes or migration; regression tests cover old syntax and deterministic serialization. GitHub anchors are separate, deferred work.
