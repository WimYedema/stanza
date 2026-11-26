import { type Alignment, type LineSpacing } from '@stanza/core';
import { childOf, elementsOf, type XmlElement } from '../xml.js';

/**
 * Small helpers shared by the modules of the cover import (ADR 0094): units, runs and their text,
 * kebab-case names, and the looks, frames and borders that the modules pass on.
 */

export const MAX_PART_BYTES = 64 * 1024 * 1024;
export const RELATIONSHIP_BASE =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';

export const twipsToPt = (value: string | undefined): number | undefined =>
  value === undefined || !/^-?\d+$/.test(value) ? undefined : Number(value) / 20;

export const round = (value: number): number => Math.round(value * 10) / 10;

// ---------------------------------------------------------------------------------------------
// The package

export interface Part {
  readonly xml: XmlElement;
  /** Relationship targets by ID, as paths in the package. */
  readonly relationships: ReadonlyMap<string, { readonly type: string; readonly path: string }>;
}

export function resolveTarget(from: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = from.split('/').slice(0, -1);
  for (const step of target.split('/')) {
    if (step === '..') parts.pop();
    else if (step !== '.' && step !== '') parts.push(step);
  }
  return parts.join('/');
}

export interface Look {
  font?: string;
  sizePt?: number;
  bold?: boolean;
  italic?: boolean;
  color?: string;
  alignment?: Alignment;
  spaceBeforePt?: number;
  spaceAfterPt?: number;
  lineSpacing?: LineSpacing;
  indentLeftPt?: number;
}

export interface Border {
  readonly side: string;
  readonly widthPt: number;
  readonly color: string;
}

/** The vertical place of a frame (ADR 0094): at a distance, or aligned, from the page or margins. */
export interface Frame {
  readonly key: string;
  readonly anchor: 'page' | 'margin' | 'text';
  readonly y?: number;
  readonly align?: string;
}

export const runsOf = (paragraph: XmlElement): XmlElement[] => {
  const runs: XmlElement[] = [];
  const visit = (element: XmlElement): void => {
    for (const child of elementsOf(element)) {
      if (child.name === 'r') runs.push(child);
      else if (child.name !== 'pPr' && child.name !== 'txbxContent') visit(child);
    }
  };
  visit(paragraph);
  return runs;
};

export function textOfRun(run: XmlElement): string {
  let text = '';
  for (const child of elementsOf(run)) {
    if (child.name === 't')
      text += child.children.filter((node) => typeof node === 'string').join('');
    else if (child.name === 'tab') text += ' ';
    else if (child.name === 'br' || child.name === 'cr') text += '\n';
  }
  return text;
}

export const kebab = (text: string): string =>
  text
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** The elements of a name below one, without the fallback copy of alternate content. */
export const descendants = (element: XmlElement, name: string): XmlElement[] => {
  const found: XmlElement[] = [];
  const visit = (node: XmlElement): void => {
    for (const child of elementsOf(node)) {
      if (child.name === 'Fallback') continue;
      if (child.name === name) found.push(child);
      visit(child);
    }
  };
  visit(element);
  return found;
};

export const hasVisibleBorders = (table: XmlElement): boolean => {
  const sides = [
    ...elementsOf(childOf(childOf(table, 'tblPr'), 'tblBorders')),
    ...descendants(table, 'tcBorders').flatMap((borders) => elementsOf(borders)),
  ];
  return sides.some((side) => {
    const value = side.attrs['val'];
    return value !== undefined && value !== 'none' && value !== 'nil';
  });
};
