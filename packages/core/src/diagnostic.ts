import type { NodeId } from './ids.js';

export type Severity = 'error' | 'warning';

export interface Diagnostic {
  readonly severity: Severity;
  readonly code: string;
  readonly message: string;
  /** One-based line in the source text, when known. */
  readonly line?: number;
  readonly nodeId?: NodeId;
}
