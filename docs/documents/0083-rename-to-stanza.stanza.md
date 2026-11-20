---
stanza-format: 1
title: "ADR 0083: Rename to Stanza"
---

<!-- stanza: #7tyjjkje5t -->
# ADR 0083: Rename to Stanza

Status: Accepted. Refines ADRs 0001, 0007, 0009, 0017, 0025 and 0061 in their names only.

<!-- stanza: #2m8c59p83p -->
## Context

Phrase is the name of an established localization company, which makes the product hard to find and the name hard to keep. The repository is already called stanza. The name is also in the files of every project, so a rename needs a migration and not only a search and replace.

<!-- stanza: #6rs4b3a8at -->
## Decision

- **Everything is Stanza.** Packages `@stanza/*`, the command `stanza`, the extension `stanza-local.stanza-vscode` with `stanza.*` commands and settings, CSS classes and editor plugin names.
- **Persisted names.** `stanza.yaml`, `*.stanza.md`, `stanza-format`, `<!-- stanza: ... -->`, `stanza-*` fences, `[](stanza:token)` slots and `stanza_<id>` bookmarks.
- **Same format numbers.** The key name tells the old files from the new ones, so the numbers stay 1 and the format 2 of ADR 0081 is unchanged. A file with `phrase-format` is not read: it is the error `legacy-format`, which names the fix, and so is a folder with only `phrase.yaml`.
- **`stanza migrate [project] [--check]`.** Renames the project file and the documents and rewrites the format keys, annotations, semantic fences, links to `.phrase.md` files and `phrase:` slots. Ordinary code fences and inline code stay, so examples of the old syntax stay. IDs never change, so references keep working. All new texts are written before any old file is removed, and nothing is written when a new name is taken. A user-owned `AGENTS.md` is reported, not changed (ADR 0061).
- **One place for the old names.** `format/src/legacy.ts` and `project/src/migrate.ts`. The comment import (item 140) must also accept `phrase_<id>` bookmarks, so files sent out for review before the rename stay importable.
- **History stays.** Accepted ADRs and `BACKLOG_DONE.md` keep the word Phrase: it means Stanza there. Their markup was migrated by the command, not by hand.

<!-- stanza: #erkzd89fcp -->
## Consequences

The docs project was migrated by `stanza migrate docs` in its own commit, and validates as before. Settings named `phrase.*` in VS Code are not carried over; the old extension is uninstalled by hand.
