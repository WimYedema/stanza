import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { StyleName } from '@stanza/core';
import { COVER_PRESETS, applyCoverPreset } from './cover-presets.js';
import { parseStylesheet } from './stylesheet.js';

const MINIMAL = [
  'stanza-format: 1',
  'paragraph-styles:',
  ...[
    'body',
    'heading-1',
    'heading-2',
    'heading-3',
    'heading-4',
    'heading-5',
    'heading-6',
    'code',
    'list-bulleted',
    'list-numbered',
  ].map((name) => `  ${name}: {}`),
  'table-styles:',
  '  table: {}',
  'page-templates:',
  '  page:',
  '    size: A4',
  '',
].join('\n');

const errors = (text: string) =>
  parseStylesheet(text).diagnostics.filter((diagnostic) => diagnostic.severity === 'error');

describe('cover presets (ADR 0100)', () => {
  it.each(COVER_PRESETS.map((preset) => preset.id))(
    '%s makes a valid cover with the styles and colors it needs',
    (id) => {
      const applied = applyCoverPreset(MINIMAL, 'page', id);
      if (!applied.ok) throw new Error(applied.message);
      expect(errors(applied.text)).toEqual([]);
      const sheet = parseStylesheet(applied.text).stylesheet;
      expect(sheet.pageTemplates.get('page' as StyleName)?.cover).toBeDefined();
      expect(sheet.tokens.colors.get('cover-accent')).toBe('#1F4E79');
    },
  );

  it('keeps the styles and colors the stylesheet has under the same names', () => {
    const own = MINIMAL.replace(
      'table-styles:',
      '  cover-title:\n    based-on: body\n    size: 40\ntable-styles:',
    );
    const applied = applyCoverPreset(own, 'page', 'classic');
    if (!applied.ok) throw new Error(applied.message);
    expect(applied.text).toContain('  cover-title:\n    based-on: body\n    size: 40\n');
    expect(applied.text.match(/ {2}cover-title:/g)).toHaveLength(1);
  });

  it('replaces the cover there is, and refuses a preset or template that does not exist', () => {
    const first = applyCoverPreset(MINIMAL, 'page', 'band');
    if (!first.ok) throw new Error(first.message);
    const second = applyCoverPreset(first.text, 'page', 'side-band');
    if (!second.ok) throw new Error(second.message);
    const cover = parseStylesheet(second.text).stylesheet.pageTemplates.get(
      'page' as StyleName,
    )?.cover;
    expect(cover?.kind).toBe('grid');
    expect(applyCoverPreset(MINIMAL, 'page', 'nothing').ok).toBe(false);
    expect(applyCoverPreset(MINIMAL, 'missing', 'band').ok).toBe(false);
  });

  it('applies to the stylesheets of the example projects', () => {
    const root = new URL('../../../examples/', import.meta.url);
    for (const example of readdirSync(root)) {
      let files: string[];
      try {
        files = readdirSync(new URL(`${example}/styles/`, root));
      } catch {
        continue;
      }
      for (const file of files) {
        const text = readFileSync(new URL(`${example}/styles/${file}`, root), 'utf8').replaceAll(
          '\r\n',
          '\n',
        );
        const template = [...parseStylesheet(text).stylesheet.pageTemplates.keys()][0];
        if (template === undefined) continue;
        for (const preset of COVER_PRESETS) {
          const applied = applyCoverPreset(text, template, preset.id);
          expect(applied.ok && errors(applied.text)).toEqual([]);
        }
      }
    }
  });
});
