import { Extension } from '@tiptap/core';
import { gapCursor } from '@tiptap/pm/gapcursor';

/**
 * Lets the cursor stand before or after a block that text cannot be put in, such as a table at the
 * start or end of the document. Typing there makes a paragraph.
 */
export const GapCursor = Extension.create({
  name: 'stanzaGapCursor',
  addProseMirrorPlugins: () => [gapCursor()],
});
