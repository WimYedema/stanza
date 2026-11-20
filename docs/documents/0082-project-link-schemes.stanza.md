---
stanza-format: 1
title: "ADR 0082: Project link schemes"
---

<!-- stanza: #gbd0f47ftf -->
# ADR 0082: Project link schemes

Status: Accepted. Refines ADRs 0007, 0023 and 0075.

<!-- stanza: #y2b2amyxyb -->
## Decision

- Optional `link-schemes` in `phrase.yaml` maps lowercase URI scheme names to HTTP(S) URL templates, for example `jira: https://example.atlassian.net/browse/{id}`. Each template contains exactly one `{id}`, outside the authority. Reserved schemes (`http`, `https`, `mailto`, `phrase`, `file`, `data`, `javascript`, `vbscript`) cannot be overridden. Invalid names, templates and unknown placeholders are errors.
- `[ticket](jira://PROJ-123)` is an ordinary semantic link. Its non-empty ID is everything after `://`, URI-decoded once and encoded as one URL component when substituted. Malformed escapes, whitespace and control characters are errors. No guessing, fetching, authentication or remote validation occurs.
- A shared pure resolver supplies browser and DOCX destinations. Unknown schemes and missing IDs are actionable diagnostics, blocking export but never rewriting or removing authored links. HTTP(S), mail and existing document/block references retain their meaning.
- Editor commands and paste accept configured schemes under existing style rules. Displayed links and Ctrl/Cmd-click use resolved addresses; clipboard data retains the authored short destination. Project configuration changes refresh destinations without changing document source or selection.
- This is an additive project-format-1 property; documents and stylesheets remain format 1. Older readers reject the unknown project property instead of silently interpreting it. Existing projects need no migration.

<!-- stanza: #hbmwd5vyf6 -->
## Consequences

Templates are project configuration, not content formatting. Source and Git diffs keep short links; generated outputs contain real addresses. Link checking remains a separate explicit command (item 151); shared records and remote areas remain separate work.
