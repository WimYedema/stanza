---
stanza-format: 1
title: "ADR 0051: The style editor, page templates"
---

<!-- stanza: #egr380e0jd -->
# ADR 0051: The style editor, page templates

Status: Accepted

<!-- stanza: #aat3agxr8f -->
## Context

The Pages tab of ADR 0036 lists the page templates and shows their size and margins read only. A page template has a size, four margins, a header and a footer of three slots each, and a cover (ADR 0016, 0017, 0019). The panels of ADR 0037 to 0040 and 0050 change the text of the stylesheet with `setProperty` and `unsetProperty` (ADR 0035).

<!-- stanza: #68bk87wfgc -->
## Decision

- **A panel under the list** for the selected template, with the groups Page (size), Margins (top, right, bottom, left, in points), Header and Footer, and Cover.
- **Size** is a list of the sizes the model has. **A margin** is a number. A margin is shown with the value the template has, which is the default of 72 points when the file does not set it, and is written to the file only when it is changed. Emptying the field takes it off, so that the default applies again.
- **A header or footer** has the style of its line (a list of the paragraph styles, with `(body)` for none) and its three slots, left, center and right. A slot is a line of text as it is written in the stylesheet, with the values the program fills in as links, `[](phrase:title)` (ADR 0017). It is shown by `slotSource` of the `format` package, which writes a slot as `readSlotText` read it. An emptied slot is taken off, and a line without slots is left as it is, with its style.
- **Inserting a value** is a list next to each slot, with the tokens of ADR 0017, which puts the link at the cursor. A token that is a Word field (`page`, `pages`) gets `1` as its stand-in text, as the fixtures have it. A custom field of the document (`field:name`) is typed by hand.
- **The cover is not edited here.** The panel says so, and the cover stays in the text of the stylesheet. Its entries are a list of mixed kinds that need a panel of their own.
- **No adding, renaming or removing of templates.** That comes with adding styles (backlog item 74), since documents refer to a template by name.
- The panel shows for the Pages tab only, and the read only detail is hidden while it shows. The panel is updated in place from the text after every change, as for styles.
- The side panels share the helpers for building them (`styles-dom`) and one class for their look.

<!-- stanza: #7tjjjf0gk9 -->
## Consequences

- A page can be set up, with its header and footer, without writing YAML, and the comments and layout of the file stay.
- A person who types a link that the stylesheet does not know gets the refusal of the host, with the message of the diagnostic.
- The writing of a slot lives in `format` next to the reading, so the two stay in step, and a test reads what it writes.

<!-- stanza: #nsfacegaa9 -->
## Alternatives considered

- **A control for each part of a slot** (a text and a chosen token). The slot is a line with any number of parts in any order, and a text field with an insert list does the same with one control.
- **Showing only the margins that the file sets.** The model gives the value in force, which is what a person wants to see, and a placeholder would need the text of the file in the panel.
