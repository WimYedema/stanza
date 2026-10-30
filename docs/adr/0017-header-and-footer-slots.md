# ADR 0017: Header and footer slots

Status: Accepted. The `authors` and `field:<name>` tokens added by ADR 0019.

## Context

ADR 0016 gave page templates a size and margins and left headers and footers to a later record. The vision wants left, centre and right slots with a small set of tokens, where the product writes what it can know and Word computes only what depends on pagination.

## Decision

### Slots

A page template can have a `header` and a `footer`. Each has three slots, `left`, `center` and `right`, and an optional `style`, the paragraph style of the line (default `body`). A slot is a string of text with tokens. A header or footer whose slots are all empty is not written. One section carries one header and one footer, as the vision says: no different first page, no odd and even pages.

### Tokens written as links

A token is written as a Markdown link whose target is `phrase:` and the token name: `[label](phrase:title)`. This matches how references will be written in documents, leaves braces and brackets free as literal text, and cannot clash with an ID target (`#<id>`) or an external link. Only a complete `[label](phrase:name)` is a token, and anything else is literal text. An unknown token name is an error (`unknown-slot-token`), and the text stays literal. The tokens are `title`, `version`, `classification`, `page`, `pages` and `section`.

The label is the text shown while a token has no value. For `title`, `classification` and `version` it is what appears when the document has no such value. For the fields it is the cached result that Word shows until it updates the field, such as the `1` in `[1](phrase:page)`. An empty label shows nothing.

### Values

`title` and `classification` come from the metadata of the document, with the project defaults applied by the build. `version` has no source until the build information item, so its label shows. `page`, `pages` and `section` are Word fields, `PAGE`, `NUMPAGES` and `STYLEREF "heading 1"`, since only Word knows the pagination. Heading numbers are literal text (ADR 0011), so `section` shows a heading with its number. Word updates these fields in headers and footers by itself, with no prompt. A level 1 heading must exist for `section`, otherwise Word shows its own message in place of the field.

### Model and notation

The decoder in `format` splits slot text into literal parts and tokens, and `core` holds those parts and checks the style. The model does not depend on the notation. The stylesheet format stays at version 1, because the addition is optional.

### Layout of the line

The three slots are one paragraph, separated by tabs, with a centre tab at half of the text width and a right tab at its edge. The library cannot write several tab stops into a paragraph style, so the tab stops are explicit properties of the header or footer paragraph. This is a third place with explicit properties in the output, after those of ADR 0008 and ADR 0012. Tabs are written only as far as a slot to the right needs them.

## Consequences

- Page numbers and the current section are correct in Word without any update prompt.
- A template can use literal text, brackets, and braces in a slot.
- A stylesheet that uses `section` needs a level 1 heading in every document that uses the template.
- Tokens whose values are unknown show their labels, so a draft marker can be written into a template before the version is available.

## Alternatives considered

- **Braces for tokens, such as `{page}`.** Simpler, but a literal brace would need an escape, and the notation would differ from the one for references.
- **A three-column table for the slots.** No explicit tab stops, but a table in every header.
- **Tab stops written into a patched style.** They would stay in a named style, at the cost of inserting them in the schema order of the paragraph properties.

## Not covered

A different first page, odd and even headers, and a cover page with its own slots. The cover page is a separate backlog item.
