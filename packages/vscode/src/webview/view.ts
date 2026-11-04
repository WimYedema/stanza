/**
 * The controls of the view (ADR 0028): the sheet or the plain page, and the zoom. They change how
 * the document is shown and nothing else. The choice is kept by the webview between sessions.
 */

export type ViewMode = 'sheet' | 'plain';

export interface ViewState {
  readonly mode: ViewMode;
  /** A percentage, one of `ZOOM_STEPS`. */
  readonly zoom: number;
}

export const ZOOM_STEPS: readonly number[] = [50, 75, 100, 125, 150, 200];

export const DEFAULT_VIEW: ViewState = { mode: 'sheet', zoom: 100 };

/** The state that was kept, or the default for anything that is not one. */
export function parseViewState(value: unknown): ViewState {
  if (typeof value !== 'object' || value === null) return DEFAULT_VIEW;
  const { mode, zoom } = value as Record<string, unknown>;
  return {
    mode: mode === 'plain' ? 'plain' : 'sheet',
    zoom: typeof zoom === 'number' && ZOOM_STEPS.includes(zoom) ? zoom : DEFAULT_VIEW.zoom,
  };
}

const zoomClass = (zoom: number): string => `zoom-${String(zoom)}`;

/** Fills the container with the controls and applies the view to the desk. */
export function buildViewControls(
  container: HTMLElement,
  desk: HTMLElement,
  initial: ViewState,
  keep: (state: ViewState) => void,
): void {
  let state = initial;
  const button = (label: string, title: string, run: () => void): HTMLButtonElement => {
    const element = document.createElement('button');
    element.textContent = label;
    element.title = title;
    // A click must not take the selection away from the editor.
    element.addEventListener('mousedown', (event) => {
      event.preventDefault();
    });
    element.addEventListener('click', run);
    container.append(element);
    return element;
  };

  const sheet = button('Sheet', 'Show the page with its margins, header, footer and cover', () => {
    show({ ...state, mode: state.mode === 'sheet' ? 'plain' : 'sheet' });
  });
  const zoomBy = (step: number): void => {
    const index = ZOOM_STEPS.indexOf(state.zoom) + step;
    const zoom = ZOOM_STEPS[Math.max(0, Math.min(ZOOM_STEPS.length - 1, index))];
    if (zoom !== undefined) show({ ...state, zoom });
  };
  const smaller = button('\u2212', 'Zoom out', () => {
    zoomBy(-1);
  });
  const percent = button('100%', 'Back to 100%', () => {
    show({ ...state, zoom: DEFAULT_VIEW.zoom });
  });
  const larger = button('+', 'Zoom in', () => {
    zoomBy(1);
  });

  function show(next: ViewState): void {
    state = next;
    desk.classList.toggle('paper', state.mode === 'sheet');
    desk.classList.toggle('plain', state.mode === 'plain');
    for (const step of ZOOM_STEPS) desk.classList.toggle(zoomClass(step), step === state.zoom);
    sheet.setAttribute('aria-pressed', String(state.mode === 'sheet'));
    percent.textContent = `${String(state.zoom)}%`;
    smaller.disabled = state.zoom === ZOOM_STEPS[0];
    larger.disabled = state.zoom === ZOOM_STEPS[ZOOM_STEPS.length - 1];
    keep(state);
  }
  show(state);
}
