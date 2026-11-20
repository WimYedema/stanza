---
stanza-format: 1
title: "ADR 0076: Agent editing workflow"
---

<!-- stanza: #b8j3esxvnx -->
# ADR 0076: Agent editing workflow

Status: Accepted. Refines ADRs 0014, 0015, 0020 and 0061.

<!-- stanza: #8v0b1v5353 -->
## Context

Generated instructions prescribe a command that may not be installed and whole-project formatting for every edit. Agents need a dependable local invocation, small edits and bounded diagnostics without weakening project-wide identity checks.

<!-- stanza: #5mzayxjb3e -->
## Decision

- Document building a local checkout, invoking its CLI directly with Node, and optionally linking its executable. No registry download or new service is needed to run it after setup.
- Reuse `validate`: it is read-only and already checks the project, stylesheet, metadata, IDs and project-wide reference destinations. It does not fetch external links or support Markdown title fragments.
- `validate` and project-directory `format` accept repeated `--file` paths relative to the project. Reject unsafe paths, non-document paths and missing selections. Formatting changes only selected files. With ID assignment, read all project documents to reserve their IDs; an unreadable document still prevents assignment.
- Selected validation reads the whole project for context, reports selected-document diagnostics plus project/stylesheet, duplicate-ID and unreadable-file diagnostics. It is not a full-project certification. `--max-diagnostics N` bounds printed diagnostics, not checking, totals or exit status; omitted diagnostics are counted explicitly.
- Generated instructions link to their embedded syntax reference, explain immutable project-wide IDs and reference behavior, and prescribe checks after a coherent batch. Report unrelated existing failures rather than silently repairing them or claiming validation passed.
- Existing user-owned `AGENTS.md` files are never overwritten.

<!-- stanza: #nav7dm3fyz -->
## Consequences

No persisted format changes. Small-file workflows retain project-wide reference and ID safety. Diagnostics retain source lines when known and structured paths otherwise; explicit available fixes are shown, never applied by validation.
