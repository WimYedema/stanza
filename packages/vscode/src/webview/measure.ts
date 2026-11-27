import type { StanzaEditor } from '@stanza/editor';
import {
  MEASURED_ACTIONS,
  type ActionCounts,
  type ActionTimings,
  type MeasuredAction,
} from '../shared/protocol.js';

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

/**
 * Times each action from just before it to the paint after it (ADR 0101). Typing goes through the
 * browser's text input and Enter through a key event, so the handlers of ProseMirror run as they do
 * for a person; the style and Strong run the editor commands that their buttons run. The caller makes
 * sure the changes are not sent to the host.
 */
export async function measureActions(
  editor: StanzaEditor,
  content: HTMLElement,
  runs: number,
  transactions: () => number,
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
  for (const action of MEASURED_ACTIONS) {
    editor.setPosition({ block, offset: 0 });
    editor.focus();
    await painted();
    for (let run = 0; run < runs; run++) {
      const before = transactions();
      const start = performance.now();
      act[action](run);
      await painted();
      timings[action].push(performance.now() - start);
      if (transactions() > before) applied[action] += 1;
    }
  }
  return { timings, applied };
}
