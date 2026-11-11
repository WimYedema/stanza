---
phrase-format: 1
title: "ADR 0049: Word import, line breaks that separate paragraphs"
---

<!-- phrase: #1m9mbdkbg5 -->
# ADR 0049: Word import, line breaks that separate paragraphs

Status: Accepted

<!-- phrase: #f8hn9m8dkf -->
## Context

ADR 0043 says that a line break inside a paragraph becomes a space, since the dialect has no hard line break (ADR 0001). A real document, the Threat Model, separates the paragraphs of a table cell with two line breaks in a row, not with paragraph marks. Read by ADR 0043, the paragraphs of such a cell run together in one line, although ADR 0048 gives cells paragraphs and lists to hold them.

<!-- phrase: #xpd75ph6dt -->
## Decision

- **Two or more line breaks in a row** inside a paragraph, with only line breaks between them, end the paragraph. The text after them starts a new paragraph of the same kind. Runs and elements do not matter: the breaks may be in one run or in several.
- **A single line break** stays a space, as in ADR 0043. It is not reported, as before.
- **In a list item**, the text after the breaks is a further paragraph of the same item, so it stays under its bullet or number.
- **In a heading**, the breaks are a space. A heading is one line.
- **Line breaks before the first text or after the last text** of a paragraph are dropped. Line breaks that Word uses for a page or a column keep the rule of ADR 0043 (left out and reported).
- This applies in the body and in table cells alike.

<!-- phrase: #jx1evtnwxq -->
## Consequences

- The paragraphs of cells like those of the Threat Model arrive as paragraphs, in the `phrase-table` form of ADR 0048.
- A document that used two line breaks for vertical space, and not to separate paragraphs, gets a paragraph break instead, which the style then spaces.
- Three or more line breaks do not make empty paragraphs. The extra blank space is lost, as other spacing is (ADR 0043).

<!-- phrase: #4kvshe7bse -->
## Alternatives considered

- **Reading every line break as a paragraph break.** A single break is often a line of an address or a name with its title, which belongs in one paragraph.
- **A hard line break in the dialect.** It would keep a single break exactly, but the dialect and the model do not have it, and adding it is a larger decision than this import needs (item 94 lists it with what Markdown adoption cannot hold).
