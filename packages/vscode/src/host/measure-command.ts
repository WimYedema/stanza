import * as vscode from 'vscode';
import {
  MEASURED_ACTIONS,
  type ActionCounts,
  type ActionTimings,
  type MeasuredAction,
} from '../shared/protocol.js';
import type { ProjectDiagnostics } from './project-diagnostics.js';
import { findRoot } from './project-files.js';
import type { MeasuredActions, StanzaEditorProvider } from './provider.js';
import type { OpenDurations } from './startup-times.js';

/** How often each document is opened cold and warm, and each action is run (ADR 0101). */
export const MEASURE_RUNS = 20;
const OPEN_TIMEOUT_MS = 60_000;
/** All the actions of one document together: 80 of them can take most of a second each. */
const ACTIONS_TIMEOUT_MS = 10 * 60_000;

/** The budgets of ADR 0101, as p95 in milliseconds. */
export const BUDGETS = { action: 100, warmEditable: 300, coldVisible: 500, coldEditable: 2000 };

export interface Spread {
  readonly p50: number;
  readonly p95: number;
}

export const spread = (values: readonly number[]): Spread => {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p: number): number => sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)] ?? NaN;
  return { p50: at(0.5), p95: at(0.95) };
};

export interface MeasuredDocument {
  readonly label: 'short' | 'typical' | 'long';
  readonly path: string;
  readonly blocks: number;
}

/** The shortest, the median and the longest document by top-level blocks, each once. */
export function pickDocuments(
  documents: readonly { readonly path: string; readonly blocks: number }[],
): MeasuredDocument[] {
  const sorted = [...documents].sort((a, b) => a.blocks - b.blocks || a.path.localeCompare(b.path));
  const chosen: MeasuredDocument[] = [];
  const add = (label: MeasuredDocument['label'], index: number): void => {
    const document = sorted[index];
    if (document !== undefined && !chosen.some((item) => item.path === document.path)) {
      chosen.push({ label, ...document });
    }
  };
  add('short', 0);
  add('typical', Math.floor((sorted.length - 1) / 2));
  add('long', sorted.length - 1);
  return chosen;
}

export interface DocumentResult extends MeasuredDocument {
  readonly cold: readonly OpenDurations[];
  readonly warm: readonly OpenDurations[];
  readonly actions: ActionTimings | undefined;
  /** In how many runs each action did something; fewer than its timings means it was not measured. */
  readonly applied: ActionCounts | undefined;
}

const ms = (value: number): string => `${String(Math.round(value))} ms`;
const against = (value: Spread, budget: number): string =>
  `p50 ${ms(value.p50)}, p95 ${ms(value.p95)} (${value.p95 <= budget ? 'within' : 'over'} ${ms(budget)})`;

/** The lines of the output channel: each document, its opens and actions, against the budgets. */
export function reportLines(results: readonly DocumentResult[]): string[] {
  const lines: string[] = [];
  for (const result of results) {
    lines.push(`${result.label}: ${result.path} (${String(result.blocks)} blocks)`);
    const visible = (opens: readonly OpenDurations[]): Spread =>
      spread(opens.map((open) => open.visible));
    const editable = (opens: readonly OpenDurations[]): Spread =>
      spread(opens.map((open) => open.editable));
    // A measurement cancelled before the first open of a document has nothing to report.
    const line = (name: string, opens: readonly OpenDurations[], value: Spread, budget: number) =>
      opens.length === 0 ? `  ${name} not measured` : `  ${name} ${against(value, budget)}`;
    lines.push(
      line('cold open, visible: ', result.cold, visible(result.cold), BUDGETS.coldVisible),
    );
    lines.push(
      line('cold open, editable:', result.cold, editable(result.cold), BUDGETS.coldEditable),
    );
    lines.push(
      line('warm open, editable:', result.warm, editable(result.warm), BUDGETS.warmEditable),
    );
    for (const action of MEASURED_ACTIONS) {
      const values = result.actions?.[action] ?? [];
      const applied = result.applied?.[action] ?? 0;
      const missed =
        applied < values.length
          ? ` (did something in ${String(applied)} of ${String(values.length)} runs)`
          : '';
      lines.push(
        values.length === 0
          ? `  ${action}: not measured`
          : `  ${action}: ${against(spread(values), BUDGETS.action)}${missed}`,
      );
    }
  }
  return lines;
}

/** The results as JSON, with the spreads and the durations they come from. */
export function resultsJson(results: readonly DocumentResult[], about: object): string {
  const spreads = (timings: ActionTimings | undefined): Partial<Record<MeasuredAction, Spread>> =>
    Object.fromEntries(MEASURED_ACTIONS.map((action) => [action, spread(timings?.[action] ?? [])]));
  return `${JSON.stringify(
    {
      ...about,
      budgets: BUDGETS,
      documents: results.map((result) => ({
        ...result,
        summary: {
          coldVisible: spread(result.cold.map((open) => open.visible)),
          coldEditable: spread(result.cold.map((open) => open.editable)),
          warmEditable: spread(result.warm.map((open) => open.editable)),
          actions: spreads(result.actions),
        },
      })),
    },
    null,
    2,
  )}\n`;
}

const pause = (duration: number): Promise<void> =>
  new Promise((done) => setTimeout(done, duration));

function withTimeout<T>(promise: Promise<T>, what: string, limit = OPEN_TIMEOUT_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${what} took longer than ${ms(limit)}.`));
    }, limit);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

const stanzaTabs = (uri: vscode.Uri): vscode.Tab[] =>
  vscode.window.tabGroups.all
    .flatMap((group) => group.tabs)
    .filter(
      (tab) =>
        tab.input instanceof vscode.TabInputCustom && tab.input.uri.toString() === uri.toString(),
    );

async function close(uri: vscode.Uri): Promise<void> {
  const tabs = stanzaTabs(uri);
  if (tabs.length > 0) await vscode.window.tabGroups.close(tabs);
  await pause(200);
}

async function open(editors: StanzaEditorProvider, uri: vscode.Uri): Promise<OpenDurations> {
  const done = editors.nextOpen(uri);
  await vscode.commands.executeCommand('vscode.openWith', uri, 'stanza.editor', {
    preview: false,
  });
  return withTimeout(done, `Opening ${uri.fsPath}`);
}

/** The document of the active Stanza editor, or of the active text editor. */
function activeDocument(): vscode.Uri | undefined {
  const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
  if (input instanceof vscode.TabInputCustom || input instanceof vscode.TabInputText) {
    return input.uri.path.endsWith('.stanza.md') ? input.uri : undefined;
  }
  return undefined;
}

/**
 * "Stanza: Measure Responsiveness", shown only with `stanza.development.measure` (ADR 0101): opens
 * the shortest, a typical and the longest document of the active project cold and warm, times the
 * actions in each, and reports against the budgets. The documents are not changed.
 */
export function registerMeasureResponsiveness(
  editors: StanzaEditorProvider,
  diagnostics: ProjectDiagnostics,
  log: vscode.OutputChannel,
): vscode.Disposable {
  return vscode.commands.registerCommand(
    'stanza.measureResponsiveness',
    (options?: MeasureOptions) => measure(editors, diagnostics, log, options),
  );
}

/** For a script (ADR 0101): measure the project of this document, write here, then quit VS Code. */
export interface MeasureOptions {
  readonly document?: vscode.Uri;
  readonly target?: vscode.Uri;
  readonly quit?: boolean;
}

async function measure(
  editors: StanzaEditorProvider,
  diagnostics: ProjectDiagnostics,
  log: vscode.OutputChannel,
  options: MeasureOptions = {},
): Promise<void> {
  try {
    await measureProject(editors, diagnostics, log, options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.appendLine(`Stanza measurement failed: ${message}`);
    // A script waits for the file, so it hears of the failure too. A person gets a message, which is
    // not waited for, so that nothing is held up until it is closed.
    if (options.target !== undefined) {
      const text = `${JSON.stringify({ error: message })}\n`;
      await vscode.workspace.fs.writeFile(options.target, new TextEncoder().encode(text));
    }
    if (options.quit !== true) void vscode.window.showErrorMessage(`Stanza: ${message}`);
  }
  if (options.quit === true) await vscode.commands.executeCommand('workbench.action.quit');
}

async function measureProject(
  editors: StanzaEditorProvider,
  diagnostics: ProjectDiagnostics,
  log: vscode.OutputChannel,
  options: MeasureOptions,
): Promise<void> {
  const active = options.document ?? activeDocument();
  const root = active === undefined ? undefined : await findRoot(active);
  if (root === undefined) throw new Error('Open a document of the project to measure first.');
  const project = await diagnostics.load(root);
  const chosen = pickDocuments(
    project.documents.map(({ path, document }) => ({ path, blocks: document.blocks.length })),
  );
  const uris = chosen.map((item) => vscode.Uri.joinPath(root, item.path));
  // The editors of this project are closed, so that none loads it again while the cold opens are
  // timed: those inside its folder, not in a folder whose name only starts the same.
  const inProject = root.toString().endsWith('/') ? root.toString() : `${root.toString()}/`;
  const projectTabs = vscode.window.tabGroups.all
    .flatMap((group) => group.tabs)
    .filter(
      (tab) =>
        tab.input instanceof vscode.TabInputCustom &&
        tab.input.uri.toString().startsWith(inProject),
    );
  const closing = new Set([
    ...uris.map((uri) => uri.toString()),
    ...projectTabs.flatMap((tab) =>
      tab.input instanceof vscode.TabInputCustom ? [tab.input.uri.toString()] : [],
    ),
  ]);
  const dirty = vscode.workspace.textDocuments.filter(
    (document) => document.isDirty && closing.has(document.uri.toString()),
  );
  if (dirty.length > 0) {
    throw new Error(
      `Save ${dirty.map((document) => document.fileName).join(', ')} before measuring.`,
    );
  }
  const target =
    options.target ??
    (await vscode.window.showSaveDialog({
      title: 'Save the results as JSON (Cancel: the Stanza output channel only)',
      filters: { JSON: ['json'] },
    }));
  if (projectTabs.length > 0) await vscode.window.tabGroups.close(projectTabs);
  log.show(true);
  log.appendLine(
    `Stanza measurement: ${String(MEASURE_RUNS)} runs, VS Code ${vscode.version}, ${root.fsPath}.`,
  );
  const results = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Stanza: measuring',
      cancellable: true,
    },
    async (progress, token) => {
      // Read each time: the person can cancel while a document is being measured.
      const cancelled = (): boolean => token.isCancellationRequested;
      const done: DocumentResult[] = [];
      for (const [index, item] of chosen.entries()) {
        const uri = uris[index];
        if (uri === undefined || cancelled()) break;
        progress.report({ message: `${item.label}: ${item.path}` });
        await close(uri);
        const cold: OpenDurations[] = [];
        const warm: OpenDurations[] = [];
        let measured: MeasuredActions | undefined;
        try {
          for (let run = 0; run < MEASURE_RUNS && !cancelled(); run++) {
            diagnostics.invalidate(root);
            cold.push(await open(editors, uri));
            await close(uri);
            await diagnostics.load(root);
            warm.push(await open(editors, uri));
            if (run < MEASURE_RUNS - 1) await close(uri);
          }
          const measuring = cancelled() ? undefined : editors.measureActions(uri, MEASURE_RUNS);
          measured =
            measuring === undefined
              ? undefined
              : await withTimeout(measuring, 'Measuring actions', ACTIONS_TIMEOUT_MS);
        } finally {
          // Also when measuring failed: the measured editor sends no change any more and holds what
          // was typed in it. Closing it leaves the file as it was.
          await close(uri);
        }
        done.push({
          ...item,
          cold,
          warm,
          actions: measured?.timings,
          applied: measured?.applied,
        });
      }
      return done;
    },
  );
  for (const line of reportLines(results)) log.appendLine(line);
  if (target !== undefined) {
    const text = resultsJson(results, {
      vscode: vscode.version,
      project: root.fsPath,
      runs: MEASURE_RUNS,
    });
    await vscode.workspace.fs.writeFile(target, new TextEncoder().encode(text));
    log.appendLine(`Written to ${target.fsPath}.`);
  }
}

/**
 * With `STANZA_MEASURE_RESULTS` set, as `scripts/bench/responsiveness.mjs` does: once the first
 * Stanza document is editable, measure its project, write the results to that file and quit.
 */
export function measureOnFirstOpen(
  editors: StanzaEditorProvider,
  target: string | undefined,
): void {
  if (target === undefined || target === '') return;
  void editors.anyOpen().then((document) =>
    vscode.commands.executeCommand('stanza.measureResponsiveness', {
      document,
      target: vscode.Uri.file(target),
      quit: true,
    } satisfies MeasureOptions),
  );
}
