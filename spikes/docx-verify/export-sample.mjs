// Throwaway: writes spikes/out/export-sample.docx from the built packages, for a look in Word.
import { readFileSync, writeFileSync } from 'node:fs';
import { exportDocx } from '../../packages/export-docx/dist/index.js';
import { parseDocument, parseStylesheet } from '../../packages/format/dist/index.js';

// Emphasis in a heading also switches bold off, which a character style cannot express.
const sheetText = readFileSync(new URL('../../fixtures/stylesheet/default.yaml', import.meta.url), 'utf8')
  .replace(/\r\n/g, '\n')
  .replace('emphasis: { italic: true }\n\n  heading-2', 'emphasis: { italic: true, bold: false }\n\n  heading-2');
const sheet = parseStylesheet(sheetText);
const source = `---
phrase-format: 1
title: "Export sample"
authors:
  - "Example Author"
---

<!-- phrase: #k7m2q9x4zb -->
# Heading with *emphasis* and <span class="marker">marker</span>

<!-- phrase: #a1b2c3d4e5 -->
## Second level

<!-- phrase: #b2c3d4e5f6 -->
### Third level

#### Fourth level is not numbered

<!-- phrase: #c3d4e5f6g7 -->
# Another first level

Body text with **strong**, *emphasis*, \`code\`, ***both***, a [link](https://example.com) and a <span class="muted">muted</span> word.

\`\`\`
first line
\tindented line
\`\`\`

<!-- phrase: .cover-title -->
Cover title style

- Bullet one with **strong** text

  A second paragraph of the first bullet.

  - Nested bullet
    1. Numbered inside a nested bullet
    2. Second numbered
  - Another nested bullet
- Bullet two

1. First numbered
   - A bullet inside a numbered item
2. Second numbered

1) A separate numbered list starts at 1 again
2) Second item
`;
const parsed = parseDocument(source);
const result = await exportDocx(parsed.document, sheet.stylesheet, { timestamp: new Date() });
console.log([...sheet.diagnostics, ...parsed.diagnostics, ...result.diagnostics]);
if (result.bytes !== undefined) {
  writeFileSync(new URL('../out/export-sample.docx', import.meta.url), result.bytes);
  console.log('written spikes/out/export-sample.docx');
}
