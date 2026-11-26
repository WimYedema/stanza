import { isStyleName } from '@stanza/core';
import { coverSource, setBlock, setProperty, type StylesheetEdit } from '@stanza/format';
import {
  importCoverTemplate,
  type CoverTemplateImport,
  type ImportedBorder,
  type ImportedParagraphStyle,
  type ImportedTableStyle,
} from '@stanza/import-docx';
import { loadProjectConfiguration } from './load.js';
import type { ProjectStorage } from './storage.js';

export interface ImportCoverOptions {
  /** The name of the page template; by default the file name in kebab-case. */
  readonly name?: string;
  /** The name of the Word file without its extension, for the default name. */
  readonly fileName: string;
}

export type ImportCoverResult =
  | {
      readonly ok: true;
      readonly template: string;
      /** The stylesheet and the images, relative to the project root. */
      readonly written: readonly string[];
      readonly result: CoverTemplateImport;
    }
  | { readonly ok: false; readonly message: string };

const kebab = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const quoted = (text: string): string => `'${text.replaceAll("'", "''")}'`;
const indent = (lines: readonly string[]): string[] =>
  lines.map((line) => (line === '' ? line : `  ${line}`));

/** The lines of a paragraph style, in the keys of the stylesheet (ADR 0006). */
function paragraphStyleLines(style: ImportedParagraphStyle): string[] {
  const spacing = style.lineSpacing;
  return [
    ...(style.font !== undefined ? [`font: ${style.font}`] : []),
    ...(style.sizePt !== undefined ? [`size: ${String(style.sizePt)}`] : []),
    ...(style.bold === true ? ['bold: true'] : []),
    ...(style.italic === true ? ['italic: true'] : []),
    ...(style.color !== undefined ? [`color: ${style.color}`] : []),
    ...(style.alignment !== undefined ? [`alignment: ${style.alignment}`] : []),
    ...(style.spaceBeforePt !== undefined ? [`space-before: ${String(style.spaceBeforePt)}`] : []),
    ...(style.spaceAfterPt !== undefined ? [`space-after: ${String(style.spaceAfterPt)}`] : []),
    ...(spacing === undefined
      ? []
      : [
          `line-spacing: { ${
            spacing.rule === 'multiple'
              ? `multiple: ${String(spacing.factor)}`
              : `${spacing.rule}: ${String(spacing.pt)}`
          } }`,
        ]),
    ...(style.indentLeftPt !== undefined ? [`indent-left: ${String(style.indentLeftPt)}`] : []),
  ];
}

const borderText = (border: ImportedBorder): string =>
  `{ width: ${String(border.widthPt)}, color: ${border.color} }`;

function tableStyleLines(style: ImportedTableStyle): string[] {
  const borders = [
    ...(style.outer !== undefined ? [`outer: ${borderText(style.outer)}`] : []),
    ...(style.insideHorizontal !== undefined
      ? [`inside-horizontal: ${borderText(style.insideHorizontal)}`]
      : []),
    ...(style.insideVertical !== undefined
      ? [`inside-vertical: ${borderText(style.insideVertical)}`]
      : []),
  ];
  return [
    `cell-style: ${style.cellStyle}`,
    ...(borders.length > 0 ? ['border:', ...indent(borders)] : []),
    ...(style.cellPaddingPt !== undefined ? [`cell-padding: ${String(style.cellPaddingPt)}`] : []),
  ];
}

/** The lines of the new page template: its page and its cover (ADR 0094). */
function templateLines(result: CoverTemplateImport): string[] {
  const { margins } = result;
  // A header or footer of the body pages, as a grid with its distance (ADR 0095).
  const band = (kind: 'header' | 'footer'): string[] => {
    const spec = result[kind];
    if (spec?.grid === undefined) return [];
    return [
      `${kind}:`,
      ...indent([
        ...(spec.distancePt !== undefined ? [`distance: ${String(spec.distancePt)}`] : []),
        ...coverSource(spec.grid).split('\n'),
      ]),
    ];
  };
  return [
    `size: ${result.size}`,
    `margins: { top: ${String(margins.topPt)}, right: ${String(margins.rightPt)}, bottom: ${String(margins.bottomPt)}, left: ${String(margins.leftPt)} }`,
    ...band('header'),
    ...band('footer'),
    'cover:',
    ...indent(coverSource(result.cover).split('\n')),
  ];
}

/** Applies the edits in order, and stops at the first that is refused. */
function applyAll(
  text: string,
  edits: readonly ((text: string) => StylesheetEdit)[],
): StylesheetEdit {
  let current = text;
  for (const edit of edits) {
    const next = edit(current);
    if (!next.ok) return next;
    current = next.text;
  }
  return { ok: true, text: current };
}

/**
 * Imports the cover of a Word template into a project (ADR 0094): a new page template with the
 * cover, the styles and tokens it needs, and its images in `assets/<template>/`. Nothing is
 * replaced: a template of the name that exists already is a refusal, and so is a stylesheet edit
 * that would make an error. Nothing is written unless all of it can be.
 */
export async function importCover(
  storage: ProjectStorage,
  bytes: Uint8Array,
  options: ImportCoverOptions,
): Promise<ImportCoverResult> {
  const configuration = await loadProjectConfiguration(storage);
  const { settings, stylesheet, stylesheetText } = configuration;
  if (settings === undefined || stylesheet === undefined || stylesheetText === undefined) {
    return {
      ok: false,
      message: 'The project file or the stylesheet cannot be read or has errors; fix them first.',
    };
  }
  const name = options.name ?? (kebab(options.fileName) || 'imported');
  if (!isStyleName(name)) {
    return { ok: false, message: `"${name}" is not a name for a page template: use kebab-case.` };
  }
  if (stylesheet.pageTemplates.has(name)) {
    return {
      ok: false,
      message: `The stylesheet has a page template "${name}" already; give another with --name.`,
    };
  }
  const imported = importCoverTemplate(bytes, {
    name,
    assetsDirectory: `assets/${name}`,
    colors: stylesheet.tokens.colors,
    fonts: stylesheet.tokens.fonts,
  });
  if (!imported.ok) return imported;
  const result = imported.result;
  const taken = [
    ...result.paragraphStyles.map((style) => style.name),
    ...result.tableStyles.map((style) => style.name),
  ].find((style) =>
    [...stylesheet.paragraphStyles.keys(), ...stylesheet.tableStyles.keys()].some(
      (existing) => existing === style,
    ),
  );
  if (taken !== undefined) {
    return {
      ok: false,
      message: `The stylesheet has a style "${taken}" already; give another name with --name.`,
    };
  }
  const template = templateLines(result).join('\n');
  const edits = [
    ...result.colors.map(
      ([token, hex]) =>
        (text: string) =>
          setProperty(text, ['tokens', 'colors', token], hex),
    ),
    ...result.fonts.map(
      ([token, families]) =>
        (text: string) =>
          setProperty(text, ['tokens', 'fonts', token], families),
    ),
    ...result.paragraphStyles.map(
      (style) => (text: string) =>
        setBlock(text, ['paragraph-styles', style.name], paragraphStyleLines(style).join('\n')),
    ),
    ...result.tableStyles.map(
      (style) => (text: string) =>
        setBlock(text, ['table-styles', style.name], tableStyleLines(style).join('\n')),
    ),
    (text: string) => {
      const added = setBlock(text, ['page-templates', name], template);
      if (added.ok || added.code !== 'invalid-path') return added;
      // A stylesheet without page templates gets the section with this one.
      return setBlock(
        text,
        ['page-templates'],
        [`${name}:`, ...indent(template.split('\n'))].join('\n'),
      );
    },
  ];
  const edited = applyAll(stylesheetText, edits);
  if (!edited.ok) {
    return {
      ok: false,
      message: `The cover could not be added to the stylesheet: ${edited.message}`,
    };
  }
  for (const image of result.images) await storage.writeFile(image.path, image.bytes);
  await storage.writeText(settings.stylesheet, edited.text);
  return {
    ok: true,
    template: name,
    written: [settings.stylesheet, ...result.images.map((image) => image.path)],
    result,
  };
}

/** Lines for a person: what was imported, and the fields that the project file should declare. */
export function describeCoverImport(imported: ImportCoverResult & { ok: true }): string[] {
  const { result } = imported;
  return [
    ...result.converted.map((line) => `converted: ${line}`),
    ...result.approximated.map((line) => `approximated: ${line}`),
    ...result.leftOut.map((line) => `left out: ${line}`),
    ...(result.fields.length > 0
      ? [
          `declare in the project file (metadata-fields): ${result.fields.join(', ')}`,
          `use the template in a document with: page-template: ${quoted(imported.template)}`,
        ]
      : [`use the template in a document with: page-template: ${quoted(imported.template)}`]),
  ];
}
