# @phrase/editor

Tiptap/ProseMirror adapter. Imports `core` and `css`; no VS Code. Content holds style names and marks only.

- Schema and conversion: `schema.ts`, `convert.ts` (to and from the model), `annotations.ts`, `phrase-block-view.ts`.
- Commands: `commands.ts` (semantic commands that can be checked without running), `keys.ts`, `reference-trigger.ts` (typing `@`), `paste.ts` and `paste-html.ts`, `gap-cursor.ts`, `selection.ts`.
- State for the toolbar: `context.ts`, `context-classes.ts`, `block-styles.ts`, `notice.ts`.
- IDs of new blocks: `block-ids.ts`. Changes from outside: `change-marks.ts` (block diff and marks, ADR 0062). `position.ts`: cursor mapping after outside changes.
- `editor.ts` assembles the editor; `setEditable` gates editing commands and document-changing input transactions for read-only startup previews without recreating the editor or losing selection (ADR 0078). `styles.testing.ts` is the shared test stylesheet.
- `setMetadata` receives host-accepted properties without replacing body nodes, moving the selection or emitting a change. The host owns persistence and undo/redo (ADR 0080); subsequent body edits keep the new metadata.
- `linkSchemes` / `setLinkSchemes` configure commands, paste and rendered destinations. Updating schemes preserves content and selection; clipboard HTML carries the authored destination in `data-phrase-href` (ADR 0082).

ADRs: `docs/INDEX.md` (editor).
