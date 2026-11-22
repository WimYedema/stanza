---
stanza-format: 1
title: "ADR 0086: Review comments in the editor"
---

<!-- stanza: #myxk325ss5 -->
# ADR 0086: Review comments in the editor

Status: Accepted. Backlog item 141. Builds on ADR 0084 (review documents), ADR 0028 (the paper look) and ADR 0079 (edits of project files from VS Code).

<!-- stanza: #yx9wbazcax -->
## Context

`review pull` (ADR 0084) writes the comments of a reviewed DOCX into review documents. The author works through them while editing the reviewed document, so the comments belong beside their text, as Word shows them in its margin. The editor shows a document as a sheet on a desk, in a paper or a plain look and at a zoom (ADR 0028). There is no area beside the sheet yet, and the width of a VS Code editor varies a lot: often wide, sometimes half a screen.

A review document is an ordinary Stanza document, so the editor can read it like any other. ADR 0084 fixed its layout so that it can be read back: one level-2 heading per thread, a paragraph with the place, a status paragraph, then the comments.

<!-- stanza: #kc5m7k71pr -->
## Decision

<!-- stanza: #2vxwtatwz4 -->
### What is shown

- **The threads of the review documents of the open document:** every document of the project whose `reviews` field names it (ADR 0084).
- **Open threads by default.** A toggle in the toolbar shows the resolved ones as well. Each card names its review (the file name and date of the review document), so that threads of several reviews can be told apart.
- **Nothing is added to the document.** The comments are a view, like the page template (ADR 0028): not in the source, not in the DOCX, not in the undo history of the document.

<!-- stanza: #7b6kf3gzyb -->
### Reading a thread back

The host reads each review document from the project snapshot (ADR 0078) and turns each level-2 heading into a thread, by the layout of ADR 0084:

- **The place:** the first paragraph under the heading. Its first link to a block of the open document is **the anchor**: an ordinary reference to an ID that is unique in the project (ADR 0068, ADR 0073), so it is checked, kept up to date and found by "Find references" like any other, and it survives moving and renaming documents. Within that block, the sentence adds two hints: the quote, `at "…"`, whole or as its two ends, which gives the characters; and the position, "In the 4th paragraph under", "In the 1st paragraph after" or "row R, column C", which only tells apart a quote that occurs more than once in the section (the same word in several table cells). A sentence that was rewritten loses the hints, not the anchor.
- **The status:** the paragraph that starts with `Status: open` or `Status: resolved`, and the Word comment ID after it.
- **The comments:** each paragraph that starts with a name and a time in bold, with the paragraphs after it until the next one; `Reactions:` paragraphs belong to the comment before them.

A thread that the author has edited so that a part cannot be read is still shown, with what can be read: without a place it goes to the top of the document, without a status it counts as open. The review document is never rewritten to make it readable.

<!-- stanza: #p4vf0pm4jd -->
### Where a thread goes

The editor finds the text in its own model, in this order:

1. **The block** by the ID of the anchor. A thread whose block the document no longer has goes into a list of orphaned threads at the top, with a link to its review document.
1. **The quote** in the section of that block, and for a long quote its start and its end, which gives the range of characters.
1. **The position**, when the quote occurs more than once: the occurrence at the same count as in the DOCX, the paragraphs of headings, paragraphs and list items, and of table cells for a row and column, from the block (ADR 0084). Without a position, the first occurrence.

A thread whose quote is not found is shown at its block with "text changed since the review", and its card has no highlighted range. A found range is highlighted with a decoration of the editor, which moves with the text while editing, as a highlight in Word does.

<!-- stanza: #9tznjwztkz -->
### How it looks

- **Margin cards** when the desk is wide enough: a column to the right of the sheet, at least 240 px wide. Each card is at the height of the start of its text; cards that would overlap are moved down, in the order of the document. The card of the selected thread is drawn with a line to its text.
- **Markers** when it is not: a small numbered marker in the right margin of the page, at the height of the text, which opens the card as a popover. The editor switches between the two when the width changes, also with the zoom.
- **Linked both ways:** hovering or clicking a highlighted range selects its card, and selecting a card scrolls to its text and selects the range.
- **A card** shows the author, the time, the text, the replies (the first two, the others behind "N more replies"), the reactions, the review it comes from, and its status. Display names only, as in the review document.
- **Both looks** (paper and plain) and every zoom have the cards or the markers.

<!-- stanza: #w0x431ef7k -->
### What the author can do

- **Open in review:** opens the review document at the heading of the thread.
- **Resolve or Reopen:** changes `Status: open` to `Status: resolved` in the review document, or back, and nothing else in it. The edit is made as the edits of the project file are (ADR 0079): on the buffer of the review document, undoable, with a refusal when the thread in the review document is not as the editor read it. A resolve always ends with the review document saved, so that the status on disk is the one shown. When the review document has unsaved changes of its own, the editor asks first ("reviews/… has unsaved changes. Save it and resolve?", **Save and Resolve** or **Cancel**), so that those changes are never saved without the author knowing; when it is open without unsaved changes, or not open, the edit is made and saved at once. The card then follows the toggle: it goes away, or shows as resolved.
- **Not yet:** replying, adding a comment, or anything that goes back into the DOCX. Replies would be paragraphs in the review document and need a decision on how they look; a comment from the author is an authoring comment (item 197), which is a different thing.

<!-- stanza: #bx8qtff5bn -->
### Keeping it current

The threads are read again when a review document changes (a new pull, an edit, a resolve) and placed again when the open document changes. Placing is a pure function of the document and the threads, in the webview, so typing does not wait for the host.

<!-- stanza: #tjxtjg3s7c -->
## Consequences

- The author sees each comment beside the text it is about, in the editor where the text is changed, and works through them there.
- The layout of the review document in ADR 0084 becomes a contract between `review pull` and the editor. The anchor is a reference and needs nothing new; the quote and the position are read from the sentence, so a change to its wording must keep the editor able to read review documents written before.
- A comment on text that was rewritten since the review loses its highlight and stays at its block; the quote in the card shows what it was about. Item 142 (a comment against how its block changed) can later show the difference.
- The webview gets a layout beside the sheet, which the page layout of item 173 has to take into account.
- Tests: reading threads back from the review documents written by the tests of ADR 0084, including edited ones; placing them on blocks, positions, quotes, changed text and orphans; the switch between cards and markers by width; resolve and reopen against an open, an unsaved and a changed review document.

<!-- stanza: #vz2qjtpqmq -->
## Alternatives considered

- **Markers and popovers only.** Works at every width with less layout, but a thread is seen only when it is opened, which makes working through many comments slow. It is the narrow form of the chosen design.
- **A comments panel** beside the editor, listing the threads in order. Readable for many comments, but the comments are away from their text, which is the point of this item.
- **Callouts in the text.** Simple and always in place, but they push the text apart, and the page no longer looks like the printed document (ADR 0028).
- **VS Code's own comments (the Comments API).** It works for text editors only, not for the webview of a custom editor, so it would show comments in the Markdown source and not on the sheet.
- **A separate anchor for the editor**, such as attributes in the review document. The reference to the block already is that anchor, with every check the project has for references; only the quote and the position come from the sentence, and they are hints within the block. Attributes for them would need a change of the dialect, since annotations take no unknown keys (ADR 0001), for little gain.
- **An ID for every commented paragraph**, so that the anchor is always the block itself. It would write IDs into the reviewed source on every pull, which the pull never changes (ADR 0084).
