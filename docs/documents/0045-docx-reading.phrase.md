---
phrase-format: 1
title: "ADR 0045: Reading a Word document for import"
---

<!-- phrase: #ng80kkaxzm -->
# ADR 0045: Reading a Word document for import

Status: Accepted

<!-- phrase: #w3rtprxyrb -->
## Context

ADR 0043 decided what the import of a Word document carries over and left the XML parser to the first item that needs it. This record is that choice, with the small rules that the first item (text content) had to settle. The dependency policy asks for a written reason for a new dependency that processes document content (ADR 0002).

<!-- phrase: #58fpnak356 -->
## Decision

<!-- phrase: #haqphzmf63 -->
### The parser

The `import-docx` package uses `saxes` (ISC license, no dependencies of its own besides `xmlchars`) to read the XML parts, and `fflate`, already used by the exporter, to open the package. `saxes` is a plain JavaScript streaming parser that follows the XML rules strictly, handles namespaces, does not fetch or expand external entities, and runs in a browser as well as in Node. The package builds a small tree of its own, so no type of the parser leaves it. Names in the tree are local names, so a document that uses other namespace prefixes than `w:` is read the same.

Only parts that are XML or relationships, and no larger than 64 MB each, are unpacked, so that a small file cannot unpack into a huge one. Media and embedded files are never read.

Alternatives were `fast-xml-parser`, which builds objects by itself but has a looser reading of the rules, and a parser of our own, which is excluded by the architecture constraints.

<!-- phrase: #2zw6rzeysm -->
### Refusals

An old `.doc` or an encrypted file (they share one signature), a file that is not a ZIP package, a package with no Word document, and XML that is not well-formed are refused with a reason, and nothing is written.

<!-- phrase: #ver47mgbh2 -->
### Small rules of the text import

- A paragraph style is a heading by its name (`heading 1` to `heading 6`, which Word keeps in English in every language) or by the styles it is based on. `heading 7` to `heading 9` and `TOC Heading` give body, since the project has six levels and the title of a table of contents is not part of the outline.
- A heading that skips a level keeps its level, and the report says so. The editor refuses such a heading, but the import does not repair content (the product rule on diagnostics).
- Numbering is read from the paragraph, else from its style, and a level is a bullet list when its format is `bullet` or `none`. A list that changes kind, or number, at the same level starts a new list.
- A run is code when its font is on a short list of monospace fonts or its character style is one of Word's code styles. Another font is direct formatting, left out and counted.
- A link is kept only for `http`, `https`, `mailto` and `tel`. Any other address, relative paths included, is kept as text and reported, so that a document cannot bring in a `javascript:` or `file:` link.
- A paragraph whose mark is a tracked deletion joins the next paragraph, as when Word accepts the change.
- Tables are replaced by a placeholder, `[Table: 5 rows, 4 columns]`, until the item on tables.
- The importer assigns no IDs and does not name the file. That is for the host that writes the document.

<!-- phrase: #9gxkvdatzv -->
## Consequences

- The package depends on `core`, `fflate` and `saxes`, and on no Node built-in, so a browser host can use it.
- A document is read whole into memory, which is fine for the documents this is meant for.
- Rules that are only about the text are here, so the tables and command line items can add to them without rewriting ADR 0043.
