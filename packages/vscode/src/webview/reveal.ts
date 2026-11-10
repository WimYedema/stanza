import type { PhraseEditor } from '@phrase/editor';

/** The space left between the bar at the top and the block that is scrolled to, in pixels. */
const GAP_PX = 12;

/**
 * Puts the cursor at the start of a top-level block and scrolls the page so that the block is
 * just under the bar that sticks to the top, where the cursor alone would leave it behind the bar.
 */
export function revealBlock(
  editor: Pick<PhraseEditor, 'setPosition' | 'blockElement'>,
  block: number,
  bar: HTMLElement,
  page: Pick<Window, 'scrollY' | 'scrollTo'> = window,
): void {
  editor.setPosition({ block, offset: 0 });
  const target = editor.blockElement(block);
  if (target === undefined) return;
  const top =
    target.getBoundingClientRect().top + page.scrollY - bar.getBoundingClientRect().height - GAP_PX;
  page.scrollTo({ top: Math.max(0, top) });
}
