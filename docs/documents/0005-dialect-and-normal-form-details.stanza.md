---
stanza-format: 1
title: "ADR 0005: Markdown dialect and normal form, implementation details"
---

<!-- stanza: #c01r4nnwhp -->
# ADR 0005: Markdown dialect and normal form, implementation details

Status: Accepted

<!-- stanza: #zctdehgrvz -->
## Context

ADR 0001 chose the Markdown dialect and ADR 0004 the domain model and its normal form. Building the parser and serializer, and testing them with fixtures and randomized round trips, settled details those records left open and corrected one rule that could not work as written. This record adds to ADR 0001 and ADR 0004 and does not change what they decided. Where they differ, this record governs.

<!-- stanza: #1jg7rkajby -->
## Decision

<!-- stanza: #jmfrr523tt -->
### Parser and serializer

- The parser is built on `markdown-it` (CommonMark with tables, raw HTML enabled, reference-style links disabled) and reads front matter with `yaml` using its failsafe schema, so every scalar is a string. The serializer is our own, written from the domain model.
- The parser is lenient. It accepts equivalent constructs such as setext headings, `*` bullets, and `_emphasis_`, and reports what it cannot represent. The serializer is strict. A file is canonical when serializing its parsed form gives the same text.
- Reference-style links are not part of the dialect, so `[text]` stays plain text.

<!-- stanza: #4akbrbta42 -->
### Serialization rules

- Lists are written with `-` for bullets and `1.` for every numbered item. Adjacent lists of the same kind would merge when read back, so every second one uses the other marker (`*` for bullets, `1)` for numbered lists).
- Blocks inside a list item are separated by a blank line, except a nested list directly after a paragraph. Items are separated by a blank line only when some item has two blocks separated that way.
- Strong and emphasis are written as `**` and `*`. Whether these delimiters read back correctly depends on the surrounding characters, so the serializer checks its own output by reading it again. When a block would not read back as the same runs, the whole block uses `<strong>` and `<em>` instead. The parser accepts these two tags as the only inline HTML besides the character-style span.
- Text is escaped minimally: `\`, `` ` ``, `*`, and `<` always; `_` unless inside a word; `&` only before something that looks like an entity; `]` before `(`; brackets inside link labels; `|` in table cells; and characters that would start a block at the start of a paragraph, including `[ ]` and `[x]`, which GitHub reads as task-list markers.
- Link destinations are written as read. The parser percent-encodes spaces and non-ASCII characters, so a destination is stable after one round trip.
- Pipe tables: the separator row is always `| --- |`, an empty cell is written as two spaces between the pipes, and colons in a separator row are reported because column alignment is not supported. The Markdown parser drops cells beyond the header, as GitHub does, and the dropped cells are not reported.
- Front matter lists are block sequences, one item per line, and an empty list is `[]`.
- The parser also accepts CRLF line endings and a byte order mark. The serializer writes LF.
- Line breaks inside text become spaces, and hard line breaks are unsupported and reported.

<!-- stanza: #2qvhj72g3p -->
### Normal form

This replaces the whitespace rule in ADR 0004 and adds three rules.

- Whitespace at the start or end of a span of marks moves out of the marks. A span is a stretch of runs that share a mark, so whitespace inside `**a *b* c**` stays. The earlier rule, which moved whitespace out of every marked run, would have rewritten that common construct as `**a** ***b*** **c**` and made such files non-canonical.
- Whitespace at the edges of a block is trimmed.
- Line breaks inside text become spaces.
- Paragraphs left empty are dropped, since Markdown cannot express them.

<!-- stanza: #cmj0r295sj -->
## Consequences

- Every document in the model can be written, and reading the result gives the same document. Fixture files, exhaustive short strings, and randomized mark combinations check this.
- The check on emphasis costs a second read of blocks that contain strong or emphasis. Only those blocks pay it.
- Some content changes shape after one round trip: link destinations are percent-encoded, and `*` emphasis may become `<em>` where Markdown cannot express it.
- Extra table cells are lost without a diagnostic. Reporting them would need a table parser of our own.

<!-- stanza: #pzwfwhna91 -->
## Alternatives considered

- **Always `<strong>` and `<em>`.** Simple, but unreadable in source and in diffs.
- **Underscore delimiters for emphasis.** They fail inside words, which is as common as the cases they would fix.
- **Rewriting the accepted ADRs.** Accepted decisions are not changed after the fact. This record exists so they stay as they were decided.
