---
stanza-format: 1
title: "ADR 0100: Cover presets"
---

<!-- stanza: #z46dyrexmd -->
# ADR 0100: Cover presets

Status: Accepted. Backlog item 228, refining ADR 0091 and ADR 0096.

<!-- stanza: #7jsepbs37w -->
## Context

A cover can be made in the Pages panel (ADR 0091, ADR 0096) or imported from a Word template (ADR 0094), but a person without a template starts from nothing: an empty list, rows or grid, and styles to make first. Most corporate covers follow a few layouts: centred and stacked, a title in the lower third, colored bands, a strip down one side, and a controlled document with a table of its data.

<!-- stanza: #13m1h04jx5 -->
## Decision

- **Five presets:** classic and centred; the title in the lower third; bands; a side band; and a controlled document with a table of its number, version, status, date and classification. A cover with a large picture is left out, since it needs a picture the project may not have.
- **A preset is stylesheet text,** as `coverSource` writes it, with the paragraph styles, the table style and the color tokens it uses, all as text in `format`.
- **Applying a preset is one edit of a page template:** the color tokens and styles it uses that the stylesheet does not have are added, the cover replaces the one there is, and the edit is refused as a whole if any part of it would make an error. A style or token that the stylesheet has under the same name is kept, so a preset takes the look of the stylesheet where it can.
- **After that it is an ordinary cover.** Nothing refers to the preset at build time, and the person changes the cover, styles and colors as any other.
- **In the Pages panel,** the cover page has a choice "Start from" with the presets. Choosing one where there is a cover asks first, as other changes that lose what was made do (ADR 0096). The panel then says which metadata fields the preset shows, to declare them in the project file.

<!-- stanza: #xqhkskjmmz -->
## Consequences

- A cover can be started in one choice and adjusted from there, in the panel or the text.
- Styles of a preset that a stylesheet already has under the same name, such as `cover-title`, give the preset their look, which may differ from the preset's own.

<!-- stanza: #wmp75fe2tg -->
## Alternatives considered

- **Presets as a reference that the build resolves.** A change of a preset would then change documents without a change in their project, which the vision rules out.
- **Presets in the editor only.** In `format`, the same text can serve the command line or tests later.
