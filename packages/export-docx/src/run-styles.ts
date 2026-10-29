import {
  VARIANT_MARKS,
  resolveParagraphStyle,
  resolveTextProps,
  type Diagnostic,
  type Mark,
  type StyleName,
  type Stylesheet,
} from '@phrase/core';
import type { ICharacterStyleOptions, IRunStylePropertiesOptions } from 'docx';
import { runProps } from './docx-props.js';
import { wordStyleId, wordStyleName } from './style-ids.js';

/** What a run needs on top of its paragraph: at most a character style and explicit properties. */
export type RunFormat = { readonly style?: string } & IRunStylePropertiesOptions;

const TOGGLES = ['bold', 'italics'] as const;

const capitalized = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);

interface Canonical {
  readonly marks: readonly Mark[];
  readonly segments: readonly string[];
  readonly displayNames: readonly string[];
}

/** Variant marks in the canonical order, then character styles by name; links lose their target. */
function canonicalMarks(marks: readonly Mark[]): Canonical {
  const variants = VARIANT_MARKS.filter((kind) => marks.some((mark) => mark.type === kind));
  const styles = [
    ...new Set(marks.flatMap((mark) => (mark.type === 'style' ? [mark.name] : []))),
  ].sort();
  const canonical: Mark[] = [
    ...variants.map((kind): Mark =>
      kind === 'link' ? { type: 'link', href: '' } : { type: kind },
    ),
    ...styles.map((name): Mark => ({ type: 'style', name })),
  ];
  const names: readonly string[] = [...variants, ...styles];
  return {
    marks: canonical,
    segments: names.map((name) => name.split('-').map(capitalized).join('')),
    displayNames: names.map((name) => name.split('-').map(capitalized).join(' ')),
  };
}

function different(
  full: IRunStylePropertiesOptions,
  base: IRunStylePropertiesOptions,
): IRunStylePropertiesOptions {
  const keys = Object.keys(full) as (keyof IRunStylePropertiesOptions)[];
  return Object.fromEntries(
    keys
      .filter((key) => JSON.stringify(full[key]) !== JSON.stringify(base[key]))
      .map((key) => [key, full[key]]),
  );
}

/**
 * Word combines a bold or italic that is on in the paragraph style with the same property in a
 * character style by an exclusive or, and a character style cannot switch such a property off.
 * This is the one place where the output carries explicit run properties.
 */
export function splitToggles(
  changes: IRunStylePropertiesOptions,
  base: IRunStylePropertiesOptions,
): { readonly style: IRunStylePropertiesOptions; readonly direct: IRunStylePropertiesOptions } {
  const off = TOGGLES.filter((key) => changes[key] === false);
  const style = Object.fromEntries(
    Object.entries(changes).filter(([key]) => !off.some((toggle) => toggle === key)),
  );
  const direct = Object.fromEntries(
    off.filter((key) => base[key] === true).map((key) => [key, false]),
  );
  return { style, direct };
}

/**
 * Chooses the formatting of runs: one generated character style for each combination of paragraph
 * style, marks and character styles that occurs, holding only what differs from the paragraph.
 */
export class RunStyles {
  private readonly generated = new Map<string, { key: string; options: ICharacterStyleOptions }>();

  constructor(
    private readonly stylesheet: Stylesheet,
    private readonly declaredIds: ReadonlySet<string>,
    private readonly diagnostics: Diagnostic[],
  ) {}

  format(paragraphStyle: StyleName, marks: readonly Mark[]): RunFormat {
    const canonical = canonicalMarks(marks);
    if (canonical.marks.length === 0) return {};
    const paragraph = resolveParagraphStyle(this.stylesheet, paragraphStyle);
    const full = resolveTextProps(this.stylesheet, paragraphStyle, canonical.marks);
    if (paragraph === undefined || full === undefined) return {};

    const tokens = this.stylesheet.tokens;
    const base = runProps(tokens, paragraph.text);
    const { style, direct } = splitToggles(different(runProps(tokens, full), base), base);
    if (Object.keys(style).length === 0) return direct;

    const id = wordStyleId(paragraphStyle) + canonical.segments.join('');
    const key = `${paragraphStyle}|${canonical.segments.join('|')}`;
    const existing = this.generated.get(id);
    if (existing === undefined) {
      if (this.declaredIds.has(id)) this.collision(id, paragraphStyle);
      this.generated.set(id, {
        key,
        options: {
          id,
          name: [wordStyleName(paragraphStyle), ...canonical.displayNames].join(' '),
          run: style,
        },
      });
    } else if (existing.key !== key) {
      this.collision(id, paragraphStyle);
    }
    return { style: id, ...direct };
  }

  /** The generated character styles, ordered by ID. */
  styles(): readonly ICharacterStyleOptions[] {
    return [...this.generated.values()]
      .map(({ options }) => options)
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  private collision(id: string, paragraphStyle: StyleName): void {
    this.diagnostics.push({
      severity: 'error',
      code: 'style-id-collision',
      message: `A generated character style for "${paragraphStyle}" would reuse the Word style "${id}".`,
    });
  }
}
