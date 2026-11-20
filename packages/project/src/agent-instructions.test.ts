import { describe, expect, it } from 'vitest';
import { parseAnnotation, parseDocument } from '@stanza/format';
import {
  AGENT_INSTRUCTIONS,
  AGENT_INSTRUCTIONS_FILE,
  addAgentInstructions,
} from './agent-instructions.js';
import { memoryStorage } from './memory-storage.testing.js';

describe('addAgentInstructions', () => {
  it('writes AGENTS.md into the project folder', async () => {
    const storage = memoryStorage({ 'stanza.yaml': 'stanza-format: 1\n' });
    expect(await addAgentInstructions(storage)).toEqual({ ok: true, file: 'AGENTS.md' });
    expect(storage.texts.get(AGENT_INSTRUCTIONS_FILE)).toBe(AGENT_INSTRUCTIONS);
  });

  it('never writes over a file of that name', async () => {
    const storage = memoryStorage({ 'AGENTS.md': 'My own rules.\n' });
    expect(await addAgentInstructions(storage)).toEqual({ ok: false, reason: 'exists' });
    expect(storage.texts.has('AGENTS.md')).toBe(false);
  });
});

describe('the text of the instructions', () => {
  it('has a rich-table syntax example that parses without losing cell structure', () => {
    const example = /````markdown\n([\s\S]*?)\n````/.exec(AGENT_INSTRUCTIONS)?.[1];
    expect(example).toBeDefined();
    const parsed = parseDocument(`---\nstanza-format: 1\n---\n\n${example ?? ''}\n`);
    expect(parsed.diagnostics).toEqual([]);
    const table = parsed.document.blocks[0];
    expect(table?.type).toBe('table');
    if (table?.type !== 'table') throw new Error('Expected the documented table.');
    expect(table.rows[0]?.[0]?.blocks.map((block) => block.type)).toEqual([
      'paragraph',
      'paragraph',
    ]);
    expect(table.rows[0]?.[1]?.blocks[0]?.type).toBe('list');
  });

  it('has an example annotation that the dialect reads', () => {
    const example = /<!-- stanza: ([^>]*?) -->/.exec(AGENT_INSTRUCTIONS)?.[1];
    expect(example).toBeDefined();
    const parsed = parseAnnotation(`<!-- stanza: ${example ?? ''} -->`, 1);
    expect(parsed?.diagnostics).toEqual([]);
    expect(parsed?.annotation).toMatchObject({ id: 'k7m2q9x4zb', style: 'style-name' });
  });

  it('names as unsupported what the reader of the dialect reports', () => {
    const source =
      '---\nstanza-format: 1\n---\n\n> quote\n\n---\n\n![alt](a.png)\n\n<div>raw</div>\n\nline  \nbreak\n';
    const codes = parseDocument(source).diagnostics.map((d) => d.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        'blockquote-unsupported',
        'thematic-break-unsupported',
        'image-unsupported',
        'html-unsupported',
        'hard-break-unsupported',
      ]),
    );
    expect(AGENT_INSTRUCTIONS).toContain(
      'Block quotes, horizontal rules, images, raw HTML and hard line breaks are not supported.',
    );
  });

  it('names the commands and the option that the command line has', () => {
    for (const command of [
      'stanza format .',
      'stanza validate .',
      'stanza format . --assign-ids',
    ]) {
      expect(AGENT_INSTRUCTIONS).toContain(command);
    }
  });
});
