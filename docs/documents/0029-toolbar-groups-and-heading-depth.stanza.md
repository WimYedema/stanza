---
stanza-format: 1
title: "ADR 0029: Toolbar groups, the block list and the heading depth rule"
---

<!-- stanza: #14yn4m5sjm -->
# ADR 0029: Toolbar groups, the block list and the heading depth rule

Status: Accepted

<!-- stanza: #9cwhmnngnb -->
## Context

ADR 0027 gave the toolbar the state at the cursor and disabled commands, but kept a button for every command with its full name, six heading buttons, and a list of every paragraph style. People coming from Word expect short forms (B, I), one list for the kind and style of a paragraph, and an outline that does not skip a level. A skipped level breaks the numbers of ADR 0011 and the table of contents, which `numberHeadings` already reports as a warning after the fact.

<!-- stanza: #wdh066z7qt -->
## Decision

<!-- stanza: #g1ehrp3rrz -->
### Buttons in groups

Buttons show a short form (**B**, *I*, `</>`, a bullet, `1.`, arrows, `{ }`) and carry the full name in `aria-label` and in the title with the key, as before. They sit in groups, separated by a line: text marks, the lists of styles, lists, insert (code block, table, table of contents), and table. The table group is shown only where the cursor is in a table, since its commands have no place elsewhere. A hidden group is not checked.

<!-- stanza: #snb2wk3y8g -->
### One list for the block

The six heading buttons and the paragraph button are replaced by the list of styles, which now has two groups of options:

- **Block**: Paragraph and Heading 1 to 6, which run `set-paragraph` and `set-heading`.
- **Styles**: the other paragraph styles, which run `set-style`. The reserved styles (`body`, the headings, `code`, the list styles) are not offered a second time, since the kinds of block stand for them.

For a table cell the list shows the table styles with "(default)", as before. The list shows the block as it is: its own style if it names one that differs from the default of its kind, else the kind. A block with no option of its own, such as a code block, is shown as a disabled option. Options are checked when the list is opened (ADR 0026): one that no stylesheet change would allow is disabled with its reason, and one that a variant would allow reads "(needs strong)" and stays enabled.

<!-- stanza: #zdztevhjyw -->
### The heading depth rule

A heading is at most one level deeper than the last heading before it, and the first heading is level 1. `maxHeadingLevel` in `core` is that rule. `set-heading` refuses a deeper level with the reason `heading-level` and a message that says the deepest level allowed and why, in the toolbar, the list and the keys alike. A heading is never refused for staying as deep as it is or for going up, so text that came in with a skipped level can be left or corrected. Level 6 is the last.

`set-paragraph` now also gives a paragraph the default style, as Normal does in Word, and so `Ctrl+Alt+0` and the list option "Paragraph" take a style off. It did nothing to a styled paragraph before. This changes the command of ADR 0023, which is not rewritten.

<!-- stanza: #zf5pfw7q2v -->
## Consequences

- A person cannot make an outline with a gap in it from the editor. A gap that exists in the text stays reported by the numbering warning.
- Making a heading shallower can leave the headings after it more than one level deeper than it. They are reported, not refused, so that a person can promote headings in any order. The rule looks at the heading before, not at those after.
- A document that continues another one and starts at level 2 has to be written in the text. The editor starts a document at level 1.
- A style that is only for output, such as `cover-title` or `toc-1`, is listed with the others. The list does not know where a style is meant to be used.

<!-- stanza: #hva86acr32 -->
## Alternatives considered

- **Refusing a change that makes later headings skip.** It forces the order of the changes: to turn level 2 and 3 into 1 and 2, the deeper one first.
- **Disabling the heading options only in the list.** The keys would then allow what the list does not.
- **A drop-down for each family of style.** More lists with fewer options in each, and more room taken. The style editor (backlog) is where the families are separated.
