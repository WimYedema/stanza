import type {
  CharacterStyle,
  Diagnostic,
  ParagraphStyle,
  StyleName,
  Stylesheet,
} from '@phrase/core';
import type { ICharacterStyleOptions, IParagraphStyleOptions } from 'docx';
import { paragraphProps, runProps } from './docx-props.js';
import { wordStyleId, wordStyleName } from './style-ids.js';

/** Word style IDs are shared by every kind of style, so two stylesheet names must not map to one. */
export function checkStyleIds(stylesheet: Stylesheet): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const owners = new Map<string, string>();
  const sections: readonly (readonly [string, Iterable<StyleName>])[] = [
    ['paragraph-styles', stylesheet.paragraphStyles.keys()],
    ['character-styles', stylesheet.characterStyles.keys()],
    ['table-styles', stylesheet.tableStyles.keys()],
  ];
  for (const [section, names] of sections) {
    for (const name of names) {
      const path = `${section}.${name}`;
      const id = wordStyleId(name);
      const owner = owners.get(id);
      if (owner === undefined) owners.set(id, path);
      else {
        diagnostics.push({
          severity: 'error',
          code: 'style-id-collision',
          message: `"${name}" and "${owner}" both become the Word style "${id}".`,
          path,
        });
      }
    }
  }
  return diagnostics;
}

function paragraphStyleOptions(name: StyleName, style: ParagraphStyle, sheet: Stylesheet) {
  // Heading styles carry their outline level, so that Word lists them in a table of contents
  // and in its navigation, and styles based on them inherit it.
  const heading = /^heading-([1-6])$/.exec(name)?.[1];
  const options: IParagraphStyleOptions = {
    id: wordStyleId(name),
    name: wordStyleName(name),
    quickFormat: true,
    ...(style.basedOn !== undefined ? { basedOn: wordStyleId(style.basedOn) } : {}),
    run: runProps(sheet.tokens, style.text),
    paragraph: {
      ...paragraphProps(sheet.tokens, style.paragraph),
      ...(heading !== undefined ? { outlineLevel: Number(heading) - 1 } : {}),
    },
  };
  return options;
}

function characterStyleOptions(name: StyleName, style: CharacterStyle, sheet: Stylesheet) {
  const options: ICharacterStyleOptions = {
    id: wordStyleId(name),
    name: wordStyleName(name),
    quickFormat: true,
    ...(style.basedOn !== undefined ? { basedOn: wordStyleId(style.basedOn) } : {}),
    run: runProps(sheet.tokens, style.text),
  };
  return options;
}

/** Every declared paragraph and character style, with its own properties and its base. */
export function declaredStyles(stylesheet: Stylesheet): {
  readonly paragraphStyles: readonly IParagraphStyleOptions[];
  readonly characterStyles: readonly ICharacterStyleOptions[];
} {
  return {
    paragraphStyles: [...stylesheet.paragraphStyles].map(([name, style]) =>
      paragraphStyleOptions(name, style, stylesheet),
    ),
    characterStyles: [...stylesheet.characterStyles].map(([name, style]) =>
      characterStyleOptions(name, style, stylesheet),
    ),
  };
}

/** The Word styles whose own `page-break-before` is set; the library cannot write it into a style. */
export function pageBreakStyles(stylesheet: Stylesheet): ReadonlyMap<string, boolean> {
  return new Map(
    [...stylesheet.paragraphStyles].flatMap(([name, style]) =>
      style.paragraph.pageBreakBefore === undefined
        ? []
        : [[wordStyleId(name), style.paragraph.pageBreakBefore] as const],
    ),
  );
}
