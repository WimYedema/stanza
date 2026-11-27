import {
  DEFAULT_PAGE_TEMPLATE_NAME,
  SLOT_TOKENS,
  type PageSize,
  type PageTemplate,
  type Stylesheet,
} from '@stanza/core';
import { slotSource } from '@stanza/format';
import type { StylesWebviewMessage, Value } from '../shared/styles-protocol.js';
import type { CoverPreview } from './styles-cover-preview.js';
import { createCoverEditor, refuseCover } from './styles-cover.js';
import { createBandGridEditor, type BandGridEditor } from './styles-grid.js';
import { el, option, simpleRow as row, simpleSection as section } from './styles-dom.js';
import type { Entry } from './styles-families.js';
import { numberFrom } from './styles-properties.js';

/**
 * The panel of a page layout, a page template in the stylesheet (ADR 0051, ADR 0096). The Page
 * layout tab lists its two parts: the cover page (ADR 0091) and the body pages, with their size,
 * margins, header, footer and title block. The layout itself is chosen at the top of the panel.
 * Changes go to the host as edits of the text of the stylesheet.
 */

const SIZES: readonly PageSize[] = ['A4', 'Letter'];
const SIDES = ['top', 'right', 'bottom', 'left'] as const;
const SLOTS = ['left', 'center', 'right'] as const;
const BANDS = ['header', 'footer'] as const;

/** The text that stands in for a Word field in a slot, where the number is not known. */
const PLACEHOLDER_LABEL: Partial<Record<(typeof SLOT_TOKENS)[number], string>> = {
  page: '1',
  pages: '1',
};

export interface PagePanelOptions {
  readonly root: HTMLElement;
  readonly send: (message: StylesWebviewMessage) => void;
  /** Where the cover and title block of the template are drawn, if anywhere. */
  readonly preview?: CoverPreview;
}

export interface PagePanel {
  /** Shows the panel of a part of the page layout, or hides it for anything else, and says whether it is shown. */
  show(entry: Entry | undefined, stylesheet: Stylesheet): boolean;
  /** The layout of the document the style editor was opened from, which it starts on. */
  setDocumentLayout(name: string, document: string): void;
  /** A change was refused: says why, and shows the stylesheet as it is. */
  refused(message: string): void;
  /** The images of the project as data URLs by path, to choose from and to show. */
  setImages(images: ReadonlyMap<string, string>): void;
}

const titleOf = (key: string): string => key.charAt(0).toUpperCase() + key.slice(1);

export function createPagePanel({ root, send, preview }: PagePanelOptions): PagePanel {
  const covers = createCoverEditor(send, (name) => {
    preview?.select('cover', name);
  });
  const status = el('p', 'status');
  status.setAttribute('role', 'status');
  let imagePaths: readonly string[] = [];
  const bandGrids: Record<(typeof BANDS)[number], BandGridEditor> = {
    header: createBandGridEditor('header', bandOptions('header')),
    footer: createBandGridEditor('footer', bandOptions('footer')),
  };
  function bandOptions(band: (typeof BANDS)[number]): Parameters<typeof createBandGridEditor>[1] {
    return {
      send,
      images: () => imagePaths,
      listId: 'cover-images',
      refuse: (message) => {
        status.textContent = message;
      },
      selected: (name) => {
        preview?.select(band, name);
      },
    };
  }
  preview?.setEditing({
    cells(target, range, action) {
      status.textContent = '';
      if (target === 'cover') covers.cells(range, action);
      else bandGrids[target].cells(range, action);
    },
    select(target, name) {
      if (target === 'cover') covers.selectArea(name);
      else bandGrids[target].selectArea(name);
    },
  });
  let current:
    | { readonly name: string; readonly part: 'cover' | 'body'; readonly stylesheet: Stylesheet }
    | undefined;
  /** The layout chosen in the panel, and that of the document the editor was opened from. */
  let chosen: string | undefined;
  let fromDocument: { readonly name: string; readonly document: string } | undefined;

  /** The layout to show: the one chosen, or the document's, or the default, or the first. */
  const layoutOf = (stylesheet: Stylesheet): string | undefined => {
    const names = [...stylesheet.pageTemplates.keys()] as string[];
    return [chosen, fromDocument?.name, DEFAULT_PAGE_TEMPLATE_NAME, names[0]].find(
      (name) => name !== undefined && names.includes(name),
    );
  };

  const layout = el('select');
  layout.title = 'The page layout a document uses is named by page-template in its front matter';
  layout.addEventListener('change', () => {
    chosen = layout.value;
    if (current !== undefined) show(current.part, current.stylesheet);
  });
  const layoutName = el('span', 'layout-name');
  const layoutNote = el('p', 'hint');
  const layoutBox = el('div', 'layout-box');
  layoutBox.append(row('Layout', layout, layoutName), layoutNote);
  const coverNote = el('p', 'hint');
  const updates: ((template: PageTemplate, stylesheet: Stylesheet) => void)[] = [];

  const commit = (keys: readonly string[], value: Value | null): void => {
    if (current === undefined) return;
    status.textContent = '';
    const path = ['page-templates', current.name, ...keys];
    send(value === null ? { type: 'unset', path } : { type: 'set', path, value });
  };

  const size = el('select');
  size.append(...SIZES.map((value) => option(value, value)));
  size.addEventListener('change', () => {
    commit(['size'], size.value);
  });
  updates.push((template) => {
    size.value = template.size;
  });

  const margins = SIDES.map((side) => {
    const input = el('input');
    input.type = 'number';
    input.step = 'any';
    input.min = '0';
    input.addEventListener('change', () => {
      const value = numberFrom(input.value);
      if (value !== undefined) commit(['margins', side], value);
    });
    updates.push((template) => {
      input.value = String(template.margins[`${side}Pt`]);
    });
    return row(titleOf(side), input, el('span', 'unit', 'pt'));
  });

  const bandSections = BANDS.map((band) => {
    const style = el('select');
    style.addEventListener('change', () => {
      commit([band, 'style'], style.value === '' ? null : style.value);
    });
    updates.push((template, stylesheet) => {
      const own = template[band]?.style;
      style.replaceChildren(
        option('', '(body)'),
        ...[...stylesheet.paragraphStyles.keys()].map((name) => option(name, name)),
      );
      style.value = own ?? '';
    });

    const slotRows = SLOTS.map((slot) => {
      const input = el('input');
      input.type = 'text';
      const write = (): void => {
        commit([band, slot], input.value === '' ? null : input.value);
      };
      input.addEventListener('change', write);
      const insert = el('select');
      insert.title = 'Insert a value that the program fills in';
      insert.append(
        option('', 'Insert\u2026'),
        ...SLOT_TOKENS.map((token) => option(token, token)),
      );
      insert.addEventListener('change', () => {
        const token = SLOT_TOKENS.find((candidate) => candidate === insert.value);
        insert.value = '';
        if (token === undefined) return;
        const link = `[${PLACEHOLDER_LABEL[token] ?? ''}](stanza:${token})`;
        const start = input.selectionStart ?? input.value.length;
        const end = input.selectionEnd ?? start;
        input.value = input.value.slice(0, start) + link + input.value.slice(end);
        write();
      });
      updates.push((template) => {
        input.value = slotSource(template[band]?.[slot] ?? []);
      });
      const line = row(titleOf(slot), input, insert);
      line.classList.add('slot');
      return line;
    });

    // The distance from the edge of the page (ADR 0095); empty takes the default of 1.25 cm.
    const distance = el('input');
    distance.type = 'number';
    distance.step = 'any';
    distance.min = '0';
    distance.placeholder = '35.4';
    distance.addEventListener('change', () => {
      const value = numberFrom(distance.value);
      if (value === undefined) return;
      commit([band, 'distance'], value);
    });
    updates.push((template) => {
      const own = template[band]?.distancePt;
      distance.value = own === undefined ? '' : String(own);
    });

    // Three slots, or a grid of areas with a logo or several lines (ADR 0095, ADR 0096).
    const kind = el('select');
    kind.append(option('slots', 'Three slots'), option('grid', 'A grid of areas'));
    kind.addEventListener('change', () => {
      status.textContent = '';
      bandGrids[band].setKind(kind.value === 'grid' ? 'grid' : 'slots');
    });
    const gridNote = el(
      'p',
      'hint',
      'Alignment comes from the paragraph styles of the entries. Drag across the cells of the band on the page in the preview to make areas.',
    );
    const hint = el(
      'p',
      'hint',
      'Values the program fills in are written as links, such as [](stanza:title). Empty all three slots to leave the line blank.',
    );
    updates.push((template) => {
      const isGrid = template[band]?.grid !== undefined;
      kind.value = isGrid ? 'grid' : 'slots';
      gridNote.hidden = !isGrid;
      hint.hidden = isGrid;
      for (const slotRow of slotRows) slotRow.hidden = isGrid;
    });

    return section(
      titleOf(band),
      row('Kind', kind),
      hint,
      gridNote,
      row('Style', style),
      row('Distance', distance, el('span', 'unit', 'pt')),
      ...slotRows,
      bandGrids[band].element,
    );
  });

  const bodySections = [
    section('Page', row('Size', size)),
    section('Margins', ...margins),
    ...bandSections,
  ];
  root.append(status, layoutBox, coverNote, ...bodySections, covers.element);

  /** The picker of layouts, or the name of the only one, and what it is used by. */
  function drawLayouts(stylesheet: Stylesheet, name: string): void {
    const names = [...stylesheet.pageTemplates.keys()] as string[];
    const label = (each: string): string =>
      each === DEFAULT_PAGE_TEMPLATE_NAME ? `${each} (default)` : each;
    layout.replaceChildren(...names.map((each) => option(each, label(each))));
    layout.value = name;
    layout.hidden = names.length < 2;
    layoutName.textContent = names.length < 2 ? label(name) : '';
    layoutNote.textContent = [
      'These settings shape every document that uses this layout.',
      ...(fromDocument?.name === name ? [`${fromDocument.document} uses it.`] : []),
    ].join(' ');
  }

  function show(part: 'cover' | 'body', stylesheet: Stylesheet): void {
    const name = layoutOf(stylesheet);
    if (name === undefined) return;
    current = { name, part, stylesheet };
    drawLayouts(stylesheet, name);
    for (const body of bodySections) body.hidden = part !== 'body';
    covers.showPart(part);
    update();
  }

  function update(): void {
    const template = [...(current?.stylesheet.pageTemplates ?? [])].find(
      ([name]) => name === current?.name,
    )?.[1];
    if (current === undefined || template === undefined) return;
    for (const apply of updates) apply(template, current.stylesheet);
    coverNote.hidden = current.part !== 'cover';
    coverNote.textContent = `The cover page is ${template.size}, as the body pages; its margins are its own, or those of the body pages.`;
    covers.update(current.name, template, current.stylesheet);
    for (const band of BANDS) bandGrids[band].update(current.name, template, current.stylesheet);
    preview?.show(template, current.stylesheet, current.part);
  }

  return {
    show(entry, stylesheet) {
      if (entry?.kind !== 'page-part') {
        current = undefined;
        root.hidden = true;
        preview?.show(undefined, stylesheet);
        return false;
      }
      root.hidden = false;
      show(entry.name === 'cover' ? 'cover' : 'body', stylesheet);
      return true;
    },
    setDocumentLayout(name, document) {
      fromDocument = { name, document };
      chosen = undefined;
      if (current !== undefined) show(current.part, current.stylesheet);
    },
    refused(message) {
      status.textContent = message;
      update();
      refuseCover(covers, message);
      for (const band of BANDS) bandGrids[band].reset();
    },
    setImages(images) {
      imagePaths = [...images.keys()];
      covers.setImages(imagePaths);
      preview?.setImages(images);
    },
  };
}
