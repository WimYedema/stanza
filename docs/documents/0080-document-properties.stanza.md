---
stanza-format: 1
title: "ADR 0080: Document properties"
---

<!-- stanza: #x0v78t4a55 -->
# ADR 0080: Document properties

Status: Accepted. Refines ADRs 0007 and 0025.

<!-- stanza: #72c268sxb3 -->
## Decision

A collapsible properties panel sits above the document, outside the printable sheet. A toolbar button reveals and focuses it. Opening it never changes source.

Distinguish document values, inherited project defaults with their origin, known but absent built-in and declared fields, and read-only system/generated values. Override copies an inherited value only on explicit request; Use project default removes the document override. Never persist defaults just because they are displayed.

Custom properties remain plain text or ordered lists of text, including empty and multiline values. No Markdown interpretation or number, boolean or date inference. Absence differs from an empty string or list. Add and Remove are explicit. New names are non-reserved kebab-case. Declarations supply labels, types and required status; undeclared properties remain editable with the existing warning. Opening the project definition is explicit and never edits its schema automatically.

Apply submits one undoable change to the current VS Code buffer; normal Save persists it. Cancel discards the draft. Keep body, block IDs and selection. Flush pending body typing first. The host checks the expected source and refuses stale or non-metadata edits. External document or relevant configuration changes while a draft is dirty require explicitly reloading or discarding it.

Show `phrase-format` as read-only system metadata. Git/build version, date and revision are unavailable until item 29 implements them; never invent values or make them document overrides. Richer metadata schemas remain separate work.

<!-- stanza: #ezrf626x3b -->
## Consequences

Use the existing metadata model, validation and deterministic serialization. Format stays 1; there is no new persisted representation or migration. VS Code remains the history owner. No backend, network, registry or new dependency is needed.
