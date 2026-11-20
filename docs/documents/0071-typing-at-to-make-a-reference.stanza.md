---
stanza-format: 1
title: "ADR 0071: Typing @ to make a reference"
---

<!-- stanza: #bg1cped35r -->
# ADR 0071: Typing @ to make a reference

Status: Accepted. Builds on ADR 0069.

<!-- stanza: #xvbgd6zdpx -->
## Context

The list of headings for a reference (ADR 0069) is opened from a button, a key, the palette and the context menu. While writing, a person wants it where the hands are: type a character, pick a heading, go on.

<!-- stanza: #1tarwdj9an -->
## Decision

- **Typing `@` opens the list**, when it is typed at the start of a block or after a space, in a block of text that is not a code block, with no text selected. An `@` inside a word, as in a mail address, is only text.
- **The `@` is typed as usual.** It is in the text while the list is open, so closing the list with Escape, or by going elsewhere, leaves a plain `@`. Choosing a heading replaces the `@` by the reference in one step of the history (`replaces` on `set-reference`, taking effect only when that text is just before the cursor).
- **With no heading to offer, nothing opens** and the `@` is only text.
- **It is a shorthand of the editor and nothing else.** The file holds the ordinary link of ADR 0068; there is no `@` syntax in the dialect. The list is the one of ADR 0069, with all headings first and a field to narrow them.
- **It is not a setting.** It is on whenever the document has a heading with an ID.

<!-- stanza: #zj8kq77xqe -->
## Consequences

- A person who types a word that starts with `@`, such as a handle, sees the list open and presses Escape; the text stays.
- The trigger lives in the editor package, and the list in the webview. The editor only says that `@` was typed, so another host could draw its own list.
- Not checked in a real VS Code: the feel of the list opening while typing, and typing with an input method that composes characters.
