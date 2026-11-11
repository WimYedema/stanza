---
phrase-format: 1
title: "ADR 0070: References go by the text of headings only"
---

<!-- phrase: #j09rcb7r5h -->
# ADR 0070: References go by the text of headings only

Status: Accepted. Refines ADR 0069.

<!-- phrase: #gqtgebgndc -->
## Context

ADR 0069 matched the text selected for a reference against the leading code of a heading ("I5" in "I5 — Secrets exposed"), and inserted that code when nothing was selected. A code is a convention of one document, the threat model. Phrase is for any document and must not guess what a document calls its headings.

<!-- phrase: #ndv312mxtg -->
## Decision

- **`suggestReferences` goes by the text of a heading alone.** It knows no codes, numbers or separators. The kinds of match are: the whole text, a start that ends at a word (so "I5" does not start "I50"), a part, and all the words, in that order, with document order inside a kind. A heading that starts with "I5" is still found by "I5", because its text does.
- **With nothing selected the reference carries the text of the heading.**
- **Nothing in the code reads a name out of a heading.** Names that a document uses for its headings are for the author to state, which is item 119.
- **The match kind `code`, and the `label` of a suggestion, are gone.** ADR 0069 keeps its record; this one replaces its matching and its inserted text.

<!-- phrase: #67vqwcbv7k -->
## Consequences

- A mention such as "see T6" is found by looking at the headings that start with "T6", not because Phrase knows what a code is.
- Finding all the mentions of a name in a document needs the author to say what the names are, by an alias on a heading or by a pattern in the project file. Until that is decided, only the full text of a heading can be found in the text.
