import { appendFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import type { StartupStep } from '../shared/protocol.js';

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
  | 'editable'
  | 'visible-received'
  | 'editable-received';

/** Takes a step of startup down, as a line of the timing file. */
export type RecordMark = (
  mark: StartupMark,
  at: number,
  file?: string,
  steps?: readonly StartupStep[],
) => void;

/**
 * The marks go as JSON lines to the file that `STANZA_TIMING_FILE` names, for
 * `scripts/bench/first-open.mjs`; without it nothing is written. The times stay on this machine.
 */
export function timingFile(path: string | undefined): RecordMark | undefined {
  if (path === undefined || path === '') return undefined;
  return (mark, at, file, steps) => {
    const line = {
      mark,
      at,
      ...(file !== undefined ? { file } : {}),
      ...(steps !== undefined ? { steps } : {}),
    };
    appendFileSync(path, `${JSON.stringify(line)}\n`);
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

/** How long after the open request a document was visible and editable, in milliseconds. */
export interface OpenDurations {
  readonly visible: number;
  readonly editable: number;
}

/**
 * Times one editor from the open request to its painted stages, on the clock of the host, and says
 * each step in the output channel once (ADR 0101).
 */
export class OpenTimer {
  private readonly open: number;
  private ready: number | undefined;
  private sent: number | undefined;
  private readonly seen = new Set<'visible' | 'editable'>();
  private visibleAfter: number | undefined;
  /** Called once, when the document was painted both read-only and editable. */
  onDone: ((durations: OpenDurations) => void) | undefined;

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
    this.stepAt = this.ready;
    this.record?.('webview-ready', this.ready, this.fileName);
  }

  private readonly steps: StartupStep[] = [];
  private stepAt: number | undefined;

  /** Ends a part of what the host does between the webview being ready and sending the document. */
  hostStep(name: string): void {
    if (this.sent !== undefined || this.stepAt === undefined) return;
    const now = this.clock();
    this.steps.push({ name, ms: now - this.stepAt });
    this.stepAt = now;
  }

  /** The host sent the document to the webview. */
  initSent(): void {
    if (this.sent !== undefined) return;
    this.hostStep('until sent');
    this.sent = this.clock();
    this.record?.('init-sent', this.sent, this.fileName, this.steps);
    if (this.steps.length > 0) {
      const parts = this.steps.map(({ name, ms: duration }) => `${name} ${ms(duration)}`);
      this.log(`Stanza host: ${parts.join(', ')}.`);
    }
  }

  /**
   * A stage was painted at `paintedAt`, on the clock of the machine; true when this was the first
   * time it was. A time before the open request or after now cannot be right, so then the arrival
   * of the message is taken.
   */
  painted(
    stage: 'visible' | 'editable',
    paintedAt: number,
    steps?: readonly StartupStep[],
  ): boolean {
    if (this.seen.has(stage)) return false;
    this.seen.add(stage);
    const received = this.clock();
    const at = paintedAt >= this.open && paintedAt <= received ? paintedAt : received;
    this.record?.(stage, at, this.fileName, steps);
    this.record?.(`${stage}-received`, received, this.fileName);
    const host = [
      ...(this.ready !== undefined ? [`webview ready after ${ms(this.ready - this.open)}`] : []),
      ...(this.sent !== undefined ? [`document sent after ${ms(this.sent - this.open)}`] : []),
    ];
    const ready = stage === 'visible' && host.length > 0 ? ` (${host.join(', ')})` : '';
    const late = received - at >= 50 ? `, the host heard of it ${ms(received - at)} later` : '';
    this.log(
      `Stanza startup: ${stage} after ${ms(at - this.open)}${ready}${late} (${this.fileName}).`,
    );
    if (steps !== undefined && steps.length > 0) {
      const parts = steps.map(({ name, ms: duration }) => `${name} ${ms(duration)}`).join(', ');
      this.log(`Stanza webview: ${parts}.`);
    }
    if (stage === 'visible') this.visibleAfter = at - this.open;
    else if (this.visibleAfter !== undefined) {
      this.onDone?.({ visible: this.visibleAfter, editable: at - this.open });
    }
    return true;
  }
}
