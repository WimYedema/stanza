---
phrase-format: 1
title: "ADR 0067: Style editor, link to the token"
---

<!-- phrase: #hedyg5yvv8 -->
# ADR 0067: Style editor, link to the token

Status: Accepted. Refines ADR 0066.

<!-- phrase: #z9b4mhv3yw -->
## Context

A color or font row shows a token picked from the theme (ADR 0066), but changing the token itself needs the Theme tab (ADR 0050), which the person has to find by hand.

<!-- phrase: #8gs5s3z9x5 -->
## Decision

- **A token picker has a link** (an arrow button after the swatch or sample) that selects the token in the Theme tab. It is there for a color or font row, the banded rows and the color of a border.
- **The token is the one shown**: the one the style sets, or else the one it has from a base. With nothing set, or a "Custom" value, there is no link.
- **No new message.** The link is a selection inside the webview, the same one that shows a style that was just added (`selectWhenShown`), so the host and the protocol do not change.

<!-- phrase: #7vry2m9kxv -->
## Consequences

- A token can be changed from the row that uses it, in two clicks.
- Where the arrow sits in a narrow panel is judged by hand in VS Code.
