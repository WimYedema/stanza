---
stanza-format: 1
title: "Product Vision"
---

<!-- stanza: #3qqxyfvj14 -->
# Product Vision

<!-- stanza: #pc2s90mrhx -->
## Working concept

A local-first, structured authoring environment for creating professional, consistently styled documents and document collections.

The product is not intended to expose all the formatting power of Microsoft Word or the DOCX format. It deliberately constrains authoring so that users can create well-structured, well-presented documents without becoming experts in document formatting.

**Structured content. Controlled styling. Open files. Real versioning.**

It is built for documents that are written by people who work comfortably with Git, such as software developers, but read and reviewed in Word by people who do not.

<!-- stanza: #v48s5ys6rt -->
## The problem

Traditional word processors combine content, structure, layout, and incidental formatting in a single editing surface. This gives authors considerable freedom, but also makes it easy to create documents that are internally inconsistent, difficult to restyle, hard to compare, and awkward to manage as a related collection.

Named styles help, but direct formatting remains easy to introduce and difficult to detect. Version history is commonly file-oriented rather than structure-aware. Cross-document references and shared styling require discipline and manual maintenance.

Professional and technical authors often do not need every capability of DOCX. They need a smaller set of capabilities that work predictably and make the correct result easy to achieve.

Text-based toolchains such as Markdown with Pandoc solve consistency and versioning for the author, but they do not give a visual editing experience with enforced styling, and they leave the review loop with Word-based readers unsolved. Authors end up exporting a DOCX, receiving comments in Word, and transcribing them back by hand.

<!-- stanza: #vvyrj74ff9 -->
## Vision

The product provides a visual word-processing experience over a constrained semantic document model.

Authors select what content *is*, rather than directly specifying how it looks. Paragraphs, headings, captions, notes, code, emphasis, tables, figures, and references are semantic objects. A shared stylesheet determines their appearance.

Formatting commands never silently create direct formatting. For example, a **Strong** button selects the strong variant defined for the current style. If no such variant exists, the editor does not invent one. It may offer to create or configure the variant explicitly.

Projects may contain multiple documents, shared styles, shared assets, and stable cross-references. Their native representation is deterministic, line-oriented text, based on Markdown, designed so that Git diffs read like prose. DOCX and PDF are generated publication artifacts rather than canonical editable sources.

Reviewers do not need to leave Word. Exported DOCX files carry stable anchors, so comments made in Word can be brought back and attached to the content they refer to.

<!-- stanza: #0ggbgcn6ea -->
## Target users

The initial product targets its author first, and then people with the same working style: developers and other technical authors who are comfortable with Git and the command line, create related professional or technical documents, and value consistency, maintainability, and traceable change more than unrestricted page-design freedom.

The audience for the published documents is different. Readers and reviewers are typically familiar with Word, not Git. They receive DOCX or PDF files and must never be required to use Git, GitHub, or Stanza.

Representative uses include:

- architecture and design documentation;
- policies, procedures, and controlled documentation;
- technical reports and manuals;
- proposals and specifications;
- document sets sharing branding, terminology, figures, and references.

Authors are expected to understand Git. The editor should nevertheless let them write without entering markup, and should provide commit support when they work directly in a repository. Other Git operations remain available on the command line.

<!-- stanza: #8s2ysvq0pe -->
## Product principles

<!-- stanza: #janrnp0dy4 -->
### 1. Meaning before appearance

Document content expresses semantic intent. Visual presentation is derived from explicitly defined styles.

<!-- stanza: #chyybv1ynb -->
### 2. No silent direct formatting

Editing commands may apply semantic roles or declared style variants. They must not add arbitrary font, size, weight, color, spacing, or alignment properties to document content.

<!-- stanza: #rgntx1syg1 -->
### 3. Constraint is a feature

Feature completeness relative to Word is not a goal. The supported vocabulary is intentionally limited to constructs that can be edited, styled, validated, versioned, and published predictably.

<!-- stanza: #ekvgvykvpc -->
### 4. Local-first operation

Authoring, rendering, styling, validation, history, and export require no account, network connection, or hosted backend. A project can live entirely in a local directory.

Remote Git repositories, including GitHub or GitLab, are optional synchronization and collaboration mechanisms. Git is part of the storage and history model; a particular hosting provider is not.

<!-- stanza: #znef4s14ye -->
### 5. Collections are first-class

The primary unit is a project containing one or more documents, rather than an isolated file. Documents may share styles, assets, metadata, numbering, and references.

<!-- stanza: #gbrej7k4jn -->
### 6. References are structural

Cross-references target immutable identifiers rather than filenames, headings, or current section numbers. Renaming, renumbering, or moving content must not invalidate references.

<!-- stanza: #gr81skdcyg -->
### 7. History is meaningful

The native format supports useful Git diffs, branches, tags, review, and reproducible releases. A change to a sentence should appear as a small, readable diff, and unrelated content must not be reformatted. The user interface may later present document-aware changes.

<!-- stanza: #0gb7e5g117 -->
### 8. Review happens where the reviewers are

Authors may review changes through Git hosting. Readers who use Word review in Word. Comments made on a generated DOCX can be imported back and anchored to stable identifiers; they are data for the author to resolve, not edits applied to the source.

<!-- stanza: #qtkq0zrpxk -->
### 9. Publication is reproducible

Given the same project revision and exporter version, building the project should produce equivalent publication output. A tagged revision should be sufficient to recover the source of a published release.

<!-- stanza: #8jr1gm701m -->
### 10. Open and inspectable source files

The canonical project data uses documented, text-based formats. Users retain control of their content and are not dependent on a proprietary cloud database.

<!-- stanza: #p1rtphms7a -->
### 11. AI is optional

The product must function without AI. AI-assisted authoring may be added later, but editing, styling, reference resolution, versioning, validation, and export remain deterministic product capabilities.

<!-- stanza: #mmc24597gg -->
## Styling model

A document node identifies its semantic role and optionally a declared variant. It contains no arbitrary visual properties.

Conceptually:

```json
{
  "type": "paragraph",
  "style": "body",
  "content": [
    { "type": "text", "text": "This is " },
    {
      "type": "text",
      "marks": [{ "type": "strong" }],
      "text": "important"
    }
  ]
}
```

The stylesheet defines the appearance of `body` and the contextual meaning of `strong` within it. The same semantic mark may render differently inside a heading, caption, warning, or code block.

The stylesheet is a typed application model, not arbitrary CSS. It is compiled to browser CSS and DOCX style/run properties so that both renderers derive from one source of truth.

The core vocabulary stays small. Document-specific meanings, such as a status marker like `[proposed]`, are character styles that the project's own stylesheet defines, not part of the core model.

<!-- stanza: #t699cxdm8k -->
## Local and remote usage

Supported project locations should eventually include:

1. A local directory selected through the browser or desktop shell.
1. A local Git working tree.
1. A cloned repository with an optional remote on GitHub, GitLab, or another Git host.

When working in a Git working tree, the product supports committing changes. Branching, merging, and pushing remain command-line concerns until a use case justifies otherwise.

Core editing must not require cloud storage, user accounts, telemetry, or server-side conversion.

<!-- stanza: #ev8bpf1fka -->
## Publication model

The native project is the editable source. DOCX and PDF are outputs.

```text
Project source
    + stylesheet
    + assets
    + references
          |
          v
       build
       /   \
    DOCX   PDF
```

Generated DOCX files include stable anchors for referenceable content, such as bookmarks named after node IDs. Reviewers comment in Word as usual, and the author imports those comments to see them next to the content they refer to.

```text
Project source --build--> DOCX --review in Word--> comments
       ^                                              |
       +------ author resolves, edits source <--------+
```

The compatibility promise is one-way for content and one-way back for comments:

- Project to DOCX: supported.
- Project to PDF: supported when implemented.
- Comments in a generated DOCX to the project: supported, anchored by stable ID. Comments whose anchor no longer exists are reported, not discarded.
- Arbitrary DOCX to project: not supported.
- Edits and tracked changes made in Word: not applied to the source. They may be shown as suggestions later.

<!-- stanza: #xwghqvgymh -->
## Publication constraints

Publication features that depend on page layout are the hardest to generate reliably, so the product supports deliberately fewer options than Word.

**Rule: the product computes everything it can know. Word computes only what depends on pagination.**

- Heading numbers, caption numbers, and the text of cross-references ("Figure 3", "section 2.3") are computed from the project and written as literal text. They do not use Word `SEQ` or `REF` fields.
- Only page numbers, in headers, footers, and the table of contents, depend on pagination and are left to Word fields.
- Dates and versions in published output come from project metadata or the tagged release, never from the build time.

<!-- stanza: #g0a73j4s45 -->
### Constrained features

- **Table of contents:** a semantic block with a depth setting, derived from headings. Entries are written as linked paragraphs, so they are visible without any update. Page numbers are a stylesheet option: on, each entry carries a page-number field and Word asks the reader once whether to update fields when the file opens (accepting fills in the page numbers; declining leaves placeholders); off, there are no fields and no prompt.
- **Cover page:** a page template in the stylesheet whose slots are filled from document metadata, such as title, document class lines, a metadata table, and classification. The page is divided into rows of fixed or proportional height, so a logo, the title and the metadata can sit where a corporate cover has them, without text boxes or floating shapes (ADR 0089). The body starts on a new page because the template says so. A template can also put a condensed title block at the top of the first body page, with or without a cover (ADR 0090).
- **Tables:** named table styles in the stylesheet, several allowed, covering borders, header row, and padding. Column widths are autofit by default, with optional relative weights on a table. No per-cell formatting.
- **Headers and footers:** defined in the stylesheet, not the content. Left, centre, and right slots with a small token set, such as title, version, classification, page, pages, and section.
- **Page templates:** a few named templates in the stylesheet, each with page size (A4 or Letter), margins, and header and footer. A document selects one template.
- **Numbering and captions:** a small set of fixed schemes, such as hierarchical decimal headings, "Figure N", "Table N", and lettered appendices. Numbering across a project follows a defined document order.

<!-- stanza: #3w6xfr27zy -->
### Scope tiers

<!-- stanza: #r3b0exk9ck -->
| Tier | Features |
| --- | --- |
| Initial | Table of contents with depth, header and footer slots with tokens, page numbers, A4 and Letter with margins, cover page from metadata, table styles, numbered headings, cross-reference text |
| Later | Images and captions, boxes and their placement, landscape sections, cover columns and backgrounds, table of figures, glossary, minimal bibliography |
| Not planned | Index, page-number cross-references, columns, odd and even headers, per-page overrides, custom list or number definitions |

Page breaks are a layout concern handled by styles and templates, not by content. Word asks the reader whether to update fields when a document with page-number fields is opened; this was tested and is accepted. A table of contents without page numbers remains available for readers who must never see that prompt.

<!-- stanza: #mkmq8gx21d -->
## Initial product scope

The first usable version should demonstrate:

- paragraphs and headings;
- a table of contents, headers and footers, page numbers, and numbered headings, within the publication constraints above;
- semantic strong, emphasis, code, and links;
- ordered and unordered lists;
- simple tables with named table styles;
- a cover page and page templates, with page breaks left to styling;
- a typed stylesheet with inheritance and contextual variants;
- browser rendering from that stylesheet;
- multiple documents in one project;
- immutable IDs for referenceable objects;
- cross-document references and broken-reference validation;
- local project storage;
- Git-friendly history and commit support;
- DOCX export with shared named styles and stable anchors;
- import of Word comments anchored to those stable IDs;
- a one-time import of the content of an existing Word document, to populate a project (ADR 0043);
- deterministic validation and automated tests.

<!-- stanza: #vmchfa2cfx -->
## Explicit non-goals

The initial product is not:

- a complete replacement for Microsoft Word;
- a desktop-publishing or arbitrary page-layout application;
- an editor for arbitrary DOCX files, or an import that keeps their formatting: the one-time import of ADR 0043 takes the content and leaves the look to the stylesheet;
- a DOCX round-trip system, including applying edits or tracked changes made in Word;
- a vehicle for exposing every OOXML feature;
- a cloud document platform;
- a proprietary version-control service;
- a real-time collaboration platform;
- a custom browser layout engine;
- a generator of indexes, page-number cross-references, multi-column layouts, or per-page header overrides;
- an AI-dependent application.

Features such as macros, OLE objects, text boxes, WordArt, SmartArt, arbitrary floating shapes, mail merge, and unrestricted direct formatting are outside the intended product model unless a later use case provides compelling justification.

<!-- stanza: #gdqs5wxe5s -->
## Success criteria for the first product increment

The concept is validated when a user can:

1. Create a local project containing several documents.
1. Author them visually without entering markup.
1. Apply only declared semantic styles and variants.
1. Change the shared stylesheet and see all documents update.
1. Create stable references between documents.
1. Commit meaningful source changes to Git.
1. Export DOCX files that open in Word and remain reasonably faithful in typography, hierarchy, tables, lists, images, and references.
1. Rebuild the same document release from a tagged source revision.
1. Send a DOCX to a reviewer who uses only Word, and import their comments back, attached to the right content.

Pixel-identical pagination between the browser and Word is not required.
