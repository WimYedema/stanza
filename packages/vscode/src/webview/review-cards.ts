import type { PlacedThread, StanzaEditor, ThreadBox } from '@stanza/editor';
import type { ReviewThreadView, WebviewMessage } from '../shared/protocol.js';

/**
 * Review comments beside their text (ADR 0086): a column of cards to the right of the sheet when
 * the desk is wide enough, numbered markers in the margin of the page that open a card when it is
 * not, and a list at the top for threads whose text the document no longer has.
 */

/** The width of the column of cards, and the space around it, in CSS pixels at 100%. */
export const COLUMN_PX = 260;
export const GAP_PX = 16;
/** The space between cards that were moved down so as not to overlap. */
const CARD_GAP_PX = 8;
const MARKER_PX = 20;
/** The space kept above the text of a thread that is scrolled to, under the bar. */
const SCROLL_GAP_PX = 48;
/** Replies shown before "N more replies". */
const SHOWN_REPLIES = 2;

/** Whether the desk has room for the column of cards beside the sheet; otherwise markers. */
export function useCards(deskWidth: number, sheetWidth: number, zoom: number): boolean {
  return deskWidth >= sheetWidth + (COLUMN_PX + 3 * GAP_PX) * zoom;
}

/**
 * The tops of boxes that want to be at their own heights, in that order: each one at its height,
 * or under the one before it when they would overlap.
 */
export function stackTops(
  boxes: readonly { readonly top: number; readonly height: number }[],
  gap: number,
): number[] {
  const tops: number[] = [];
  let free = -Infinity;
  for (const box of boxes) {
    const top = Math.max(box.top, free);
    tops.push(top);
    free = top + box.height + gap;
  }
  return tops;
}

/** The name of a review document as a card shows it: its file name without the extension. */
export const reviewName = (path: string): string =>
  (path.split('/').at(-1) ?? path).replace(/\.stanza\.md$/, '');

export interface CardState {
  /** The number of the thread in the order of the document, as on its marker. */
  readonly number?: number;
  /** The quote was not found: the text changed since the review. */
  readonly changed: boolean;
  readonly selected: boolean;
  readonly expanded: boolean;
  readonly pending: boolean;
}

export interface CardActions {
  select(): void;
  expand(): void;
  openReview(): void;
  setStatus(status: 'open' | 'resolved'): void;
}

function make<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const made = document.createElement(tag);
  if (className !== '') made.className = className;
  if (text !== undefined) made.textContent = text;
  return made;
}

/** The card of a thread. */
export function renderCard(
  thread: ReviewThreadView,
  state: CardState,
  actions: CardActions,
): HTMLElement {
  const card = make('article', 'review-card');
  card.dataset['thread'] = thread.key;
  card.tabIndex = 0;
  card.classList.toggle('resolved', thread.status === 'resolved');
  card.classList.toggle('selected', state.selected);
  card.setAttribute('aria-label', `Review comment: ${thread.title}`);

  const comment = (entry: ReviewThreadView['comments'][number], className: string): HTMLElement => {
    const part = make('div', className);
    const header = make('header', '');
    if (className === 'first' && state.number !== undefined) {
      header.append(make('span', 'number', String(state.number)));
    }
    header.append(make('span', 'author', entry.author), make('time', '', entry.time));
    part.append(header, make('p', 'text', entry.text));
    if (entry.reactions.length > 0) {
      part.append(make('p', 'reactions', `Reactions: ${entry.reactions.join(', ')}`));
    }
    return part;
  };

  const [first, ...replies] = thread.comments;
  if (first === undefined) {
    const part = make('div', 'first');
    const header = make('header', '');
    if (state.number !== undefined) header.append(make('span', 'number', String(state.number)));
    header.append(make('span', 'author', thread.title));
    part.append(header);
    card.append(part);
  } else card.append(comment(first, 'first'));

  if (state.changed) {
    const quote =
      thread.quote === undefined
        ? ''
        : `: "${thread.quote.start}${thread.quote.end === undefined ? '' : `…${thread.quote.end}`}"`;
    card.append(make('p', 'changed', `Text changed since the review${quote}`));
  }
  for (const note of thread.notes) card.append(make('p', 'note', note));

  const shown = state.expanded ? replies : replies.slice(0, SHOWN_REPLIES);
  for (const reply of shown) card.append(comment(reply, 'reply'));
  const hidden = replies.length - shown.length;
  if (hidden > 0) {
    const more = make(
      'button',
      'more',
      `${String(hidden)} more ${hidden === 1 ? 'reply' : 'replies'}`,
    );
    more.type = 'button';
    more.addEventListener('click', () => {
      actions.expand();
    });
    card.append(more);
  }

  const footer = make('footer', '');
  const source = make('span', 'source', reviewName(thread.review));
  source.title = thread.review;
  const status = make('span', 'status', thread.status === 'resolved' ? 'Resolved' : 'Open');
  const open = make('button', '', 'Open in review');
  open.type = 'button';
  open.title = `Open ${thread.review} at this thread`;
  open.addEventListener('click', () => {
    actions.openReview();
  });
  const next = thread.status === 'open' ? 'resolved' : 'open';
  const change = make(
    'button',
    'status-action',
    state.pending
      ? next === 'resolved'
        ? 'Resolving…'
        : 'Reopening…'
      : next === 'resolved'
        ? 'Resolve'
        : 'Reopen',
  );
  change.type = 'button';
  change.disabled = state.pending;
  change.addEventListener('click', () => {
    actions.setStatus(next);
  });
  footer.append(source, status, open, change);
  card.append(footer);

  card.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('button') !== null) return;
    actions.select();
  });
  card.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && event.target === card) actions.select();
  });
  return card;
}

export interface ReviewCardsParts {
  readonly desk: HTMLElement;
  readonly page: HTMLElement;
  /** The column of cards beside the sheet. */
  readonly column: HTMLElement;
  /** The markers, in the page. */
  readonly markers: HTMLElement;
  readonly orphans: HTMLElement;
  /** The element of the editor, whose highlights link to the cards. */
  readonly content: HTMLElement;
  /** The bar that sticks to the top, which a thread that is scrolled to must be under. */
  readonly bar: HTMLElement;
  editor(): StanzaEditor | undefined;
  /** The zoom of the desk, 1 for 100%. */
  zoom(): number;
  send(message: WebviewMessage): void;
}

export interface ReviewCards {
  /** Shows these threads, as the editor placed them. */
  show(threads: readonly ReviewThreadView[], placed: readonly PlacedThread[]): void;
  /** Puts the cards or the markers at the height of their text again, as after an edit. */
  schedule(): void;
  layout(): void;
  /** The host is done with a resolve or a reopen. */
  done(key: string): void;
}

type Mode = 'none' | 'cards' | 'markers';

export function createReviewCards(parts: ReviewCardsParts): ReviewCards {
  let threads: readonly ReviewThreadView[] = [];
  let placements = new Map<string, PlacedThread['placement']>();
  /** The keys of the threads with text in the document, in the order of the document. */
  let ordered: readonly string[] = [];
  const cards = new Map<string, HTMLElement>();
  const markers = new Map<string, HTMLButtonElement>();
  const expanded = new Set<string>();
  const pending = new Set<string>();
  let selected: string | undefined;
  /** The thread whose card is open as a popover beside its marker. */
  let popover: string | undefined;
  let mode: Mode = 'none';
  let frame: number | undefined;
  const leaders = [0, 1, 2].map(() => make('div', 'review-leader'));
  const popoverBox = make('div', 'review-popover');

  const threadOf = (key: string): ReviewThreadView | undefined =>
    threads.find((thread) => thread.key === key);

  function cardFor(thread: ReviewThreadView): HTMLElement {
    const placement = placements.get(thread.key);
    const index = ordered.indexOf(thread.key);
    return renderCard(
      thread,
      {
        ...(index >= 0 ? { number: index + 1 } : {}),
        changed: placement?.kind === 'block' && placement.changed,
        selected: thread.key === selected,
        expanded: expanded.has(thread.key),
        pending: pending.has(thread.key),
      },
      {
        select: () => {
          select(thread.key, true);
        },
        expand: () => {
          expanded.add(thread.key);
          redraw(thread.key);
        },
        openReview: () => {
          parts.send({ type: 'open-review', key: thread.key });
        },
        setStatus: (status) => {
          pending.add(thread.key);
          redraw(thread.key);
          parts.send({ type: 'set-thread-status', key: thread.key, status });
        },
      },
    );
  }

  /** Draws the card of one thread again, in the place of the one before. */
  function redraw(key: string): void {
    const thread = threadOf(key);
    const old = cards.get(key);
    if (thread === undefined || old === undefined) return;
    const card = cardFor(thread);
    cards.set(key, card);
    old.replaceWith(card);
    schedule();
  }

  function select(key: string | undefined, scroll: boolean): void {
    selected = key;
    const box = parts.editor()?.selectReviewThread(key);
    for (const [k, card] of cards) card.classList.toggle('selected', k === key);
    for (const [k, marker] of markers) marker.classList.toggle('selected', k === key);
    if (mode === 'markers') popover = key;
    if (scroll && box !== undefined) {
      const top =
        box.top + window.scrollY - parts.bar.getBoundingClientRect().height - SCROLL_GAP_PX;
      window.scrollTo({ top: Math.max(0, top) });
    }
    layout();
  }

  function show(next: readonly ReviewThreadView[], placed: readonly PlacedThread[]): void {
    threads = next;
    placements = new Map(placed.map((p) => [p.key, p.placement]));
    const at = (placement: PlacedThread['placement']): number =>
      placement.kind === 'range' ? placement.from : placement.kind === 'block' ? placement.pos : -1;
    ordered = placed
      .filter((p) => p.placement.kind !== 'orphan')
      .sort((a, b) => at(a.placement) - at(b.placement))
      .map((p) => p.key);
    const keys = new Set(next.map((t) => t.key));
    if (selected !== undefined && !keys.has(selected)) selected = undefined;
    if (popover !== undefined && !keys.has(popover)) popover = undefined;
    for (const key of [...pending]) if (!keys.has(key)) pending.delete(key);

    cards.clear();
    markers.clear();
    const orphaned: HTMLElement[] = [];
    for (const thread of next) {
      const card = cardFor(thread);
      cards.set(thread.key, card);
      if (placements.get(thread.key)?.kind === 'orphan' || !placements.has(thread.key)) {
        orphaned.push(card);
      }
    }
    for (const [index, key] of ordered.entries()) {
      const marker = make('button', 'review-marker', String(index + 1));
      marker.type = 'button';
      marker.dataset['thread'] = key;
      marker.classList.toggle('selected', key === selected);
      const thread = threadOf(key);
      marker.title = thread === undefined ? '' : `Review comment: ${thread.title}`;
      marker.addEventListener('click', () => {
        if (popover === key) {
          popover = undefined;
          layout();
        } else select(key, false);
      });
      markers.set(key, marker);
    }

    parts.orphans.replaceChildren();
    if (orphaned.length > 0) {
      parts.orphans.append(
        make(
          'h2',
          '',
          orphaned.length === 1
            ? 'A review comment whose text is not in this document'
            : `${String(orphaned.length)} review comments whose text is not in this document`,
        ),
        ...orphaned,
      );
    }
    parts.orphans.hidden = orphaned.length === 0;
    // The cards and markers are new elements, so they are put in place again.
    setMode('none');
    layout();
  }

  function schedule(): void {
    if (frame !== undefined) return;
    frame = requestAnimationFrame(() => {
      frame = undefined;
      layout();
    });
  }

  function setMode(next: Mode): void {
    if (next === mode) return;
    mode = next;
    parts.desk.classList.toggle('with-reviews', mode === 'cards');
    parts.column.hidden = mode !== 'cards';
    parts.markers.hidden = mode !== 'markers';
    if (mode === 'cards') {
      popover = undefined;
      parts.column.replaceChildren(...leaders, ...ordered.flatMap((key) => cards.get(key) ?? []));
      parts.markers.replaceChildren();
    } else if (mode === 'markers') {
      parts.column.replaceChildren();
      parts.markers.replaceChildren(...markers.values(), popoverBox);
    } else {
      parts.column.replaceChildren();
      parts.markers.replaceChildren();
    }
  }

  function layout(): void {
    const editor = parts.editor();
    if (editor === undefined || ordered.length === 0) {
      setMode('none');
      return;
    }
    const zoom = parts.zoom();
    const wide = useCards(
      parts.desk.getBoundingClientRect().width,
      parts.page.getBoundingClientRect().width,
      zoom,
    );
    setMode(wide ? 'cards' : 'markers');
    if (mode === 'cards') {
      // A card that was drawn again since the mode was set is put in the column.
      for (const key of ordered) {
        const card = cards.get(key);
        if (card !== undefined && card.parentElement !== parts.column) parts.column.append(card);
      }
    }
    const boxes = new Map(editor.reviewThreadBoxes().map((box) => [box.key, box]));
    const keys = ordered.filter((key) => boxes.has(key));
    if (mode === 'cards') layoutCards(keys, boxes, zoom);
    else layoutMarkers(keys, boxes, zoom);
  }

  function layoutCards(keys: readonly string[], boxes: Map<string, ThreadBox>, zoom: number): void {
    const origin = parts.column.getBoundingClientRect();
    const wanted = keys.map((key) => ({
      key,
      top: ((boxes.get(key)?.top ?? origin.top) - origin.top) / zoom,
      height: cards.get(key)?.offsetHeight ?? 0,
    }));
    const tops = stackTops(wanted, CARD_GAP_PX);
    let bottom = 0;
    for (const [index, { key, height }] of wanted.entries()) {
      const card = cards.get(key);
      const top = tops[index] ?? 0;
      if (card !== undefined) card.style.top = `${String(top)}px`;
      bottom = Math.max(bottom, top + height);
    }
    parts.column.style.minHeight = `${String(bottom)}px`;

    for (const leader of leaders) leader.hidden = true;
    const index = selected === undefined ? -1 : keys.indexOf(selected);
    const box = selected === undefined ? undefined : boxes.get(selected);
    if (index < 0 || box === undefined) return;
    // A line from the text to the card: along the text, down beside the column, into the card.
    const textY = (box.bottom - origin.top) / zoom;
    const textX = (box.left - origin.left) / zoom;
    const cardY = (tops[index] ?? 0) + 12;
    const bend = -GAP_PX / 2;
    const [along, down, into] = leaders;
    if (along === undefined || down === undefined || into === undefined) return;
    Object.assign(along.style, {
      top: `${String(textY)}px`,
      left: `${String(textX)}px`,
      width: `${String(Math.max(0, bend - textX))}px`,
      height: '0',
      borderTopWidth: '1px',
      borderLeftWidth: '0',
    });
    Object.assign(down.style, {
      top: `${String(Math.min(textY, cardY))}px`,
      left: `${String(bend)}px`,
      width: '0',
      height: `${String(Math.abs(cardY - textY))}px`,
      borderTopWidth: '0',
      borderLeftWidth: '1px',
    });
    Object.assign(into.style, {
      top: `${String(cardY)}px`,
      left: `${String(bend)}px`,
      width: `${String(-bend)}px`,
      height: '0',
      borderTopWidth: '1px',
      borderLeftWidth: '0',
    });
    along.hidden = false;
    down.hidden = false;
    into.hidden = false;
  }

  function layoutMarkers(
    keys: readonly string[],
    boxes: Map<string, ThreadBox>,
    zoom: number,
  ): void {
    const origin = parts.page.getBoundingClientRect();
    const wanted = keys.map((key) => ({
      top: ((boxes.get(key)?.top ?? origin.top) - origin.top) / zoom,
      height: MARKER_PX,
    }));
    const tops = stackTops(wanted, 2);
    for (const [key, marker] of markers) {
      const index = keys.indexOf(key);
      marker.hidden = index < 0;
      if (index >= 0) marker.style.top = `${String(tops[index] ?? 0)}px`;
    }
    const card = popover === undefined ? undefined : cards.get(popover);
    const index = popover === undefined ? -1 : keys.indexOf(popover);
    popoverBox.hidden = card === undefined || index < 0;
    if (card === undefined || index < 0) return;
    if (card.parentElement !== popoverBox) popoverBox.replaceChildren(card);
    popoverBox.style.top = `${String((tops[index] ?? 0) + MARKER_PX + 4)}px`;
  }

  // The highlights in the text link to their cards.
  const threadAt = (target: EventTarget | null): string | undefined =>
    target instanceof Element
      ? (target.closest<HTMLElement>('[data-thread]')?.dataset['thread'] ?? undefined)
      : undefined;
  parts.content.addEventListener('click', (event) => {
    const key = threadAt(event.target);
    if (key !== undefined && cards.has(key)) select(key, false);
  });
  parts.content.addEventListener('mouseover', (event) => {
    const key = threadAt(event.target);
    for (const [k, card] of cards) card.classList.toggle('hovered', k === key);
  });
  parts.content.addEventListener('mouseout', () => {
    for (const card of cards.values()) card.classList.remove('hovered');
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && popover !== undefined) {
      popover = undefined;
      layout();
    }
  });
  window.addEventListener('resize', schedule);
  new MutationObserver(schedule).observe(parts.desk, {
    attributes: true,
    attributeFilter: ['class'],
  });

  return {
    show,
    schedule,
    layout,
    done(key) {
      if (!pending.delete(key)) return;
      redraw(key);
    },
  };
}
