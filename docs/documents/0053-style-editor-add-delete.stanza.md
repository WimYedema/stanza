---
stanza-format: 1
title: "ADR 0053: The style editor, adding and deleting styles"
---

<!-- stanza: #03atn2m417 -->
# ADR 0053: The style editor, adding and deleting styles

Status: Accepted

<!-- stanza: #sfm1835v3w -->
## Context

The style editor changes the properties of the styles that a stylesheet has (ADR 0037 to 0040), but a person who needs a style, such as a `note` paragraph or a `status-high` character style, has to write it in the YAML. A style that is no longer needed has to be removed by hand, and nothing says whether a document still uses it. ADR 0035 says that adding a style is `setProperty` of the style with a value, and removing it is `unsetProperty`. The usage index of ADR 0052 says where documents use a style.

<!-- stanza: #cve0bwm28a -->
## Decision

<!-- stanza: #7zsjm9eze5 -->
### Adding

- **A form under the list** has a name and a list to choose the base style from. It is shown on the tabs Paragraphs, Character styles and Tables. The headings and the list styles are the ones that every stylesheet has, so they are not added to, and the page templates and the theme have their own panels (ADR 0050, 0051).
- **The base** is chosen among the styles of the same family, with `(none)`. A paragraph style starts based on `body` and a table style on `table`, since a style with no base has to say everything. A character style starts with none.
- **The style is empty**: `name: { based-on: note }`, or `{}`. Its properties are set in the panel, which opens on the new style.
- **A new message**, `add-style`, with the kind, the name and the base. The host reads the stylesheet as it is now and refuses a name that is not kebab-case, a name that the family has already, and a base that is not there. It then makes the edit with `setProperty` (ADR 0035), whose result is checked as for any edit.

<!-- stanza: #vka5acwk5s -->
### Deleting

- **A button in the panel of a style**, for a style that is not one of the reserved ones (ADR 0006), sends the message `delete-style`. The host decides, and the page cannot make it delete anything that the rules refuse.
- **A style is kept** when:
  - it is one that every stylesheet needs (the reserved paragraph styles and the table style `table`);
  - a document of the project uses it, directly or by default (ADR 0052). A use through a derived style is not counted, since the derived style is itself a reason, below;
  - the stylesheet refers to it: a style based on it, a table style that has it as the cell style, or a page template that uses it in its header, footer or cover. `styleReferences` of the `core` package finds these.
- **The refusal says why**, in the places the page shows a refusal: the documents with the number of blocks in each (up to five documents), and the styles and templates that refer to it.
- **The person confirms** with a modal question of VS Code, since the page cannot ask one. The edit is made from the text as it is after the answer, with `unsetProperty`.
- **The documents are those of the project as the editor has them**, with the text of the files that are open and not saved, as for the other commands (ADR 0014). If the project has errors, so that its documents cannot be read, nothing is deleted and the refusal says so.

<!-- stanza: #drr018eewh -->
### Not in this item

- **Renaming.** Documents and styles refer to a style by its name, so a rename would have to change them all. A new style and a delete is the way, once nothing uses the old one.
- **Page templates and tokens** are not added or removed here. A token is not removed since styles refer to it by name, and there is no index of that yet.

<!-- stanza: #yw5028qyr9 -->
## Consequences

- A person can build up and tidy a stylesheet without writing YAML, and cannot break the documents or the stylesheet by deleting a style that is in use.
- A style that is used by a document that is not in the project folder, or by a document that is not loaded, is not known to the editor.
- The refusal of a delete is a message in the panel, as for a refused change of a property. There is no list of the blocks with a link to them yet; that is the view of backlog item 62.

<!-- stanza: #3fme9rcht9 -->
## Alternatives considered

- **Letting the page decide with the data it has.** The page does not have the documents, and what it sends cannot be trusted (ADR 0036).
- **Deleting and changing the documents that use the style to the base style.** It rewrites documents that were not asked for, and a style that people use is a decision for them.
- **Adding a style with a chosen set of properties.** The panel sets them one by one with the usual controls and the base gives most of them.
