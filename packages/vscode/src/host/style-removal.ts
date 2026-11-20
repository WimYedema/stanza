import {
  isReservedStyle,
  styleReferences,
  type StyleFamily,
  type StyleName,
  type Stylesheet,
} from '@stanza/core';
import type { StyleUse } from '@stanza/project';

const MAX_FILES = 5;

const FAMILY_MAPS = {
  paragraph: (sheet: Stylesheet) => sheet.paragraphStyles,
  character: (sheet: Stylesheet) => sheet.characterStyles,
  table: (sheet: Stylesheet) => sheet.tableStyles,
} as const;

/** `a.stanza.md (2 blocks), b.stanza.md (1 block)`, for the uses that are not through a derived style. */
function whereUsed(uses: readonly StyleUse[]): string {
  const blocks = new Map<string, Set<string>>();
  for (const use of uses) {
    if (use.kind === 'inherited') continue;
    blocks.set(use.file, (blocks.get(use.file) ?? new Set()).add(use.path));
  }
  const files = [...blocks].map(
    ([file, paths]) => `${file} (${String(paths.size)} block${paths.size === 1 ? '' : 's'})`,
  );
  const shown = files.slice(0, MAX_FILES).join(', ');
  return files.length > MAX_FILES ? `${shown} and ${String(files.length - MAX_FILES)} more` : shown;
}

/**
 * Why a style cannot be deleted (ADR 0053), as sentences: it is one that every stylesheet needs,
 * a document uses it, or the stylesheet refers to it. Empty when it can go.
 */
export function removalBlockers(
  stylesheet: Stylesheet,
  family: StyleFamily,
  name: StyleName,
  uses: readonly StyleUse[],
): readonly string[] {
  if (!FAMILY_MAPS[family](stylesheet).has(name)) {
    return [`There is no ${family} style "${name}".`];
  }
  if (isReservedStyle(family, name)) {
    return [`The ${family} style "${name}" is one that every stylesheet needs, so it stays.`];
  }
  const found: string[] = [];
  const used = whereUsed(uses);
  if (used !== '') found.push(`The documents use it: ${used}.`);
  found.push(...styleReferences(stylesheet, family, name));
  return found;
}
