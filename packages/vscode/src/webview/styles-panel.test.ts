// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_VARIANTS, parseStylesheet } from '@phrase/format';
import type { StylesWebviewMessage } from '../shared/styles-protocol.js';
import { entriesOf, type Entry } from './styles-families.js';
import { createPanel, type Panel } from './styles-panel.js';

const stylesheet = parseStylesheet(`phrase-format: 1
tokens:
  colors:
    brand: '#2E75B6'
    rule: '#BFBFBF'
    pale: '#F2F2F2'
  fonts:
    body: ['Calibri', 'Arial']
paragraph-styles:
  body:
    font: body
    size: 11
    space-after: 6
    line-spacing: { multiple: 1.15 }
    variants:
      strong: { bold: true }
  heading-1:
    label: Title
    based-on: body
    size: 18
    bold: true
    variants:
      strong: false
      emphasis: { italic: true }
  list-bulleted:
    based-on: body
    indent-left: 36
    first-line-indent: -18
character-styles:
  quote:
    italic: true
    label: Quotation
  loud-quote:
    based-on: quote
    bold: true
table-styles:
  table:
    cell-style: body
    cell-padding: 4
    border:
      outer: { width: 0.75, color: brand }
      inside-horizontal: { width: 0.5, color: rule }
    header-row:
      bold: true
      repeat: true
    banded-rows:
      odd: pale
  table-grid:
    based-on: table
    border:
      inside-vertical: { width: 0.5, color: brand }
`).stylesheet;

const entry = (name: string): Entry => {
  const found = entriesOf(stylesheet).find((candidate) => candidate.name === name);
  if (found === undefined) throw new Error(`No entry ${name}.`);
  return found;
};

let root: HTMLElement;
let panel: Panel;
const send = vi.fn<(message: StylesWebviewMessage) => void>();
const openToken = vi.fn<(kind: 'color' | 'font', name: string) => void>();

beforeEach(() => {
  root = document.createElement('div');
  document.body.append(root);
  send.mockClear();
  openToken.mockClear();
  panel = createPanel({ root, send, openToken });
  panel.show(entry('heading-1'), stylesheet);
});
afterEach(() => {
  document.body.replaceChildren();
});

const rowOf = (title: string): HTMLElement => {
  const found = [...root.querySelectorAll<HTMLElement>('.row')].find(
    (candidate) => candidate.querySelector('.title')?.textContent === title,
  );
  if (found === undefined) throw new Error(`No row ${title}.`);
  return found;
};
interface Controls {
  readonly input: HTMLInputElement;
  readonly select: HTMLSelectElement;
  readonly '.reset': HTMLButtonElement;
}
const control = <K extends keyof Controls>(title: string, selector: K): Controls[K] => {
  const found = rowOf(title).querySelector(selector);
  if (found === null) throw new Error(`No ${selector} in ${title}.`);
  return found as Controls[K];
};
const change = (node: HTMLInputElement | HTMLSelectElement, value: string): void => {
  node.value = value;
  node.dispatchEvent(new Event('change'));
};

describe('showing a paragraph style', () => {
  it('has a row for the label, the base and each property, and is shown', () => {
    expect(root.hidden).toBe(false);
    for (const title of ['Label', 'Based on', 'Font', 'Size', 'Bold', 'Space after', 'Alignment']) {
      expect(() => rowOf(title)).not.toThrow();
    }
  });

  it('is hidden for anything but a style', () => {
    panel.show(entry('brand'), stylesheet);
    expect(root.hidden).toBe(true);
    panel.show(undefined, stylesheet);
    expect(root.hidden).toBe(true);
  });

  it('shows what the style sets, with a button to take it off', () => {
    expect(control('Size', 'input').value).toBe('18');
    expect(control('Size', '.reset').hidden).toBe(false);
    expect(control('Label', 'input').value).toBe('Title');
    expect(control('Based on', 'select').value).toBe('body');
  });

  it('shows what comes from a base in the place of a value, and says from which', () => {
    const input = control('Space after', 'input');
    expect(input.value).toBe('');
    expect(input.placeholder).toBe('6 pt');
    expect(control('Space after', '.reset').hidden).toBe(true);
    expect(rowOf('Space after').querySelector('.note')?.textContent).toBe('from body');
  });

  it('shows a flag as yes, no or what the base gives', () => {
    expect(control('Bold', 'select').value).toBe('true');
    expect(control('Italic', 'select').value).toBe('');
    expect(control('Italic', 'select').options[0]?.textContent).toBe('(not set)');
  });

  it('shows the line spacing of the base', () => {
    const select = control('Line spacing', 'select');
    expect(select.value).toBe('');
    expect(select.options[0]?.textContent).toBe('(from base: 1.15 lines)');
  });

  it('offers the tokens of the theme for colors and fonts, and says where they come from', () => {
    const options = (title: string): (string | undefined)[] =>
      [...control(title, 'select').options].slice(1).map((o) => o.value);
    expect(options('Color')).toEqual(['brand', 'rule', 'pale']);
    expect(options('Font')).toEqual(['body']);
    expect(root.querySelector('.hint')?.textContent).toContain('theme');
  });

  it('shows a font token with a sample in its families, and the token it comes from', () => {
    expect(control('Font', 'select').value).toBe('');
    expect(control('Font', 'select').options[0]?.textContent).toBe('(from base: body)');
    const sample = rowOf('Font').querySelector<HTMLElement>('.sample');
    expect(sample?.style.fontFamily).toBe('"Calibri", "Arial"');
    expect(rowOf('Font').querySelector('.note')?.textContent).toBe('from body \u00b7 Theme: body');
    panel.show(entry('body'), stylesheet);
    expect(control('Font', 'select').value).toBe('body');
    expect(rowOf('Font').querySelector('.note')?.textContent).toBe('Theme: body');
  });

  it('shows what the file says again after an undo, also in the control that has the focus', () => {
    const input = control('Size', 'input');
    input.focus();
    change(input, '20');
    panel.show(entry('heading-1'), stylesheet);
    expect(input.value).toBe('18');
    expect(document.activeElement).toBe(input);
  });
});

describe('showing a character style', () => {
  const path = (...keys: string[]): string[] => ['character-styles', 'loud-quote', ...keys];

  beforeEach(() => {
    panel.show(entry('loud-quote'), stylesheet);
  });

  it('has the label, the base and the text properties, and nothing of paragraphs or marks', () => {
    expect(root.hidden).toBe(false);
    const sections = [...root.querySelectorAll('section > details > summary')].map(
      (node) => node.textContent,
    );
    expect(sections).toEqual(['Style', 'Text']);
    expect(() => rowOf('Bold')).not.toThrow();
    expect(() => rowOf('Space after')).toThrow();
  });

  it('shows what it sets and what its base gives', () => {
    expect(control('Bold', 'select').value).toBe('true');
    expect(control('Italic', 'select').value).toBe('');
    expect(rowOf('Italic').querySelector('.note')?.textContent).toBe('from quote');
    expect(control('Based on', 'select').value).toBe('quote');
  });

  it('offers only character styles as a base', () => {
    const names = [...control('Based on', 'select').options].map((o) => o.value);
    expect(names).toEqual(['', 'quote']);
  });

  it('sends changes with the path of a character style', () => {
    change(control('Size', 'input'), '9');
    expect(send).toHaveBeenLastCalledWith({ type: 'set', path: path('size'), value: 9 });
    control('Bold', '.reset').click();
    expect(send).toHaveBeenLastCalledWith({ type: 'unset', path: path('bold') });
  });

  it('is built again for a paragraph style of the same name', () => {
    panel.show(entry('heading-1'), stylesheet);
    expect(
      [...root.querySelectorAll('section > details > summary')].map((node) => node.textContent),
    ).toContain('Marks');
  });
});

describe('showing a table style', () => {
  const path = (name: string, ...keys: string[]): string[] => ['table-styles', name, ...keys];
  const inputs = (title: string): (HTMLInputElement | HTMLSelectElement)[] => [
    ...rowOf(title).querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select'),
  ];
  const titles = (): (string | null)[] =>
    [...root.querySelectorAll('section > details > summary')].map((node) => node.textContent);

  beforeEach(() => {
    panel.show(entry('table'), stylesheet);
  });

  it('says that it is shown, and is not for a theme entry', () => {
    expect(panel.show(entry('table'), stylesheet)).toBe(true);
    expect(panel.show(entry('brand'), stylesheet)).toBe(false);
    expect(root.hidden).toBe(true);
  });

  it('has the groups of a table style and nothing of text or marks', () => {
    expect(titles()).toEqual(['Style', 'Table', 'Borders', 'Header row', 'Banded rows']);
  });

  it('shows the cell style, the padding and the borders it sets', () => {
    expect(control('Cell style', 'select').value).toBe('body');
    expect(control('Cell padding', 'input').value).toBe('4');
    expect(inputs('Outer').map((input) => input.value)).toEqual(['0.75', 'brand']);
    expect(inputs('Inside horizontal').map((input) => input.value)).toEqual(['0.5', 'rule']);
    expect(inputs('Inside vertical').map((input) => input.value)).toEqual(['', '']);
  });

  it('shows the header row properties', () => {
    expect(control('Bold', 'select').value).toBe('true');
    expect(control('Repeat', 'select').value).toBe('true');
    expect(control('Italic', 'select').value).toBe('');
  });

  it('shows the colors of the banded rows, and where the even one comes from', () => {
    expect(control('Odd', 'select').value).toBe('pale');
    expect(rowOf('Odd').querySelector<HTMLElement>('.swatch')?.style.background).toBe(
      'rgb(242, 242, 242)',
    );
    expect(control('Even', 'select').value).toBe('');
    panel.show(entry('table-grid'), stylesheet);
    expect(control('Odd', 'select').value).toBe('');
    expect(control('Odd', 'select').options[0]?.textContent).toBe('(from base: pale)');
    expect(rowOf('Odd').textContent).toContain('from table');
  });

  it('sends changes of the banded rows and takes one off', () => {
    change(control('Even', 'select'), 'brand');
    expect(send).toHaveBeenLastCalledWith({
      type: 'set',
      path: path('table', 'banded-rows', 'even'),
      value: 'brand',
    });
    control('Odd', '.reset').click();
    expect(send).toHaveBeenLastCalledWith({
      type: 'unset',
      path: path('table', 'banded-rows', 'odd'),
    });
  });

  it('offers the paragraph styles for the cell style and the other table styles as a base', () => {
    expect([...control('Cell style', 'select').options].map((o) => o.value)).toContain('body');
    expect([...control('Based on', 'select').options].map((o) => o.value)).toEqual([
      '',
      'table-grid',
    ]);
  });

  it('shows a border from the base as a whole, with where it comes from', () => {
    panel.show(entry('table-grid'), stylesheet);
    const [width, color] = inputs('Outer');
    expect(width?.value).toBe('');
    expect((width as HTMLInputElement | undefined)?.placeholder).toBe('0.75');
    expect((color as HTMLSelectElement | undefined)?.options[0]?.textContent).toBe(
      '(from base: brand)',
    );
    expect(rowOf('Outer').querySelector('.note')?.textContent).toBe('from table');
    expect(control('Cell padding', '.reset').hidden).toBe(true);
    expect(inputs('Inside vertical').map((input) => input.value)).toEqual(['0.5', 'brand']);
  });

  it('sends the whole border when the width or the color changes', () => {
    const [width, color] = inputs('Outer');
    if (width === undefined || color === undefined) throw new Error('No inputs.');
    change(width, '1');
    expect(send).toHaveBeenLastCalledWith({
      type: 'set',
      path: path('table', 'border', 'outer'),
      value: { width: 1, color: 'brand' },
    });
    change(color, 'rule');
    expect(send).toHaveBeenLastCalledWith({
      type: 'set',
      path: path('table', 'border', 'outer'),
      value: { width: 1, color: 'rule' },
    });
  });

  it('fills the other half of a border from its base, or from a default', () => {
    panel.show(entry('table-grid'), stylesheet);
    const [width] = inputs('Outer');
    if (width === undefined) throw new Error('No input.');
    change(width, '2');
    expect(send).toHaveBeenLastCalledWith({
      type: 'set',
      path: path('table-grid', 'border', 'outer'),
      value: { width: 2, color: 'brand' },
    });
    const [, color] = inputs('Inside horizontal');
    if (color === undefined) throw new Error('No input.');
    change(color, 'brand');
    expect(send).toHaveBeenLastCalledWith({
      type: 'set',
      path: path('table-grid', 'border', 'inside-horizontal'),
      value: { width: 0.5, color: 'brand' },
    });
  });

  it('takes a border that the style has off when a field is emptied or the width is 0', () => {
    const outer = path('table', 'border', 'outer');
    for (const [which, value] of [
      [0, ''],
      [0, '0'],
      [1, ''],
    ] as const) {
      panel.show(entry('table'), stylesheet);
      send.mockClear();
      const field = inputs('Outer')[which];
      if (field === undefined) throw new Error('No input.');
      change(field, value);
      expect(send).toHaveBeenCalledOnce();
      expect(send).toHaveBeenLastCalledWith({ type: 'unset', path: outer });
    }
  });

  it('takes a border off when both are emptied, and with the button', () => {
    const [width, color] = inputs('Outer');
    if (width === undefined || color === undefined) throw new Error('No inputs.');
    width.value = '';
    change(color, '');
    expect(send).toHaveBeenLastCalledWith({
      type: 'unset',
      path: path('table', 'border', 'outer'),
    });
    control('Outer', '.reset').click();
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('sends changes of the cell style, the padding and the header row', () => {
    change(control('Cell style', 'select'), 'list-bulleted');
    expect(send).toHaveBeenLastCalledWith({
      type: 'set',
      path: path('table', 'cell-style'),
      value: 'list-bulleted',
    });
    change(control('Cell padding', 'input'), '6');
    expect(send).toHaveBeenLastCalledWith({
      type: 'set',
      path: path('table', 'cell-padding'),
      value: 6,
    });
    change(control('Bold', 'select'), '');
    expect(send).toHaveBeenLastCalledWith({
      type: 'unset',
      path: path('table', 'header-row', 'bold'),
    });
    change(control('Repeat', 'select'), 'false');
    expect(send).toHaveBeenLastCalledWith({
      type: 'set',
      path: path('table', 'header-row', 'repeat'),
      value: false,
    });
  });
});

describe('collapsing', () => {
  const groups = (): HTMLDetailsElement[] => [
    ...root.querySelectorAll<HTMLDetailsElement>('section > details'),
  ];
  const groupOf = (title: string): HTMLDetailsElement => {
    const found = groups().find((node) => node.querySelector('summary')?.textContent === title);
    if (found === undefined) throw new Error(`No group ${title}.`);
    return found;
  };
  const toggle = (node: HTMLDetailsElement, open: boolean): void => {
    node.open = open;
    node.dispatchEvent(new Event('toggle'));
  };

  it('opens the groups, and closes the properties of the marks', () => {
    expect(groups().every((node) => node.open)).toBe(true);
    const variants = [...root.querySelectorAll<HTMLDetailsElement>('details.variant')];
    expect(variants).toHaveLength(4);
    expect(variants.every((node) => !node.open)).toBe(true);
    expect(variants[1]?.querySelector('summary')?.textContent).toBe('Properties of emphasis');
  });

  it('keeps a group closed when another style is selected', () => {
    toggle(groupOf('Text'), false);
    panel.show(entry('body'), stylesheet);
    expect(groupOf('Text').open).toBe(false);
    expect(groupOf('Flow').open).toBe(true);
    panel.show(entry('loud-quote'), stylesheet);
    expect(groupOf('Text').open).toBe(false);
  });

  it('keeps the properties of a mark open when another style is selected', () => {
    const emphasis = (): HTMLDetailsElement | undefined =>
      root.querySelectorAll<HTMLDetailsElement>('details.variant')[1];
    const first = emphasis();
    if (first === undefined) throw new Error('No variant.');
    toggle(first, true);
    panel.show(entry('list-bulleted'), stylesheet);
    expect(emphasis()?.open).toBe(true);
  });

  it('keeps the text of a header row closed in a group of its own', () => {
    panel.show(entry('table'), stylesheet);
    const text = root.querySelector<HTMLDetailsElement>('details.subgroup');
    expect(text?.querySelector('summary')?.textContent).toBe('Text');
    expect(text?.open).toBe(false);
    expect(groupOf('Header row').contains(text)).toBe(true);
    expect(text?.querySelectorAll('.row')).toHaveLength(7);
  });
});

describe('the groups of a family', () => {
  const sectionTitles = (): (string | null | undefined)[] =>
    [...root.querySelectorAll('section')].map(
      (node) => node.querySelector('details > summary')?.textContent,
    );
  const sectionOf = (title: string): HTMLElement => {
    const found = [...root.querySelectorAll('section')].find(
      (node) => node.querySelector('details > summary')?.textContent === title,
    );
    if (found === undefined) throw new Error(`No section ${title}.`);
    return found;
  };

  it('has a Numbering group with the numbering hint for a heading', () => {
    expect(sectionTitles()).toEqual([
      'Style',
      'Text',
      'Spacing and alignment',
      'Flow',
      'Numbering',
      'Marks',
    ]);
    expect(sectionOf('Numbering').querySelector('.hint')?.textContent).toContain('1.1');
    expect(sectionOf('Numbering').querySelector('.title')?.textContent).toBe('Numbered');
  });

  it('has the indents of a list in a group of their own, with the hint', () => {
    panel.show(entry('list-bulleted'), stylesheet);
    expect(sectionTitles()[2]).toBe('List indents');
    const indents = [...sectionOf('List indents').querySelectorAll('.title')].map(
      (node) => node.textContent,
    );
    expect(indents).toEqual(['Indent left', 'First line indent']);
    expect(sectionOf('List indents').querySelector('.hint')?.textContent).toContain('(n + 1)');
    expect(sectionOf('Spacing and alignment').textContent).not.toContain('Indent left');
  });

  it('builds the groups again when the next style is of another family', () => {
    panel.show(entry('list-bulleted'), stylesheet);
    panel.show(entry('heading-1'), stylesheet);
    expect(sectionTitles()).toContain('Numbering');
    expect(sectionTitles()).not.toContain('List indents');
  });

  it('sends changes of a group with the path of the style', () => {
    panel.show(entry('list-bulleted'), stylesheet);
    const input = sectionOf('List indents').querySelector('input');
    if (input === null) throw new Error('No input.');
    change(input, '48');
    expect(send).toHaveBeenLastCalledWith({
      type: 'set',
      path: ['paragraph-styles', 'list-bulleted', 'indent-left'],
      value: 48,
    });
  });
});

describe('changes from the page', () => {
  const path = (...keys: string[]): string[] => ['paragraph-styles', 'heading-1', ...keys];

  it('sets a number', () => {
    change(control('Size', 'input'), '20');
    expect(send).toHaveBeenCalledWith({ type: 'set', path: path('size'), value: 20 });
  });

  it('takes the property off for an empty number, and for the button', () => {
    change(control('Size', 'input'), '');
    expect(send).toHaveBeenLastCalledWith({ type: 'unset', path: path('size') });
    control('Size', '.reset').click();
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('sets a flag, and takes it off', () => {
    change(control('Italic', 'select'), 'true');
    expect(send).toHaveBeenLastCalledWith({ type: 'set', path: path('italic'), value: true });
    change(control('Italic', 'select'), 'false');
    expect(send).toHaveBeenLastCalledWith({ type: 'set', path: path('italic'), value: false });
    change(control('Italic', 'select'), '');
    expect(send).toHaveBeenLastCalledWith({ type: 'unset', path: path('italic') });
  });

  it('sets a choice', () => {
    change(control('Alignment', 'select'), 'center');
    expect(send).toHaveBeenLastCalledWith({
      type: 'set',
      path: path('alignment'),
      value: 'center',
    });
  });

  it('sets a color and a font by picking a token', () => {
    change(control('Color', 'select'), 'brand');
    expect(send).toHaveBeenLastCalledWith({ type: 'set', path: path('color'), value: 'brand' });
    change(control('Font', 'select'), 'body');
    expect(send).toHaveBeenLastCalledWith({ type: 'set', path: path('font'), value: 'body' });
  });

  it('shows a value that is not a token as Custom, with a warning, until a token is picked', () => {
    const custom = parseStylesheet(
      `phrase-format: 1\ntokens:\n  colors:\n    brand: '#2E75B6'\nparagraph-styles:\n  body:\n    color: '#123456'\n`,
    ).stylesheet;
    panel.show(
      entriesOf(custom).find((candidate) => candidate.name === 'body'),
      custom,
    );
    const select = control('Color', 'select');
    expect(select.selectedOptions[0]?.textContent).toBe('Custom');
    expect(rowOf('Color').querySelector<HTMLElement>('.warning')?.hidden).toBe(false);
    expect(rowOf('Color').querySelector('.note')?.textContent).toBe('');
    change(select, 'brand');
    expect(send).toHaveBeenLastCalledWith({
      type: 'set',
      path: ['paragraph-styles', 'body', 'color'],
      value: 'brand',
    });
  });

  it('has no warning for a token', () => {
    panel.show(entry('body'), stylesheet);
    expect(rowOf('Font').querySelector<HTMLElement>('.warning')?.hidden).toBe(true);
  });

  it('links a font or a color to its token in the Theme tab, also when it comes from a base', () => {
    const link = (title: string): HTMLButtonElement => {
      const found = rowOf(title).querySelector<HTMLButtonElement>('.token-link');
      if (found === null) throw new Error(`No link in ${title}.`);
      return found;
    };
    expect(link('Font').hidden).toBe(false);
    expect(link('Font').title).toBe('Show the token body in the Theme tab');
    link('Font').click();
    expect(openToken).toHaveBeenLastCalledWith('font', 'body');
    panel.show(entry('table-grid'), stylesheet);
    link('Odd').click();
    expect(openToken).toHaveBeenLastCalledWith('color', 'pale');
  });

  it('has no link when nothing is set or the value is not a token', () => {
    expect(rowOf('Color').querySelector<HTMLButtonElement>('.token-link')?.hidden).toBe(true);
    const custom = parseStylesheet(
      `phrase-format: 1\ntokens:\n  colors:\n    brand: '#2E75B6'\nparagraph-styles:\n  body:\n    color: '#123456'\n`,
    ).stylesheet;
    panel.show(
      entriesOf(custom).find((candidate) => candidate.name === 'body'),
      custom,
    );
    expect(rowOf('Color').querySelector<HTMLButtonElement>('.token-link')?.hidden).toBe(true);
  });

  it('sets a line spacing with a rule and a number', () => {
    change(control('Line spacing', 'select'), 'at-least');
    expect(send).toHaveBeenLastCalledWith({
      type: 'set',
      path: path('line-spacing'),
      value: { 'at-least': expect.any(Number) as number },
    });
    change(control('Line spacing', 'input'), '14');
    expect(send).toHaveBeenLastCalledWith({
      type: 'set',
      path: path('line-spacing'),
      value: { 'at-least': 14 },
    });
  });

  it('sets the label and the base, and takes them off', () => {
    change(control('Label', 'input'), 'Chapter');
    expect(send).toHaveBeenLastCalledWith({ type: 'set', path: path('label'), value: 'Chapter' });
    change(control('Based on', 'select'), '');
    expect(send).toHaveBeenLastCalledWith({ type: 'unset', path: path('based-on') });
  });

  it('offers as a base the other styles but not the style itself', () => {
    const names = [...control('Based on', 'select').options].map((o) => o.value);
    expect(names).toEqual(['', 'body', 'list-bulleted']);
  });
});

describe('the marks', () => {
  const path = (...keys: string[]): string[] => [
    'paragraph-styles',
    'heading-1',
    'variants',
    ...keys,
  ];

  it('shows whether a mark is allowed, declared or from a base', () => {
    expect(control('Strong', 'select').value).toBe('off');
    expect(control('Emphasis', 'select').value).toBe('allow');
    expect(control('Code', 'select').value).toBe('');
    expect(control('Code', 'select').options[0]?.textContent).toBe('(not set)');
  });

  it('allows a mark with its usual variant, switches it off, and takes it off', () => {
    change(control('Code', 'select'), 'allow');
    expect(send).toHaveBeenLastCalledWith({
      type: 'set',
      path: path('code'),
      value: DEFAULT_VARIANTS.code,
    });
    change(control('Emphasis', 'select'), 'off');
    expect(send).toHaveBeenLastCalledWith({ type: 'set', path: path('emphasis'), value: false });
    change(control('Emphasis', 'select'), '');
    expect(send).toHaveBeenLastCalledWith({ type: 'unset', path: path('emphasis') });
  });

  it('shows the properties of a declared variant and hides those of the others', () => {
    const variants = [...root.querySelectorAll<HTMLElement>('.variant')];
    // strong is off, emphasis is declared, code and link are not
    expect(variants.map((node) => node.hidden)).toEqual([true, false, true, true]);
  });

  it('sets a property of a variant', () => {
    const emphasis = root.querySelectorAll<HTMLElement>('.variant')[1];
    const size = emphasis?.querySelector<HTMLInputElement>('input[type="number"]');
    if (size === null || size === undefined) throw new Error('No size in the variant.');
    change(size, '9');
    expect(send).toHaveBeenLastCalledWith({
      type: 'set',
      path: path('emphasis', 'size'),
      value: 9,
    });
  });
});

describe('a refused change', () => {
  it('says why, and clears when the next change is made', () => {
    panel.refused('The stylesheet would have an error.');
    const status = root.querySelector('.status');
    expect(status?.textContent).toBe('The stylesheet would have an error.');
    change(control('Size', 'input'), '12');
    expect(status?.textContent).toBe('');
  });
});

describe('deleting a style', () => {
  const button = (): HTMLButtonElement | null => root.querySelector('button.delete');

  it('asks the host to delete a character style or a table style', () => {
    panel.show(entry('quote'), stylesheet);
    button()?.click();
    expect(send).toHaveBeenLastCalledWith({
      type: 'delete-style',
      kind: 'character-style',
      name: 'quote',
    });
    panel.show(entry('table-grid'), stylesheet);
    button()?.click();
    expect(send).toHaveBeenLastCalledWith({
      type: 'delete-style',
      kind: 'table-style',
      name: 'table-grid',
    });
  });

  it('has no button for a style that every stylesheet needs', () => {
    for (const name of ['body', 'heading-1', 'list-bulleted', 'table']) {
      panel.show(entry(name), stylesheet);
      expect(button()).toBeNull();
    }
  });

  it('clears an old refusal when it asks again', () => {
    panel.show(entry('quote'), stylesheet);
    panel.refused('The character style "quote" was not deleted.');
    button()?.click();
    expect(root.querySelector('.status')?.textContent).toBe('');
  });
});
