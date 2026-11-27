import type { StanzaEditor } from '@stanza/editor';
import { type ActionCounts, type ActionTimings, type MeasuredAction } from '../shared/protocol.js';

/** Resolves two animation frames later, when what changed has been painted. */
const painted = (): Promise<void> =>
  new Promise((done) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        done();
      });
    });
  });

/** The first top-level block that is a paragraph, to type in; the first block when there is none. */
function paragraphBlock(editor: StanzaEditor): number {
  for (let block = 0; ; block++) {
    const element = editor.blockElement(block);
    if (element === undefined) return 0;
    if (element.tagName === 'P') return block;
  }
}

/** Selects the first characters of the text of a block, through the page as a person would. */
function selectStart(editor: StanzaEditor, block: number): void {
  const element = editor.blockElement(block);
  if (element === undefined) return;
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const length = node.textContent?.length ?? 0;
    if (length === 0) continue;
    const range = document.createRange();
    range.setStart(node, 0);
    range.setEnd(node, Math.min(4, length));
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    return;
  }
}

/**
 * Enter goes last: it leaves empty paragraphs where the others would then run, and Strong needs
 * text to select.
 */
const ORDER: readonly MeasuredAction[] = ['type', 'style', 'strong', 'enter'];

/**
 * Times each action from just before it to the paint after it (ADR 0101). Typing goes through the
 * browser's text input and Enter through a key event, so the handlers of ProseMirror run as they do
 * for a person; the style and Strong run the editor commands that their buttons run, Strong on the
 * first characters of the paragraph, on and off. A run counts as applied when the document changed
 * (`changes`). When a run fails, what was measured until then is returned. The caller makes sure the
 * changes are not sent to the host.
 */
export async function measureActions(
  editor: StanzaEditor,
  content: HTMLElement,
  runs: number,
  changes: () => number,
): Promise<{ readonly timings: ActionTimings; readonly applied: ActionCounts }> {
  const block = paragraphBlock(editor);
  const act: Record<MeasuredAction, (run: number) => void> = {
    type: () => {
      // Deprecated, but still the only way for a page to type through the browser's own input,
      // which ProseMirror then reads as it reads a key a person pressed.
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      document.execCommand('insertText', false, 'x');
    },
    enter: () => {
      content.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          bubbles: true,
          cancelable: true,
        }),
      );
    },
    style: (run) => {
      editor.run(run % 2 === 0 ? { type: 'set-heading', level: 2 } : { type: 'set-paragraph' });
    },
    strong: () => {
      editor.run({ type: 'toggle-mark', mark: 'strong' });
    },
  };
  const timings: Record<MeasuredAction, number[]> = { type: [], enter: [], style: [], strong: [] };
  const applied: Record<MeasuredAction, number> = { type: 0, enter: 0, style: 0, strong: 0 };
  try {
    for (const action of ORDER) {
      editor.setPosition({ block, offset: 0 });
      editor.focus();
      if (action === 'strong') selectStart(editor, block);
      // The editor takes up a selection made in the page by the next frame.
      await painted();
      for (let run = 0; run < runs; run++) {
        const before = changes();
        const start = performance.now();
        act[action](run);
        await painted();
        timings[action].push(performance.now() - start);
        if (changes() > before) applied[action] += 1;
      }
    }
  } catch {
    // What was measured is still worth reporting; the report says which runs are missing.
  }
  return { timings, applied };
}
