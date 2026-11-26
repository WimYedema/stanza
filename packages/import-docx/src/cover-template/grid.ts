import {
  readImageInfo,
  type CoverArea,
  type CoverColumnWidth,
  type CoverEntry,
  type CoverGrid,
  type CoverRowHeight,
  type PageMargins,
  type SlotPart,
  type StyleName,
} from '@stanza/core';
import { childOf, elementsOf } from '../xml.js';
import {
  type CoverTemplateOptions,
  type ImportedBorder,
  type ImportedParagraphStyle,
  type ImportedTableStyle,
} from './types.js';
import { type Frame, type Look, hasVisibleBorders, kebab, round, twipsToPt } from './shared.js';
import { TemplatePackage } from './package.js';
import { Looks } from './looks.js';
import { type Block, type PictureRef, Reader, type Segment } from './reader.js';

/**
 * The blocks of a page as a cover grid, and the lines of a header or footer as a band (ADR 0094,
 * ADR 0095).
 */

/** A part of the page: its rows, how high they are together, and where its top is. */
export interface Piece {
  readonly top: number;
  readonly rows: GridRow[];
  readonly height: number;
}

/**
 * The blocks in groups: those of one frame, with a table between two of its paragraphs, and those
 * in the flow between them.
 */
export function groupByFrame(blocks: readonly Block[]): { frame?: Frame; blocks: Block[] }[] {
  const frameOf = (block: Block | undefined): Frame | undefined =>
    block?.kind === 'paragraph' ? block.frame : undefined;
  const groups: { frame?: Frame; blocks: Block[] }[] = [];
  blocks.forEach((block, index) => {
    let frame = frameOf(block);
    if (block.kind === 'table') {
      const before = frameOf(blocks[index - 1]);
      const after = frameOf(blocks[index + 1]);
      if (before !== undefined && before.key === after?.key) frame = before;
    }
    const last = groups.at(-1);
    if (last !== undefined && last.frame?.key === frame?.key) last.blocks.push(block);
    else groups.push({ ...(frame !== undefined ? { frame } : {}), blocks: [block] });
  });
  return groups;
}

/** The padding of the cells of a cover table, in points: Word's own is about as wide at the sides. */
export const COVER_TABLE_PADDING_PT = 3;

export interface GridRow {
  heightPt: number;
  /** The areas of the row by their column range; one spanning all columns for most rows. */
  readonly cells: { readonly from: number; readonly to: number; readonly area?: CoverArea }[];
  /** The boundaries of its columns in points from the left, for a row of a layout table. */
  readonly boundaries?: readonly number[];
  readonly share?: boolean;
}

export class GridBuilder {
  private readonly rows: GridRow[] = [];
  private readonly styles = new Map<string, { style: ImportedParagraphStyle; key: string }>();
  readonly tableStyles: ImportedTableStyle[] = [];
  readonly newColors: [string, string][] = [];
  readonly newFonts: [string, readonly string[]][] = [];
  readonly images: { path: string; bytes: Uint8Array }[] = [];
  readonly converted: string[] = [];
  private readonly imagePaths = new Map<string, string>();

  constructor(
    private readonly name: string,
    private readonly widthPt: number,
    private readonly looks: Looks,
    private readonly reader: Reader,
    private readonly options: CoverTemplateOptions,
    private readonly pkg: TemplatePackage,
  ) {}

  private colorToken(hex: string): string {
    const value = `#${hex.toUpperCase()}`;
    const existing = [...this.options.colors].find(
      ([, known]) => known.toUpperCase() === value,
    )?.[0];
    if (existing !== undefined) return existing;
    const made = this.newColors.find(([, known]) => known === value)?.[0];
    if (made !== undefined) return made;
    const token = `${this.name}-color-${String(this.newColors.length + 1)}`;
    this.newColors.push([token, value]);
    return token;
  }

  private fontToken(family: string): string {
    const existing = [...this.options.fonts].find(([, families]) => families[0] === family)?.[0];
    if (existing !== undefined) return existing;
    const made = this.newFonts.find(([, families]) => families[0] === family)?.[0];
    if (made !== undefined) return made;
    const token = `${this.name}-font-${String(this.newFonts.length + 1)}`;
    this.newFonts.push([token, [family]]);
    return token;
  }

  /** A paragraph style for a look; paragraphs that look the same share one. */
  styleFor(look: Look, wordStyle: string | undefined): StyleName {
    const style: Omit<ImportedParagraphStyle, 'name'> = {
      ...(look.font !== undefined ? { font: this.fontToken(look.font) } : {}),
      ...(look.sizePt !== undefined ? { sizePt: look.sizePt } : {}),
      ...(look.bold === true ? { bold: true } : {}),
      ...(look.italic === true ? { italic: true } : {}),
      ...(look.color !== undefined ? { color: this.colorToken(look.color) } : {}),
      ...(look.alignment !== undefined && look.alignment !== 'left'
        ? { alignment: look.alignment }
        : {}),
      spaceBeforePt: look.spaceBeforePt ?? 0,
      spaceAfterPt: look.spaceAfterPt ?? 0,
      ...(look.lineSpacing !== undefined ? { lineSpacing: look.lineSpacing } : {}),
      ...(look.indentLeftPt !== undefined && look.indentLeftPt !== 0
        ? { indentLeftPt: look.indentLeftPt }
        : {}),
    };
    const key = JSON.stringify(style);
    const found = [...this.styles.values()].find((entry) => entry.key === key);
    if (found !== undefined) return found.style.name as StyleName;
    const base = `${this.name}-${kebab(wordStyle ?? 'text') || 'text'}`;
    let named = base;
    for (let count = 2; this.styles.has(named); count += 1) named = `${base}-${String(count)}`;
    this.styles.set(named, { style: { name: named, ...style }, key });
    return named as StyleName;
  }

  paragraphStyles(): ImportedParagraphStyle[] {
    return [...this.styles.values()].map((entry) => entry.style);
  }

  private image(picture: PictureRef): CoverEntry | undefined {
    const bytes = this.pkg.bytes(picture.id);
    const info = bytes === undefined ? undefined : readImageInfo(bytes);
    if (bytes === undefined || info === undefined) {
      this.reader.leftOut.push(`The picture ${picture.id} is not a PNG or JPEG and is left out.`);
      return undefined;
    }
    let path = this.imagePaths.get(picture.id);
    if (path === undefined) {
      path = `${this.options.assetsDirectory}/image-${String(this.imagePaths.size + 1)}.${info.format === 'png' ? 'png' : 'jpg'}`;
      this.imagePaths.set(picture.id, path);
      this.images.push({ path, bytes });
      this.converted.push(`The picture ${picture.id} as ${path}.`);
    }
    return { kind: 'image', path, widthPt: picture.widthPt };
  }

  /** The entries of paragraphs: their lines in their style, and their pictures. */
  private entries(blocks: readonly (Block & { kind: 'paragraph' })[]): CoverEntry[] {
    const entries: CoverEntry[] = [];
    for (const block of blocks) {
      const style = this.styleFor(block.look, block.style);
      for (const picture of block.pictures) {
        const entry = this.image(picture);
        if (entry !== undefined) entries.push({ ...entry, style });
      }
      for (const line of block.lines) {
        if (line.length > 0) entries.push({ kind: 'paragraph', style, text: line });
      }
    }
    return entries;
  }

  private full(heightPt: number, area: CoverArea | undefined): void {
    this.rows.push({
      heightPt,
      cells: [{ from: 0, to: 1, ...(area !== undefined ? { area } : {}) }],
    });
  }

  spacer(heightPt: number): void {
    const last = this.rows.at(-1);
    if (
      last !== undefined &&
      last.share !== true &&
      last.boundaries === undefined &&
      last.cells[0]?.area === undefined
    ) {
      last.heightPt += heightPt;
      return;
    }
    this.full(heightPt, undefined);
  }

  /** The rows of blocks, built apart from the others, and their height together. */
  capture(blocks: readonly Block[]): { rows: GridRow[]; height: number } {
    const saved = this.rows.splice(0);
    this.add(blocks);
    const rows = this.rows.splice(0);
    this.rows.push(...saved);
    return { rows, height: rows.reduce((sum, row) => sum + row.heightPt, 0) };
  }

  /**
   * The parts in order from the top, with spacer rows between them, and the footer at the bottom
   * after a share row that takes what is left. A part that would overlap the one above follows it.
   */
  place(
    pieces: readonly Piece[],
    coverTop: number,
    footer: { rows: GridRow[]; height: number } | undefined,
  ): void {
    let cursor = coverTop;
    for (const piece of [...pieces].sort((a, b) => a.top - b.top)) {
      const gap = piece.top - cursor;
      if (gap > 0.5) this.spacer(gap);
      else if (gap < -1)
        this.reader.approximated.push('Parts that overlap on the page follow each other.');
      this.rows.push(...piece.rows);
      cursor = Math.max(cursor, piece.top) + piece.height;
    }
    this.share();
    if (footer !== undefined) this.rows.push(...footer.rows);
  }

  share(): void {
    this.rows.push({ heightPt: 0, cells: [{ from: 0, to: 1 }], share: true });
  }

  /** Adds the blocks as rows, and returns their height. */
  add(blocks: readonly Block[]): number {
    let total = 0;
    let text: (Block & { kind: 'paragraph' })[] = [];
    const flush = (): void => {
      if (text.length === 0) return;
      const heightPt = text.reduce((sum, block) => sum + block.heightPt, 0);
      this.full(heightPt, { valign: 'top', content: this.entries(text) });
      text = [];
    };
    for (const block of blocks) {
      total += block.heightPt;
      if (block.kind === 'table') {
        flush();
        this.addTable(block);
        continue;
      }
      if (block.segments !== undefined) {
        flush();
        this.addSegments(block, block.segments);
        continue;
      }
      const hasText = block.lines.some((line) => line.length > 0);
      if (hasText || block.pictures.length > 0) {
        text.push(block);
        continue;
      }
      flush();
      const rule = block.borders.find(
        (border) => border.side === 'bottom' || border.side === 'top',
      );
      if (rule !== undefined) {
        const space = Math.max(0, block.heightPt - rule.widthPt);
        if (rule.side === 'bottom' && space > 0) this.spacer(space);
        this.full(Math.max(0.5, rule.widthPt), {
          valign: 'top',
          background: { kind: 'token', name: this.colorToken(rule.color) },
          content: [],
        });
        if (rule.side === 'top' && space > 0) this.spacer(space);
        this.converted.push('A paragraph border as a rule: a thin row with a color.');
        continue;
      }
      if (block.borders.length > 0) {
        this.reader.approximated.push('A border around a paragraph is left out; the text stays.');
      }
      this.spacer(block.heightPt);
    }
    flush();
    for (const block of blocks) {
      if (
        block.kind === 'paragraph' &&
        block.borders.length > 0 &&
        block.lines.some((l) => l.length > 0)
      ) {
        this.reader.approximated.push('A border around a paragraph with text is left out.');
      }
    }
    return total;
  }

  private addTable(block: Block & { kind: 'table' }): void {
    const table = block.table;
    const grid = elementsOf(childOf(table, 'tblGrid'), 'gridCol').map(
      (column) => twipsToPt(column.attrs['w']) ?? 0,
    );
    const total = grid.reduce((sum, value) => sum + value, 0) || this.widthPt;
    const scale = Math.min(1, this.widthPt / total);
    const rows = elementsOf(table, 'tr');
    if (!hasVisibleBorders(table)) {
      // A layout table: its columns become columns of the grid.
      const boundaries = [0];
      for (const width of grid) boundaries.push((boundaries.at(-1) ?? 0) + width * scale);
      for (const row of rows) {
        let column = 0;
        const cells: { from: number; to: number; area?: CoverArea }[] = [];
        let height = 0;
        for (const cell of elementsOf(row, 'tc')) {
          const span = Number(childOf(childOf(cell, 'tcPr'), 'gridSpan')?.attrs['val'] ?? '1');
          const blocks = elementsOf(cell, 'p').flatMap((p) => this.reader.paragraph(p, block.part));
          const paragraphs = blocks.filter(
            (b): b is Block & { kind: 'paragraph' } => b.kind === 'paragraph',
          );
          height = Math.max(
            height,
            paragraphs.reduce((sum, b) => sum + b.heightPt, 0),
          );
          const content = this.entries(paragraphs);
          cells.push({
            from: column,
            to: column + span,
            ...(content.length > 0 ? { area: { valign: 'top', content } } : {}),
          });
          column += span;
        }
        this.rows.push({ heightPt: height, cells, boundaries });
      }
      this.converted.push(`A table without borders as ${String(grid.length)} columns of the grid.`);
      return;
    }
    // A table with borders: a cover table of labels and values.
    const tableRows: { label: string; value: SlotPart[] }[] = [];
    let cellLook: Look | undefined;
    let cellWordStyle: string | undefined;
    for (const row of rows) {
      const cells = elementsOf(row, 'tc');
      const texts = cells.map((cell) =>
        elementsOf(cell, 'p')
          .flatMap((p) => this.reader.paragraph(p, block.part))
          .flatMap((b) => (b.kind === 'paragraph' ? b.lines : []))
          .filter((line) => line.length > 0),
      );
      const firstParagraph = cells[0] === undefined ? undefined : elementsOf(cells[0], 'p')[0];
      if (firstParagraph !== undefined && cellLook === undefined) {
        cellLook = this.looks.lookOf(firstParagraph);
        cellWordStyle = this.looks.styleOf(firstParagraph);
      }
      if (cells.length > 2) {
        this.reader.approximated.push(
          'A table row with more than two cells is one label and one value, the other cells joined.',
        );
      }
      const label = (texts[0] ?? [])
        .flat()
        .map((part) => (part.kind === 'text' ? part.text : part.label))
        .join(' ');
      const value: SlotPart[] = [];
      for (const lines of texts.slice(1)) {
        for (const line of lines) {
          if (value.length > 0) value.push({ kind: 'text', text: ' ' });
          value.push(...line);
        }
      }
      tableRows.push({ label, value });
    }
    const cellStyle = this.styleFor(cellLook ?? {}, cellWordStyle);
    const firstCell = rows[0] === undefined ? undefined : elementsOf(rows[0], 'tc')[0];
    const cellBorders = childOf(childOf(firstCell, 'tcPr'), 'tcBorders');
    const tableBorders = childOf(childOf(table, 'tblPr'), 'tblBorders');
    // Without borders of the table, those of its first cell stand for them.
    const fromCell: Readonly<Record<string, string>> = { insideH: 'bottom', insideV: 'right' };
    const border = (name: string): ImportedBorder | undefined => {
      const side =
        tableBorders === undefined
          ? childOf(cellBorders, fromCell[name] ?? name)
          : childOf(tableBorders, name);
      const value = side?.attrs['val'];
      if (side === undefined || value === undefined || value === 'none' || value === 'nil')
        return undefined;
      const hex = side.attrs['color'];
      return {
        widthPt: Number(side.attrs['sz'] ?? '4') / 8,
        color: this.colorToken(hex !== undefined && /^[0-9A-Fa-f]{6}$/.test(hex) ? hex : '000000'),
      };
    };
    const styleName = `${this.name}-table${this.tableStyles.length === 0 ? '' : `-${String(this.tableStyles.length + 1)}`}`;
    const outer = border('top') ?? border('left');
    const insideHorizontal = border('insideH');
    const insideVertical = border('insideV');
    this.tableStyles.push({
      name: styleName,
      cellStyle,
      ...(outer !== undefined ? { outer } : {}),
      ...(insideHorizontal !== undefined ? { insideHorizontal } : {}),
      ...(insideVertical !== undefined ? { insideVertical } : {}),
      cellPaddingPt: COVER_TABLE_PADDING_PT,
    });
    // Word leaves no room above and below the text of a cell; the cover table has its padding.
    this.full(block.heightPt + 2 * COVER_TABLE_PADDING_PT * tableRows.length, {
      valign: 'top',
      content: [{ kind: 'table', style: styleName as StyleName, rows: tableRows }],
    });
    this.converted.push(
      `A table with borders as a cover table of ${String(tableRows.length)} rows.`,
    );
  }

  /**
   * A line of a header or footer with parts between tabs (ADR 0095): a row with a column for each
   * part, each in the alignment of its tab. In a line of left, centre and right, the centre part
   * is usually the longest, so it has half of the width; other lines have equal columns.
   */
  private addSegments(block: Block & { kind: 'paragraph' }, segments: readonly Segment[]): void {
    const count = segments.length;
    const centred = count === 3 && segments[1]?.alignment === 'center';
    const boundaries = centred
      ? [0, this.widthPt / 4, (this.widthPt * 3) / 4, this.widthPt]
      : Array.from({ length: count + 1 }, (_, index) => (this.widthPt * index) / count);
    const cells = segments.map((segment, index) => {
      const style = this.styleFor({ ...block.look, alignment: segment.alignment }, block.style);
      const content: CoverEntry[] = [
        ...segment.pictures.flatMap((picture): CoverEntry[] => {
          const entry = this.image(picture);
          return entry === undefined ? [] : [{ ...entry, style }];
        }),
        ...segment.lines
          .filter((line) => line.length > 0)
          .map((text): CoverEntry => ({ kind: 'paragraph', style, text })),
      ];
      return {
        from: index,
        to: index + 1,
        ...(content.length > 0 ? { area: { valign: 'top' as const, content } } : {}),
      };
    });
    this.rows.push({ heightPt: block.heightPt, cells, boundaries });
    this.converted.push(
      'A line of a header or footer with tabs as columns, left, centre and right.',
    );
  }

  /**
   * A header or a footer as a grid (ADR 0095): the rows of its blocks, without the empty rows at its
   * ends; a row with content grows, and an empty row between keeps its height. Undefined when it
   * has no content.
   */
  band(blocks: readonly Block[]): CoverGrid | undefined {
    const { rows } = this.capture(blocks);
    const filled = (row: GridRow): boolean => row.cells.some((cell) => cell.area !== undefined);
    while (rows.length > 0 && !filled(rows[0] as GridRow)) rows.shift();
    while (rows.length > 0 && !filled(rows.at(-1) as GridRow)) rows.pop();
    if (rows.length === 0) return undefined;
    const { columns, areas, area } = this.shape(rows);
    return {
      kind: 'grid',
      columns,
      rows: rows.map((row): CoverRowHeight =>
        filled(row) ? { kind: 'auto' } : { kind: 'points', pt: Math.max(0.5, round(row.heightPt)) },
      ),
      areas,
      area,
    };
  }

  /** The grid: columns from the boundaries of layout tables, and the rows that fill the cover. */
  grid(margins: Partial<PageMargins>, heightPt: number): CoverGrid {
    const empty = (row: GridRow | undefined): boolean =>
      row !== undefined &&
      row.share !== true &&
      row.boundaries === undefined &&
      row.cells.every((cell) => cell.area === undefined);
    for (let index = this.rows.length - 1; index > 0; index -= 1) {
      const row = this.rows[index];
      const above = this.rows[index - 1];
      if (row !== undefined && above !== undefined && empty(row) && empty(above)) {
        above.heightPt += row.heightPt;
        this.rows.splice(index, 1);
      }
    }
    const { columns, areas, area } = this.shape(this.rows);
    const fixed = this.rows.reduce(
      (sum, row) => sum + (row.share === true ? 0 : Math.max(1, round(row.heightPt))),
      0,
    );
    const room = heightPt - 2;
    const scale = fixed > room ? room / fixed : 1;
    if (scale < 1) {
      this.reader.approximated.push(
        'The cover was taller than the page, so its rows were made lower.',
      );
    }
    const rows: CoverRowHeight[] = this.rows.map((row) =>
      row.share === true
        ? { kind: 'share', fr: 1 }
        : { kind: 'points', pt: Math.max(0.5, round(row.heightPt * scale)) },
    );
    return { kind: 'grid', margins, columns, rows, areas, area };
  }

  /** The columns of rows, from the boundaries of their tables and tabs, and their areas. */
  private shape(gridRows: readonly GridRow[]): {
    columns: CoverColumnWidth[];
    areas: string[][];
    area: Record<string, CoverArea>;
  } {
    // An edge within a point of another is that edge, so that a table a little narrower than the
    // page does not make a sliver of a column.
    const sorted = [0, round(this.widthPt)];
    for (const row of gridRows) {
      for (const edge of row.boundaries ?? []) {
        const at = round(Math.min(edge, this.widthPt));
        if (sorted.every((known) => Math.abs(known - at) > 1)) sorted.push(at);
      }
    }
    sorted.sort((a, b) => a - b);
    const snap = (edge: number): number =>
      sorted.reduce((best, known) =>
        Math.abs(known - edge) < Math.abs(best - edge) ? known : best,
      );
    const columns: CoverColumnWidth[] = sorted.slice(1).map((edge, index) => {
      const widthPt = round(edge - (sorted[index] ?? 0));
      return index === sorted.length - 2
        ? { kind: 'share', fr: 1 }
        : { kind: 'points', pt: widthPt };
    });
    const columnOf = (edge: number): number =>
      sorted.indexOf(snap(round(Math.min(edge, this.widthPt))));
    const area: Record<string, CoverArea> = {};
    let count = 0;
    const areas = gridRows.map((row) => {
      const line = sorted.slice(1).map(() => '.');
      for (const cell of row.cells) {
        if (cell.area === undefined) continue;
        count += 1;
        const name = `area-${String(count)}`;
        area[name] = cell.area;
        const from = row.boundaries === undefined ? 0 : columnOf(row.boundaries[cell.from] ?? 0);
        const to =
          row.boundaries === undefined
            ? sorted.length - 1
            : columnOf(row.boundaries[cell.to] ?? this.widthPt);
        for (let column = from; column < Math.max(to, from + 1); column += 1) line[column] = name;
      }
      return line;
    });
    return { columns, areas, area };
  }
}
