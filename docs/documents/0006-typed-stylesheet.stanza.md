---
stanza-format: 1
title: "ADR 0006: Typed stylesheet"
---

<!-- stanza: #sqx3frwc5b -->
# ADR 0006: Typed stylesheet

Status: Accepted. Page templates added by ADR 0016; the `table-of-contents` section by ADR 0018; compilation to browser CSS: ADR 0021; marks that follow the style, in the editor: ADR 0023; declaring a variant from the editor: ADR 0026.

<!-- stanza: #x26f5by3dg -->
## Context

The vision makes the stylesheet the single source of appearance: documents carry style names, and the stylesheet decides how they look in the browser, in DOCX, and later in PDF. ADR 0003 said the rules about which marks may apply in which style would live in the style definitions. The spike showed what real documents use: a handful of paragraph styles, one status-marker character style, and tables that need styles in place of per-cell formatting.

<!-- stanza: #c8s71964md -->
## Decision

<!-- stanza: #n8jyt0z68y -->
### Format

One stylesheet per project, written as YAML with `phrase-format: 1`. It has four top-level sections: `tokens`, `paragraph-styles`, `character-styles`, and `table-styles`. Later items add sections for lists, numbering, page templates, headers and footers, the cover, and the table of contents. Unknown properties are errors.

Style, token, and property names are kebab-case. Sizes and spacing are in points.

<!-- stanza: #3xykcb1q06 -->
### Tokens

Tokens name colors and font families. A color value is `#RRGGBB` or a color token name. A font value is a font token name or a list of family names, whose first entry is the one DOCX uses. Everything else is a literal.

<!-- stanza: #aaf1e9dh80 -->
### Styles

- **Reserved names.** These must exist: `body`, `heading-1` to `heading-6`, `code`, `list-bulleted`, `list-numbered` (paragraph styles) and `table` (table style). A block without a `style` uses the one for its kind.
- **Inheritance.** Every kind of style may have `based-on`. A property comes from the nearest style that sets it. Cycles and unknown bases are errors.
- **Paragraph styles** have text properties (`font`, `size`, `bold`, `italic`, `underline`, `color`, `highlight`) and paragraph properties (`space-before`, `space-after`, `line-spacing`, `indent-left`, `first-line-indent`, `alignment`, `keep-with-next`, `keep-together`, `page-break-before`, `background`). Line spacing is one of `at-least`, `exactly`, or `multiple`. A negative first-line indent is a hanging indent.
- **Variants.** A paragraph style declares `variants` for the marks `strong`, `emphasis`, `code`, and `link`, each with extra text properties. Declaring a variant, even an empty one, means the mark is allowed in that style. A variant is inherited per mark, and `false` switches off an inherited one. A style without the variant does not offer the mark, so the editor must refuse it and validation reports existing uses.
- **Character styles** have text properties and may have `based-on`. They are usable in every paragraph style.
- **Resolution order for a run:** the paragraph style's text properties, then the variants for the run's marks in the canonical mark order, then the run's character styles.
- **Table styles** have `border` (`outer`, `inside-horizontal`, `inside-vertical`, each with `width` and `color`), `header-row` (text properties, `background`, `repeat`), and `cell-padding`. Column widths stay in the content (ADR 0001).

<!-- stanza: #n6g8d51nz8 -->
### Not included

Paragraph borders. A box around content, such as the framed cover title, is better a concept of its own than a border on a paragraph. If it is wanted, it is added to the content model and the stylesheet together.

<!-- stanza: #9jamnh99g4 -->
### Code

`core` holds the types, inheritance resolution, semantic validation, and a query for whether a mark is allowed in a style. `format` holds the YAML decoder, which reports every problem as a diagnostic with a path into the file. `core` stays free of dependencies. Compilation to CSS and DOCX is separate work.

<!-- stanza: #0xz7vz2671 -->
### Diagnostics

Each has a stable code: `unknown-base-style`, `style-cycle`, `missing-reserved-style`, `unknown-token`, `invalid-value`, `unknown-property`, and the decoding codes for wrong types and an unsupported format version. `Diagnostic` gains an optional `path`.

<!-- stanza: #c92b4kz0bc -->
## Consequences

- Appearance can be changed in one place, and the editor can tell what a style allows.
- A project must define the reserved styles before anything renders.
- Because variants inherit, a heading based on `body` offers `strong` unless it writes `strong: false`.
- Resolution is a pure function of the stylesheet, so it is cheap to test and to reuse in the compilers.

<!-- stanza: #7dz6d2fend -->
## Alternatives considered

- **CSS as the stylesheet.** Rejected by the vision: CSS is generated output.
- **Configurable default styles instead of reserved names.** More indirection for no gain.
- **Paragraph borders now.** The only use is the cover title, and a box concept would serve that better.
- **JSON.** No comments and harder to maintain by hand.
