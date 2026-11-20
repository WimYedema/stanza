import { parseStylesheet } from '@stanza/format';

/** A stylesheet for tests of the commands: styles that offer marks, and some that offer none. */
const TEXT = `stanza-format: 1
paragraph-styles:
  body:
    variants:
      strong: { bold: true }
      emphasis: { italic: true }
      code: {}
      link: { underline: true }
  heading-1: { based-on: body }
  heading-2: { based-on: body }
  heading-3: { based-on: body }
  heading-4: { based-on: body }
  heading-5: { based-on: body }
  heading-6: {}
  code: {}
  list-bulleted: { based-on: body }
  list-numbered: {}
  plain: {}
  note: { based-on: body }
character-styles:
  marker: { bold: true }
table-styles:
  table: { cell-style: body }
  table-plain: { cell-style: plain }
`;

export const COMMANDS_STYLESHEET = parseStylesheet(TEXT);
