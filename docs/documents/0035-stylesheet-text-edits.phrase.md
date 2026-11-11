---
phrase-format: 1
title: "ADR 0035: Edits of the text of a stylesheet"
---

<!-- phrase: #0w7zcqragj -->
# ADR 0035: Edits of the text of a stylesheet

Status: Accepted. It replaces one limit of ADR 0026: a style or `variants` written as a mapping on one line, with content, is edited now.

<!-- phrase: #drv1vwt4z4 -->
## Context

ADR 0026 made a comment-preserving edit of the stylesheet text for one change, declaring a variant. The style editor (backlog) changes many properties of many styles, and needs the same kind of edit for any of them: set a value, add one, remove one, with the comments, the order and the layout of the file left alone, so that Git shows a few lines.

<!-- phrase: #csfkbkn9ds -->
## Decision

The `format` package has two functions that work on the text of a stylesheet and give the new text back:

- `setProperty(text, path, value)` sets the property at a path, such as `paragraph-styles`, `body`, `size`.
- `unsetProperty(text, path)` removes it.

`declareVariant` is `setProperty` of `variants.<mark>`, with its own checks that a variant already declared is left as it is and that the mark is allowed afterwards.

<!-- phrase: #nb2vtxga0r -->
### How a property is set

The text is edited where the property is, using the positions that the `yaml` library gives for the nodes. The file is not written again, so the other lines, their comments, their quoting and their order stay.

- A property that is there has its value replaced where it stands, so a comment after it stays. A value that is a scalar, or a mapping or list written on one line, can be replaced. A block mapping, a literal block and a value that is empty (`key:` or `null`) are not replaced, since that needs a guess about what should remain.
- A property that is not there is added after the last line of its block mapping, with the indentation of its keys, or after the last pair inside the braces of a mapping written on one line. The mappings that are missing on the way are made, as lines in a block and on the same line in a flow.
- A style written as an empty `{}` becomes a block. Inside a mapping on one line, an empty `{}` is filled in place.
- A path is made of property names in kebab-case. A value is a word, a number, a flag, a list of words, or a mapping of these, and is written on one line as the project writes them: words plain when YAML reads them as words, colors and other text in single quotes, lists of fonts as `['Calibri', 'Arial']`, mappings as `{ width: 0.75, color: rule }`. A value with a line break, or a number that is not finite, is refused.

<!-- phrase: #9x224b09fq -->
### How a property is removed

The lines of the property go, with the comment that ends them. The comments on the lines above stay. In a mapping on one line, the property and its comma go. A mapping below a style that has nothing left goes too, so that `header-row` or `variants` does not stay behind empty and change what the style means. A style or a section that has nothing left is written `{}`, which is how an empty style is written, and the comment on its line stays. A property that is not there leaves the text as it was.

<!-- phrase: #7ah6zs8fjv -->
### What a result must be

The result is read as a stylesheet. It is refused (`invalid-result`, with the message of the first error) if it has an error that the text did not have, such as a size that is not above zero, a name that is not a property, or a removed reserved style. An error that was in the text already does not stop an edit that is about something else, nor one that fixes it. A text that is not YAML (`invalid-stylesheet`), a path that is not names (`invalid-path`), a value that cannot be written (`invalid-value`) and a layout that cannot be edited without guessing (`unsupported-layout`) are refused too, and say so. The line ending of the file is kept.

<!-- phrase: #82g4k89fhe -->
## Consequences

- The style editor changes any property with one function, and the edit is a few lines in a file that Git shows.
- A refusal says what is wrong, so the editor can show it as it shows any other refusal.
- Where a property is inserted is the end of its mapping and not the place where it would be in a canonical order. A person who wants that moves the line by hand.
- Moving or renaming a style, and adding or removing a whole style with a block of properties, are not special cases here: adding is `setProperty` of a style with a value, removing is `unsetProperty`. A style removed while documents use it is for the caller to check.

<!-- phrase: #7xs0my6jem -->
## Alternatives considered

- **Printing the document again with the `yaml` library.** ADR 0026 rejected it, since it changes lines that are not about the change.
- **Editing only block mappings.** ADR 0026 did, and a stylesheet in which people write `{ size: 11 }` could then not be changed from the editor.
- **Making the removal of a last property leave `key:` empty.** It reads as null, which the stylesheet does not take for a style, and for `header-row` it is not the same as having none.
