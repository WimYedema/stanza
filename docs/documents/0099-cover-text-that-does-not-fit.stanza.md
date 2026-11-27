---
stanza-format: 1
title: "ADR 0099: Cover text that does not fit"
---

<!-- stanza: #kynbvvwwpb -->
# ADR 0099: Cover text that does not fit

Status: Accepted. Backlog item 231, refining ADR 0089 and ADR 0092.

<!-- stanza: #rvt4a6ad9c -->
## Context

A row of a cover, or an area of a grid, often has a fixed height, so that the cover keeps its layout whatever the document puts in it. The text in it comes from the metadata of each document: a title, an abstract, the authors. Word cuts off what does not fit a row of fixed height, without a sign, so a long abstract loses its end and nobody sees it until the DOCX is opened. Four of the nineteen covers that the cover work started from have an abstract.

<!-- stanza: #797zgfndce -->
## Decision

- **Validating a document estimates, for each area of its cover whose rows all have a height, the height its text needs with the values of that document,** and warns (`cover-text-too-long`) when the text needs more than the area has. A row that grows with its content makes room, so it is not checked. A cover that is a list is not checked either.
- **The estimate is rough on purpose.** Word does not say where it breaks lines, and the fonts are not known offline, so a character is taken as half the font size wide. Each line of text wraps on its own; a paragraph takes its number of lines times the line height of its style, with Word's single spacing of 1.2 times the font size where the style gives none, and its space before and after. A cover table has two columns of the same width, with the padding of its cells. Images are left to the image checks of ADR 0089.
- **To avoid false alarms, the warning comes only when the text needs more than 10% above the height of the area.** It says how much the text needs and how much the area has.
- **The warning points at the value to shorten:** the field or token with the longest value in the area, such as `abstract` in the front matter, or else the page template of the document.

<!-- stanza: #qx5y3391z5 -->
## Consequences

- A document with a long abstract is warned when it is validated or built, before anyone opens the DOCX, and the warning shows at its abstract in the editor.
- The estimate can miss a text that is just too long, or warn for one that just fits in a narrow font. The tolerance favours missing over warning.

<!-- stanza: #h957d30kgv -->
## Alternatives considered

- **Measuring the text with the fonts.** It would be exact, but needs the fonts and their metrics, which a check that works offline and the same everywhere does not have.
- **Checking the stylesheet with sample values.** The values that are too long are those of a document, not of the template.
