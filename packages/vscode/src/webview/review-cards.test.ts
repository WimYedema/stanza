// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlacedThread, StanzaEditor, ThreadBox } from '@stanza/editor';
import type { ReviewThreadView, WebviewMessage } from '../shared/protocol.js';
import {
  COLUMN_PX,
  GAP_PX,
  createReviewCards,
  renderCard,
  reviewName,
  stackTops,
  useCards,
} from './review-cards.js';

const comment = (text: string, author = 'Ada Reviewer') => ({
  author,
  time: '2026-11-21 15:25 UTC',
  text,
  reactions: [] as string[],
});

const thread = (key: string, more: Partial<ReviewThreadView> = {}): ReviewThreadView => ({
  key,
  review: 'reviews/0002-host-2026-11-21.stanza.md',
  headingId: 'k7m2q9x4zb',
  title: `Thread ${key}`,
  anchor: 'aaaaaaaaaa',
  quote: { start: 'host' },
  status: 'open',
  comments: [comment(`Comment ${key}`)],
  notes: [],
  ...more,
});

const noActions = { select: vi.fn(), expand: vi.fn(), openReview: vi.fn(), setStatus: vi.fn() };
const state = { changed: false, selected: false, expanded: false, pending: false };

afterEach(() => {
  document.body.replaceChildren();
});

describe('the layout of the cards', () => {
  it('uses cards only when the column fits beside the sheet, at the zoom', () => {
    const needed = 800 + COLUMN_PX + 3 * GAP_PX;
    expect(useCards(needed, 800, 1)).toBe(true);
    expect(useCards(needed - 1, 800, 1)).toBe(false);
    // At 200% the sheet and the column are both twice as wide.
    expect(useCards(needed, 800, 2)).toBe(false);
  });

  it('moves a card down that would overlap the one before, in the order of the document', () => {
    expect(
      stackTops(
        [
          { top: 0, height: 50 },
          { top: 20, height: 30 },
          { top: 200, height: 10 },
        ],
        8,
      ),
    ).toEqual([0, 58, 200]);
  });

  it('names a review by its file', () => {
    expect(reviewName('reviews/0002-host-2026-11-21.stanza.md')).toBe('0002-host-2026-11-21');
  });
});

describe('a card', () => {
  it('shows the comment, two replies and the rest behind a button, the review and the status', () => {
    const card = renderCard(
      thread('a', {
        comments: [
          { ...comment('Why this?'), reactions: ['thumbs up (Ada Reviewer)'] },
          comment('One', 'Ben'),
          comment('Two', 'Cy'),
          comment('Three', 'Di'),
          comment('Four', 'Ed'),
        ],
      }),
      { ...state, number: 3 },
      noActions,
    );
    expect(card.querySelector('.number')?.textContent).toBe('3');
    expect(card.querySelector('.first .text')?.textContent).toBe('Why this?');
    expect(card.querySelector('.reactions')?.textContent).toBe(
      'Reactions: thumbs up (Ada Reviewer)',
    );
    expect([...card.querySelectorAll('.reply .author')].map((e) => e.textContent)).toEqual([
      'Ben',
      'Cy',
    ]);
    expect(card.querySelector('.more')?.textContent).toBe('2 more replies');
    expect(card.querySelector('.source')?.textContent).toBe('0002-host-2026-11-21');
    expect(card.querySelector('.status')?.textContent).toBe('Open');
    expect(card.querySelector('.status-action')?.textContent).toBe('Resolve');
  });

  it('shows all replies when expanded, the changed text, and Reopen for a resolved one', () => {
    const card = renderCard(
      thread('a', {
        status: 'resolved',
        quote: { start: 'the start', end: 'the end' },
        comments: [comment('x'), comment('1'), comment('2'), comment('3')],
      }),
      { ...state, expanded: true, changed: true },
      noActions,
    );
    expect(card.querySelectorAll('.reply')).toHaveLength(3);
    expect(card.querySelector('.more')).toBeNull();
    expect(card.querySelector('.changed')?.textContent).toBe(
      'Text changed since the review: "the start…the end"',
    );
    expect(card.classList.contains('resolved')).toBe(true);
    expect(card.querySelector('.status-action')?.textContent).toBe('Reopen');
  });

  it('does what its buttons say, and is selected by a click elsewhere on it', () => {
    const actions = { select: vi.fn(), expand: vi.fn(), openReview: vi.fn(), setStatus: vi.fn() };
    const card = renderCard(thread('a'), { ...state, pending: false }, actions);
    document.body.append(card);
    const button = (text: string) =>
      [...card.querySelectorAll('button')].find((b) => b.textContent === text);
    button('Open in review')?.click();
    button('Resolve')?.click();
    card.querySelector<HTMLElement>('.text')?.click();
    expect(actions.openReview).toHaveBeenCalledTimes(1);
    expect(actions.setStatus).toHaveBeenCalledWith('resolved');
    expect(actions.select).toHaveBeenCalledTimes(1);
  });

  it('cannot be resolved twice while a resolve is going on', () => {
    const card = renderCard(thread('a'), { ...state, pending: true }, noActions);
    const action = card.querySelector<HTMLButtonElement>('.status-action');
    expect(action?.textContent).toBe('Resolving…');
    expect(action?.disabled).toBe(true);
  });
});

function setup(boxes: readonly ThreadBox[]) {
  document.body.innerHTML = `<div id="top"></div><section id="orphans" hidden></section>
    <div id="desk"><div id="sheets"><div id="page"><div id="editor"><span data-thread="b">host</span></div>
    <div id="markers" hidden></div></div></div><aside id="column" hidden></aside></div>`;
  const get = (id: string) => document.getElementById(id) as HTMLElement;
  const sent: WebviewMessage[] = [];
  const selected: (string | undefined)[] = [];
  const editor = {
    reviewThreadBoxes: () => boxes,
    selectReviewThread: (key: string | undefined) => {
      selected.push(key);
      return boxes.find((box) => box.key === key);
    },
  } as unknown as StanzaEditor;
  const cards = createReviewCards({
    desk: get('desk'),
    page: get('page'),
    column: get('column'),
    markers: get('markers'),
    orphans: get('orphans'),
    content: get('editor'),
    bar: get('top'),
    editor: () => editor,
    zoom: () => 1,
    send: (message) => sent.push(message),
  });
  return { cards, get, sent, selected };
}

const placed = (key: string, from: number): PlacedThread => ({
  key,
  placement: { kind: 'range', from, to: from + 4 },
});

describe('the cards of a document', () => {
  it('numbers markers in the order of the text when the desk is narrow, and lists orphans', () => {
    // jsdom has no layout: the desk has no width, so there is no room for the column.
    const { cards, get } = setup([
      { key: 'a', top: 300, bottom: 310, left: 0 },
      { key: 'b', top: 100, bottom: 110, left: 0 },
    ]);
    cards.show(
      [thread('a'), thread('b'), thread('c', { title: 'Gone' })],
      [placed('a', 40), placed('b', 10), { key: 'c', placement: { kind: 'orphan' } }],
    );
    expect(get('column').hidden).toBe(true);
    expect(get('markers').hidden).toBe(false);
    const markers = [...get('markers').querySelectorAll<HTMLElement>('.review-marker')];
    expect(markers.map((m) => [m.dataset['thread'], m.textContent, m.style.top])).toEqual([
      ['b', '1', '100px'],
      ['a', '2', '300px'],
    ]);
    expect(get('orphans').hidden).toBe(false);
    expect(get('orphans').querySelector('h2')?.textContent).toBe(
      'A review comment whose text is not in this document',
    );
    expect(get('orphans').querySelector('.review-card')?.getAttribute('data-thread')).toBe('c');
  });

  it('opens the card of a marker beside it, and selects a thread by its highlight', () => {
    const { cards, get, selected } = setup([{ key: 'b', top: 100, bottom: 110, left: 0 }]);
    cards.show([thread('b')], [placed('b', 10)]);
    get('markers').querySelector<HTMLElement>('.review-marker')?.click();
    const popover = get('markers').querySelector<HTMLElement>('.review-popover');
    expect(popover?.hidden).toBe(false);
    expect(popover?.querySelector('.review-card')?.classList.contains('selected')).toBe(true);
    expect(popover?.style.top).toBe('124px');
    get('markers').querySelector<HTMLElement>('.review-marker')?.click();
    expect(popover?.hidden).toBe(true);
    document.querySelector<HTMLElement>('[data-thread="b"]')?.click();
    expect(selected).toEqual(['b', 'b']);
  });

  it('puts the cards in the column at the height of their text when the desk is wide', () => {
    const { cards, get } = setup([
      { key: 'a', top: 50, bottom: 60, left: 0 },
      { key: 'b', top: 400, bottom: 410, left: 0 },
    ]);
    get('desk').getBoundingClientRect = () => ({ width: 2000 }) as DOMRect;
    cards.show([thread('a'), thread('b')], [placed('a', 1), placed('b', 9)]);
    expect(get('desk').classList.contains('with-reviews')).toBe(true);
    expect(get('markers').hidden).toBe(true);
    const placedCards = [...get('column').querySelectorAll<HTMLElement>('.review-card')];
    expect(placedCards.map((c) => [c.dataset['thread'], c.style.top])).toEqual([
      ['a', '50px'],
      ['b', '400px'],
    ]);
  });

  it('sends a resolve once, and takes it as done when the host says so', () => {
    const { cards, get, sent } = setup([{ key: 'b', top: 0, bottom: 10, left: 0 }]);
    get('desk').getBoundingClientRect = () => ({ width: 2000 }) as DOMRect;
    cards.show([thread('b')], [placed('b', 1)]);
    const action = () => get('column').querySelector<HTMLButtonElement>('.status-action');
    action()?.click();
    expect(sent).toEqual([{ type: 'set-thread-status', key: 'b', status: 'resolved' }]);
    expect(action()?.disabled).toBe(true);
    cards.done('b');
    expect(action()?.disabled).toBe(false);
    get('column').querySelector<HTMLButtonElement>('button:not(.status-action)')?.click();
    expect(sent.at(-1)).toEqual({ type: 'open-review', key: 'b' });
  });
});
