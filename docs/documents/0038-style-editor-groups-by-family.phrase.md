---
phrase-format: 1
title: "ADR 0038: The style editor, groups by family"
---

<!-- phrase: #ps0mf8dpy9 -->
# ADR 0038: The style editor, groups by family

Status: Accepted

<!-- phrase: #81nf1jd3rg -->
## Context

The paragraph panel (ADR 0037) shows every property of a paragraph style in two groups, whatever the style is for. The headings and the list styles are paragraph styles that the model reserves (ADR 0006, 0010, 0011), and some properties mean more for them: `numbered` decides which headings get a number, and the left and first-line indents of a list style are what the nested levels of a list are made from.

<!-- phrase: #txb3dcxm65 -->
## Decision

The panel groups the paragraph properties by the family of the selected style (ADR 0036), from one pure function, `paragraphGroups`. Every property is in exactly one group for every family, so nothing can be reached for one style and not for another, and the order of the properties is that of the property list (ADR 0033) within a group.

- **Headings**: Spacing and alignment (with the indents), Flow, and Numbering with `numbered`. The hint under Numbering says that numbers are computed (1, 1.1, 1.1.1) and written as text, and that styles based on this one inherit the choice. The hint of Flow says what keep with next is for.
- **Lists**: first List indents, with `indent-left` and `first-line-indent` and a hint that level n is indented (n + 1) times the left indent and that a negative first-line indent hangs the marker out. Then Spacing and alignment without the indents, Flow and Numbering.
- **Other paragraph styles**: Spacing and alignment (with the indents), Flow and Numbering.

`numbered` is shown for every style, because a paragraph style that is not one of the reserved headings can be what headings use (ADR 0011: an `unnumbered-heading` based on `heading-1`). Its hint says that elsewhere it gives a warning, which is the `numbering-not-applicable` diagnostic. Nothing is hidden by the panel, so a value the file has can always be seen and taken off.

A group may have a hint, a line under its title for what the properties alone do not say. The panel is built again when the style or its family changes.

<!-- phrase: #n6b47fmnwa -->
## Consequences

- The properties that make a heading or a list what it is are where a person looks for them, with the rule that the export applies.
- The groups are tested for completeness against the property list, so a property added to the list must be placed in each family, and a test fails until it is.
- The panel does not yet show the numbers a heading gets or a nested list; that preview is not part of this item.
- Table styles and character styles have panels of their own in the next items.

<!-- phrase: #dg18jkyjwk -->
## Alternatives considered

- **Hide `numbered` except for headings.** A custom heading style is a plain paragraph style by name, and hiding the property would make a value set in the file impossible to see or remove.
- **A separate panel for each family.** It would repeat the common groups, and the family only changes a few groups.
