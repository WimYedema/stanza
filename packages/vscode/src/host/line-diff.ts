/**
 * The smallest change that turns one text into another: the lines that differ between the first
 * and the last line that they have in common, as one range of the old text and what replaces it.
 * Applying only this keeps the cursor, the undo history and Git's view of the file sensible (ADR
 * 0003), where replacing the whole document would not.
 *
 * Both texts use `\n`. VS Code turns the `\n` of the replacement into the line ending that the
 * document has. A line is compared with its line ending, so a text with and without a final newline
 * differ in their last line.
 */

export interface TextPosition {
  /** Zero-based. */
  readonly line: number;
  readonly character: number;
}

export interface LineEdit {
  readonly start: TextPosition;
  readonly end: TextPosition;
  readonly text: string;
}

/** The lines of a text, each with its `\n`, except perhaps the last. */
const lines = (text: string): string[] => text.match(/[^\n]*\n|[^\n]+$/g) ?? [];

/** Where a text that starts at a position ends. */
function positionAfter(start: TextPosition, text: string): TextPosition {
  const last = text.lastIndexOf('\n');
  if (last < 0) return { line: start.line, character: start.character + text.length };
  const breaks = text.split('\n').length - 1;
  return { line: start.line + breaks, character: text.length - (last + 1) };
}

/** The edit that makes `before` into `changed`, or undefined when they are the same. */
export function lineEdit(before: string, changed: string): LineEdit | undefined {
  if (before === changed) return undefined;
  const old = lines(before);
  const next = lines(changed);
  let prefix = 0;
  while (prefix < old.length && prefix < next.length && old[prefix] === next[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < old.length - prefix &&
    suffix < next.length - prefix &&
    old[old.length - 1 - suffix] === next[next.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  const start = positionAfter({ line: 0, character: 0 }, old.slice(0, prefix).join(''));
  const removed = old.slice(prefix, old.length - suffix).join('');
  return {
    start,
    end: positionAfter(start, removed),
    text: next.slice(prefix, next.length - suffix).join(''),
  };
}

/** Applies an edit to a text, as VS Code does. For tests, and to check an edit before using it. */
export function applyLineEdit(text: string, edit: LineEdit): string {
  const rows = text.split('\n');
  const offsetOf = (position: TextPosition): number => {
    let offset = 0;
    for (let row = 0; row < position.line; row += 1) offset += (rows[row] ?? '').length + 1;
    return offset + position.character;
  };
  return text.slice(0, offsetOf(edit.start)) + edit.text + text.slice(offsetOf(edit.end));
}
