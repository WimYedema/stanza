---
stanza-format: 1
title: "ADR 0016: Page templates"
---

<!-- stanza: #h13dk4nqnh -->
# ADR 0016: Page templates

Status: Accepted. Header and footer slots added by ADR 0017; the cover page by ADR 0019.

<!-- stanza: #ap98nhpkzx -->
## Context

The vision says that a few named page templates in the stylesheet each give a page size (A4 or Letter), margins, and a header and footer, and that a document selects one. The exporter wrote a fixed A4 page and used its text width for tables in list items (ADR 0013). This record covers the page itself and how a document selects it. Header and footer slots, their tokens, and page numbers are a separate backlog item and will extend the templates defined here.

<!-- stanza: #1fdhdh08ga -->
## Decision

<!-- stanza: #5xa1xzw6d9 -->
### Stylesheet

An optional section `page-templates` holds named templates, with names like other styles. A template has `size`, either `A4` or `Letter`, and `margins` with `top`, `right`, `bottom`, and `left` in points. Anything left out takes the built-in value: A4 and 72 pt (2.54 cm) on every side. Unknown properties are errors. A template named `page` is the default. A stylesheet without the section, or without a `page` template, uses the built-in page, which is what the exporter wrote before, so existing stylesheets keep working. The section is optional and additive, so the stylesheet format stays at version 1.

<!-- stanza: #kk41qwn1a7 -->
### Checks

Margins must be finite and not negative, and must leave a text area of at least 50 pt each way. The size must be one that is supported.

<!-- stanza: #r0wqktryjb -->
### Selecting a template

A document selects a template with a `page-template` entry in its front matter. It is stored in the existing custom fields, so neither the Markdown format nor the document model changes. The project file gains `defaults.page-template`, which applies to documents that do not select one, in the same way as the other defaults. A document value wins over the default.

`page-template` is a built-in field name: a project cannot declare it in `metadata-fields`, and it is never reported as undeclared. A name that the stylesheet does not declare is an error (`unknown-page-template`), in a document and in the project defaults. A value that is a list is a type error. The name `page` is always valid, so a document can ask for the default explicitly.

<!-- stanza: #q820yeefnw -->
### Export

The page size and margins of the single Word section come from the selected template. The text width, which tables in list items are narrowed to (ADR 0013), is derived from the template and replaces the fixed constants of that record. Header and footer distance stays at the library's 1.25 cm. A different first page, odd and even headers, and per-page overrides are not supported, as the vision says, and a cover page will be a separate section.

<!-- stanza: #rc700pd1qe -->
## Consequences

- A project can print on Letter paper or with wider margins by changing the stylesheet, without touching documents.
- Documents that name a template depend on the stylesheet declaring it, and the check says so.
- The default page now comes from two places that agree: the built-in page and a template named `page`. The second wins when it exists.

<!-- stanza: #7bqw35edkz -->
## Alternatives considered

- **A `page-template` field in the document model.** It would change the front matter format and the serializer for one value that fits in the custom fields.
- **Requiring a `page` template in every stylesheet.** It would break all existing stylesheets for no gain.
- **Margins in centimeters.** The stylesheet uses points everywhere else.
