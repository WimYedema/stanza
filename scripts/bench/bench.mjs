// The parts of opening a document that need no editor (ADR 0101): `npm run bench`, after
// `npm run build`. Each part runs on `docs/` and on the generated project of make-corpus.mjs, and
// the p50 and p95 of each are printed, so a slower change shows which part it is in. Not part of
// `npm run check`: durations depend on the machine, and the budgets are checked on the reference
// setup only.
//
//   node scripts/bench/bench.mjs [--runs 30] [--out file.json]
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { getSchema } from '@tiptap/core';
import { compileStylesheetToCss } from '@stanza/css';
import { fromEditorContent, schemaExtensions, toEditorContent } from '@stanza/editor';
import { parseDocument, parseStylesheet, serializeDocument } from '@stanza/format';
import { loadProject, loadProjectConfiguration } from '@stanza/project';
import { nodeStorage } from '../../packages/cli/dist/node-storage.js';
import { makeCorpus } from './make-corpus.mjs';

const argv = process.argv.slice(2);
const option = (name, fallback) => {
  const index = argv.indexOf(name);
  return index === -1 ? fallback : argv[index + 1];
};
const runs = Number(option('--runs', '30'));
const out = option('--out', undefined);

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const scratch = mkdtempSync(join(tmpdir(), 'stanza-bench-'));
const corpus = makeCorpus(join(scratch, 'corpus')).folder;

const percentile = (values, p) =>
  [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(p * values.length) - 1)];

/** Runs a part a few times to warm up, then `runs` times; its p50 and p95 in milliseconds. */
async function time(work) {
  for (let i = 0; i < 3; i++) await work();
  const durations = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    await work();
    durations.push(performance.now() - start);
  }
  return { p50: percentile(durations, 0.5), p95: percentile(durations, 0.95) };
}

const parts = [];
for (const [name, root] of [
  ['docs', join(repo, 'docs')],
  ['corpus', corpus],
]) {
  const storage = nodeStorage(root);
  parts.push([`${name}: configuration`, () => loadProjectConfiguration(storage)]);
  parts.push([`${name}: whole project`, () => loadProject(storage)]);
}
const longText = readFileSync(join(corpus, 'documents', 'long.stanza.md'), 'utf8');
const long = parseDocument(longText).document;
const schema = getSchema(schemaExtensions());
const node = schema.nodeFromJSON(toEditorContent(long));
const stylesheetText = readFileSync(join(corpus, 'styles', 'report.yaml'), 'utf8');
const { stylesheet } = parseStylesheet(stylesheetText);
parts.push(
  ['long document: parse', () => parseDocument(longText)],
  ['long document: serialize', () => serializeDocument(long)],
  ['long document: to the editor', () => schema.nodeFromJSON(toEditorContent(long))],
  ['long document: from the editor', () => fromEditorContent(node, long.meta)],
  ['stylesheet: parse', () => parseStylesheet(stylesheetText)],
  ['stylesheet: browser CSS', () => compileStylesheetToCss(stylesheet)],
);

const results = {};
try {
  for (const [name, work] of parts) {
    results[name] = await time(work);
    const { p50, p95 } = results[name];
    console.log(
      `${name.padEnd(34)} p50 ${p50.toFixed(1).padStart(7)} ms   p95 ${p95.toFixed(1).padStart(7)} ms`,
    );
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
if (out !== undefined) {
  writeFileSync(resolve(out), `${JSON.stringify({ runs, results }, null, 2)}\n`);
}
