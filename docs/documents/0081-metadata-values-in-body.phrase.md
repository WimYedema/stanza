---
phrase-format: 1
title: "ADR 0081: Metadata values in body text"
---

<!-- phrase: #3ztevj0twt -->
# ADR 0081: Metadata values in body text

Status: Accepted. Refines ADRs 0001, 0004, 0005, 0017 and 0019.

<!-- phrase: #n2r370veew -->
## Decision

- A reference is a semantic inline atom: `![label](phrase:title)`, `phrase:authors`, `phrase:classification` or `phrase:field:document-number`. `field:` names a kebab-case custom field, including `page-template`. The label identifies the reference, not a cached value or fallback.
- Resolve against the current document's metadata and applicable project defaults. Strings are plain text; lists join with comma and space as in ADR 0019. Line breaks become spaces. Empty values are not missing. Unknown or absent fields are diagnostics; never substitute the label. Do not interpret Markdown or HTML.
- The editor shows the current value and field name on hover, with explicit insertion. The read-only atom can be selected and removed whole; metadata changes update its display without changing body source or cursor. Paragraph styles apply; formatting the atom is later work. Preserve adjacent marks; diagnose unsupported marks on the atom.
- Support all inline contexts, including headings, lists and cells. Heading display, navigation, tables of contents and DOCX agree. The first implementation supports top-level paragraphs only and refuses unsupported placements without rewriting them.
- Documents with atoms use document format 2, so older Phrase versions refuse them. Read and preserve canonical format-1 documents unchanged; inserting a reference explicitly upgrades that document. Provide explicit, lossless migration and deterministic round-trip tests. Project and stylesheet formats remain 1. Never reinterpret existing links or silently repair unsupported source.
- Standard Markdown reads `![label](...)` as an image, not transclusion; a `phrase:` target may appear broken or as alt text on GitHub. Real images and other targets are not metadata. Item 152 decides broader inclusion syntax; later changes require explicit compatibility and migration.

<!-- phrase: #s2se14r4zn -->
## Consequences

Header/footer/cover token syntax and fallback labels stay unchanged. No general templating, shared-value registry, network or rich metadata content.
