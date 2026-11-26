// Prints where the rows of the cover of each page template sit on the page, and what is in them:
// a cheap check of a cover layout before (or instead of) a render in Word.
// Usage: node scripts/cover-rows.mjs <project directory or stylesheet> [template]
// Needs `npm run build` first.
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { coverAreaHeightPt, coverGrid, coverMargins, coverRowHeightsPt } from '@stanza/core';
import { parseStylesheet } from '@stanza/format';

const [target, only] = process.argv.slice(2);
if (target === undefined) {
  console.error('Usage: node scripts/cover-rows.mjs <project directory or stylesheet> [template]');
  process.exit(2);
}
let path = target;
if (statSync(target).isDirectory()) {
  const project = readFileSync(join(target, 'stanza.yaml'), 'utf8');
  const match = /^stylesheet:\s*['"]?([^'"\n]+)['"]?\s*$/m.exec(project);
  path = join(target, match?.[1] ?? 'styles/default.yaml');
}
const parsed = parseStylesheet(readFileSync(path, 'utf8'));
for (const d of parsed.diagnostics) console.error(`${d.severity}: ${d.message}`);

const text = (parts) =>
  parts.map((part) => (part.kind === 'text' ? part.text : `[${part.label ?? ''}]`)).join('');
const describe = (entry) => {
  if (entry === undefined) return '';
  if (entry.kind === 'image') return `image ${entry.path}`;
  if (entry.kind === 'table') return `table of ${String(entry.rows.length)} rows`;
  return `${entry.style ?? ''} "${text(entry.text).slice(0, 40)}"`;
};

for (const [name, template] of parsed.stylesheet.pageTemplates) {
  if (only !== undefined && name !== only) continue;
  const cover = template.cover;
  if (cover === undefined || cover.kind === 'list') continue;
  const grid = coverGrid(cover);
  const margins = coverMargins(template);
  const heights = coverRowHeightsPt(grid.rows, coverAreaHeightPt(template));
  console.log(`${name}: ${template.size}, cover from ${String(margins.topPt)} pt`);
  let top = margins.topPt;
  grid.areas.forEach((line, index) => {
    const height = heights[index];
    const names = [...new Set(line)].filter((area) => area !== '.');
    const content = names
      .map((area) => {
        const background = grid.area[area]?.background;
        const color = background === undefined ? '' : ` background ${background.name ?? ''}`;
        return `${area}:${color} ${describe(grid.area[area]?.content[0])}`.trimEnd();
      })
      .join(' | ');
    const size = height === undefined ? 'auto' : `${height.toFixed(1)} pt`;
    console.log(`  ${top.toFixed(1).padStart(6)}  ${size.padStart(8)}  ${content}`);
    if (height !== undefined) top += height;
  });
}
