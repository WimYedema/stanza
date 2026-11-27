// Measures the budgets of ADR 0101 inside VS Code: cold and warm opens and the actions, for the
// shortest, a typical and the longest document of a project.
//
//   node scripts/bench/responsiveness.mjs <document.stanza.md> [--code code] [--out file.json]
//
// Starts the installed `code` once, with a new profile and Stanza from packages/vscode (build it
// first), on the project of the document. STANZA_MEASURE_RESULTS makes Stanza run "Stanza: Measure
// Responsiveness" once the document is editable, write the results to a file and quit. The documents
// are not changed. Nothing is sent anywhere.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
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

const TIMEOUT_MS = 30 * 60_000;
const BUDGET = { action: 100, warmEditable: 300, coldVisible: 500, coldEditable: 2000 };

const argv = process.argv.slice(2);
let code = 'code';
let out;
let document;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--code') code = argv[++i];
  else if (argv[i] === '--out') out = resolve(argv[++i]);
  else document = resolve(argv[i]);
}
if (document === undefined || !existsSync(document)) {
  console.error(
    'Usage: node scripts/bench/responsiveness.mjs <document.stanza.md> [--code code] [--out file.json]',
  );
  process.exit(2);
}
requireBuild();

const about = machine(code);
console.log(describeMachine(about));
console.log(`Measuring the project ${projectFolder(document)}; this takes some minutes.`);
const profile = newProfile('stanza-responsiveness-', { 'stanza.development.measure': true });
const target = join(profile.folder, 'results.json');
let results;
try {
  await launch({
    code,
    profile,
    document,
    env: { STANZA_MEASURE_RESULTS: target },
    timeoutMs: TIMEOUT_MS,
  });
  // `--wait` returns when the document it opened is closed, and the measurement closes it, so wait
  // for the results; VS Code quits once they are written.
  const deadline = Date.now() + TIMEOUT_MS;
  while (!existsSync(target) && Date.now() < deadline) await pause(2000);
  await pause(5000);
  if (existsSync(target)) {
    results = { machine: about, ...JSON.parse(readFileSync(target, 'utf8')) };
  } else {
    // What Stanza said, before the profile and its logs are removed.
    const logs = readdirSync(join(profile.userData, 'logs'), { recursive: true }).filter((file) =>
      String(file).endsWith('Stanza.log'),
    );
    for (const file of logs) {
      const lines = readFileSync(join(profile.userData, 'logs', String(file)), 'utf8').split('\n');
      console.error(lines.slice(-15).join('\n'));
    }
  }
} finally {
  removeProfile(profile);
}
if (results === undefined) {
  console.error(
    'Stanza wrote no results; run "Stanza: Measure Responsiveness" by hand to see why.',
  );
  process.exit(1);
}

const ms = (value) => `${String(Math.round(value))}`;
const row = (name, spread, budget) =>
  `  ${name.padEnd(20)} p50 ${ms(spread.p50).padStart(6)}  p95 ${ms(spread.p95).padStart(6)}  ${
    spread.p95 <= budget ? 'within' : 'OVER  '
  } ${String(budget)} ms`;
for (const result of results.documents) {
  console.log(`\n${result.label}: ${result.path} (${String(result.blocks)} blocks)`);
  console.log(row('cold open, visible', result.summary.coldVisible, BUDGET.coldVisible));
  console.log(row('cold open, editable', result.summary.coldEditable, BUDGET.coldEditable));
  console.log(row('warm open, editable', result.summary.warmEditable, BUDGET.warmEditable));
  for (const [action, spread] of Object.entries(result.summary.actions)) {
    const applied = result.applied?.[action] ?? 0;
    const runs = result.actions?.[action]?.length ?? 0;
    const missed =
      applied < runs ? `  (did something in ${String(applied)} of ${String(runs)})` : '';
    console.log(`${row(action, spread, BUDGET.action)}${missed}`);
  }
}
if (out !== undefined) {
  writeFileSync(out, `${JSON.stringify(results, null, 2)}\n`);
  console.log(`\nWritten to ${out}`);
}
