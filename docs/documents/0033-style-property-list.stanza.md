---
stanza-format: 1
title: "ADR 0033: The list of style properties"
---

<!-- stanza: #8ba5z3g815 -->
# ADR 0033: The list of style properties

Status: Accepted

<!-- stanza: #yzfmmk625r -->
## Context

The properties that a stylesheet can set were written down several times: the keys the parser allows in each place (`TEXT_KEYS`, `PARAGRAPH_KEYS` and the lists inside `checkKeys`), the way each key is read, the map from model fields to file keys in the validation, and what each number may be (above zero, not negative, any). The style editor (backlog) needs the same facts to offer the right fields, with the right units, in each place. A fourth copy would drift from the others.

<!-- stanza: #37b1hhdvyc -->
## Decision

`core` holds one list, `STYLE_PROPERTIES` (`style-properties.ts`). Each entry has:

- **key**: the name in the stylesheet file, in kebab-case;
- **type**: `number` (with its unit, `pt`, and its range: `positive`, `non-negative` or `any`), `boolean`, `color`, `font`, `choice` (with its values), `line-spacing`, `style-name`, or one of the kinds that are mappings with properties of their own (`variants`, `borders`, `border`, `header-row`);
- **places**: where in the file it can be written: a paragraph style, a character style, a table style, a variant, a header row, the sides of a table border, or one border.

The text properties and the paragraph properties also name the field of the model they set (`prop`), checked by the compiler against `TextProps` and `ParagraphProps`. The list is in the order in which the properties are read, which is the order in which problems with them are reported.

<!-- stanza: #hxvhcywtpd -->
### What reads it

- The parser allows the keys of each place from the list (`propertyKeys`), and reads the text and paragraph properties by their type, so that a new property of a known type is one entry and no code. A value of the wrong kind is reported as before, and `alignment` names its choices from the list.
- The validation checks the text and paragraph properties by the type and range of the list, with the path built from the key.
- The style editor will offer the properties of a place from the list, with their types and units.

<!-- stanza: #ngcn1jt7n6 -->
### What stays by hand

The kinds that are mappings (`variants`, `border`, `header-row`, the line spacing) are still read by their own functions, since their contents are not a single value. The table-style properties that the validation checks (`cell-padding`, the border width, the cell style) are still checked there, by hand, and the list says the same about them. A test checks that each number of the text and paragraph lists is validated as its range says, and that the list has exactly the fields of the model.

<!-- stanza: #ca8whd620m -->
## Consequences

- A property is added in one place, and the parser, the validation and (later) the editor follow.
- The order in which independent problems of one style are reported follows the list. The line spacing is now reported after the indents, as the validation already did, and before the alignment, as the parser already did.
- The model types are still written by hand. The list and the types are tied by a test and by the compiler for `prop`, not generated from one another.
- The reading of text and paragraph properties is typed loosely inside the parser, since the list drives it. The test of the list is what keeps it safe.

<!-- stanza: #rd4ra6rvpk -->
## Alternatives considered

- **Generating the model types from the list.** It would remove the last duplication, but it makes the types harder to read and to navigate, for a list that changes rarely.
- **Descriptors for the table properties too.** Their values are mappings, so a descriptor would only repeat the code that reads them.
- **Keeping the lists in the editor.** Then the editor and the parser would disagree the first time one changed.
