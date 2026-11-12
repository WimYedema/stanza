---
phrase-format: 1
title: "ADR 0075: Making a link to a web address in the editor"
---

<!-- phrase: #dx3c27p6c0 -->
# ADR 0075: Making a link to a web address in the editor

Status: Accepted. Builds on ADR 0069 (links to blocks) and ADR 0026 (marks come from the style).

<!-- phrase: #d2yv78d9z6 -->
## Context

The commands `set-link` and `remove-link` existed, with the rule that a link goes to a web page (`http`, `https`), a mail address (`mailto`) or a block (`#id`). The editor had no way to use them: only "Make reference" made links, and only to headings. A link such as a ticket address could be written in the Markdown, not in the editor.

<!-- phrase: #6wvxfhz6ad -->
## Decision

- **A "Link" button in the toolbar opens one field** for where the link goes (`webview/link-prompt.ts`, like the list of ADR 0069). Enter makes the selected text a link; Escape closes it.
- **A cursor in a link changes the whole link.** `set-link` with nothing selected changes the link the cursor is in, and refuses when the cursor is in none. The field starts with the address of that link (`getLinkHref`). An empty field takes the link off (`remove-link`).
- **The editor decides what is allowed.** An address that is not allowed keeps the field open with the reason. A style that does not offer `link` is refused with the fix of ADR 0026, as for the other marks. No scheme is added to the address by guesswork.
- **No keyboard shortcut yet.** `Ctrl+K` starts a chord in VS Code, and a key of a custom editor needs a `package.json` binding as `Ctrl+Shift+K` has (ADR 0069). That is not checked in a real VS Code.

<!-- phrase: #jetr8aknmb -->
## Consequences

- How a link looks is the `link` variant of the paragraph style, as before. Nothing about looks is in the content.
- Schemes such as `jira://` stay refused. Smart links are a later item (backlog).
