import { appendFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

/** The moment, in milliseconds since 1970, with the precision of the performance clock. */
export const clockNow = (): number => performance.timeOrigin + performance.now();

/** The steps of startup that are timed (ADR 0101). */
export type StartupMark =
  | 'host-start'
  | 'loaded'
  | 'activate-start'
  | 'activate-end'
  | 'open'
  | 'webview-ready'
  | 'init-sent'
  | 'visible'
  | 'editable';

/** Takes a step of startup down, as a line of the timing file. */
export type RecordMark = (mark: StartupMark, at: number, file?: string) => void;

/**
 * The marks go as JSON lines to the file that `STANZA_TIMING_FILE` names, for
 * `scripts/measure-first-open.mjs`; without it nothing is written. The times stay on this machine.
 */
export function timingFile(path: string | undefined): RecordMark | undefined {
  if (path === undefined || path === '') return undefined;
  return (mark, at, file) => {
    appendFileSync(
      path,
      `${JSON.stringify({ mark, at, ...(file !== undefined ? { file } : {}) })}\n`,
    );
  };
}

const ms = (duration: number): string => `${String(Math.round(duration))} ms`;

/** What the extension knows of its own start: when the host and the bundle began, and activation. */
export interface Activation {
  readonly hostStart: number;
  readonly loaded: number;
  readonly start: number;
  readonly end: number;
}

/** The output line for activation, reported apart from any budget. */
export const activationLine = ({ hostStart, loaded, start, end }: Activation): string =>
  `Stanza activation: ${ms(end - start)}, after ${ms(start - loaded)} loading the extension and ${ms(loaded - hostStart)} from the start of the extension host.`;

/**
 * Times one editor from the open request to its painted stages, on the clock of the host, and says
 * each step in the output channel once (ADR 0101).
 */
export class OpenTimer {
  private readonly open: number;
  private ready: number | undefined;
  private sent: number | undefined;
  private readonly seen = new Set<'visible' | 'editable'>();

  constructor(
    private readonly fileName: string,
    private readonly log: (line: string) => void,
    private readonly record: RecordMark | undefined,
    private readonly clock: () => number = clockNow,
  ) {
    this.open = clock();
    record?.('open', this.open, fileName);
  }

  /** The webview sent its first message. */
  webviewReady(): void {
    if (this.ready !== undefined) return;
    this.ready = this.clock();
    this.record?.('webview-ready', this.ready, this.fileName);
  }

  /** The host sent the document to the webview. */
  initSent(): void {
    if (this.sent !== undefined) return;
    this.sent = this.clock();
    this.record?.('init-sent', this.sent, this.fileName);
  }

  /** A stage was painted; true when this was the first time it was. */
  painted(stage: 'visible' | 'editable'): boolean {
    if (this.seen.has(stage)) return false;
    this.seen.add(stage);
    const at = this.clock();
    this.record?.(stage, at, this.fileName);
    const steps = [
      ...(this.ready !== undefined ? [`webview ready after ${ms(this.ready - this.open)}`] : []),
      ...(this.sent !== undefined ? [`document sent after ${ms(this.sent - this.open)}`] : []),
    ];
    const ready = stage === 'visible' && steps.length > 0 ? ` (${steps.join(', ')})` : '';
    this.log(`Stanza startup: ${stage} after ${ms(at - this.open)}${ready} (${this.fileName}).`);
    return true;
  }
}
