---
stanza-format: 1
title: "ADR 0085: Protection by destination"
---

<!-- stanza: #qnxngkb5n5 -->
# ADR 0085: Protection by destination

Status: Accepted. Refines ADR 0030. Backlog item 211.

<!-- stanza: #7h7e3w985q -->
## Context

ADR 0030 protects every exported DOCX for comments: a reviewer can comment and reply, and cannot change the text. It left a setting for later, "for when a project needs it".

The spike of item 203 (`spike-findings`, "Review round trip in Word") showed that a project needs it. Word for the web opens a document that has the protection read-only: existing comments are shown, but nobody can add a comment or reply, and editing is refused with a message that it only works in the desktop app. Without the protection, Word for the web comments as usual. So review through SharePoint or OneDrive in the browser is impossible with the protection, which is the review loop that the backlog puts first.

The protection was a guard against slips, not security: it has no password and is lifted in Word's Restrict Editing pane. Since ADR 0084, the pull is a second guard: it rebuilds the reviewed version and reports every change made to the text, tracked or not, without applying any.

<!-- stanza: #ajf643hdeq -->
## Decision

- **A setting in the project file:** `review-protection`, with the value `comments` (reviewers can only comment, as in ADR 0030) or `none` (no protection). Absent means `comments`, so a project that does not set it exports as before. Another value is an error (`invalid-review-protection`).
- **For one build:** `stanza build --protection comments|none` overrides the project file, for example to make a copy for SharePoint from a project that otherwise protects its files.
- **Everywhere a DOCX is exported:** `stanza build` and export on save in VS Code follow the project file; Open in Word exports in the same way.
- **The guard without the protection is the pull** (ADR 0084): an untracked change is a "Changed text" thread with the text before and after, and a tracked change is a thread of its own. Nothing is applied, so a reviewer's edit is a suggestion for the author, as a comment is.
- **The destination decides later.** When the `exchange` areas of items 132 to 136 exist, `review push` (item 139) uses the protection the area needs, `none` for an area in SharePoint, without a flag. Until then the setting and the flag are the way to choose.
- **Read only** (ADR 0030 named it as a third value) is not added: nothing needs it, and it would block comments too.

<!-- stanza: #eec9wkkneh -->
## Consequences

- Reviewers in Word for the web can comment and reply once a project, or a build, uses `none`.
- With `none`, a reviewer can change the text, in Word desktop and in the browser. The change is not lost: the pull lists it. It is still not carried into the source, and the author decides what to do with it.
- A project has to choose. For files sent to desktop Word only, `comments` keeps the guard of ADR 0030; for files reviewed in SharePoint, `none` is required.
- Whether a work tenant can share a document for comments only, so that SharePoint enforces what the file no longer does, is not known yet (item 203). If it can, that is the better guard for SharePoint, and this setting stays for the file itself.

<!-- stanza: #e24xj5marq -->
## Alternatives considered

- **Always without the protection.** It changes what existing projects send to desktop reviewers, where the protection works and is the cheaper guard.
- **Protection only for tracked changes** (`w:edit="trackedChanges"`). It is a protection as well, so Word for the web would refuse it in the same way, and a tracked change still cannot be carried into the source.
- **A setting per document.** The destination is a property of where the file goes, not of the document; the build flag covers a different destination for the same document.
