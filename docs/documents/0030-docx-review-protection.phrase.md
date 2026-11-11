---
phrase-format: 1
title: "ADR 0030: DOCX review protection"
---

<!-- phrase: #bwaax9zdem -->
# ADR 0030: DOCX review protection

Status: Accepted

<!-- phrase: #sajvcdtymf -->
## Context

Documents are reviewed in Word, and what the reviewers write comes back as comments (backlog item on importing them). The text itself is edited in Phrase, where the source of truth is, and a change made in Word is lost at the next build. A reviewer who edits the text by mistake loses the change, and the author does not see it as a comment. Word has a protection for this, which is part of the format.

<!-- phrase: #mk73skfx53 -->
## Decision

Every exported document is protected for comments: `<w:documentProtection w:edit="comments" w:enforcement="1"/>` in `word/settings.xml`. A reviewer can add and reply to comments and cannot change the text. There is no password, no editing exception (`w:permStart`), and no setting: protection is always on. The element is added when the package is finished (`finishPackage`), since the `docx` library has no option for it, and goes before `w:defaultTabStop`, where the settings schema puts it. If the settings have no such place after a library update, the export fails with an error and does not write an unprotected file.

<!-- phrase: #qa3kv88cyk -->
### No password

Real protection of a document, such as who can open or edit the file, comes from where it is kept (OneDrive or SharePoint permissions, rights management), which the file cannot express. A password in `settings.xml` is stored as a hash that anyone can remove by editing the package, so it would only look like security. It also needs a salt, and a random one would make every build differ, while the build is meant to be reproducible. Without a password, Word shows the Restrict Editing pane and a person can stop the protection with one click, which is what is wanted: the protection stops a slip and not a decision.

<!-- phrase: #759njnrss8 -->
## Consequences

- A reviewer who types in the text gets a message from Word, and can comment instead.
- Someone who wants to edit the DOCX directly has to stop the protection first. A change made there is still not carried back into the source.
- Word may not let a protected document update fields by hand. The table of contents is marked for update and Word asks when the document is opened (ADR 0018). The page numbers in headers and footers (ADR 0017) are computed from the layout. Whether the prompt to update works for a document protected for comments has to be checked in Word with a real document.
- The protection cannot be turned off from the project. A setting (none, comments, read only) is left for when a project needs it.

<!-- phrase: #eckzdptn1a -->
## Alternatives considered

- **Protecting with a password.** The hash can be removed, and a salt that keeps the output reproducible has to be fixed or derived, which weakens it further.
- **Tracked changes only.** Reviewers could change the text, but a suggestion cannot be carried back into the source, so it would turn into manual work.
- **Read only.** Reviewers could not comment.
- **A setting from the start.** Nothing needs a different value yet.
