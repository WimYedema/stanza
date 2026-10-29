import type { Diagnostic, StyleName, Stylesheet } from '@phrase/core';
import { resolveParagraphStyle } from '@phrase/core';
import {
  LevelFormat,
  type ILevelsOptions,
  type INumberingOptions,
  type IParagraphStyleOptions,
} from 'docx';
import { wordStyleId, wordStyleName } from './style-ids.js';

type NumberingDefinition = INumberingOptions['config'][number];

export type ListKind = 'bulleted' | 'numbered';

/** Word has nine list levels, numbered 0 to 8. */
export const MAX_LIST_LEVEL = 8;

const BULLETS = ['\u2022', '\u25E6', '\u25AA'];
const NUMBER_FORMATS = [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN];

const twips = (pt: number): number => Math.round(pt * 20);

interface Indents {
  /** Where the text of the first level starts, in twips. */
  readonly left: number;
  /** Positive: the marker hangs left of the text. Zero: no hanging. */
  readonly hanging: number;
  readonly firstLine: number;
}

/**
 * Chooses the numbering definitions and the continuation styles of lists. Both are generated from
 * the stylesheet's list styles, so the indents of a list come from the stylesheet and nowhere else.
 */
export class ListNumbering {
  private readonly definitions = new Map<string, NumberingDefinition>();
  private readonly continuations = new Map<string, IParagraphStyleOptions>();
  private instances = 0;

  constructor(
    private readonly stylesheet: Stylesheet,
    private readonly declaredIds: ReadonlySet<string>,
    private readonly diagnostics: Diagnostic[],
  ) {}

  /** A new list: Word numbers each instance of a definition from the start. */
  newInstance(): number {
    return this.instances++;
  }

  /** The numbering definition for a list style and kind, registered on first use. */
  reference(style: StyleName, kind: ListKind): string {
    const reference = `${wordStyleId(style)}.${kind}`;
    if (!this.definitions.has(reference)) {
      const indents = this.indents(style);
      const levels = Array.from({ length: MAX_LIST_LEVEL + 1 }, (_, level) =>
        levelOptions(kind, level, indents),
      );
      this.definitions.set(reference, { reference, levels });
    }
    return reference;
  }

  /** Where the text of a list item at a level starts, in twips. */
  textIndent(listStyle: StyleName, level: number): number {
    return this.indents(listStyle).left * (level + 1);
  }

  /**
   * The paragraph style for a block that continues a list item at a level: the style of the block,
   * with the indent of the item's text and no hanging indent.
   */
  continuationStyle(style: StyleName, listStyle: StyleName, level: number): string {
    const number = String(level + 1);
    const same = style === listStyle;
    const id = same
      ? `${wordStyleId(style)}Continue${number}`
      : `${wordStyleId(style)}In${wordStyleId(listStyle)}${number}`;
    if (!this.continuations.has(id)) {
      if (this.declaredIds.has(id)) {
        this.diagnostics.push({
          severity: 'error',
          code: 'style-id-collision',
          message: `A generated paragraph style for "${style}" would reuse the Word style "${id}".`,
        });
      }
      this.continuations.set(id, {
        id,
        name: same
          ? `${wordStyleName(style)} Continue ${number}`
          : `${wordStyleName(style)} In ${wordStyleName(listStyle)} ${number}`,
        basedOn: wordStyleId(style),
        paragraph: { indent: { left: this.textIndent(listStyle, level), hanging: 0 } },
      });
    }
    return id;
  }

  config(): readonly NumberingDefinition[] {
    return [...this.definitions.values()];
  }

  styles(): readonly IParagraphStyleOptions[] {
    return [...this.continuations.values()].sort((a, b) =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    );
  }

  private indents(style: StyleName): Indents {
    const paragraph = resolveParagraphStyle(this.stylesheet, style)?.paragraph;
    const first = paragraph?.firstLineIndentPt ?? 0;
    return {
      left: twips(paragraph?.indentLeftPt ?? 0),
      hanging: first < 0 ? twips(-first) : 0,
      firstLine: first > 0 ? twips(first) : 0,
    };
  }
}

/** Each level is indented one more step of the style's left indent, with the style's hanging. */
function levelOptions(kind: ListKind, level: number, indents: Indents): ILevelsOptions {
  const indent = {
    left: indents.left * (level + 1),
    ...(indents.hanging > 0 ? { hanging: indents.hanging } : {}),
    ...(indents.firstLine > 0 ? { firstLine: indents.firstLine } : {}),
  };
  const marker =
    kind === 'bulleted'
      ? { format: LevelFormat.BULLET, text: BULLETS[level % BULLETS.length] ?? '\u2022' }
      : {
          format: NUMBER_FORMATS[level % NUMBER_FORMATS.length] ?? LevelFormat.DECIMAL,
          text: `%${String(level + 1)}.`,
        };
  return { level, ...marker, style: { paragraph: { indent } } };
}
