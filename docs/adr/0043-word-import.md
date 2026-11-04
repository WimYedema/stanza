# ADR 0043: One-time import of a Word document

Status: Accepted

## Context

The documents that people want to manage in Phrase exist already, as Word files with messy formatting: direct formatting on most runs, styles made on the spot, tables formatted cell by cell (`docs/SPIKE_FINDINGS.md`). Typing them in again is the main obstacle to starting. The vision rules out an editor for arbitrary DOCX files and a DOCX round trip, and it still does.

The product owner's requirement: import is to make an initial population of the documentation easier. It is not for round-tripping. It may refuse what the product cannot represent, as long as it says so clearly. What matters is that the content is kept, and the look is restricted to what is common, since the person restyles in Phrase anyway.

## Decision

### Scope

- **One-time and one-way.** A DOCX is read once and becomes one new `.phrase.md` document in an existing project. Nothing is written back, nothing links the document to the DOCX afterwards, and re-importing makes a new document, never an update.
- **Content, not formatting.** The text and the structure come across. Look never does: the document gets the styles of the project, so no direct formatting and no styles of the DOCX are carried over (ADR 0006).
- **Local and native.** It is written in TypeScript with no external executable (ADR 0002), in its own adapter package, `import-docx`. Types of its XML library stay inside that package, as for the exporter. A small maintained XML parser is the dependency, and the choice of it is made with the first item that needs it.
- **Never silent.** Everything that is not carried over is in a report, with a count and where it was, or is replaced by a placeholder in the text. A file that is not a readable DOCX (an old `.doc`, an encrypted or damaged file) is refused with the reason, and writes nothing.

### What comes across

- Paragraphs, with the style of the project for what they are. A paragraph style of Word is mapped to the nearest known style, by its name and then by the styles it is based on: `Heading 1` to `Heading 6` become `heading-1` to `heading-6`, and a paragraph that is in a list becomes a list item. Everything else, including every custom style, becomes `body`. No styles are made in the stylesheet.
- Lists, bulleted or numbered, by the numbering of the paragraph, nested by its level.
- Bold and italic on a run, and in a character style of the run, become strong and emphasis. Runs in a monospace font become code. The bold or italic of a paragraph style is not read, so that every heading is not strong.
- Hyperlinks to an address become links. A link inside the document is kept as its text and reported.
- Tracked changes are taken as accepted, as in the spike: insertions are in, deletions are out. They are counted.
- A table of contents field becomes a `phrase-toc` block with the depth of the field; the entries it showed are dropped.
- Tables with a header row and cells of text become tables with the style `table` (ADR 0012), the widths left to autofit. Direct formatting of cells is dropped.
- IDs are assigned to what needs them, as the format command does (ADR 0020).
- The title comes from the properties of the document, or else from the first heading.

### What is kept in another form

Text is never dropped when it can be kept:

- A cell with several paragraphs or a list keeps its text, joined with spaces. Merged cells keep their text in the first cell, and the others are empty. A nested table has its text joined into the cell. Each is reported.
- A line break inside a paragraph, a tab and a no-break space become a space.
- The text of a text box is put at the place of the box as paragraphs, and reported.
- A footnote or an endnote becomes a placeholder at its reference that holds its text.
- A field that is not a link or a table of contents keeps the text that it shows.
- The content of a content control is kept as text.

### What is replaced or left out

- An image, a drawing, an equation and an object become a placeholder paragraph that names what was there, such as `[Image: image1.png]`.
- Left out, and counted in the report: direct formatting, empty paragraphs, page and section breaks, headers, footers and cover layout (the page template gives them), comments (item 38 is about those), bookmarks, and typed or automatic heading numbers. The project numbers headings itself, so a number typed in a heading appears twice, which the report points out.

### The report

The report is a list of diagnostics of the kind the other project commands show, each with a code, a message, a count and a place such as a heading or a paragraph number, with a summary of the styles of Word that were used and how they were mapped. A placeholder starts with a fixed word so that it can be found by search.

### How it is checked

The imported text must equal the body text of the DOCX paragraph by paragraph, after what the report says was lost. Automatic tests build small DOCX files in code for each rule above. Real documents are tried by hand, since they are not committed.

## Consequences

- A person can start from the documents they have, at the price of restyling and of going through the report.
- A document with many images or merged tables imports with placeholders to fill, not with an error.
- The importer must not grow into a conversion that tries to look the same. A request for more formatting is a request to extend the styles of Phrase first (ADR 0006).
- Items 82 to 84 of the backlog build this in three steps: text, tables and the table of contents, and the command line and the VS Code command.

## Alternatives considered

- **Pandoc.** Fast to start, but it needs a binary, has its own quirks (`docs/SPIKE_FINDINGS.md`), and cannot run in a browser (ADR 0002).
- **Refusing a file that has anything unsupported.** Honest, but most real documents have an image or a merged cell, so most would be refused.
- **Making the styles of Word into styles of the project.** A messy document has many styles and little use of them, and the project's look is the thing the product exists to keep consistent.
- **Importing formatting as direct formatting.** It is excluded by the invariants of the product.
