# ADR 0024: IDs of new blocks in the editor

Status: Accepted

## Context

Every referenceable block has an immutable ID, unique across the project (ADR 0001). The command line can give IDs to a whole project (ADR 0020), but in the editor blocks are created all the time: a paragraph becomes a heading, a table is inserted, a heading is split or pasted. The editor of ADR 0022 only cleared an ID that an edit had copied onto a second block. ADR 0003 says that opening a file never rewrites it.

## Decision

### Which blocks

The blocks that `validate` warns about without an ID: headings and tables. `core` has one rule for this (`needsId`), which validation, the assignment of IDs by the command line and the editor all use. Paragraphs, lists and the other blocks get no ID, but one that they have is kept.

### One plugin

A plugin of the editor looks at the document after every edit and does two things, in this order:

1. When an ID is on more than one block and an edit touched one of them, the later blocks lose it. The first keeps it, which is the original in a split.
2. A heading or table without an ID that the edit created or changed, or that lost its ID in the first step, gets a new one.

The document that the host receives after any edit is therefore complete as far as the edit went.

### Only what an edit touched

A block counts as touched when a changed range of the edit overlaps it. A hand-written heading without an ID that nothing touched stays without one, so that the first keystroke somewhere else does not rewrite the file. The same goes for IDs that are repeated in a document as it was loaded: they are validation errors, and are only settled when an edit touches one of them. A block that is only moved, such as a table lifted out of a list item, is not changed and gets no ID. Typing in a heading without an ID is a change, and gives it one, once.

### Opening and loading

Nothing is assigned when the editor starts or when `setDocument` loads new content. A load is recognised by the metadata that the library puts on it, so opening a file never rewrites it. Giving IDs to a whole project stays with `format --assign-ids`.

### What creates an ID

Setting a paragraph to a heading, inserting a table, splitting a heading (the second half is new), pasting headings or tables, and typing in a heading that has none. An existing ID is never changed and a moved block keeps its ID. A joined heading keeps the ID of the first; the other ID is gone, and a reference to it is then a broken reference for the reference index to report.

### Source of IDs and uniqueness

The options of the editor gain `newId`, a candidate ID, and `usedIds`, the IDs of the other documents of the project, which the host knows and the editor does not. By default the candidates are random, from the Web Crypto API with `nodeIdFromRandomBytes` of `core`, and no other IDs are known. A candidate that is in this document or in `usedIds` is not used. After 20 attempts the block is left without an ID and a notice says so (`id-generation-failed`); validation still warns. A source that gives something that is not an ID is a programming error and throws.

### Trying a command

A command is tried on a copy of the state without plugins (ADR 0023), so that candidates are not used up and notices are not sent twice. A change that takes several steps, such as taking a list item out of its list level by level, is one transaction, so that no plugin runs between the steps and changes the document that the rest of the plan was made for.

## Consequences

- A heading or a table that you make in the editor always has an ID by the time it is saved.
- A file that was never touched is never rewritten by the editor, and a project is still made complete with the command line.
- Two people who create blocks at the same time cannot clash in practice, since the random IDs have 50 bits, and a clash is also checked against the project.
- Undoing a change that gave a block an ID takes the ID away with it, since it is part of the same edit.

## Alternatives considered

- **Giving IDs when the document is read back for saving.** The editor would show blocks without IDs, and a copy of the block could be saved before it had one.
- **Giving IDs to all blocks that lack one at the first edit.** It rewrites parts of the file that nobody touched.
- **Giving IDs when the file is opened.** It breaks the rule that opening never rewrites.

## Not covered

References to blocks and what happens to them when a block is deleted (the reference index), and a way to see or change an ID in the editor.
