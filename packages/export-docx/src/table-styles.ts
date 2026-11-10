import {
  resolveTableStyle,
  type Border,
  type ColorValue,
  type StyleName,
  type Stylesheet,
  type TextProps,
} from '@phrase/core';
import { colorHex, fontFamily } from './docx-props.js';
import { wordStyleId, wordStyleName } from './style-ids.js';

const NAMESPACE = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

const twips = (pt: number): number => Math.round(pt * 20);

function escape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

/** A border side; `sz` is in eighths of a point. */
function side(tag: string, border: Border | undefined, stylesheet: Stylesheet): string {
  const color = border === undefined ? undefined : colorHex(stylesheet.tokens, border.color);
  if (border === undefined || color === undefined) return '';
  const size = String(Math.max(2, Math.round(border.widthPt * 8)));
  return `<w:${tag} w:val="single" w:sz="${size}" w:space="0" w:color="${color}"/>`;
}

/** Run properties in schema order. Bold and italic are toggles, so they are always explicit. */
function runPropertiesXml(text: TextProps, stylesheet: Stylesheet): string {
  const tokens = stylesheet.tokens;
  const family = text.font === undefined ? undefined : fontFamily(tokens, text.font);
  const color = text.color === undefined ? undefined : colorHex(tokens, text.color);
  const highlight = text.highlight === undefined ? undefined : colorHex(tokens, text.highlight);
  const flag = (tag: string, on: boolean | undefined): string =>
    on === undefined ? '' : on ? `<w:${tag}/>` : `<w:${tag} w:val="0"/>`;
  const parts = [
    family === undefined
      ? ''
      : `<w:rFonts w:ascii="${escape(family)}" w:hAnsi="${escape(family)}" w:eastAsia="${escape(family)}" w:cs="${escape(family)}"/>`,
    flag('b', text.bold),
    flag('bCs', text.bold),
    flag('i', text.italic),
    flag('iCs', text.italic),
    color === undefined ? '' : `<w:color w:val="${color}"/>`,
    text.sizePt === undefined ? '' : `<w:sz w:val="${String(Math.round(text.sizePt * 2))}"/>`,
    text.sizePt === undefined ? '' : `<w:szCs w:val="${String(Math.round(text.sizePt * 2))}"/>`,
    text.underline === undefined ? '' : `<w:u w:val="${text.underline ? 'single' : 'none'}"/>`,
    highlight === undefined ? '' : `<w:shd w:val="clear" w:color="auto" w:fill="${highlight}"/>`,
  ].join('');
  return parts === '' ? '' : `<w:rPr>${parts}</w:rPr>`;
}

function tableStyleXml(name: StyleName, stylesheet: Stylesheet): string {
  const style = resolveTableStyle(stylesheet, name);
  if (style === undefined) return '';
  const border = style.border;
  const borders = [
    side('top', border?.outer, stylesheet),
    side('left', border?.outer, stylesheet),
    side('bottom', border?.outer, stylesheet),
    side('right', border?.outer, stylesheet),
    side('insideH', border?.insideHorizontal, stylesheet),
    side('insideV', border?.insideVertical, stylesheet),
  ].join('');
  const padding =
    style.cellPaddingPt === undefined ? undefined : String(twips(style.cellPaddingPt));
  const margins =
    padding === undefined
      ? ''
      : ['top', 'left', 'bottom', 'right']
          .map((tag) => `<w:${tag} w:w="${padding}" w:type="dxa"/>`)
          .join('');
  // Word counts the bands after the first row when the table look has a header row.
  const band = (type: 'band1Horz' | 'band2Horz', color: ColorValue | undefined): string => {
    const fill = color === undefined ? undefined : colorHex(stylesheet.tokens, color);
    return fill === undefined
      ? ''
      : `<w:tblStylePr w:type="${type}"><w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="${fill}"/></w:tcPr></w:tblStylePr>`;
  };
  const bands =
    band('band1Horz', style.bandedRows?.odd) + band('band2Horz', style.bandedRows?.even);

  // Word shows no bands unless the band size is written.
  const bandSize = bands === '' ? '' : '<w:tblStyleRowBandSize w:val="1"/>';
  const tblPr =
    bandSize === '' && borders === '' && margins === ''
      ? ''
      : `<w:tblPr>${bandSize}${borders === '' ? '' : `<w:tblBorders>${borders}</w:tblBorders>`}${margins === '' ? '' : `<w:tblCellMar>${margins}</w:tblCellMar>`}</w:tblPr>`;

  const header = style.headerRow;
  const background =
    header?.background === undefined ? undefined : colorHex(stylesheet.tokens, header.background);
  const firstRow =
    header === undefined
      ? ''
      : `<w:tblStylePr w:type="firstRow">${runPropertiesXml(header.text, stylesheet)}${
          background === undefined
            ? ''
            : `<w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="${background}"/></w:tcPr>`
        }</w:tblStylePr>`;

  // Resolved values are written without `basedOn`, since Word's merging of inherited borders is unclear.
  return (
    `<w:style w:type="table" w:customStyle="1" w:styleId="${wordStyleId(name)}">` +
    `<w:name w:val="${escape(wordStyleName(name, stylesheet.tableStyles.get(name)?.label))}"/><w:basedOn w:val="TableNormal"/>` +
    `<w:uiPriority w:val="59"/>${tblPr}${bands}${firstRow}</w:style>`
  );
}

/** The `externalStyles` part of the package: every declared table style. */
export function tableStylesXml(stylesheet: Stylesheet): string {
  const styles = [...stylesheet.tableStyles.keys()]
    .map((name) => tableStyleXml(name, stylesheet))
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="${NAMESPACE}">${styles}</w:styles>`;
}
