---
stanza-format: 1
title: "ADR 0010: DOCX lists"
---

<!-- stanza: #4d6a9v2ahq -->
# ADR 0010: DOCX lists

Status: Accepted. Blocks in list items extended by ADR 0013.

<!-- stanza: #xzwaqh6wqg -->
## Context

Lists in a document are bulleted or numbered, nest, and can hold several paragraphs in an item. The vision rules out custom list or number definitions, and asks for literal text only for heading numbers, caption numbers and cross-reference text. The stylesheet already holds the indents of lists in the paragraph styles `list-bulleted` and `list-numbered` (ADR 0006).

<!-- stanza: #t2b8ddncp5 -->
## Decision

- Lists are real Word lists, written with Word numbering definitions. The vision's literal-text rule does not cover list items, and real lists keep the list structure for accessibility and for PDFs made from the DOCX.
- The definitions are fixed. Bullets are `•`, `◦` and `▪`, and numbered levels are `1.`, `a.` and `i.`, each cycling after three levels. Each definition has all nine Word levels.
- A definition is generated for each list style and kind that occurs. The indents come from the resolved list style: level n is indented `(n + 1)` times the style's left indent, with the style's hanging or first-line indent. The numbering definition carries them because Word takes the indents of a list paragraph from there.
- Each top-level list is its own Word list, so numbered lists start at 1 again. A nested list shares the Word list of its parent when it has the same list style and kind, and counts on its own otherwise.
- The first paragraph of an item is a numbered paragraph in the list style, or in the style of the paragraph when it has one. An item that is empty, or starts with a nested list, gets an empty numbered paragraph so that its marker exists.
- Further paragraphs of an item use a generated paragraph style, based on the list style, with the indent of the item's text and no hanging indent. One is generated for each list style and level that occurs, with IDs such as `ListBulletedContinue1`.
- A list nested deeper than nine levels is an error (`docx-list-too-deep`). Code, tables and `phrase` blocks in an item are an error until they are supported (`docx-unsupported-block`).
- The ID of a list is a bookmark (ADR 0009) on the first paragraph of the list.

<!-- stanza: #tm3t3m06np -->
## Consequences

- Indents have one source, the stylesheet, even though Word reads them from the numbering definitions.
- A stylesheet whose list styles have no left indent gives lists that do not visibly nest. This is left to the stylesheet author.
- Generated continuation styles are written to the DOCX and appear in Word's style list.

<!-- stanza: #rzpf1qazpx -->
## Alternatives considered

- **Literal list numbers.** Consistent with heading numbers, but a Word user adding an item would not get renumbering, and the list structure would be lost.
- **Indents only in the paragraph styles.** The numbering definition would then override them for list paragraphs, so nested levels would not be indented.
- **Direct indent on continuation paragraphs.** It would add explicit properties to the output, which ADR 0008 limits to two cases.
