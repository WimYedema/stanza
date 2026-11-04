# ADR 0041: The style editor, collapsible groups

Status: Accepted

## Context

The panels of ADR 0037 to 0040 show every property of a style in groups. A paragraph style has about twenty rows and four marks that each have seven more, and the table panel has nine rows for the header row alone. Most of what a person changes in one visit is a few of them.

## Decision

Each group of a panel is a native `details` element with a `summary`, so that it can be collapsed with the mouse or the keyboard and needs no script. All the groups are open at first.

- **Nesting**: two things are a group inside a group. The properties of a mark (strong, emphasis, code, link) are in a group "Properties of …" under the row that allows the mark, and it is only there when the style declares the mark. The text properties of the header row of a table style are in a group "Text" under the Header row group, after its background and repeat flag. Both are closed at first, so that the rows that decide what a mark or a header row is are seen first.
- **Memory**: which groups are open is kept by the panel, by the title of the group (or the mark), and applied when the panel is built for another style. A group that is closed stays closed when another style is selected, also across kinds of style that have a group of the same title. The state is not saved: it is gone when the editor is closed.
- Groups that hold only a few rows, such as Style, Table and Borders, are collapsible as well, so that every group works the same way.

## Consequences

- The panel is short to begin with, and what a person has opened stays open while going through the styles.
- A closed group still has its rows in the page, so that their state follows the file (ADR 0037) and an undo shows when the group is opened again.
- The state is lost with the editor. A saved state would need a place in the workspace state of VS Code, which is left until someone asks.

## Alternatives considered

- **Collapsing only the marks.** It is what the backlog item asked for, but the same reasons hold for the header row and for a long list of paragraph properties.
- **One accordion with a single open group.** It would hide the marks while the person works on the spacing, which they often do together.
- **A saved state.** It adds storage for little gain at this point.
