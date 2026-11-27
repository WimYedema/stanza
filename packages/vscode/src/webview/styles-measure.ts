/**
 * Arrows in the preview of the style editor that show what a field of the Pages panel sizes while
 * the cursor is in it (ADR 0096): a column or a row of a grid, a margin of the cover or the body
 * pages, or the distance of the header or footer from the edge. A field says what it sizes with a
 * `data-measure` attribute, such as `cover column 1`, `body margin top` or `header distance`.
 */

export type MeasureTarget = 'cover' | 'body' | 'header' | 'footer';
export type Side = 'top' | 'right' | 'bottom' | 'left';

export type Measure =
  | { readonly target: MeasureTarget; readonly what: 'column' | 'row'; readonly index: number }
  | { readonly target: MeasureTarget; readonly what: 'margin'; readonly side: Side }
  | { readonly target: 'header' | 'footer'; readonly what: 'distance' };

const TARGETS: readonly string[] = ['cover', 'body', 'header', 'footer'];
const SIDES: readonly string[] = ['top', 'right', 'bottom', 'left'];

/** The value of `data-measure` for a measure. */
export function measureText(measure: Measure): string {
  switch (measure.what) {
    case 'column':
    case 'row':
      return `${measure.target} ${measure.what} ${String(measure.index)}`;
    case 'margin':
      return `${measure.target} margin ${measure.side}`;
    case 'distance':
      return `${measure.target} distance`;
  }
}

/** A measure from `data-measure`, or nothing for text that is not one. */
export function parseMeasure(text: string | undefined): Measure | undefined {
  const [target, what, detail] = (text ?? '').split(' ');
  if (target === undefined || !TARGETS.includes(target)) return undefined;
  const at = target as MeasureTarget;
  if ((what === 'column' || what === 'row') && detail !== undefined && /^\d+$/.test(detail)) {
    return { target: at, what, index: Number(detail) };
  }
  if (what === 'margin' && detail !== undefined && SIDES.includes(detail)) {
    return { target: at, what, side: detail as Side };
  }
  if (what === 'distance' && (at === 'header' || at === 'footer')) return { target: at, what };
  return undefined;
}

/** Marks a field as sizing what a measure names. */
export function measures<T extends HTMLElement>(field: T, measure: Measure): T {
  field.dataset['measure'] = measureText(measure);
  return field;
}

/** Points from CSS pixels, at 96 pixels to the inch. */
const points = (pixels: number): string => `${String(Math.round((pixels * 72) / 96))} pt`;

interface Box {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** The box of a part of a sheet, relative to the sheet. */
function boxIn(sheet: HTMLElement, elements: readonly Element[]): Box | undefined {
  if (elements.length === 0) return undefined;
  const origin = sheet.getBoundingClientRect();
  const rects = elements.map((element) => element.getBoundingClientRect());
  const left = Math.min(...rects.map((rect) => rect.left)) - origin.left;
  const top = Math.min(...rects.map((rect) => rect.top)) - origin.top;
  const right = Math.max(...rects.map((rect) => rect.right)) - origin.left;
  const bottom = Math.max(...rects.map((rect) => rect.bottom)) - origin.top;
  return { left, top, width: right - left, height: bottom - top };
}

/** The cells of a column or row of the grid in `root`, or the areas of a cover of rows. */
function lineOf(root: HTMLElement, what: 'column' | 'row', index: number): Element[] {
  const cells = [...root.querySelectorAll(`.grid-cell[data-${what}="${String(index)}"]`)];
  if (cells.length > 0) return cells;
  return [...root.querySelectorAll(`.cover-area[data-${what}="${String(index + 1)}"]`)];
}

/** An arrow from end to end of a span, with its length as label. */
function arrow(
  direction: 'horizontal' | 'vertical',
  at: { readonly left: number; readonly top: number },
  length: number,
): HTMLElement {
  const element = document.createElement('div');
  element.className = `measure ${direction}`;
  element.style.left = `${String(at.left)}px`;
  element.style.top = `${String(at.top)}px`;
  if (direction === 'horizontal') element.style.width = `${String(length)}px`;
  else element.style.height = `${String(length)}px`;
  const label = document.createElement('span');
  label.className = 'measure-label';
  label.textContent = points(length);
  element.append(label);
  return element;
}

export interface MeasureSheets {
  readonly cover: HTMLElement;
  /** The body page, with the header and the footer in it. */
  readonly body: HTMLElement;
  readonly header?: HTMLElement;
  readonly footer?: HTMLElement;
}

/** Removes the arrow there is, and draws the one for a measure, if what it sizes is shown. */
export function drawMeasure(sheets: MeasureSheets, measure: Measure | undefined): void {
  for (const old of [sheets.cover, sheets.body].flatMap((sheet) => [
    ...sheet.querySelectorAll('.measure'),
  ])) {
    old.remove();
  }
  if (measure === undefined) return;
  const sheet = measure.target === 'cover' ? sheets.cover : sheets.body;
  if (sheet.hidden) return;
  const added = measureArrow(sheet, sheets, measure);
  if (added !== undefined) sheet.append(added);
}

function measureArrow(
  sheet: HTMLElement,
  sheets: MeasureSheets,
  measure: Measure,
): HTMLElement | undefined {
  const width = sheet.offsetWidth;
  const height = sheet.offsetHeight;
  switch (measure.what) {
    case 'column':
    case 'row': {
      const root =
        measure.target === 'header'
          ? sheets.header
          : measure.target === 'footer'
            ? sheets.footer
            : sheet;
      const box =
        root === undefined ? undefined : boxIn(sheet, lineOf(root, measure.what, measure.index));
      if (box === undefined) return undefined;
      return measure.what === 'column'
        ? arrow('horizontal', { left: box.left, top: box.top + box.height / 2 }, box.width)
        : arrow('vertical', { left: box.left + box.width / 2, top: box.top }, box.height);
    }
    case 'margin': {
      const style = getComputedStyle(sheet);
      const size = parseFloat(style.getPropertyValue(`padding-${measure.side}`)) || 0;
      switch (measure.side) {
        case 'top':
          return arrow('vertical', { left: width / 2, top: 0 }, size);
        case 'bottom':
          return arrow('vertical', { left: width / 2, top: height - size }, size);
        case 'left':
          return arrow('horizontal', { left: 0, top: height / 3 }, size);
        case 'right':
          return arrow('horizontal', { left: width - size, top: height / 3 }, size);
      }
      return undefined;
    }
    case 'distance': {
      const band = measure.target === 'header' ? sheets.header : sheets.footer;
      if (band === undefined || band.hidden) return undefined;
      const box = boxIn(sheet, [band]);
      if (box === undefined) return undefined;
      const left = box.left + box.width / 2;
      return measure.target === 'header'
        ? arrow('vertical', { left, top: 0 }, box.top)
        : arrow('vertical', { left, top: box.top + box.height }, height - box.top - box.height);
    }
  }
}
