---
phrase-format: 1
title: "ADR 0065: Colors and fonts only from tokens"
---

<!-- phrase: #tawy9m1gv6 -->
# ADR 0065: Colors and fonts only from tokens

Status: Accepted. Refines ADR 0006.

<!-- phrase: #8svxgwj54x -->
## Context

ADR 0006 lets a style give a color as a hex value or a token name, and a font as a family list or a token name. A hex value in a style is a second place that holds a color: changing the look of a document then means searching every style. The theme (`tokens`) is meant to be that one place.

<!-- phrase: #8t5ggtnapc -->
## Decision

- **A color in a style is the name of a color token.** A hex value there is the error `raw-color`. The message names the token that has that value, or says to add the value to `tokens.colors` under a name.
- **A font in a style is the name of a font token.** A family list there is the error `raw-font`, with the same kind of message.
- **The tokens themselves hold the values.** `tokens.colors` has hex values and `tokens.fonts` has family lists; a malformed hex value stays `invalid-value`.
- **No change in the types or the exporters.** `ColorValue` and `FontValue` keep both forms, since the rule is a validation; CSS and DOCX read the token values as before.
- **Where the check runs.** In `validateStylesheet`, so a stylesheet with a raw value does not load, export or open in the editor, and `setProperty` refuses to write one.

<!-- phrase: #zg0mwb4c48 -->
## Consequences

- Stylesheets written before this ADR must move their raw values into tokens. The shipped default stylesheet, the example project and the documentation project did this (`surface` and `white` are new tokens).
- The style editor still takes typed text for a color or a font; a raw value is refused with the message that names the token. Choosing from a list of the tokens is item 78.
- Not done: an automatic fix that moves a raw value into a token. It can be added as a quick fix later.
