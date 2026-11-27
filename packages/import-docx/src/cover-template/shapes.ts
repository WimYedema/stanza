import type { CoverAlignment } from '@stanza/core';
import { childOf, elementsOf, type XmlElement } from '../xml.js';
import type { Theme } from './looks.js';
import { THEME_COLOR_NAMES } from './looks.js';
import { descendants, round } from './shared.js';

/**
 * Shapes anchored to the first page of a template (ADR 0098): text boxes, filled rectangles and
 * pictures, each as a rectangle on the page in points, from the anchor of a drawing and, inside a
 * group, from the place the group gives it. What cannot be a rectangle is reported.
 */

/** EMU in a point. */
const EMU = 12700;

/** The page and its margins, in points, against which an anchor places a drawing. */
export interface PageBox {
  readonly widthPt: number;
  readonly heightPt: number;
  readonly topPt: number;
  readonly rightPt: number;
  readonly bottomPt: number;
  readonly leftPt: number;
}

/** A rectangle on the page, in points from its top left corner. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** One shape on the page: where it is, what is in it, and what is above what. */
export interface Shape {
  readonly rect: Rect;
  /** Higher is in front; shapes behind the text are below the text, which is at 0. */
  readonly z: number;
  /** The color that fills it, as six hex digits, if it is filled. */
  readonly fill?: string;
  /** The paragraphs of a text box, and how they are aligned in it from top to bottom. */
  readonly paragraphs?: readonly XmlElement[];
  readonly valign?: CoverAlignment;
  /** The relationship ID of a picture, and the part whose relationships hold it. */
  readonly picture?: string;
  /** Whether it is behind the text of the page. */
  readonly behind: boolean;
}

export interface ShapeReport {
  readonly approximated: string[];
  readonly leftOut: string[];
}

/**
 * A child of an element, also when Word wraps it in `mc:AlternateContent` for a newer reader, such
 * as a position in percent; the choice is taken over the fallback.
 */
function childIn(element: XmlElement | undefined, name: string): XmlElement | undefined {
  const own = childOf(element, name);
  if (own !== undefined) return own;
  for (const alternative of elementsOf(element, 'AlternateContent')) {
    for (const branch of [
      ...elementsOf(alternative, 'Choice'),
      ...elementsOf(alternative, 'Fallback'),
    ]) {
      const found = childOf(branch, name);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

const textOf = (element: XmlElement | undefined): string =>
  element === undefined
    ? ''
    : element.children
        .filter((node) => typeof node === 'string')
        .join('')
        .trim();

const numberOf = (element: XmlElement | undefined): number | undefined => {
  const value = Number(textOf(element));
  return textOf(element) === '' || !Number.isFinite(value) ? undefined : value;
};

/** The range of a reference that an anchor measures from, in points. */
function range(
  page: PageBox,
  axis: 'h' | 'v',
  relativeFrom: string | undefined,
  report: ShapeReport,
): readonly [number, number] {
  if (axis === 'h') {
    switch (relativeFrom) {
      case 'page':
        return [0, page.widthPt];
      case 'leftMargin':
      case 'insideMargin':
        return [0, page.leftPt];
      case 'rightMargin':
      case 'outsideMargin':
        return [page.widthPt - page.rightPt, page.widthPt];
      case 'character':
        report.approximated.push('A shape placed from a character is placed from the margin.');
        return [page.leftPt, page.widthPt - page.rightPt];
      default:
        return [page.leftPt, page.widthPt - page.rightPt];
    }
  }
  switch (relativeFrom) {
    case 'page':
      return [0, page.heightPt];
    case 'topMargin':
      return [0, page.topPt];
    case 'bottomMargin':
      return [page.heightPt - page.bottomPt, page.heightPt];
    case 'margin':
      return [page.topPt, page.heightPt - page.bottomPt];
    default:
      // A shape placed from its paragraph or line: on a cover these are near the top of the text.
      report.approximated.push(
        'A shape placed from its paragraph is placed from the top margin of the page.',
      );
      return [page.topPt, page.heightPt - page.bottomPt];
  }
}

/** Where along an axis a drawing starts, from its offset, its alignment or a percentage. */
function position(
  element: XmlElement | undefined,
  size: number,
  reference: readonly [number, number],
): number {
  const [from, to] = reference;
  // A percentage is newer than an offset, which Word keeps beside it for older readers.
  const percent = numberOf(childIn(element, 'pctPosHOffset') ?? childIn(element, 'pctPosVOffset'));
  if (percent !== undefined) return from + ((to - from) * percent) / 100000;
  const offset = numberOf(childIn(element, 'posOffset'));
  if (offset !== undefined) return from + offset / EMU;
  const align = textOf(childIn(element, 'align'));
  if (align === 'center') return from + (to - from - size) / 2;
  if (align === 'right' || align === 'bottom' || align === 'outside') return to - size;
  return from;
}

/** The size along an axis: a percentage of a reference when Word gives one, else the extent. */
function size(
  anchor: XmlElement,
  page: PageBox,
  axis: 'h' | 'v',
  extent: number,
  report: ShapeReport,
): number {
  const relative = childIn(anchor, axis === 'h' ? 'sizeRelH' : 'sizeRelV');
  const percent = numberOf(childIn(relative, axis === 'h' ? 'pctWidth' : 'pctHeight'));
  if (relative === undefined || percent === undefined || percent === 0) return extent;
  const [from, to] = range(page, axis, relative.attrs['relativeFrom'], report);
  return ((to - from) * percent) / 100000;
}

/** HSL luminance changes of DrawingML: `lumMod`, `lumOff`, and `shade` and `tint` as darker and lighter. */
function modify(hex: string, color: XmlElement): string {
  let [r, g, b] = [0, 2, 4].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
  const value = (name: string): number | undefined => {
    const found = childOf(color, name)?.attrs['val'];
    return found === undefined ? undefined : Number(found) / 100000;
  };
  const shade = value('shade');
  if (shade !== undefined) [r, g, b] = [r * shade, g * shade, b * shade];
  const tint = value('tint');
  if (tint !== undefined) {
    const lighter = (c: number): number => c + (1 - c) * (1 - tint);
    [r, g, b] = [lighter(r), lighter(g), lighter(b)];
  }
  const mod = value('lumMod');
  const off = value('lumOff');
  if (mod !== undefined || off !== undefined) {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let light = (max + min) / 2;
    const delta = max - min;
    const sat = delta === 0 ? 0 : delta / (1 - Math.abs(2 * light - 1));
    let hue = 0;
    if (delta !== 0) {
      if (max === r) hue = ((g - b) / delta) % 6;
      else if (max === g) hue = (b - r) / delta + 2;
      else hue = (r - g) / delta + 4;
    }
    light = Math.min(1, Math.max(0, light * (mod ?? 1) + (off ?? 0)));
    const chroma = (1 - Math.abs(2 * light - 1)) * sat;
    const second = chroma * (1 - Math.abs((hue % 2) - 1));
    const base = light - chroma / 2;
    const sector = Math.floor(((hue % 6) + 6) % 6);
    const parts: [number, number, number][] = [
      [chroma, second, 0],
      [second, chroma, 0],
      [0, chroma, second],
      [0, second, chroma],
      [second, 0, chroma],
      [chroma, 0, second],
    ];
    const [pr, pg, pb] = parts[sector] ?? [0, 0, 0];
    [r, g, b] = [pr + base, pg + base, pb + base];
  }
  return [r, g, b]
    .map((c) =>
      Math.round(Math.min(1, Math.max(0, c)) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')
    .toUpperCase();
}

/** A DrawingML color: given, from the theme, or the system's, with its luminance changes. */
export function drawingColor(holder: XmlElement | undefined, theme: Theme): string | undefined {
  for (const color of elementsOf(holder)) {
    let hex: string | undefined;
    if (color.name === 'srgbClr') hex = color.attrs['val'];
    else if (color.name === 'sysClr') hex = color.attrs['lastClr'];
    else if (color.name === 'schemeClr') {
      const name = color.attrs['val'] ?? '';
      const scheme: Record<string, string> = { tx1: 'dk1', bg1: 'lt1', tx2: 'dk2', bg2: 'lt2' };
      hex = theme.colors.get(scheme[name] ?? THEME_COLOR_NAMES[name] ?? name);
    }
    if (hex !== undefined && /^[0-9A-Fa-f]{6}$/.test(hex)) return modify(hex.toUpperCase(), color);
  }
  return undefined;
}

/**
 * The fill of a shape: its own solid fill, the first color of a gradient (reported), none, or the
 * fill its style refers to.
 */
function fillOf(
  shape: XmlElement,
  properties: XmlElement | undefined,
  theme: Theme,
  report: ShapeReport,
): string | undefined {
  for (const child of elementsOf(properties)) {
    if (child.name === 'noFill') return undefined;
    if (child.name === 'solidFill') return drawingColor(child, theme);
    if (child.name === 'gradFill') {
      report.approximated.push('A gradient is filled with its first color.');
      return drawingColor(descendants(child, 'gs')[0], theme);
    }
    if (child.name === 'blipFill' || child.name === 'pattFill') {
      report.leftOut.push('A shape filled with a picture or a pattern is left without its fill.');
      return undefined;
    }
  }
  const reference = childOf(childOf(shape, 'style'), 'fillRef');
  if (reference !== undefined && reference.attrs['idx'] !== '0') {
    return drawingColor(reference, theme);
  }
  return undefined;
}

/** The position and size of a shape inside its group, from the transform of the group. */
interface Transform {
  readonly x: number;
  readonly y: number;
  readonly scaleX: number;
  readonly scaleY: number;
}

const transformOf = (xfrm: XmlElement | undefined): Rect | undefined => {
  const off = childOf(xfrm, 'off');
  const ext = childOf(xfrm, 'ext');
  if (off === undefined || ext === undefined) return undefined;
  return {
    x: Number(off.attrs['x'] ?? '0'),
    y: Number(off.attrs['y'] ?? '0'),
    width: Number(ext.attrs['cx'] ?? '0'),
    height: Number(ext.attrs['cy'] ?? '0'),
  };
};

/** Where a child of a group lands on the page, in points. */
const place = (box: Rect, transform: Transform): Rect => ({
  x: round(transform.x + box.x * transform.scaleX),
  y: round(transform.y + box.y * transform.scaleY),
  width: round(box.width * transform.scaleX),
  height: round(box.height * transform.scaleY),
});

/** The shapes of one anchored drawing, on the page. */
export function shapesOf(
  anchor: XmlElement,
  page: PageBox,
  theme: Theme,
  report: ShapeReport,
): Shape[] {
  const extent = childIn(anchor, 'extent');
  const width = size(anchor, page, 'h', Number(extent?.attrs['cx'] ?? '0') / EMU, report);
  const height = size(anchor, page, 'v', Number(extent?.attrs['cy'] ?? '0') / EMU, report);
  const horizontal = childIn(anchor, 'positionH');
  const vertical = childIn(anchor, 'positionV');
  const x = position(
    horizontal,
    width,
    range(page, 'h', horizontal?.attrs['relativeFrom'], report),
  );
  const y = position(vertical, height, range(page, 'v', vertical?.attrs['relativeFrom'], report));
  const behind = anchor.attrs['behindDoc'] === '1' || anchor.attrs['behindDoc'] === 'true';
  // The order of the drawings in front and behind the text; the text is between them.
  const depth = Number(anchor.attrs['relativeHeight'] ?? '0') / 1e9;
  const z = behind ? -1 + depth / 10 : 1 + depth / 10;
  const graphic = descendants(anchor, 'graphicData')[0];
  const shapes: Shape[] = [];
  let order = 0;
  const visit = (element: XmlElement, transform: Transform, top: boolean): void => {
    for (const child of elementsOf(element)) {
      const kind = child.name;
      if (kind === 'grpSp' || kind === 'wgp') {
        const groupProperties = childOf(child, 'grpSpPr');
        const xfrm = childOf(groupProperties, 'xfrm');
        const own = transformOf(xfrm);
        const chOff = childOf(xfrm, 'chOff');
        const chExt = childOf(xfrm, 'chExt');
        if (top || own === undefined || chOff === undefined || chExt === undefined) {
          // The group of the drawing itself fills the anchor's extent.
          const childOff = chOff ?? childOf(xfrm, 'off');
          const childExt = chExt ?? childOf(xfrm, 'ext');
          const cx = Number(childExt?.attrs['cx'] ?? '1') || 1;
          const cy = Number(childExt?.attrs['cy'] ?? '1') || 1;
          visit(
            child,
            {
              x: x - (Number(childOff?.attrs['x'] ?? '0') * width) / cx,
              y: y - (Number(childOff?.attrs['y'] ?? '0') * height) / cy,
              scaleX: width / cx,
              scaleY: height / cy,
            },
            false,
          );
          continue;
        }
        const placed = place(own, transform);
        const cx = Number(chExt.attrs['cx'] ?? '1') || 1;
        const cy = Number(chExt.attrs['cy'] ?? '1') || 1;
        visit(
          child,
          {
            x: placed.x - (Number(chOff.attrs['x'] ?? '0') * placed.width) / cx,
            y: placed.y - (Number(chOff.attrs['y'] ?? '0') * placed.height) / cy,
            scaleX: placed.width / cx,
            scaleY: placed.height / cy,
          },
          false,
        );
        continue;
      }
      if (kind !== 'wsp' && kind !== 'pic') {
        if (kind === 'cxnSp' || kind === 'graphicFrame') {
          report.leftOut.push('A line or chart in a drawing is left out.');
        }
        continue;
      }
      const properties = childOf(child, 'spPr');
      const xfrm = childOf(properties, 'xfrm');
      const box = top ? undefined : transformOf(xfrm);
      const rect = box === undefined ? { x, y, width, height } : place(box, transform);
      if (Number(xfrm?.attrs['rot'] ?? '0') !== 0) {
        report.approximated.push('A rotated shape is placed upright.');
      }
      order += 1;
      const at = z + order / 1e6;
      if (kind === 'pic') {
        const picture = descendants(child, 'blip')[0]?.attrs['embed'];
        if (picture !== undefined) shapes.push({ rect, z: at, picture, behind });
        continue;
      }
      const geometry = childOf(properties, 'prstGeom')?.attrs['prst'];
      const box2 = childOf(child, 'txbx');
      const paragraphs = box2 === undefined ? [] : descendants(box2, 'p');
      if (geometry !== undefined && geometry !== 'rect' && geometry !== 'snip1Rect') {
        if (paragraphs.length === 0) {
          report.leftOut.push(`A shape of the form "${geometry}" is left out.`);
          continue;
        }
        report.approximated.push(`A text box of the form "${geometry}" is a rectangle.`);
      }
      if (childOf(properties, 'custGeom') !== undefined && paragraphs.length === 0) {
        report.leftOut.push('A drawn shape is left out.');
        continue;
      }
      const fill = fillOf(child, properties, theme, report);
      const anchorText = childOf(child, 'bodyPr')?.attrs['anchor'];
      const valign: CoverAlignment =
        anchorText === 'ctr' ? 'center' : anchorText === 'b' ? 'bottom' : 'top';
      shapes.push({
        rect,
        z: at,
        ...(fill !== undefined ? { fill } : {}),
        ...(paragraphs.length > 0 ? { paragraphs, valign } : {}),
        behind,
      });
    }
  };
  if (graphic !== undefined) visit(graphic, { x, y, scaleX: 1, scaleY: 1 }, true);
  return shapes;
}
