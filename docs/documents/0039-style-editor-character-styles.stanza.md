---
stanza-format: 1
title: "ADR 0039: The style editor, character styles"
---

<!-- stanza: #2v74dmkv4k -->
# ADR 0039: The style editor, character styles

Status: Accepted

<!-- stanza: #m1a1qe4aax -->
## Context

The panel of ADR 0037 edits paragraph styles. A character style is smaller: a label, a base style of its own kind, and the text properties (ADR 0006, 0034). A paragraph style that is not one of the reserved ones is already a paragraph style for the panel, and is listed under Paragraphs.

<!-- stanza: #jzp1ahhzy3 -->
## Decision

The panel shows a character style when one is selected in the Character styles tab. It has the **Style** group (label and base style) and the **Text** group, with the same controls, the same own and inherited display and the same edits of the open file as for a paragraph style (ADR 0037). It has no paragraph groups and no marks, since a character style has neither.

- The base style is chosen among the other character styles, and the inherited values come from the chain of character styles.
- Changes are sent with a path under `character-styles`; the host and the editing of the text (ADR 0035) take any path, so they did not change.
- The reading of own and inherited values takes a map of styles, so one function serves both kinds. A style without paragraph properties has none to show.
- The panel is built again when the kind, the family or the name changes, since a character style and a paragraph style can have the same name.

Custom paragraph styles need nothing new: they are in the Paragraphs tab and use the paragraph panel with the groups of that family (ADR 0038).

<!-- stanza: #jp5gst8xk1 -->
## Consequences

- Every property that a character style can have is editable without YAML, with undo and with refusals shown.
- Adding and deleting styles is not part of this item and comes with the item on adding styles.
- The sample document shows each character style on a span of text, as the shell did (ADR 0036).

<!-- stanza: #bdt4018xp9 -->
## Alternatives considered

- **A separate panel for character styles.** It would repeat the controls, and the groups are the same ones the paragraph panel already builds.
