# ADR 0057: Heading numbers and diagnostics in the editor

Status: Accepted

## Context

A heading that the stylesheet numbers (ADR 0011) gets its number in the DOCX, but the editor showed the heading without it, so a person could not see which section they were in or whether a heading had skipped a level. The checks of the project (ADR 0025) show their findings in the Problems panel, away from the block they are about.

## Decision

### The numbers

- The editor shows the number of a numbered heading in front of its text, such as `1.2`. The number comes from `numberHeadings` of the `core` package, which the DOCX export uses too, so the two cannot differ. The editor gives it a list of the headings of the top level, in the form of the model, which is all that the numbering reads.
- It is a **widget decoration**: it is not in the content, not in the text that is saved, not part of the position of the cursor, and it cannot be edited. It is computed again when the document or the stylesheet changes. A heading whose style is not numbered has none.
- The numbers start at 1 in each document. Continuing across the documents of a project is for the item on numbering across a project (backlog item 32).
- The style editor's sample, which is the same editor without editing, shows them too, so a change of `numbered` shows in the sample.

### The diagnostics

- The host sends what the checks of the project say about **this document** in a message `diagnostics`, after `init` and again whenever it changes: the severity, the code, the message, and the path and the ID of the block when there is one. What is about another document, or about no block (such as a missing field of the front matter), stays in the Problems panel.
- The editor marks the blocks that they are about, as a **node decoration**: a bar in the left margin, red for an error and amber for a warning, with the messages as the tooltip. A diagnostic is matched to its block by the ID when it has one, else by the top-level block of its path (`blocks[2]` of `blocks[2].items[0]`). It marks the top-level block, which for a list or a table is the whole of it. The messages of the same block are put together, and the worst severity shows.
- A diagnostic whose block is not found, because the document has changed since the check, is left out until the next check, which comes after a pause.
- The marks are never part of the document either.

## Consequences

- A person sees the number of the section and the problems of a block where they write.
- The marks follow the check of the project and so come a little after the change, as the Problems panel does. A block that moved since the last check can be marked wrongly for that moment when it has no ID, as with a missing ID.
- An invalid reference to a style, a mark that a style does not offer and a heading level that is skipped are marked, since the project checks report them.

## Alternatives considered

- **Checking the document in the page.** The page has no project settings, and the project checks cover more than one document, such as an ID that two documents share.
- **A mark on the characters at fault.** The checks give a block, not a range of text.
- **Writing the numbers into the heading text.** It would put them in the file and let a person edit them, while a number is derived when the document is rendered (ADR 0011).
