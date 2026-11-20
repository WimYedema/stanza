import {
  HARDCODED_FIELD_NAMES,
  validateMetadata,
  type DocumentMeta,
  type FieldDeclaration,
  type MetaValue,
  type ProjectDefaults,
} from '@stanza/core';
import { el, option } from './styles-dom.js';

interface MetadataInput {
  readonly meta: DocumentMeta;
  readonly defaults: ProjectDefaults;
  readonly fields: ReadonlyMap<string, FieldDeclaration> | undefined;
  readonly templates: readonly string[];
  readonly editable: boolean;
}

export interface MetadataPanel {
  update(patch: Partial<MetadataInput>, external?: boolean): void;
  open(): void;
  complete(
    result:
      | { readonly ok: true; readonly meta: DocumentMeta }
      | { readonly ok: false; readonly message: string },
  ): void;
}

type Values = Readonly<Record<string, MetaValue>>;
const BUILTINS = ['title', 'authors', 'classification', 'page-template'];
const LABELS = new Map([
  ['title', 'Title'],
  ['authors', 'Authors'],
  ['classification', 'Classification'],
  ['page-template', 'Page template'],
]);
const valuesOf = (meta: DocumentMeta): Values => ({
  ...meta.fields,
  ...(meta.title !== undefined ? { title: meta.title } : {}),
  ...(meta.authors !== undefined ? { authors: meta.authors } : {}),
  ...(meta.classification !== undefined ? { classification: meta.classification } : {}),
});
const keyOf = (values: Values): string =>
  JSON.stringify(Object.entries(values).sort(([a], [b]) => a.localeCompare(b)));

function metaOf(values: Values): DocumentMeta {
  const { title, authors, classification } = values;
  return {
    ...(typeof title === 'string' ? { title } : {}),
    ...(authors !== undefined && typeof authors !== 'string' ? { authors } : {}),
    ...(typeof classification === 'string' ? { classification } : {}),
    fields: Object.fromEntries(
      Object.entries(values).filter(
        ([name]) => name !== 'title' && name !== 'authors' && name !== 'classification',
      ),
    ),
  };
}

function button(text: string, action: () => void): HTMLButtonElement {
  const result = el('button', undefined, text);
  result.type = 'button';
  result.addEventListener('click', action);
  return result;
}

function iconButton(icon: '+' | '-', label: string, action: () => void): HTMLButtonElement {
  const result = button(icon, action);
  result.className = 'metadata-icon';
  result.title = label;
  result.setAttribute('aria-label', label);
  return result;
}

function showValue(value: MetaValue): HTMLElement {
  if (typeof value === 'string') return el('pre', undefined, value === '' ? '(empty text)' : value);
  if (value.length === 0) return el('p', undefined, '(empty list)');
  const list = el('ol');
  for (const item of value) list.append(el('li', undefined, item === '' ? '(empty text)' : item));
  return list;
}

/** Staged properties, outside the printable document. All values are plain text. */
export function createMetadataPanel(
  root: HTMLElement,
  host: { readonly apply: (meta: DocumentMeta) => void; readonly openProject: () => void },
): MetadataPanel {
  let input: MetadataInput = {
    meta: { fields: {} },
    defaults: {},
    fields: undefined,
    templates: [],
    editable: false,
  };
  let baseline = valuesOf(input.meta);
  let draft = baseline;
  let conflict = false;
  let pending = false;
  let error = '';
  const dirty = (): boolean => keyOf(draft) !== keyOf(baseline);
  const details = el('details');
  const summary = el('summary', undefined, 'Document properties');
  const content = el('div', 'metadata-body');
  const form = el('fieldset');
  const status = el('p', 'metadata-status');
  status.setAttribute('role', 'status');
  const problems = el('ul', 'metadata-problems');
  problems.setAttribute('aria-live', 'polite');
  const apply = button('Apply', () => {
    if (apply.disabled) return;
    pending = true;
    error = '';
    refresh();
    host.apply(metaOf(draft));
  });
  const reset = (): void => {
    baseline = valuesOf(input.meta);
    draft = baseline;
    conflict = false;
    error = '';
    render();
  };
  const cancel = button('Cancel', reset);
  const reload = button('Reload properties', reset);
  const actions = el('div', 'metadata-actions');
  actions.append(apply, cancel, reload);
  details.append(summary, content);
  root.replaceChildren(details);
  root.setAttribute('aria-label', 'Document properties');

  function refresh(): void {
    form.disabled = !input.editable || pending;
    apply.disabled = !input.editable || pending || conflict || !dirty();
    cancel.disabled = pending || (!dirty() && !conflict && error === '');
    reload.hidden = !conflict;
    reload.disabled = pending;
    status.textContent = pending
      ? 'Applying properties...'
      : conflict
        ? 'The document or project settings changed. Reload properties to discard this draft, or Cancel.'
        : error ||
          (!input.editable
            ? 'Properties are read-only while the project is checked.'
            : dirty()
              ? 'Draft changes. Apply updates the buffer; Save writes the file.'
              : 'No draft changes.');
    problems.replaceChildren(
      ...validateMetadata(metaOf(draft), { fields: input.fields }).map((issue) =>
        el('li', issue.severity, `${issue.severity}: ${issue.message}`),
      ),
    );
  }

  function set(name: string, value: MetaValue): void {
    draft = { ...draft, [name]: value };
    error = '';
    refresh();
  }

  function remove(name: string): void {
    draft = Object.fromEntries(Object.entries(draft).filter(([field]) => field !== name));
    render();
  }

  function inherited(): Values {
    return {
      ...(input.defaults.authors !== undefined ? { authors: input.defaults.authors } : {}),
      ...(input.defaults.classification !== undefined
        ? { classification: input.defaults.classification }
        : {}),
      ...(input.defaults.pageTemplate !== undefined
        ? { 'page-template': input.defaults.pageTemplate }
        : {}),
    };
  }

  const labelOf = (name: string): string =>
    input.fields?.get(name)?.label ?? LABELS.get(name) ?? name;
  function row(name: string): HTMLElement {
    const result = el('div', 'metadata-property');
    result.dataset['field'] = name;
    const required = input.fields?.get(name)?.required === true ? ' (required)' : '';
    const label = el('div', 'metadata-label');
    label.title = name;
    label.append(el('h4', undefined, `${labelOf(name)}${required}`));
    if (labelOf(name).toLowerCase() !== name.toLowerCase()) {
      label.append(el('small', undefined, name));
    }
    result.append(label);
    return result;
  }

  function valueEditor(name: string, value: MetaValue): HTMLElement {
    const controls = el('div', 'metadata-value');
    controls.title = typeof value === 'string' ? 'Plain text' : 'Ordered list of plain text';
    if (typeof value === 'string') {
      if (name === 'page-template') {
        const select = el('select');
        select.setAttribute('aria-label', labelOf(name));
        const names = [...new Set([value, ...input.templates])];
        select.append(
          ...names.map((entry) => option(entry, entry === '' ? '(empty text)' : entry)),
        );
        select.value = value;
        const problem = el('p', 'error', 'This page template is not defined in the stylesheet.');
        problem.hidden = input.templates.includes(value);
        select.addEventListener('change', () => {
          set(name, select.value);
          problem.hidden = input.templates.includes(select.value);
        });
        controls.append(select, problem);
      } else {
        const text = el('textarea');
        text.rows = value.includes('\n') ? 3 : 1;
        text.setAttribute('aria-label', labelOf(name));
        text.value = value;
        text.addEventListener('input', () => {
          set(name, text.value);
        });
        controls.append(text);
      }
    } else {
      const list = el('ol');
      const redraw = (): void => {
        const current = draft[name];
        if (current === undefined || typeof current === 'string') return;
        list.replaceChildren(
          ...current.map((item, index) => {
            const entry = el('li');
            const text = el('textarea');
            text.rows = item.includes('\n') ? 3 : 1;
            text.value = item;
            text.setAttribute('aria-label', `${labelOf(name)} item ${String(index + 1)}`);
            text.addEventListener('input', () => {
              const latest = draft[name];
              if (latest !== undefined && typeof latest !== 'string') {
                set(
                  name,
                  latest.map((part, at) => (at === index ? text.value : part)),
                );
              }
            });
            const removeItem = iconButton(
              '-',
              `Remove ${labelOf(name)} item ${String(index + 1)}`,
              () => {
                const latest = draft[name];
                if (latest !== undefined && typeof latest !== 'string') {
                  set(
                    name,
                    latest.filter((_, at) => at !== index),
                  );
                  redraw();
                }
              },
            );
            const itemControls = el('div', 'metadata-item');
            itemControls.append(text, removeItem);
            entry.append(itemControls);
            return entry;
          }),
        );
      };
      redraw();
      controls.append(
        list,
        iconButton('+', `Add ${labelOf(name)} item`, () => {
          const latest = draft[name];
          if (latest !== undefined && typeof latest !== 'string') {
            set(name, [...latest, '']);
            redraw();
            list.lastElementChild?.querySelector('textarea')?.focus();
          }
        }),
      );
      if (name === 'page-template')
        controls.append(
          el(
            'p',
            'error',
            'The page template must be plain text, not a list. Remove and add this property to change its type.',
          ),
        );
    }
    return controls;
  }

  function section(title: string): HTMLElement {
    const result = el('section');
    result.append(el('h3', undefined, title));
    form.append(result);
    return result;
  }

  function render(): void {
    form.replaceChildren();
    const own = section('Document values');
    const defaults = inherited();
    for (const [name, value] of Object.entries(draft)) {
      const property = row(name);
      const removeProperty = iconButton(
        '-',
        Object.hasOwn(defaults, name)
          ? `Use project default for ${labelOf(name)}`
          : `Remove ${labelOf(name)} property`,
        () => {
          remove(name);
        },
      );
      property.append(valueEditor(name, value), removeProperty);
      own.append(property);
    }
    if (Object.keys(draft).length === 0)
      own.append(el('p', undefined, 'No explicit document values.'));
    const inheritedValues = section('Inherited values');
    inheritedValues.append(el('small', 'metadata-origin', 'From stanza.yaml defaults'));
    for (const [name, value] of Object.entries(defaults)) {
      if (Object.hasOwn(draft, name)) continue;
      const property = row(name);
      const shown = el('div', 'metadata-value');
      shown.title = 'From stanza.yaml defaults';
      shown.append(showValue(value));
      property.append(
        shown,
        iconButton('+', `Override ${labelOf(name)}`, () => {
          set(name, value);
          render();
        }),
      );
      inheritedValues.append(property);
    }
    const missing = section('Known fields not set');
    const names = [...new Set([...BUILTINS, ...(input.fields?.keys() ?? [])])];
    for (const name of names) {
      if (Object.hasOwn(draft, name) || Object.hasOwn(defaults, name)) continue;
      const property = row(name);
      property.append(
        iconButton('+', `Add ${labelOf(name)}`, () => {
          const value =
            name === 'authors' || input.fields?.get(name)?.type === 'list'
              ? []
              : name === 'page-template'
                ? (input.templates[0] ?? '')
                : '';
          set(name, value);
          render();
          form
            .querySelector<HTMLElement>(
              `[data-field="${name}"] textarea, [data-field="${name}"] select, [data-field="${name}"] .metadata-value button`,
            )
            ?.focus();
        }),
      );
      missing.append(property);
    }
    const custom = section('Add custom property');
    const key = el('input');
    key.setAttribute('aria-label', 'Custom property name');
    key.placeholder = 'property-name';
    const type = el('select');
    type.setAttribute('aria-label', 'Custom property type');
    type.append(option('string', 'Text'), option('list', 'List of text'));
    const customControls = el('div', 'metadata-custom-row');
    customControls.append(
      key,
      type,
      iconButton('+', 'Add custom property', () => {
        const name = key.value;
        if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name) || HARDCODED_FIELD_NAMES.includes(name)) {
          error = 'Use a non-reserved kebab-case property name.';
        } else if (Object.hasOwn(draft, name) || input.fields?.has(name) === true) {
          error = 'This property already exists or is listed under known fields.';
        } else {
          set(name, type.value === 'list' ? [] : '');
          render();
          return;
        }
        refresh();
      }),
    );
    custom.append(customControls);
    custom.append(
      el(
        'small',
        undefined,
        input.fields === undefined
          ? 'This project accepts ad hoc text and list properties.'
          : 'Undeclared properties warn. Adding a value does not change the project declarations.',
      ),
    );
    custom.append(button('Open project metadata definition', host.openProject));
    const system = el('section');
    system.append(
      el('h3', undefined, 'System and generated values (read-only)'),
      el('p', undefined, 'stanza-format: 1 - required by Stanza'),
      el(
        'p',
        undefined,
        'Git/build version, date and revision: unavailable. Generation is not implemented yet (item 29).',
      ),
    );
    content.replaceChildren(form, system, problems, status, actions);
    refresh();
  }

  render();
  return {
    update(patch, external = false) {
      const previous = JSON.stringify([
        input.defaults,
        [...(input.fields ?? [])],
        input.fields === undefined,
        input.templates,
      ]);
      input = { ...input, ...patch };
      const current = JSON.stringify([
        input.defaults,
        [...(input.fields ?? [])],
        input.fields === undefined,
        input.templates,
      ]);
      const changed = previous !== current || (external && patch.meta !== undefined);
      if ((dirty() || pending) && changed) {
        conflict = true;
        refresh();
      } else if (!dirty() && !pending) reset();
      else refresh();
    },
    open() {
      details.open = true;
      root.scrollIntoView({ block: 'start' });
      summary.focus();
    },
    complete(result) {
      pending = false;
      if (result.ok) {
        input = { ...input, meta: result.meta };
        reset();
      } else {
        error = result.message;
        refresh();
      }
    },
  };
}
