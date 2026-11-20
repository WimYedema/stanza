---
stanza-format: 1
title: "ADR 0007: Project file and metadata declarations"
---

<!-- stanza: #1st1pm8t33 -->
# ADR 0007: Project file and metadata declarations

Status: Accepted. The default page template and the built-in `page-template` field: ADR 0016.

<!-- stanza: #6dkdecd2xy -->
## Context

ADR 0004 gave documents a small set of hardcoded metadata fields and free custom fields, and left the checking of custom fields to the project. The vision calls for shared settings and a project that can describe the metadata its documents must carry. The project model that lists documents and their order is a later item, so this record covers only what the metadata work needs.

<!-- stanza: #mgqsb8ghrb -->
## Decision

<!-- stanza: #sw8cxmwvzj -->
### Project file

The project has one file, `phrase.yaml`, at its root. It starts with `phrase-format: 1` and has these properties:

- `title`: the project title (optional);
- `stylesheet`: the path of the stylesheet (required);
- `defaults`: default `classification` and `authors`, used when a document does not set them;
- `metadata-fields`: the custom metadata fields documents may or must have.

The later project model item adds the document list and order to the same file. Unknown properties are errors.

<!-- stanza: #0k9vmp5ny4 -->
### Paths

Paths in the project file are relative to the project root, use `/`, and must not be absolute or contain `..`. Paths are untrusted input, as the architecture states.

<!-- stanza: #t3thd5tfhx -->
### Defaults

A document's own value overrides a default. `applyDefaults` gives the effective metadata. Defaults apply to the hardcoded fields `classification` and `authors` only.

<!-- stanza: #dzn0akbs9t -->
### Declared fields

Each declaration has a `type` (`string` or `list`), `required` (default false), and an optional `label`. Field names are kebab-case and must not be one of the hardcoded names (`title`, `authors`, `classification`, `phrase-format`).

A project that has no `metadata-fields` property accepts any field. A project that has the property, even an empty one, declares the full set.

<!-- stanza: #rfcm2mvyf9 -->
### Checks

`validateMetadata` checks a document's metadata against the declarations:

- a required field that is missing or empty is an error (`missing-field`);
- a value of the wrong type is an error (`field-type-mismatch`);
- a field that is not declared is a warning (`undeclared-field`).

`validateProjectSettings` reports an invalid stylesheet path (`invalid-path`) and a declared field with a reserved name (`reserved-field-name`).

<!-- stanza: #b782j89qkv -->
### Code

`core` holds the types and the checks. `format` holds the YAML decoder, which shares its decoding helpers with the stylesheet decoder. As with the stylesheet, the meaning of the file is checked only after it has been read without errors.

<!-- stanza: #3x8ff3jby7 -->
## Consequences

- Teams can require the metadata their publications need, such as a document number, and catch typos in field names.
- Existing documents with free custom fields keep working in projects that declare nothing.
- Defaults apply to only two fields. Others can be added when a use appears.

<!-- stanza: #kzfwhjfcd0 -->
## Alternatives considered

- **Declarations inside the stylesheet.** Metadata is project content, not appearance.
- **Requiring every field to be declared.** Too strict for small projects.
- **Letting `title` be required through declarations.** The hardcoded fields stay outside the declarations, so there is one way to describe them.
