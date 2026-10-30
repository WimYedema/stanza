# ADR 0001: Native Markdown dialect

Status: Accepted. Details added by ADR 0005; the `phrase-toc` block by ADR 0018.

## Context

Documents are authored visually but stored as text in Git. Authors are developers who review changes on GitHub; readers use Word. The source must therefore:

- diff well, and render sensibly in GitHub's rendered view;
- carry semantic information plain Markdown lacks: immutable IDs, style names, character styles, table options;
- serialize deterministically, so saving never rewrites unrelated content;
- not depend on a particular tool such as Pandoc.

The spike (`docs/SPIKE_FINDINGS.md`) showed that Pandoc-style attributes (`{#id .style}`, fenced divs, bracketed spans) are valid Pandoc but appear as literal noise when GitHub renders the file.

## Decision

### Base format

GitHub Flavored Markdown (CommonMark plus tables) with YAML front matter. Phrase-specific information is encoded in constructs that GitHub already hides or renders harmlessly. Nothing else from Pandoc or other dialects is accepted.

We write our own parser (on an existing CommonMark parser) and our own serializer from the domain model. Pandoc is not required.

### Serialization rules

- One way to write each construct. The serializer is the only authority on layout.
- ATX headings, `-` for bullets, `1.` for every item of an ordered list (numbers come from rendering), `*emphasis*`, `**strong**`, backtick code fences.
- One paragraph per line, no wrapping.
- Nested blocks in list items are indented to the item's content column (CommonMark).
- Pipe tables with inline content only. Cells are unpadded, with a single space around each pipe. Alignment comes from the separator colons.
- UTF-8, LF line endings, one trailing newline.

### Front matter

YAML between `---` lines, a fixed schema, keys in schema order, all strings double-quoted. A `phrase-format: 1` key versions the file. GitHub renders front matter as a table.

### Annotations

Block-level information goes in an HTML comment on the line directly before the block:

```markdown
<!-- phrase: #k7m2q9x4zb .cover-title widths="30 70" -->
```

- `#id` sets the block's ID, `.name` its style, `key="value"` options.
- At most one annotation per block. Annotations are optional.
- Applies to any block: heading, paragraph, list, table, code fence. A table in a list item has the annotation indented like the table.
- Unannotated blocks take the default style for their kind (body text, heading level, list type, default table style).

Character styles use an inline span:

```markdown
Items marked <span class="marker">[proposed]</span> need approval.
```

Other inline HTML is unsupported and reported as a diagnostic. The same applies to unknown annotation keys.

### IDs

- Only referenceable nodes need IDs (headings, tables, figures). Any other block may carry one on request, for example when a comment or reference targets it.
- Format: 10 lowercase Crockford base32 characters from a cryptographic random source, such as `k7m2q9x4zb`. No type prefix, since a node's kind can change but its ID must not.
- IDs are unique across the whole project, not just one file, so content can move between files without renumbering. A tool assigns missing IDs and checks for duplicates. UUIDs were considered; short IDs were kept for readability in hand-written references and diffs. Word bookmark names must start with a letter or underscore, so the exporter adds a prefix.
- IDs are never derived from titles or reused after deletion.

### Tables

Pipe tables, header row required. Column widths are autofit unless a `widths` option gives relative weights, for example `widths="30 70"`. Table styles are named in the annotation. Multi-paragraph cells and cell merges are not supported yet.

### Extension mechanism

Complex content that does not fit the constructs above uses a fenced code block whose info string starts with `phrase-`, for example `phrase-table`. GitHub renders such a block as ordinary code, so the source stays readable. Fences with other info strings are ordinary code. Unknown `phrase-` kinds are reported as diagnostics. No such kind is defined yet.

### Example

````markdown
---
phrase-format: 1
title: "Example Document"
authors: ["A. Author"]
date: "2026-10-13"
---

<!-- phrase: .cover-title -->
Example Document

<!-- phrase: #k7m2q9x4zb -->
## Identity model

Authentication establishes the user's identity.
Items marked <span class="marker">[proposed]</span> need approval.

1. First step.
1. Second step, with a table:

   <!-- phrase: #n3d8w5r1ya .table-grid widths="30 70" -->
   | Name | Role |
   | --- | --- |
   | Alice | Reviewer |
````

## Consequences

- Files render cleanly on GitHub: annotations are invisible, the styled span shows its text, and front matter becomes a table. Source diffs stay line-oriented and readable.
- Any CommonMark parser can read the files. Tools unaware of Phrase see plain Markdown.
- Annotations are more verbose than attribute syntax such as `{#id}`. The cost is accepted for clean rendering.
- We own the parser and serializer, and the round-trip tests are our responsibility (backlog: Markdown parser and serializer).
- One paragraph per line means a one-word change shows as a whole-line change in the source diff, although GitHub highlights the changed words. Sentence-per-line can be introduced later through a format-version change.
- Cross-references are not defined here. They target IDs, never paths or titles, and are specified when references are built (backlog: reference index).

## Alternatives considered

- **Pandoc Markdown subset** (`{#id}`, fenced divs, bracketed spans). Valid Pandoc, but literal noise on GitHub, and it ties the format to Pandoc's conventions.
- **AsciiDoc.** Semantic roles and IDs, and GitHub renders it, but it is not Markdown and has a heavy JavaScript parser and no common writer.
- **MyST or directive-based Markdown.** Reasonable, but directives render as code blocks or text on GitHub and need their own ecosystem.
- **Custom format.** Full control, but a new specification, no tooling, and no GitHub rendering.
- **JSON.** Rejected earlier because its diffs do not read like prose.

## Open points

- Verify how GitHub renders the example in a pull request, including the rich diff view.
- Whether ordinary HTML comments are allowed in documents. They are currently unsupported content.
