import { isNodeId, isStyleName, type Diagnostic, type NodeId, type StyleName } from '@stanza/core';

export interface Annotation {
  readonly id?: NodeId;
  readonly style?: StyleName;
  /** Relative column weights of a table. */
  readonly widths?: readonly number[];
}

export interface ParsedAnnotation {
  readonly annotation: Annotation;
  readonly diagnostics: readonly Diagnostic[];
}

const COMMENT = /^<!--\s*stanza:\s*(.*?)\s*-->$/;
const TOKEN = /#\S+|\.\S+|[A-Za-z][\w-]*="[^"]*"|\S+/g;
const KEY_VALUE = /^([A-Za-z][\w-]*)="([^"]*)"$/;

/**
 * Parses a block annotation such as `<!-- stanza: #k7m2q9x4zb .cover-title widths="30 70" -->`.
 * Returns undefined when the line is not an annotation.
 */
export function parseAnnotation(line: string, lineNumber: number): ParsedAnnotation | undefined {
  const body = COMMENT.exec(line.trim())?.[1];
  if (body === undefined) return undefined;

  const diagnostics: Diagnostic[] = [];
  const report = (severity: Diagnostic['severity'], code: string, message: string): void => {
    diagnostics.push({ severity, code, message, line: lineNumber });
  };
  let id: NodeId | undefined;
  let style: StyleName | undefined;
  let widths: readonly number[] | undefined;

  for (const [token] of body.matchAll(TOKEN)) {
    if (token.startsWith('#')) {
      const value = token.slice(1);
      if (!isNodeId(value)) report('error', 'annotation-invalid-id', `Invalid ID "${value}".`);
      else if (id !== undefined) report('warning', 'annotation-duplicate', 'More than one ID.');
      else id = value;
    } else if (token.startsWith('.')) {
      const value = token.slice(1);
      if (!isStyleName(value)) {
        report('error', 'annotation-invalid-style', `Invalid style name "${value}".`);
      } else if (style !== undefined) {
        report('warning', 'annotation-duplicate', 'More than one style.');
      } else style = value;
    } else {
      const pair = KEY_VALUE.exec(token);
      if (pair?.[1] === 'widths') {
        const numbers = (pair[2] ?? '').split(/\s+/).map(Number);
        if (numbers.every((n) => Number.isFinite(n) && n > 0)) widths = numbers;
        else report('error', 'annotation-invalid-widths', 'Widths must be positive numbers.');
      } else if (pair?.[1] !== undefined) {
        report('warning', 'annotation-unknown-key', `Unknown annotation key "${pair[1]}".`);
      } else {
        report('warning', 'annotation-unexpected-token', `Unexpected token "${token}".`);
      }
    }
  }

  const annotation: Annotation = {
    ...(id !== undefined ? { id } : {}),
    ...(style !== undefined ? { style } : {}),
    ...(widths !== undefined ? { widths } : {}),
  };
  return { annotation, diagnostics };
}

/** The annotation comment for a block, or undefined when there is nothing to record. */
export function formatAnnotation(annotation: Annotation): string | undefined {
  const parts: string[] = [];
  if (annotation.id !== undefined) parts.push(`#${annotation.id}`);
  if (annotation.style !== undefined) parts.push(`.${annotation.style}`);
  if (annotation.widths !== undefined) parts.push(`widths="${annotation.widths.join(' ')}"`);
  return parts.length === 0 ? undefined : `<!-- stanza: ${parts.join(' ')} -->`;
}
