---
stanza-format: 1
title: "ADR 0011: Heading numbering"
---

<!-- stanza: #t7z7c3mrxv -->
# ADR 0011: Heading numbering

Status: Accepted

<!-- stanza: #yfpqp6hv36 -->
## Context

The vision says that heading numbers are computed by the product and written as literal text, not as Word fields. ADR 0006 gave the stylesheet no way to say which headings are numbered. Numbering across the documents of a project is a later item and needs a numbering that can continue from a previous document.

<!-- stanza: #x7t7pa7jwc -->
## Decision

<!-- stanza: #3evedmcfwk -->
### Which headings are numbered

A paragraph style has an optional `numbered` property, `true` or `false`, inherited through `based-on` like the other paragraph properties. A heading is numbered when its resolved style has `numbered: true`. A heading that uses another style, such as an `unnumbered-heading` based on `heading-1` with `numbered: false`, is skipped. The decision is in the stylesheet and not in the content.

This is an additive, optional property, so the stylesheet format stays at version 1. A paragraph, list or code block whose style is numbered gets the warning `numbering-not-applicable`, so the property is never ignored silently.

<!-- stanza: #q0xmpwrn0f -->
### Scheme

The scheme is hierarchical decimal: `1`, `1.1`, `1.1.1`. A heading of level n adds one to the counter of level n and resets the deeper counters. Unnumbered headings do not change the counters. Other schemes, such as lettered appendices, belong to the item on numbering across a project.

<!-- stanza: #a6tpsgas6c -->
### Skipped levels

A numbered heading that has no numbered heading of a higher level above it counts the missing level as 0, so a level 3 heading after a level 1 heading is `1.0.1`. The warning `heading-level-skipped` reports it.

<!-- stanza: #tsn6tq0jz3 -->
### Where the logic lives

`numberHeadings(document, stylesheet, start?)` in `core` is a pure function that returns the label of each top-level block, the final counters, and the diagnostics. `validateDocument` includes the diagnostics. The DOCX exporter uses the labels, and the editor view and the table of contents will use them too. `start` holds the counters to continue from, so the project numbering can pass the state of the previous document.

<!-- stanza: #rgmttq4x31 -->
### Writing the number

The DOCX exporter writes the number and one space as the first run of the heading, in the formatting of the heading's style. A tab would need tab stops, and the alignment would vary with the width of the number. The bookmark of the heading (ADR 0009) wraps the number too. The Markdown source never contains the numbers.

<!-- stanza: #wqj2g4e1dp -->
## Consequences

- Numbers change when headings are added or moved, and nothing in the source needs to change.
- The numbers are text in the DOCX, so Word does not renumber them when someone edits the file. The DOCX is a generated publication format, so this is accepted.
- A stylesheet author who sets `numbered` on `body` numbers every style based on it. The warning for non-heading blocks makes this visible.

<!-- stanza: #tjpk4kab7d -->
## Alternatives considered

- **A numbering depth in a stylesheet section.** It would not allow unnumbered headings in a numbered level without another mechanism.
- **A flag on the heading in the content.** It would put a formatting decision in the document.
- **Word multilevel list numbering for headings.** The vision rules it out, and the numbers could not be reused in cross-reference text.
