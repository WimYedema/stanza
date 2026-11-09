import { describe, expect, it } from 'vitest';
import type { StyleName } from '@phrase/core';
import { parseStylesheet } from '@phrase/format';
import type { StyleUse } from '@phrase/project';
import { removalBlockers } from './style-removal.js';

const n = (value: string): StyleName => value as StyleName;

const stylesheet = parseStylesheet(`phrase-format: 1
paragraph-styles:
  body: {}
  heading-1: { based-on: body }
  heading-2: { based-on: body }
  heading-3: { based-on: body }
  heading-4: { based-on: body }
  heading-5: { based-on: body }
  heading-6: { based-on: body }
  code: { based-on: body }
  list-bulleted: { based-on: body }
  list-numbered: { based-on: body }
  note: { based-on: body }
  warning-note: { based-on: note }
  unused: { based-on: body }
  header-footer: { based-on: body }
character-styles:
  status: { bold: true }
table-styles:
  table: {}
page-templates:
  page:
    header:
      style: header-footer
      left: 'x'
`).stylesheet;

const use = (file: string, path: string, kind: StyleUse['kind'] = 'direct'): StyleUse => ({
  kind,
  file,
  path,
});

describe('removalBlockers', () => {
  it('lets a style that nothing uses or refers to go', () => {
    expect(removalBlockers(stylesheet, 'paragraph', n('unused'), [])).toEqual([]);
    expect(removalBlockers(stylesheet, 'character', n('status'), [])).toEqual([]);
  });

  it('keeps a style that every stylesheet needs', () => {
    expect(removalBlockers(stylesheet, 'paragraph', n('body'), [])).toEqual([
      'The paragraph style "body" is one that every stylesheet needs, so it stays.',
    ]);
    expect(removalBlockers(stylesheet, 'table', n('table'), [])).toHaveLength(1);
  });

  it('says so for a style that is not there', () => {
    expect(removalBlockers(stylesheet, 'character', n('gone'), [])).toEqual([
      'There is no character style "gone".',
    ]);
  });

  it('names the documents and the number of blocks that use the style', () => {
    const uses = [
      use('a.phrase.md', 'blocks[0]'),
      use('a.phrase.md', 'blocks[0]', 'default'),
      use('a.phrase.md', 'blocks[3]'),
      use('b.phrase.md', 'blocks[1]'),
    ];
    expect(removalBlockers(stylesheet, 'paragraph', n('unused'), uses)).toEqual([
      'The documents use it: a.phrase.md (2 blocks), b.phrase.md (1 block).',
    ]);
  });

  it('does not count an inherited use, which a style based on it explains', () => {
    const uses = [use('a.phrase.md', 'blocks[0]', 'inherited')];
    expect(removalBlockers(stylesheet, 'paragraph', n('unused'), uses)).toEqual([]);
  });

  it('names what in the stylesheet refers to the style', () => {
    expect(removalBlockers(stylesheet, 'paragraph', n('note'), [])).toEqual([
      'The paragraph style "warning-note" is based on it.',
    ]);
    expect(removalBlockers(stylesheet, 'paragraph', n('header-footer'), [])).toEqual([
      'The page template "page" uses it in its header.',
    ]);
  });

  it('shortens a long list of documents', () => {
    const uses = Array.from({ length: 7 }, (_, index) => use(`d${String(index)}.phrase.md`, 'b'));
    expect(removalBlockers(stylesheet, 'paragraph', n('unused'), uses)[0]).toMatch(
      /d4\.phrase\.md \(1 block\) and 2 more\.$/,
    );
  });
});
