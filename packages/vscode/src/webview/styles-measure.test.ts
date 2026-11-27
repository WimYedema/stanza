// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { drawMeasure, measureText, parseMeasure, type Measure } from './styles-measure.js';

afterEach(() => {
  document.body.replaceChildren();
});

describe('measures (ADR 0096)', () => {
  it('are written to a field and read back', () => {
    const all: Measure[] = [
      { target: 'cover', what: 'column', index: 1 },
      { target: 'header', what: 'row', index: 0 },
      { target: 'body', what: 'margin', side: 'left' },
      { target: 'footer', what: 'distance' },
    ];
    for (const measure of all) expect(parseMeasure(measureText(measure))).toEqual(measure);
    expect(parseMeasure('cover distance')).toBeUndefined();
    expect(parseMeasure('cover column x')).toBeUndefined();
    expect(parseMeasure(undefined)).toBeUndefined();
  });

  it('draw one arrow on the sheet of what they size, with its length, and none when the sheet is hidden', () => {
    const cover = document.createElement('div');
    const body = document.createElement('div');
    cover.style.paddingTop = '48px';
    const cell = document.createElement('div');
    cell.className = 'grid-cell';
    cell.dataset['column'] = '1';
    cover.append(cell);
    document.body.append(cover, body);
    drawMeasure({ cover, body }, { target: 'cover', what: 'margin', side: 'top' });
    const arrow = cover.querySelector('.measure.vertical');
    expect(arrow?.textContent).toBe('36 pt');
    drawMeasure({ cover, body }, { target: 'cover', what: 'column', index: 1 });
    expect(cover.querySelectorAll('.measure')).toHaveLength(1);
    expect(cover.querySelector('.measure.horizontal')).not.toBeNull();
    drawMeasure({ cover, body }, undefined);
    expect(cover.querySelectorAll('.measure')).toHaveLength(0);
    body.hidden = true;
    drawMeasure({ cover, body }, { target: 'body', what: 'margin', side: 'top' });
    expect(body.querySelectorAll('.measure')).toHaveLength(0);
  });
});
