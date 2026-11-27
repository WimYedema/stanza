// Writes the generated benchmark project of ADR 0101: made-up text from a fixed seed, so the same
// seed gives the same files.
//
//   node scripts/bench/make-corpus.mjs <folder> [--seed 1] [--documents 500] [--long-blocks 3000]
//
// The project has documents of mixed length with headings, paragraphs, lists, tables and references
// between them, the stylesheet with a cover of examples/corporate-report, and one long document
// (`documents/long.stanza.md`). The output is not committed.
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const example = join(repo, 'examples', 'corporate-report');
const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';
const WORDS = (
  'the a of to and in for on with by from at as each every other this that its their which ' +
  'river stone harbour lantern meadow quarry orchard signal ledger survey corridor beacon ' +
  'archive gauge kettle mill pier ridge thistle valley willow compass anchor bramble cellar ' +
  'measure record review report schedule budget sample result outline method change limit ' +
  'shows holds keeps moves follows checks names lists counts marks gives takes finds opens ' +
  'small early quiet steady narrow plain broad local yearly shared second final common'
).split(' ');

/** A small, fast generator with a seed (mulberry32). */
function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generator(seed) {
  const next = random(seed);
  const int = (min, max) => min + Math.floor(next() * (max - min + 1));
  const pick = (items) => items[Math.floor(next() * items.length)];
  const used = new Set();
  const id = () => {
    for (;;) {
      let value = '';
      for (let i = 0; i < 10; i++) value += ALPHABET[Math.floor(next() * 32)];
      if (!used.has(value)) {
        used.add(value);
        return value;
      }
    }
  };
  const words = (min, max) => Array.from({ length: int(min, max) }, () => pick(WORDS)).join(' ');
  const title = (min, max) => {
    const text = words(min, max);
    return text.charAt(0).toUpperCase() + text.slice(1);
  };
  const sentence = () => `${title(6, 16)}.`;
  return { next, int, pick, id, words, title, sentence };
}

/** The Markdown of one document; `targets` gathers the headings that later blocks can refer to. */
function documentText(g, name, blocks, targets) {
  const lines = ['---', 'stanza-format: 1', `title: "${g.title(2, 5)}"`, '---', ''];
  const block = (text) => lines.push(text, '');
  const heading = (level) => {
    const id = g.id();
    const text = g.title(2, 6);
    block(`<!-- stanza: #${id} -->\n${'#'.repeat(level)} ${text}`);
    targets.push({ id, text, document: name });
  };
  heading(1);
  let list = false;
  let level2 = false;
  for (let count = 1; count < blocks; count++) {
    const roll = g.next();
    // Two lists in a row would be one list in Markdown.
    const wasList = list;
    list = roll >= 0.12 && roll < 0.22 && !wasList;
    if (roll < 0.12) {
      // A level 3 heading only under a level 2 one, as the numbering expects.
      const level = level2 ? g.int(2, 3) : 2;
      level2 = true;
      heading(level);
    } else if (list) {
      const marker = g.next() < 0.5 ? '-' : '1.';
      block(Array.from({ length: g.int(2, 5) }, () => `${marker} ${g.title(3, 10)}`).join('\n'));
    } else if (roll < 0.27) {
      const columns = g.int(2, 4);
      const row = () => `| ${Array.from({ length: columns }, () => g.title(1, 3)).join(' | ')} |`;
      block(
        [
          `<!-- stanza: #${g.id()} -->`,
          row(),
          `|${' --- |'.repeat(columns)}`,
          ...Array.from({ length: g.int(2, 6) }, row),
        ].join('\n'),
      );
    } else if (roll < 0.37 && targets.length > 1) {
      const target = g.pick(targets);
      block(`${g.sentence()} See [${target.text}](#${target.id}). ${g.sentence()}`);
    } else {
      block(
        Array.from({ length: g.int(1, 4) }, () =>
          g.next() < 0.1 ? `${g.title(3, 8)} **${g.words(1, 3)}** ${g.words(3, 8)}.` : g.sentence(),
        ).join(' '),
      );
    }
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

/** Writes the project into `folder`, replacing what an earlier run wrote there. */
export function makeCorpus(folder, { seed = 1, documents = 500, longBlocks = 3000 } = {}) {
  if (existsSync(folder) && readdirSync(folder).length > 0) {
    if (!existsSync(join(folder, '.stanza-corpus'))) {
      throw new Error(`${folder} is not empty and was not written by this script.`);
    }
    rmSync(folder, { recursive: true, force: true });
  }
  for (const sub of ['documents', 'styles', 'assets']) {
    mkdirSync(join(folder, sub), { recursive: true });
  }
  writeFileSync(join(folder, '.stanza-corpus'), `seed ${String(seed)}\n`);
  copyFileSync(join(example, 'styles', 'report.yaml'), join(folder, 'styles', 'report.yaml'));
  copyFileSync(join(example, 'assets', 'logo.png'), join(folder, 'assets', 'logo.png'));
  writeFileSync(
    join(folder, 'stanza.yaml'),
    "stanza-format: 1\ntitle: 'Benchmark corpus'\nstylesheet: 'styles/report.yaml'\n",
  );
  const g = generator(seed);
  const targets = [];
  const files = [];
  for (let index = 1; index < documents; index++) {
    const name = `documents/part-${String(index).padStart(3, '0')}.stanza.md`;
    // Mostly short and typical documents, now and then a longer one.
    const blocks = g.next() < 0.1 ? g.int(100, 250) : g.int(8, 40);
    writeFileSync(join(folder, name), documentText(g, name, blocks, targets));
    files.push(name);
  }
  writeFileSync(
    join(folder, 'documents', 'long.stanza.md'),
    documentText(g, 'documents/long.stanza.md', longBlocks, targets),
  );
  files.push('documents/long.stanza.md');
  return { folder, files };
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const options = {};
  let folder;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--seed') options.seed = Number(argv[++i]);
    else if (argv[i] === '--documents') options.documents = Number(argv[++i]);
    else if (argv[i] === '--long-blocks') options.longBlocks = Number(argv[++i]);
    else folder = resolve(argv[i]);
  }
  if (folder === undefined) {
    console.error(
      'Usage: node scripts/bench/make-corpus.mjs <folder> [--seed 1] [--documents 500] [--long-blocks 3000]',
    );
    process.exit(2);
  }
  const { files } = makeCorpus(folder, options);
  console.log(`Wrote ${String(files.length)} documents to ${folder}.`);
}
