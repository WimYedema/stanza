// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { revealBlock } from './reveal.js';

const sized = (rect: Partial<DOMRect>): HTMLElement => {
  const node = document.createElement('div');
  node.getBoundingClientRect = () => ({ top: 0, height: 0, ...rect }) as DOMRect;
  return node;
};

describe('revealBlock', () => {
  it('puts the cursor at the block and scrolls it just below the bar at the top', () => {
    const setPosition = vi.fn();
    const scrollTo = vi.fn();
    const target = sized({ top: 500 });
    revealBlock({ setPosition, blockElement: () => target }, 3, sized({ height: 80 }), {
      scrollY: 200,
      scrollTo,
    });
    expect(setPosition).toHaveBeenCalledWith({ block: 3, offset: 0 });
    // 500 from the top of the view, 200 scrolled, 80 for the bar, 12 of air.
    expect(scrollTo).toHaveBeenCalledWith({ top: 608 });
  });

  it('does not scroll above the top of the page', () => {
    const scrollTo = vi.fn();
    revealBlock(
      { setPosition: vi.fn(), blockElement: () => sized({ top: 10 }) },
      0,
      sized({ height: 80 }),
      { scrollY: 0, scrollTo },
    );
    expect(scrollTo).toHaveBeenCalledWith({ top: 0 });
  });

  it('moves the cursor and leaves the scroll alone when the block has no element', () => {
    const setPosition = vi.fn();
    const scrollTo = vi.fn();
    revealBlock({ setPosition, blockElement: () => undefined }, 9, sized({ height: 80 }), {
      scrollY: 0,
      scrollTo,
    });
    expect(setPosition).toHaveBeenCalled();
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
