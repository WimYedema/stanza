---
stanza-format: 1
title: "ADR 0084: Pulling review comments from Word"
---

<!-- stanza: #h5jsxcj3r1 -->
# ADR 0084: Pulling review comments from Word

Status: Accepted. Backlog item 140. Builds on ADR 0009 (bookmarks), ADR 0068 and ADR 0073 (references), ADR 0072 (unlisted documents) and ADR 0047 (the import command). Takes over backlog items 38 and 39.

<!-- stanza: #3q8pmckn5t -->
## Context

Reviewers comment on a generated DOCX in Word, and the source of truth stays in Git (product vision, principle 8). The comments have to come back to the author, attached to the content they are about, as data to resolve and never as edits to the source. The spike of item 203 (`spike-findings`, "Review round trip in Word") showed what Word writes:

- The `stanza_<id>` bookmarks survive Word desktop, Word for the web and the trip between them. A bookmark covers one block: a heading, or the first cell of a table. Blocks without an ID, such as most paragraphs and list items, have none.
- A comment is a range in the text plus an entry in `comments.xml`. Its identity is the `durableId` in `commentsIds.xml`; its `w:id` is renumbered on every save. Its time is the `dateUtc` in `commentsExtensible.xml`; `w:date` is local time, marked with `Z` by Word desktop and with no zone by Word for the web.
- A reply is a comment of its own, linked to its parent by `w15:paraIdParent` in `commentsExtended.xml`. Resolving sets `w15:done="1"`. A reaction is an extension in `commentsExtensible.xml`, with a type, a time and the user.
- Mentions and reactions hold email addresses and account IDs.
- Ranges across sections are normal.
- The same file has different forms depending on how it left the cloud, and a file in the synced folder can be behind while Word desktop has it open.

The backlog decided the outline of the answer: a pull makes a new, unlisted review document with one heading per comment, linked to the block, and never merges into an older one. This ADR settles the rest.

<!-- stanza: #smj33jwt8k -->
## Decision

<!-- stanza: #mbkgg6jg9e -->
### The command

`stanza review pull <file.docx> [project]` on the command line, and "Stanza: Pull Review Comments" in VS Code, which asks for the project when the editor in front is in none, then for the DOCX, writes the review document and opens it. The command is `review`, singular, like `review push` (item 139); the backlog's `reviews pull` is renamed. It takes a path; the `exchange` areas of items 132 to 136 later only supply the path.

As for import (ADR 0047), `pullReview` in the `project` package takes the storage of the project, the bytes of the DOCX, its file name and random bytes from the host, and writes one document. Reading the DOCX is a pure function in `import-docx`, `readReview`, which gives the comments, their threads and anchors, the tracked changes, the stamp and the time of the last save, and knows nothing of the project. The project has to be in order (project file and stylesheet load without errors), since the new IDs have to be unique and the anchors are resolved against the project.

<!-- stanza: #7h85prw8j2 -->
### Which document was reviewed

1. **The stamp** of item 138, when the file has one, names the document by its path in the project, with the Git commit it was built from, whether the source had changes that were not committed (`dirty`), and a content hash of the source.
1. **Without a stamp**, the document is the one that holds the IDs of the bookmarks in the file. IDs are unique across the project, so in practice exactly one document holds them; when they spread over several, the one with most wins and the others are reported. Both `stanza_<id>` and the `phrase_<id>` of files built before the rename (ADR 0083) are read.
1. **The file name is never used.** Review copies are renamed ("0002-unprotected - Copy.docx").

A file with no stamp and no known bookmark is not a document of this project: nothing is written, and the command line exits with 2.

<!-- stanza: #7n26fb5rrn -->
### The reviewed version

The DOCX is generated deterministically from its source, so the source of the reviewed version gives an exact map from the DOCX back to the blocks. The pull gets that source in this order:

1. **Embedded in the DOCX.** Item 138 also writes the source text of the document into the DOCX, as a custom XML part that Word does not show. It holds no more than the DOCX already shows, and it needs no Git. Whether Word desktop, Word for the web and SharePoint keep such a part is checked first (item 203); if they do not, this step falls away.
1. **From Git**, by the commit and path of the stamp, when the stamp is not `dirty`. Git is reached through an adapter in the hosts, never in `core`. The content hash checks that the source found is the one that was built; a commit that no longer exists (a squashed and deleted branch, a shallow clone) gives nothing.
1. **Otherwise none.** The pull still works, with the anchors of the bookmarks alone, and says so.

The commit is also written into the review document as the readable revision.

<!-- stanza: #gtyh5jtnrd -->
### Where a comment points

The aim is that the editor can mark the commented text and show the comment beside it, as Word does in its margin (item 141). A comment is placed by where its range starts and ends, in two steps.

**In the reviewed version.** With the source of the reviewed version, the pull exports it again in memory and matches the paragraphs of the DOCX one to one, which gives the block and the characters where the range starts and ends. Without it, the bookmarks give the place: a range that starts inside a bookmark is on that block; in a table cell, on the table with the row and column counted from 1, the header row included; otherwise on the nearest bookmark before it, which is in practice the heading of the section, together with the position of the block under that heading (the third paragraph, the second list item), counted in the DOCX.

**In the current source.** The place is then carried over to the source as it is now. A block with an ID is found by its ID. A block without one is found by comparing the blocks of the reviewed version with the current ones, and with the bookmarks alone, by its position under its heading. The quoted text confirms the place, and the characters within the block are found by it.

The review document gives the place as a link to the nearest block with an ID, the position under it, for a table the row and column, the headings a range crosses, and the **quote**: the text the comment covers, in full up to 200 characters, and longer ones as the first and the last 100 with an ellipsis between, so that the start and the end can both be found. When the quote is not found at the place any more, the review document says "text changed since the review", and the comment belongs to the block or section only.

A bookmark whose ID is no longer in the project marks an **orphaned** comment: it is kept, with its quote and the old ID as code, without a link, so that the review document has no broken reference. Orphans are reported.

<!-- stanza: #cd7exr11ng -->
### The review document

- **Where and what name.** `reviews/<name>-<date>.stanza.md`, where the name is that of the reviewed document and the date is the day of the last save in the DOCX (`dcterms:modified`, in UTC), never the clock. A taken name gets a number, as in ADR 0047, so pulling the same file again makes a new document.
- **Front matter.** The title is "Review of" and the title of the reviewed document. A new optional field, **`reviews`**, gives the path of the reviewed document relative to the project. It is additive, so `stanza-format` stays 1, as for the outline of ADR 0072. A document with `reviews` is not reported as `unlisted-document` and is not built by `stanza build`; a `reviews` path that is not a document of the project is a warning.
- **The opening paragraph** names the DOCX file, the time of its last save in UTC, the revision from the stamp (or "revision unknown"), whether the source has changed since, and the counts: comments, threads, open, resolved and orphaned. The time of the last save is there so that the author can see a file that is behind.
- **One heading per thread**, in the order of the document, at level 2. The text of the heading is the first words of the comment, up to about 60 characters. The heading gets a new ID (ADR 0020).
- **Under it, a paragraph with the place:** a link to the block (`[Context](../documents/0002-host-and-dependencies.stanza.md#b2qjj8ze19)`), for a table the row and column, the headings crossed, and the quote. Then a paragraph with `Status: open` or `Status: resolved`, as plain text until forms exist (items 99 to 103), and `Word comment <durableId>`.
- **The comment and its replies** follow in order of time, each as a paragraph that starts with the display name and the time in bold (`**Ada Reviewer, 2026-11-21 15:25 UTC:**`), then the text. Bold, italic and links of the comment are kept; anything else becomes plain text. Reactions follow their comment as `Reactions: thumbs up (Ada Reviewer)`; unknown reaction types are named by number.

```markdown
## Should the vscode package name be in the table?

In [the table](../documents/0002-host-and-dependencies.stanza.md#x6gmjy7p23) under Packages, row 4, column 2, at "DOCX adapter".

Status: resolved. Word comment 27CEB2FB.

**Ada Reviewer, 2026-11-21 15:40 UTC:** Should the vscode package name be in the table?

**Ada Reviewer, 2026-11-21 16:08 UTC:** Yes, I'll add it.
```

<!-- stanza: #7ay9v9xam9 -->
### Privacy

The review document is committed to Git, so only what the author needs goes in: the **display name** of each person. Email addresses, account IDs, providers and initials are never written. A mention becomes `@` and the display name, as plain text, and a `mailto:` link becomes its text. This is a rule of `pullReview`, not an option.

<!-- stanza: #dp9f42ktew -->
### Times

`dateUtc` is the time of a comment, written in UTC to the minute. When a file has no `commentsExtensible.xml` (older versions of Word), `w:date` is used without its `Z` and written with "time zone unknown". Times are never taken from the clock of the machine that pulls.

<!-- stanza: #fpzxarftme -->
### Changes to the text

A pull never applies a change. It reports two kinds, each as a thread of its own with status open, at the place where it is, so that the author sees it next to the comments:

- **Tracked changes** (`w:ins`, `w:del`), with the inserted and the deleted text.
- **Untracked edits**, made after a reviewer lifted the protection or in a file without it (item 211). They are found by exporting the source of the reviewed version again in memory and comparing the text of each block with the DOCX, so they are checked whenever the reviewed version is found, also when the source has changed since. Otherwise the opening paragraph says "edits not checked" and why.

<!-- stanza: #ez13jsxfsc -->
### Pulling again

A pull is a snapshot. It never changes an earlier review document, and it writes every comment it finds, also those pulled before, so each review document is complete on its own. When the `Word comment` ID of a thread is already in another review document of the same document, the command says so ("3 of 5 threads are also in reviews/0002-host-and-dependencies-2026-11-20.stanza.md"), so that the author can compare or delete the older one.

<!-- stanza: #t0qws4yamf -->
### Reporting

The command line prints the document it wrote, then a line each for orphans, comments spread over several documents, changes to the text, threads pulled before, and whether edits were checked. Then the project's diagnostics for the new document, as for import. Exit codes follow ADR 0014 and ADR 0047. VS Code writes the same lines to the Stanza output and shows a message with a button that opens it.

<!-- stanza: #3380jab76e -->
## Consequences

- The loop closes with file paths alone: build, send the file, pull it back. SharePoint is a later convenience (items 132 to 136).
- Review documents are ordinary Stanza documents: they can be edited, linked to, searched and committed, and their links show up in "Find references" (item 126). The editor shows them on their blocks (item 141).
- With the reviewed version, a comment is placed on its exact text, also in a paragraph or list item without an ID, so item 141 can show it beside that text. Without it, the place is the block position under a heading plus the quote, which is reliable while that section is unchanged.
- The `reviews` field is a small change to the front matter of every reader of the format, and it is the only new thing in a document. There is no new document type.
- Without the stamp of item 138, a pull still works, but it cannot say which revision a comment was made on, place comments exactly, or check for untracked edits. Item 138 comes first.
- The embedded source makes the pull independent of Git and of squashed or deleted branches, if Word keeps the part (item 203). The DOCX gets a little larger, by the size of the Markdown of one document.
- A pull that uses Git needs the hosts to run it; `core` and `import-docx` stay without Git.
- Display names are personal data in Git. That is the minimum needed to say who asked what; a project that cannot keep them is not served yet.
- The real files of the spike (`packages/import-docx/fixtures/review-round-trip/`) are the tests of `readReview`, in both of the forms that Word writes.

<!-- stanza: #v3dhxrnffq -->
## Alternatives considered

- **Merging into one review document per document.** A merge has to decide what changed between pulls and what the author changed by hand; a snapshot cannot go wrong, and the "pulled before" message covers the common case.
- **Comments in a sidecar file (JSON or YAML) instead of a Stanza document.** It would need its own viewer and could not be edited or linked like the rest. The backlog already decided against a new document type.
- **Giving every block a bookmark in the DOCX** (for example the ID of the section and a position) for finer anchors. A position is not stable across edits, and an ID per paragraph would fill the source with IDs. The reviewed version gives the same precision without either.
- **Only the commit, without the embedded source.** It fails for a build from uncommitted changes, for a commit that a squash merge and a deleted branch leave unreachable, for a shallow clone, and without Git. The commit stays as the readable revision and the second way to the source.
- **Only the quote, without the reviewed version.** Text that occurs twice, or that changed, cannot be placed with confidence.
- **Recognising the document by its file name.** Review copies are renamed, and the bookmarks are already a reliable fingerprint.
- **Keeping email addresses to tell people with the same name apart.** It would put addresses into Git for a rare case.
- **Putting review documents in `documents/`.** They would mix with the documents being written; `reviews/` keeps them apart, and a project can still move them.
