---
stanza-format: 1
title: "ADR 0021: Browser CSS from the stylesheet"
---

<!-- stanza: #x4xeq0ygq9 -->
# ADR 0021: Browser CSS from the stylesheet

Status: Accepted. In the editor the classes are written as decorations: ADR 0022.

<!-- stanza: #tp4at4w13c -->
## Context

The vision and the architecture say that the typed stylesheet (ADR 0006) is compiled to browser CSS and DOCX properties, and that CSS is generated output and never project data. The editor (ADR 0003) shows the document with normal browser layout, not Word pagination. The editor adapter that is still to be written must therefore emit markup that the generated CSS can style, and nothing else may carry appearance.

<!-- stanza: #d5xbgj9qjn -->
## Decision

<!-- stanza: #j3m54hx757 -->
### Package

A new package `@phrase/css` that may import `core` only, with no Node built-ins and no DOM use. Its `compileStylesheetToCss(stylesheet, { scopeClass? })` is a pure function that returns `{ css, diagnostics }`. It first runs `validateStylesheet`: with errors there is no CSS, as with the DOCX exporter. The same stylesheet always gives the same text, with rules in the declaration order of the stylesheet and properties in a fixed order.

<!-- stanza: #yp20raw8gx -->
### Class names are the contract

Every rule is scoped to one root class, `phrase-document` unless another valid class name is given. Selectors use class names only, written once in `class-names.ts` and exported as functions, so the compiler and the editor adapter cannot drift:

<!-- stanza: #9hevzkdpa0 -->
| Class | Used for |
| --- | --- |
| `phrase-document` | the root of the editor |
| `phrase-p-<style>` | a block in a paragraph style, including the default style of its kind |
| `phrase-list` | a bulleted or numbered list element |
| `phrase-li-<style>` | a list item; its text takes its look from the style of the item |
| `phrase-m-<mark>` | a run with a mark: `strong`, `emphasis`, `code` or `link` |
| `phrase-c-<style>` | a run in a character style |
| `phrase-t-<style>` | a table; its cells are styled through the table's rules |

The adapter always writes the resolved style, so the CSS never relies on the element name to decide a look. Marks are nested in the canonical mark order and character styles innermost, so the cascade follows the resolution order of ADR 0006. Inside a list item the text takes its look from the `li`, and a paragraph in an item carries a paragraph class only when it has a style of its own. Elements inside a table are the one use of element selectors (`th`, `td`, `tr`), because cells have no class of their own.

<!-- stanza: #bqppzptgtj -->
### Resolved, not cascaded

A style rule holds the fully resolved properties, using the resolution of `core`, so `based-on` is not written as a cascade. Every paragraph rule begins with a reset of what a browser adds to a block (margins, text indent, font size, weight and style), so only the stylesheet decides. A variant is a rule under its paragraph style and its list item, and is written only for a mark the style allows and only when it has properties. A switched-off variant has no rule.

<!-- stanza: #r7jdy2v7hx -->
### Property mapping

Points are written as `pt`. Space before and after are margins, `indent-left` is the left margin, `first-line-indent` is `text-indent`, and alignment, `background` and the text properties map directly. A line spacing of the kind `multiple` is a unitless `line-height`, and `exactly` and `at-least` are both a `line-height` in points. CSS has no "at least", so that rule is approximate. A list item has no `text-indent`, because markers are outside and already hang. Colors and font tokens are written as resolved literals, not as custom properties. Font families are quoted CSS strings, and anything that could end the string or the style element (quotes, backslashes, angle brackets, ampersands, control characters) is written as a hexadecimal escape. No generic fallback family is added.

A table gets collapsed borders (outer, inside horizontal and inside vertical), the cell padding, and the header row's text properties and background on `th`. Browser defaults for header cells (bold, centred) are reset.

<!-- stanza: #8f04bvmmh3 -->
### Not written

`keep-with-next`, `keep-together` and `page-break-before` have no meaning in continuous editing. Page templates, headers, footers, the cover and the table of contents are not part of the editor's CSS. `numbered` is not CSS: the editor shows heading numbers from `numberHeadings` as decorations, and they never enter the document.

<!-- stanza: #r80f0jm31x -->
### Paper

The root rule gives the editor a white background, black text and an 11 pt base size, so the page looks the same in light and dark themes of the host. Following the theme of the host is left for later.

<!-- stanza: #8ks1r6fxf8 -->
## Consequences

- The editor styles come from the stylesheet only, and a stylesheet change replaces the style element without touching the editor state.
- The adapter has no way to carry direct formatting: it has no property to write other than a style name and marks.
- Underline cannot be switched off inside an underlined element, and browser margins do not collapse as Word's spacing does, so appearance differs from Word in small ways. Exact parity is not a goal.
- A paragraph with an explicit style inside a list item is styled by the `li` as well as by its own class, which the adapter must account for.

<!-- stanza: #fdhr9kbazt -->
## Alternatives considered

- **CSS custom properties for tokens.** They allow re-theming at runtime, but add a second place where a value lives.
- **The CSS cascade for `based-on`.** Less output, but specificity would have to be kept equal to the stylesheet's resolution order.
- **Element selectors for default styles.** They would let the adapter omit classes for default blocks, at the price of the CSS deciding what a block is.
- **Following the host theme.** More work now, with little gain for a document meant to look like paper.

<!-- stanza: #a63zgtrj2z -->
## Not covered

The editor adapter and its markup (the next item), a maximum width taken from a page template, the dark theme, and a page preview.
