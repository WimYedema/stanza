/** The line number at the end of what was typed or pasted: `42`, `L42`, or a link ending in `#L42`. */
export function lineOf(input: string): number | undefined {
  const digits = /(\d+)\s*$/.exec(input)?.[1];
  const line = digits === undefined ? 0 : Number(digits);
  return Number.isSafeInteger(line) && line >= 1 ? line : undefined;
}

/**
 * The block that holds a line, given the line on which each block starts: the last block that
 * starts on or before it, and the first one for a line before them all (the front matter).
 */
export function blockAt(starts: readonly number[], line: number): number | undefined {
  if (starts.length === 0) return undefined;
  let found = 0;
  starts.forEach((start, index) => {
    if (start <= line) found = index;
  });
  return found;
}
