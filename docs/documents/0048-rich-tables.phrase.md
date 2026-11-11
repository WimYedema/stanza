---
phrase-format: 1
title: "ADR 0048: Tables with paragraphs and lists in cells"
---

<!-- phrase: #62dst0d28r -->
# ADR 0048: Tables with paragraphs and lists in cells

Status: Accepted

<!-- phrase: #y0xpn72m98 -->
## Context

A table cell holds one run of inline text (ADR 0001, ADR 0004), and a pipe table cannot say more. Real documents need more. The Threat Model of the Word import has cells with several paragraphs and lists, and the import joins their text with spaces and reports it (ADR 0043, 0046), which loses the structure. The product owner wants paragraphs and bullets in tables, tables that are somewhat more powerful in general, and, as a distant option, tables filled from a CSV or JSON file.

ADR 0001 already reserves the way to write this: a fenced block with an info string that starts with `phrase-`, "for example `phrase-table`". ADR 0004 says that the model equals what Markdown can express, so that no document is valid in the model and unwritable in the file. This record keeps both.

<!-- phrase: #k13e1zxg41 -->
## Decision

<!-- phrase: #4c8bfszw5y -->
### The model

A table cell holds blocks, not inline content: `TableCell` has `blocks`, paragraphs and lists. A cell that is empty has no blocks, and a cell of plain text has one paragraph. There is one representation, so a plain cell is not a special case in the exporter, the editor or the validation.

Cells hold only paragraphs and lists, and the items of a list in a cell hold only paragraphs and lists. A heading, a code block, a phrase block or a table in a cell is an error (`table-cell-block`). The types of `core` cannot say this without a second list type, so the validation does.

Marks in a cell are checked against the paragraph style of the cell (ADR 0012) as before. The paragraphs of a cell use that style, and the lists use the list styles of the stylesheet.

<!-- phrase: #faagqzxehn -->
### Two ways to write it, one normal form

A table is written as a pipe table when every cell is empty or one paragraph, as now. Otherwise it is written as a `phrase-table` block. The choice depends on the content alone, so the form is canonical and a round trip is stable. Existing files do not change, and a table that gains a second paragraph in one cell changes form without anything else changing.

`phrase-table` is another way to write the `table` block. The parser reads it into a table, not into a `phrase` block with verbatim text, so the validation of unknown `phrase-` kinds never sees it. The parser also accepts a `phrase-table` whose cells are all plain, and the formatter writes it back as a pipe table.

Everything about the table as a whole stays in the annotation before it, as for a pipe table (ADR 0001): the ID, the style and the `widths`. The annotation does not change when the form does, which keeps the diffs small. Options that come later, such as the number of header rows, are further attributes of the table there, and so work in both forms.

<!-- phrase: #9c6jrk1ms1 -->
### The body of a `phrase-table`

The body is a list of lists in Markdown. The items of the outer bullet list are the rows, the items of the list inside each row are the cells, and what is inside a cell is its blocks, so a bullet list in a cell is a list in the cell's item. The first row is the header, as in a pipe table.

````text
<!-- phrase: #t3k9x2m7qa .table-grid widths="30 70" -->
```phrase-table
- - Control
  - Status
- - First paragraph of the cell.

    A second paragraph.
  - - met
    - partial
```
````

An empty cell is a bare `-`. The levels are by position, so a list in a cell does not clash with the rows and cells. The text of the cells is read by the Markdown parser that reads the rest of the document, so marks, links, escaping and nested lists work as everywhere else, and the serializer writes it the same way. A body that is not a bullet list of bullet lists, rows of different length, a numbered list where rows or cells are expected, and a block that a cell may not hold are reported (`invalid-table-body`, `table-ragged-row`, `table-cell-block`) and the document is refused as for other syntax errors.

<!-- phrase: #m7kp6ze5z8 -->
### Rendering

- **DOCX.** Cell paragraphs and lists use the cell style and the list definitions of ADR 0010, in the cell. Header cells keep the rules of ADR 0012.
- **Browser.** The CSS of the editor and the paper look gets the same blocks in a cell.
- **Editor.** The cells of the editor schema take paragraphs and lists, and a cell that holds more than a plain paragraph is written as a `phrase-table` on save without the person choosing a form.
- **Word import.** A cell keeps its paragraphs and lists. The text is joined only for what a cell may not hold, a nested table, and that stays reported.

<!-- phrase: #vmm7wc6n3v -->
### Not in this record

- **Merged cells.** A cell with `colspan` or `rowspan`. A marker on the cell item in the body would fit, and it has its own record.
- **Header rows and columns.** More than one header row, and header columns.
- **Data from a file.** A table that takes its rows from a CSV or JSON file in the project would be an attribute of the table in the annotation (for example `source`), with no body, read when the project is loaded or built. It is deterministic and works offline, but it makes the document depend on another file, so it has its own record.
- **Captions and cross-references to tables.**

<!-- phrase: #arkd0nx5th -->
## Consequences

- Word documents import without joining the text of cells.
- A rich table shows as a code block on GitHub, not as a table. The source stays readable, and the pipe table is still used wherever a cell is plain.
- Every consumer of `TableCell` changes once, in one mechanical step, before anything new works.
- The nested list body is sensitive to indentation, which a person editing the text by hand has to get right. The Phrase editor writes it.
- The lists in cells use the list styles, which have indents made for body text. How they look in a cell is a question for the rendering item, and may need a context in the stylesheet.

<!-- phrase: #w9cnyr48gm -->
## Alternatives considered

- **A bullet list that is shown as a table.** It renders on GitHub, but a list would then mean a table by an attribute, the editor and the exporter would disagree on what it is, and widths, table styles and a data source have no place in it. Other layouts of a list, such as the diagrams that Word calls SmartArt, are a different feature.
- **A body in YAML.** More explicit, but bad for prose, and the cell text would need a second reader of Markdown.
- **A division `:::table`.** ADR 0001 rejected fenced divisions, since GitHub shows them as noise. A code fence shows as source.
- **A table in HTML.** It is the only form that GitHub renders with rich cells, but the dialect accepts no other HTML than the annotations, the text cannot be put in one canonical form, and people would write it by hand in many ways.
- **Hard line breaks in cells.** Cheaper, and it would help when text only needs lines, but it gives no lists, and ADR 0005 reports hard breaks as unsupported on purpose.
- **Keeping inline cells and adding rich cells as a second kind.** Two representations in the model would make every consumer handle both.

<!-- phrase: #xbg3rm7tww -->
## Decisions of the product owner

- The table options stay in the annotation. The body is less pretty than it could be, and that is accepted.
- Paragraphs and lists are enough in a cell for now.
- A `phrase-table` that has only plain cells is written back as a pipe table, as proposed, but this is preferred and not required. The Markdown is a means: what counts is that a document can be reviewed on GitHub and that the model is sound. The pipe table is used wherever it can be because GitHub renders it, so a form that is easier to build may keep a plain `phrase-table` as written if the rewrite proves costly.
