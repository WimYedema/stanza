# @phrase/editor

Tiptap/ProseMirror adapter. Imports `core` and `css`; no VS Code. Content holds style names and marks only.

- Schema and conversion: `schema.ts`, `convert.ts` (to and from the model), `annotations.ts`, `phrase-block-view.ts`.
- Commands: `commands.ts` (semantic commands that can be checked without running), `keys.ts`, `paste.ts` and `paste-html.ts`, `gap-cursor.ts`, `selection.ts`.
- State for the toolbar: `context.ts`, `context-classes.ts`, `block-styles.ts`, `notice.ts`.
- IDs of new blocks: `block-ids.ts`. `position.ts`: cursor mapping after outside changes.
- `editor.ts` assembles the editor; `styles.testing.ts` is the shared test stylesheet.

ADRs: `docs/INDEX.md` (editor).
