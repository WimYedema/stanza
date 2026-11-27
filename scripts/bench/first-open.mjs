// Measures the first open of a Stanza document in a new VS Code window (ADR 0101).
//
//   node scripts/bench/first-open.mjs <document.stanza.md> [--runs 20] [--code code] [--out file.json]
//
// The runs share one new profile, an empty user data folder and extensions folder made for this
// measurement, with Stanza loaded from packages/vscode (build it first). Each run starts the
// installed `code` on the project folder of the document and waits until VS Code has quit.
// STANZA_TIMING_FILE makes Stanza write a time stamp at each step and quit once the document is
// editable. The first run is the first start of the profile and is left out: VS Code then opens the
// file as text, since it does not know Stanza's editor yet (item 239), and it fills the caches that
// any later start of VS Code has. So the runs measure a new window of a profile that was used once.
// Nothing is sent anywhere; the result is printed, and written to --out when given.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  describeMachine,
  launch,
  machine,
  newProfile,
  pause,
  projectFolder,
  removeProfile,
  requireBuild,
} from './vscode.mjs';

const RUN_TIMEOUT_MS = 120_000;
const PAUSE_MS = 3_000;

function options(argv) {
  const result = { runs: 20, code: 'code', out: undefined, document: undefined };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--runs') result.runs = Number(argv[++i]);
    else if (arg === '--code') result.code = argv[++i];
    else if (arg === '--out') result.out = resolve(argv[++i]);
    else result.document = resolve(arg);
  }
  if (result.document === undefined || !Number.isInteger(result.runs) || result.runs < 1) {
    console.error(
      'Usage: node scripts/bench/first-open.mjs <document.stanza.md> [--runs 20] [--code code] [--out file.json]',
    );
    process.exit(2);
  }
  if (!existsSync(result.document)) {
    console.error(`No such document: ${result.document}`);
    process.exit(2);
  }
  requireBuild();
  return result;
}

/** Starts VS Code once and waits for it to quit; the marks Stanza wrote, and when it started. */
async function run(setup, index) {
  const marks = join(setup.profile.folder, `marks-${String(index)}.jsonl`);
  const started = await launch({
    code: setup.code,
    profile: setup.profile,
    document: setup.document,
    env: { STANZA_TIMING_FILE: marks },
    timeoutMs: RUN_TIMEOUT_MS,
  });
  const at = {};
  let steps;
  let hostSteps;
  if (existsSync(marks)) {
    for (const line of readFileSync(marks, 'utf8').split('\n')) {
      if (line === '') continue;
      const { mark, at: time, steps: parts } = JSON.parse(line);
      at[mark] ??= time;
      if (mark === 'visible' && parts !== undefined) steps ??= parts;
      if (mark === 'init-sent' && parts !== undefined) hostSteps ??= parts;
    }
  }
  return { started, at, steps, hostSteps };
}

/** The steps of a first open, each from the step before it. */
const PARTS = [
  ['VS Code until the extension host', 'started', 'host-start'],
  ['extension host until Stanza runs', 'host-start', 'loaded'],
  ['loading Stanza', 'loaded', 'activate-start'],
  ['activation', 'activate-start', 'activate-end'],
  ['until the open request', 'activate-end', 'open'],
  ['webview loading', 'open', 'webview-ready'],
  ['host until the document is sent', 'webview-ready', 'init-sent'],
  ['webview until visible', 'init-sent', 'visible'],
  ['until editable', 'visible', 'editable'],
  // Not a step of its own: how long the busy host took to read that the document was painted.
  ['host hears of the paint', 'visible', 'visible-received'],
  ['total: visible', 'started', 'visible'],
  ['total: editable', 'started', 'editable'],
];

function parts({ started, at }) {
  const times = { started, ...at };
  const missing = PARTS.flatMap(([, from, to]) => [from, to]).filter((mark) => !(mark in times));
  if (!('host-start' in times)) {
    return {
      error:
        'Stanza did not start. VS Code may be waiting to finish an update (restart VS Code once), or try the same command line with --verbose',
    };
  }
  if (missing.length > 0) return { error: `no ${[...new Set(missing)].join(', ')} mark` };
  // A host that started before this run means VS Code reused a window that was still running.
  if (times['host-start'] < started)
    return { error: 'VS Code was still running from a run before' };
  return Object.fromEntries(PARTS.map(([name, from, to]) => [name, times[to] - times[from]]));
}

const percentile = (values, p) =>
  [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(p * values.length) - 1)];

function summary(results) {
  return Object.fromEntries(
    PARTS.map(([name]) => {
      const values = results.map((result) => result[name]);
      return [
        name,
        {
          p50: percentile(values, 0.5),
          p95: percentile(values, 0.95),
          min: Math.min(...values),
          max: Math.max(...values),
        },
      ];
    }),
  );
}

function print(table, count) {
  const rows = Object.entries(table).map(([name, { p50, p95, min, max }]) => [
    name,
    ...[p50, p95, min, max].map((value) => String(Math.round(value))),
  ]);
  const header = ['step (ms)', 'p50', 'p95', 'min', 'max'];
  const widths = header.map((_, i) => Math.max(...[header, ...rows].map((row) => row[i].length)));
  const line = (row) =>
    row.map((cell, i) => (i === 0 ? cell.padEnd(widths[i]) : cell.padStart(widths[i]))).join('  ');
  console.log(`\n${String(count)} runs`);
  console.log(line(header));
  for (const row of rows) console.log(line(row));
}

const { runs, code, out, document } = options(process.argv.slice(2));
const setup = { code, document, profile: newProfile('stanza-first-open-') };
const about = machine(code);
console.log(describeMachine(about));
console.log(`Opening ${document} in ${projectFolder(document)}`);

const results = [];
/** The parts of the start of the webview, per run (ADR 0101). */
const webview = [];
/** The parts of "host until the document is sent", per run. */
const host = [];
try {
  for (let index = 0; index <= runs; index++) {
    const ran = await run(setup, index);
    const measured = parts(ran);
    const label = index === 0 ? 'warm-up' : `run ${String(index)}`;
    if ('error' in measured) {
      console.log(`${label}: left out, ${measured.error}`);
    } else {
      console.log(
        `${label}: visible ${String(Math.round(measured['total: visible']))} ms, editable ${String(Math.round(measured['total: editable']))} ms`,
      );
      if (index > 0) {
        results.push(measured);
        if (ran.steps !== undefined) webview.push(ran.steps);
        if (ran.hostSteps !== undefined) host.push(ran.hostSteps);
      }
    }
    await pause(PAUSE_MS);
  }
} finally {
  removeProfile(setup.profile);
}
if (results.length === 0) {
  console.error('No run was measured.');
  process.exit(1);
}
const table = summary(results);
print(table, results.length);
/** p50, p95, min and max of each named part over the runs. */
function stepTable(runs) {
  const names = [...new Set(runs.flat().map((step) => step.name))];
  return Object.fromEntries(
    names.map((name) => {
      const values = runs.map((run) => run.find((step) => step.name === name)?.ms ?? 0);
      return [
        name,
        {
          p50: percentile(values, 0.5),
          p95: percentile(values, 0.95),
          min: Math.min(...values),
          max: Math.max(...values),
        },
      ];
    }),
  );
}
const hostTable = stepTable(host);
if (host.length > 0) {
  console.log('\nIn the host, from the webview being ready to sending the document');
  print(hostTable, host.length);
}
// From the start of the webview: the first part is its script.
const webviewTable = stepTable(webview);
if (webview.length > 0) {
  console.log('\nIn the webview');
  print(webviewTable, webview.length);
}
if (out !== undefined) {
  writeFileSync(
    out,
    `${JSON.stringify({ machine: about, document, runs: results, summary: table, host: hostTable, webview: webviewTable }, null, 2)}\n`,
  );
  console.log(`\nWritten to ${out}`);
}
