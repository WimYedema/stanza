---
stanza-format: 1
title: "ADR 0013: Code blocks and tables in list items"
---

<!-- stanza: #v79mg75zsh -->
# ADR 0013: Code blocks and tables in list items

Status: Accepted. The text width comes from the page template (ADR 0016).

<!-- stanza: #nwpdw1gt1t -->
## Context

ADR 0010 mapped paragraphs and nested lists in list items and left code blocks and tables as errors. ADR 0012 did the same for tables in list items. Both need the indent of the item's text, and a table also needs a width that keeps it inside the margin.

<!-- stanza: #s9nsegsej4 -->
## Decision

<!-- stanza: #jvv21q9ztv -->
### Continuation styles

A block that continues a list item uses a generated paragraph style based on the style of the block, with the indent of the item's text and no hanging indent. This applies to further paragraphs, code blocks, and paragraphs that name their own style. A style that is the list style itself is `ListBulletedContinue1`. Any other style is `<Style>In<ListStyle><Level>`, such as `CodeInListBulleted1`. The indent is the one of ADR 0010, `(level + 1)` times the left indent of the list style. This extends ADR 0010, which left paragraphs with their own style unindented.

<!-- stanza: #b6r6zkty51 -->
### Tables

A table in a list item has an indent equal to the indent of the item's text. Its width is a percentage of the text width that leaves the indent out, so it ends at the margin. Relative column widths and the rest of the table mapping (ADR 0012) are unchanged. The text width is a fact of the exporter (`page.ts`): A4 with 2.54 cm margins, which is the library's default and now written explicitly. The item on page templates replaces it.

<!-- stanza: #9tswjbbk6y -->
### Items that start with a block

An item that is empty, or starts with a nested list, a code block, or a table, still has its marker, written as an empty numbered paragraph before the block.

<!-- stanza: #h541fgb438 -->
### Spacing paragraphs

The paragraph that Word needs between two tables and after a final table (ADR 0012) is added in one pass over the finished list of blocks, so it also covers tables that come out of list items.

<!-- stanza: #8vd2tkf0bh -->
### Still unsupported

`phrase` blocks, for which no kind is known yet, remain `docx-unsupported-block`.

<!-- stanza: #ayd8xcrv7y -->
## Consequences

- Every block that the model allows in a list item can be exported.
- A document with deep nesting and a table gets a table that is narrower the deeper it sits.
- The page size is written explicitly. Changing it before page templates exist changes the widths of tables in list items.

<!-- stanza: #947es9hq4n -->
## Alternatives considered

- **A table of full width in list items.** It would run past the right margin by the indent.
- **A table in a fixed width in points.** It would need the text width as well, with less flexibility than a percentage.
- **Leaving explicit-style paragraphs unindented.** Simpler, but a block of an item would then sit under its marker and not under its text.
