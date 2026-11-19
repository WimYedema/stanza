// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DocumentMeta } from '@phrase/core';
import { parseDocument, serializeDocument } from '@phrase/format';
import { createMetadataPanel } from './metadata.js';

afterEach(() => {
  document.body.replaceChildren();
});

function open(meta: DocumentMeta = { fields: {} }) {
  const root = document.createElement('section');
  document.body.append(root);
  const apply = vi.fn<(meta: DocumentMeta) => void>();
  const openProject = vi.fn();
  const panel = createMetadataPanel(root, { apply, openProject });
  panel.update({ meta, editable: true, templates: ['page', 'letter'] });
  return { root, apply, openProject, panel };
}
function button(root: ParentNode, text: string): HTMLButtonElement {
  const found = [...root.querySelectorAll('button')].find(
    (item) => (item.getAttribute('aria-label') ?? item.textContent) === text,
  );
  if (found === undefined) throw new Error(`Missing button: ${text}`);
  return found;
}
function property(root: ParentNode, name: string): HTMLElement {
  const found = root.querySelector<HTMLElement>(`[data-field="${name}"]`);
  if (found === null) throw new Error(`Missing property: ${name}`);
  return found;
}
function edit(root: ParentNode, label: string, value: string): void {
  const field = root.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    `[aria-label="${label}"]`,
  );
  if (field === null) throw new Error(`Missing input: ${label}`);
  field.value = value;
  field.dispatchEvent(new Event('input', { bubbles: true }));
}
function select(root: ParentNode, label: string, value: string): void {
  const field = root.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`);
  if (field === null) throw new Error(`Missing select: ${label}`);
  field.value = value;
  field.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('document properties', () => {
  it('keeps icon-only actions named and operable for properties and ordered list items', () => {
    const { root, apply } = open({ title: 'Title', fields: { tags: ['first', 'second'] } });
    const addAuthors = button(property(root, 'authors'), 'Add Authors');
    expect(addAuthors.textContent).toBe('+');
    expect(addAuthors.title).toBe('Add Authors');
    const removeTitle = button(property(root, 'title'), 'Remove Title property');
    expect(removeTitle.textContent).toBe('-');
    expect(removeTitle.title).toBe('Remove Title property');
    addAuthors.click();
    const addItem = button(property(root, 'authors'), 'Add Authors item');
    expect(document.activeElement).toBe(addItem);
    addItem.click();
    edit(root, 'Authors item 1', 'Team');
    const removeItem = button(property(root, 'tags'), 'Remove tags item 1');
    expect(removeItem.textContent).toBe('-');
    expect(removeItem.title).toBe('Remove tags item 1');
    removeItem.click();
    expect(property(root, 'tags').querySelector('textarea')?.value).toBe('second');
    button(property(root, 'title'), 'Remove Title property').click();
    expect(button(property(root, 'title'), 'Add Title').textContent).toBe('+');
    button(root, 'Apply').click();
    expect(apply).toHaveBeenCalledWith({ authors: ['Team'], fields: { tags: ['second'] } });
  });

  it('does not materialize defaults, missing fields or system metadata on opening', () => {
    const { root, panel, apply } = open();
    panel.update({
      defaults: { authors: ['Team'], classification: 'Internal', pageTemplate: 'letter' },
      fields: new Map([['doc-no', { type: 'string', required: true, label: 'Document number' }]]),
    });
    expect(property(root, 'authors').closest('section')?.textContent).toContain(
      'From phrase.yaml defaults',
    );
    expect(property(root, 'page-template').textContent).toContain('letter');
    expect(property(root, 'doc-no').textContent).toContain('Document number (required)');
    expect(root.textContent).toContain('The field "doc-no" is required');
    expect(root.textContent).toContain('phrase-format: 1');
    expect(root.textContent).toContain('revision: unavailable');
    expect(button(root, 'Apply').disabled).toBe(true);
    expect(apply).not.toHaveBeenCalled();
    button(property(root, 'classification'), 'Override Classification').click();
    button(root, 'Apply').click();
    expect(apply).toHaveBeenLastCalledWith({ classification: 'Internal', fields: {} });
  });

  it('stages text and ordered lists without inferring types or interpreting markup, then serializes deterministically', () => {
    const { root, apply, panel } = open({ fields: { code: 'old', tags: ['a', 'a', ''] } });
    edit(root, 'code', '0012\ntrue\n2026-01-01\n<img src=x>');
    edit(root, 'tags item 2', 'second\nline');
    button(property(root, 'tags'), 'Add tags item').click();
    expect(apply).not.toHaveBeenCalled();
    expect(root.querySelector('img')).toBeNull();
    button(root, 'Apply').click();
    const meta = apply.mock.calls[0]?.[0];
    expect(meta).toEqual({
      fields: { code: '0012\ntrue\n2026-01-01\n<img src=x>', tags: ['a', 'second\nline', '', ''] },
    });
    if (meta === undefined) throw new Error('Apply did not receive metadata.');
    const source = serializeDocument({ meta, blocks: [] });
    expect(serializeDocument(parseDocument(source).document)).toBe(source);
    expect(parseDocument(source).document.meta).toEqual(meta);
    expect(button(root, 'Apply').disabled).toBe(true);
    panel.complete({ ok: true, meta });
    expect(button(root, 'Apply').disabled).toBe(true);
    expect(button(root, 'Cancel').disabled).toBe(true);
  });

  it('distinguishes explicit empty values from removal and using project defaults', () => {
    const { root, apply, panel } = open({ classification: '', authors: [], fields: { note: '' } });
    panel.update({
      meta: { classification: '', authors: [], fields: { note: '' } },
      defaults: { classification: 'Internal', authors: ['Team'] },
      editable: true,
    });
    expect(property(root, 'classification').querySelector('textarea')?.value).toBe('');
    button(property(root, 'classification'), 'Use project default for Classification').click();
    expect(property(root, 'classification').textContent).toContain('Internal');
    button(property(root, 'note'), 'Remove note property').click();
    button(root, 'Apply').click();
    expect(apply).toHaveBeenCalledWith({ authors: [], fields: {} });
  });

  it('adds known and ad hoc fields explicitly, warns without editing the schema, and validates names', () => {
    const { root, panel, apply, openProject } = open();
    panel.update({ fields: new Map([['tags', { type: 'list', required: false }]]) });
    button(property(root, 'tags'), 'Add tags').click();
    for (const name of ['bad Name', 'phrase-format', 'title', 'tags']) {
      edit(root, 'Custom property name', name);
      button(root, 'Add custom property').click();
      expect(button(root, 'Apply').disabled).toBe(false);
      expect(root.textContent).toMatch(/kebab-case|already exists/);
    }
    edit(root, 'Custom property name', 'constructor');
    select(root, 'Custom property type', 'string');
    button(root, 'Add custom property').click();
    edit(root, 'constructor', 'true');
    expect(root.textContent).toContain('not declared by the project');
    expect(button(property(root, 'constructor'), 'Remove constructor property')).toBeDefined();
    button(root, 'Open project metadata definition').click();
    expect(openProject).toHaveBeenCalledOnce();
    button(root, 'Apply').click();
    expect(apply).toHaveBeenCalledWith({ fields: { tags: [], constructor: 'true' } });
  });

  it('keeps undeclared and mismatched existing fields editable and never converts their values silently', () => {
    const { root, panel, apply } = open({ fields: { tags: 'text', legacy: ['x'] } });
    panel.update({ fields: new Map([['tags', { type: 'list', required: true }]]) });
    expect(root.textContent).toContain('must be a list');
    expect(root.textContent).toContain('not declared by the project');
    edit(root, 'tags', 'edited');
    button(root, 'Apply').click();
    expect(apply).toHaveBeenCalledWith({ fields: { tags: 'edited', legacy: ['x'] } });
  });

  it('cancels drafts, and refuses applying after external source changes until explicitly reloaded', () => {
    const { root, panel, apply } = open({ title: 'Before', fields: {} });
    edit(root, 'Title', 'Draft');
    button(root, 'Cancel').click();
    expect(root.querySelector<HTMLTextAreaElement>('[aria-label="Title"]')?.value).toBe('Before');
    edit(root, 'Title', 'Draft again');
    panel.update({ meta: { title: 'External', fields: {} } }, true);
    expect(root.querySelector<HTMLTextAreaElement>('[aria-label="Title"]')?.value).toBe(
      'Draft again',
    );
    expect(root.textContent).toContain('settings changed');
    expect(button(root, 'Apply').disabled).toBe(true);
    button(root, 'Reload properties').click();
    expect(root.querySelector<HTMLTextAreaElement>('[aria-label="Title"]')?.value).toBe('External');
    expect(apply).not.toHaveBeenCalled();
  });

  it('gates preview edits, invalidates a draft on declaration/default changes, and surfaces application failures', () => {
    const { root, panel, apply } = open({ title: 'Before', fields: {} });
    panel.update({ editable: false });
    expect(root.querySelector('fieldset')?.disabled).toBe(true);
    button(property(root, 'authors'), 'Add Authors').click();
    expect(button(root, 'Apply').disabled).toBe(true);
    expect(apply).not.toHaveBeenCalled();
    panel.update({ editable: true });
    edit(root, 'Title', 'Draft');
    panel.update({ defaults: { classification: 'New default' } });
    expect(button(root, 'Apply').disabled).toBe(true);
    button(root, 'Reload properties').click();
    edit(root, 'Title', 'Retry');
    button(root, 'Apply').click();
    panel.complete({ ok: false, message: 'Disk edit refused' });
    expect(root.textContent).toContain('Disk edit refused');
    expect(button(root, 'Apply').disabled).toBe(false);
  });

  it('preserves unknown template choices with a diagnostic and offers declared templates', () => {
    const { root, apply } = open({ fields: { 'page-template': 'missing' } });
    expect(property(root, 'page-template').textContent).toContain('not defined');
    select(root, 'Page template', 'letter');
    expect(property(root, 'page-template').querySelector<HTMLElement>('.error')?.hidden).toBe(true);
    button(root, 'Apply').click();
    expect(apply).toHaveBeenCalledWith({ fields: { 'page-template': 'letter' } });
  });
});
