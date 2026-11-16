import type { NodeId } from './ids.js';
import type { StyleName } from './style-name.js';
import type { VariantMark } from './stylesheet.js';

export type Severity = 'error' | 'warning';

/**
 * A change to the project that would remove the cause of a diagnostic. It is only offered, never
 * made by itself: the stylesheet decides which marks a style allows (ADR 0006, ADR 0026).
 */
export type DeclareVariantFix = {
  readonly kind: 'declare-variant';
  readonly style: StyleName;
  readonly mark: VariantMark;
};

/** Moves the hex colors and font lists of the styles into tokens, all at once (ADR 0074). */
export type UseTokensFix = { readonly kind: 'use-tokens' };

export type ReferencePathFix = {
  readonly kind: 'reference-path';
  readonly href: string;
  readonly replacement: string;
};

export type Fix = DeclareVariantFix | UseTokensFix | ReferencePathFix;

export interface Diagnostic {
  readonly severity: Severity;
  readonly code: string;
  readonly message: string;
  /** One-based line in the source text, when known. */
  readonly line?: number;
  /** Location inside a structured file, such as `paragraph-styles.heading-1.size`. */
  readonly path?: string;
  readonly nodeId?: NodeId;
  readonly fix?: Fix;
}
