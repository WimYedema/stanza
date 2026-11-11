---
phrase-format: 1
title: "ADR 0066: Style editor, token pickers"
---

<!-- phrase: #es35tjnynr -->
# ADR 0066: Style editor, token pickers

Status: Accepted. Refines ADR 0037 and builds on ADR 0065.

<!-- phrase: #fm73pzetan -->
## Context

ADR 0065 made a color or a font in a style the name of a token. The panel of the style editor still had text fields with the token names offered, so a raw value could be typed and was only refused afterwards.

<!-- phrase: #2nmedxdf5r -->
## Decision

- **A color or a font is picked from a list of the tokens of the theme**, for the colors and fonts of paragraph, character and table styles, the banded rows, and the color of a border. Nothing is typed. The first option is for what the style does not set and shows what the base gives.
- **The list shows the value.** A color has a swatch and a font has a sample ("Aa") in its families. Both are set through the style object model, not as markup or attributes, so the content security policy of the webview needs no change.
- **The row says where the value comes from**: `Theme: mono` for a token, after `from base` when the value is inherited.
- **A value that is not a token of the theme** shows as "Custom" with a warning, until a token is picked. Validation (ADR 0065) keeps such a file from loading, so this is a safety net for a file that changes under the panel.
- **A note at the top of the panel** says that colors and fonts come from the theme, and that tokens are added or changed in the Theme tab (ADR 0050).
- **A new border without a color** takes the color of its base, or else the first color token. With no color tokens it is not written.

<!-- phrase: #1fjfpx2eaz -->
## Consequences

- The panel cannot write a raw color or font any more; `setProperty` still refuses one (ADR 0065).
- Tokens are added in the Theme tab, so a style cannot get a new color without a visit there. A link from a row to its token is item 79.
- The look of the swatch and the sample in VS Code is judged by hand.
