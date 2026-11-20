---
stanza-format: 1
title: "ADR 0074: Moving raw colors and fonts into tokens"
---

<!-- stanza: #qvkw478hbm -->
# ADR 0074: Moving raw colors and fonts into tokens

Status: Accepted. Completes ADR 0065, which left the automatic fix as not done.

<!-- stanza: #7v00p3gpws -->
## Context

ADR 0065 made a hex color or a family list in a style the error `raw-color` or `raw-font`. A stylesheet written before it, such as a copy of the older default, no longer loads. Each value is easy to fix, and the fix is mechanical.

<!-- stanza: #tf49k58mf7 -->
## Decision

- **`moveValuesToTokens(text)`** in `format` moves every raw value into a token and gives the new text. A value that equals a token uses it. Any other gets a token named after the value: `color-f2f2f2`, `font-calibri-arial`, with `-2` and so on if the name is taken by another value. The author can rename it later.
- **It is `setProperty`, one token and one value at a time** (ADR 0035), so comments, order and layout stay. Nothing is returned unless every value could be moved; a font list written as a block is reported, and the text stays as it was. Run twice, it changes nothing the second time.
- **The command line:** `phrase format --fix-stylesheet` (with `--check` it only lists the stylesheet), for a project and not for a single file. `validate` and `build` point to it when the errors are `raw-color` or `raw-font`.
- **The editor:** the two errors carry the fix `use-tokens`, shown as a quick fix on the stylesheet. It edits the open stylesheet and does not save it.
- **Nothing is changed by itself.** Loading never repairs a stylesheet (the product keeps invalid state a diagnostic); the author runs the fix.

<!-- stanza: #c7058bq1qe -->
## Consequences

- `Fix` is a union of `declare-variant` and `use-tokens`; the editor's refusals keep only the first.
- `setProperty` no longer counts a changed `raw-color` or `raw-font` message as a new error, since adding a token changes the advice.
