---
stanza-format: 1
title: "ADR 0079: Document-list maintenance"
---

<!-- stanza: #bvj4x4mhb0 -->
# ADR 0079: Document-list maintenance

Status: Accepted. Refines ADR 0072.

<!-- stanza: #dnvr7rpej1 -->
## Context

An explicit outline must stay in step with document creation. Authors also need to initialize it and change document order and grouping without moving files.

<!-- stanza: #qt341ry7xz -->
## Decision

- "Initialize Document List" explicitly adds `documents` from discovery, in path order, only when absent. Existing membership and order are preserved; an empty project gets `[]`.
- New document, Word import and Markdown adoption append at the outline root when it exists. They do not create an outline implicitly. Preflight its edit before writing the new file.
- The Phrase view offers document context actions: Move Up/Down within the current group, and Move to Group, including the project root and existing nested groups. Empty groups stay. No filesystem moves, new groups or changes to block IDs.
- Unlisted documents offer an add-to-list quick fix. Missing entries offer removal, with confirmation and a fresh applicability check. Never guess a renamed file.
- `format` edits only the `documents` pair with YAML nodes and source ranges, retaining comments and line endings; unrelated settings stay byte-for-byte. The changed pair may be re-laid out. Invalid YAML, anchors, aliases and unsupported layouts are explicit refusals. Format stays 1; the representation is unchanged, so no migration.
- VS Code makes undoable project-buffer edits, preserving unsaved settings, with a save reminder and explicit save action. Other hosts persist through storage. Refuse stale project/group snapshots and refresh diagnostics after edits.

<!-- stanza: #yjkjr7a1j9 -->
## Consequences

The shared creation use cases also maintain lists for CLI import/adopt. Storage has no multi-file transaction: if the list write fails after file creation, report that the file may exist and require inspection before retrying; never delete it or claim success.
