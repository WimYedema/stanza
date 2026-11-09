import { describe, expect, it } from 'vitest';
import type { Block, Mark } from '@phrase/core';
import { importDocx } from './import-docx.js';
import {
  HEADING_STYLES,
  buildDocx,
  item,
  numbering,
  para,
  run,
  style,
  text,
  type DocxParts,
} from './docx.testing.js';

function imported(parts: DocxParts) {
  const result = importDocx(buildDocx(parts));
  if (!result.ok) throw new Error(result.message);
  return result;
}

/** A paragraph block of plain text. */
const P = (value: string, marks: readonly Mark[] = []): Block => ({
  type: 'paragraph',
  content: [{ type: 'text', text: value, marks }],
});

const codes = (parts: DocxParts): string[] => imported(parts).report.diagnostics.map((d) => d.code);

const diagnostic = (parts: DocxParts, code: string) =>
  imported(parts).report.diagnostics.find((d) => d.code === code);

describe('paragraphs', () => {
  it('imports the text of the body paragraph by paragraph', () => {
    const lines = ['First paragraph.', 'Second paragraph, with a comma.', 'Third.'];
    const { document } = imported({ body: lines.map((line) => text(line)).join('') });
    expect(document.blocks).toEqual(lines.map((line) => P(line)));
  });

  it('drops empty paragraphs and counts them', () => {
    const parts = { body: text('One') + para('') + para(run('  ')) + text('Two') };
    expect(imported(parts).document.blocks).toEqual([P('One'), P('Two')]);
    expect(diagnostic(parts, 'empty-paragraph')?.count).toBe(2);
  });

  it('turns line breaks, tabs and no-break spaces into spaces', () => {
    const body = para(
      `<w:r><w:t>one</w:t><w:br/><w:t>two</w:t><w:tab/><w:t>three\u00a0four</w:t></w:r>`,
    );
    expect(imported({ body }).document.blocks).toEqual([P('one two three four')]);
  });

  it('ends the paragraph at two line breaks in a row, also across runs (ADR 0049)', () => {
    const body = para(
      `<w:r><w:t>one</w:t><w:br/><w:br/><w:t>two</w:t></w:r>` +
        `<w:r><w:br/></w:r><w:r><w:br/><w:t>three</w:t></w:r><w:r><w:br/><w:br/><w:br/></w:r>`,
    );
    expect(imported({ body }).document.blocks).toEqual([P('one'), P('two'), P('three')]);
  });

  it('joins the parts of a heading and keeps the parts of a list item in the item', () => {
    const split = `<w:r><w:t>a</w:t><w:br/><w:br/><w:t>b</w:t></w:r>`;
    const body =
      para(split, '<w:pStyle w:val="Heading1"/>') +
      para(split, '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>');
    const parts = { styles: HEADING_STYLES, numbering: numbering('1', 'bullet'), body };
    expect(imported(parts).document.blocks).toMatchObject([
      { type: 'heading', content: [{ text: 'a b' }] },
      {
        type: 'list',
        items: [{ blocks: [{ content: [{ text: 'a' }] }, { content: [{ text: 'b' }] }] }],
      },
    ]);
  });

  it('leaves out page breaks and counts them', () => {
    const body = para(
      `<w:r><w:t>before</w:t></w:r><w:r><w:br w:type="page"/></w:r><w:r><w:t> after</w:t></w:r>`,
    );
    const parts = { body };
    expect(imported(parts).document.blocks).toEqual([P('before after')]);
    expect(diagnostic(parts, 'page-break')?.count).toBe(1);
  });

  it('maps every style that is not a heading or a list to body, and reports the mapping', () => {
    const styles =
      style('Special', 'My Special Style', { basedOn: 'Normal' }) + style('Normal', 'Normal');
    const parts = { styles, body: text('A', 'Special') + text('B', 'Special') + text('C') };
    const { document, report } = imported(parts);
    expect(document.blocks.map((block) => block.type)).toEqual([
      'paragraph',
      'paragraph',
      'paragraph',
    ]);
    expect(report.styles).toEqual([
      { word: 'my special style', as: 'body', count: 2 },
      { word: 'normal', as: 'body', count: 1 },
    ]);
  });

  it('counts direct formatting that was left out, and keeps the text', () => {
    const body = para(run('red', '<w:color w:val="FF0000"/>'), '<w:jc w:val="center"/>');
    const parts = { body };
    expect(imported(parts).document.blocks).toEqual([P('red')]);
    expect(diagnostic(parts, 'direct-formatting')?.count).toBe(2);
  });
});

describe('headings', () => {
  it('maps Heading 1 to Heading 6 by name and takes Heading 7 as body', () => {
    const body = [1, 2, 3, 4, 5, 6, 7]
      .map((n) => text(`H${String(n)}`, `Heading${String(n)}`))
      .join('');
    const { document } = imported({ styles: HEADING_STYLES, body });
    expect(document.blocks.map((b) => (b.type === 'heading' ? b.level : b.type))).toEqual([
      1,
      2,
      3,
      4,
      5,
      6,
      'paragraph',
    ]);
  });

  it('finds the name, not the ID, so a renamed ID still maps', () => {
    const styles = style('Kop1', 'heading 1');
    const { document } = imported({ styles, body: text('Title', 'Kop1') });
    expect(document.blocks[0]).toMatchObject({ type: 'heading', level: 1 });
  });

  it('follows the styles that a style is based on', () => {
    const styles = HEADING_STYLES + style('MyHeading', 'My Heading', { basedOn: 'Heading2' });
    const body = text('One', 'Heading1') + text('Two', 'MyHeading');
    const { document } = imported({ styles, body });
    expect(document.blocks[1]).toMatchObject({ type: 'heading', level: 2 });
  });

  it('does not make the title of a table of contents a heading', () => {
    const styles = HEADING_STYLES + style('TOCHeading', 'TOC Heading', { basedOn: 'Heading1' });
    const { document } = imported({ styles, body: text('Contents', 'TOCHeading') });
    expect(document.blocks).toEqual([P('Contents')]);
  });

  it('keeps a level that skips and reports it', () => {
    const body = text('One', 'Heading1') + text('Three', 'Heading3');
    const parts = { styles: HEADING_STYLES, body };
    expect(imported(parts).document.blocks[1]).toMatchObject({ level: 3 });
    expect(diagnostic(parts, 'heading-level-skip')?.places).toEqual(['paragraph 2 under "Three"']);
  });

  it('reports typed and automatic heading numbers and keeps the text as it is', () => {
    const styles = HEADING_STYLES;
    const numbered = para(
      run('Auto'),
      '<w:pStyle w:val="Heading1"/><w:numPr><w:numId w:val="1"/></w:numPr>',
    );
    const parts = {
      styles,
      numbering: numbering('1', 'decimal'),
      body: text('1.2 Typed', 'Heading1') + numbered,
    };
    const result = imported(parts);
    expect(
      result.document.blocks.map((b) => (b.type === 'heading' ? b.content[0]?.text : '')),
    ).toEqual(['1.2 Typed', 'Auto']);
    expect(diagnostic(parts, 'heading-number')?.count).toBe(2);
  });

  it('does not take the bold of a heading style as strong', () => {
    const styles = HEADING_STYLES + style('Heading1', 'heading 1', { run: '<w:b/>' });
    const { document } = imported({ styles, body: text('Plain', 'Heading1') });
    expect(document.blocks[0]).toMatchObject({ content: [{ marks: [] }] });
  });
});

describe('lists', () => {
  const defs = numbering('1', 'bullet') + numbering('2', 'decimal');

  it('makes a bulleted and a numbered list from the numbering of the paragraph', () => {
    const body =
      item('a', '1') + item('b', '1') + text('between') + item('one', '2') + item('two', '2');
    const { document } = imported({ numbering: defs, body });
    expect(document.blocks).toEqual([
      { type: 'list', kind: 'bulleted', items: [{ blocks: [P('a')] }, { blocks: [P('b')] }] },
      P('between'),
      { type: 'list', kind: 'numbered', items: [{ blocks: [P('one')] }, { blocks: [P('two')] }] },
    ]);
  });

  it('nests by level', () => {
    const body =
      item('top', '2', 0) + item('sub', '1', 1) + item('deeper', '1', 2) + item('top 2', '2', 0);
    const { document } = imported({ numbering: defs, body });
    expect(document.blocks).toEqual([
      {
        type: 'list',
        kind: 'numbered',
        items: [
          {
            blocks: [
              P('top'),
              {
                type: 'list',
                kind: 'bulleted',
                items: [
                  {
                    blocks: [
                      P('sub'),
                      { type: 'list', kind: 'bulleted', items: [{ blocks: [P('deeper')] }] },
                    ],
                  },
                ],
              },
            ],
          },
          { blocks: [P('top 2')] },
        ],
      },
    ]);
  });

  it('starts a new list where the kind changes at the same level', () => {
    const body = item('bullet', '1') + item('number', '2');
    const { document } = imported({ numbering: defs, body });
    expect(document.blocks.map((b) => (b.type === 'list' ? b.kind : b.type))).toEqual([
      'bulleted',
      'numbered',
    ]);
  });

  it('starts a new numbered list for another numbering', () => {
    const body = item('a', '2') + item('b', '3');
    const { document } = imported({ numbering: defs + numbering('3', 'decimal'), body });
    expect(document.blocks).toHaveLength(2);
  });

  it('takes the numbering from the style of the paragraph', () => {
    const styles = style('ListNumber', 'List Number', {
      paragraph: '<w:numPr><w:numId w:val="2"/></w:numPr>',
    });
    const { document } = imported({
      styles,
      numbering: defs,
      body: text('one', 'ListNumber') + text('two', 'ListNumber'),
    });
    expect(document.blocks).toEqual([
      { type: 'list', kind: 'numbered', items: [{ blocks: [P('one')] }, { blocks: [P('two')] }] },
    ]);
  });

  it('treats numId 0 as no list', () => {
    const body = para(run('plain'), '<w:numPr><w:numId w:val="0"/></w:numPr>');
    expect(imported({ numbering: defs, body }).document.blocks).toEqual([P('plain')]);
  });

  it('takes a numbering that is not defined as bulleted, and reports it', () => {
    const parts = { body: item('lost', '9') };
    expect(imported(parts).document.blocks[0]).toMatchObject({ type: 'list', kind: 'bulleted' });
    expect(codes(parts)).toContain('unknown-numbering');
  });

  it('leaves out an empty list item', () => {
    const body =
      item('a', '1') + para('', '<w:numPr><w:numId w:val="1"/></w:numPr>') + item('b', '1');
    const { document } = imported({ numbering: defs, body });
    expect(document.blocks[0]).toMatchObject({
      items: [{ blocks: [P('a')] }, { blocks: [P('b')] }],
    });
  });
});

describe('marks', () => {
  const strong: Mark = { type: 'strong' };
  const emphasis: Mark = { type: 'emphasis' };

  it('reads bold and italic of a run', () => {
    const body = para(
      run('plain ') + run('bold', '<w:b/>') + run(' ') + run('both', '<w:b/><w:i/>'),
    );
    const { document } = imported({ body });
    expect(document.blocks).toEqual([
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'plain ', marks: [] },
          { type: 'text', text: 'bold', marks: [strong] },
          { type: 'text', text: ' ', marks: [] },
          { type: 'text', text: 'both', marks: [strong, emphasis] },
        ],
      },
    ]);
  });

  it('reads a switched off toggle as off', () => {
    const body = para(run('not bold', '<w:b w:val="0"/>'));
    expect(imported({ body }).document.blocks).toEqual([P('not bold')]);
  });

  it('reads the bold and italic of a character style', () => {
    const styles =
      style('Strong', 'Strong', { type: 'character', run: '<w:b/>' }) +
      style('Emphasis', 'Emphasis', { type: 'character', run: '<w:i/>' }) +
      style('Loud', 'Loud', { type: 'character', basedOn: 'Strong' });
    const body = para(
      run('a', '<w:rStyle w:val="Strong"/>') +
        run('b', '<w:rStyle w:val="Emphasis"/>') +
        run('c', '<w:rStyle w:val="Loud"/>'),
    );
    const { document } = imported({ styles, body });
    expect(document.blocks[0]).toMatchObject({
      content: [
        { text: 'a', marks: [strong] },
        { text: 'b', marks: [emphasis] },
        { text: 'c', marks: [strong] },
      ],
    });
  });

  it('does not take the bold of a paragraph style as strong', () => {
    const styles = style('Bold', 'Bold', { run: '<w:b/>' });
    expect(imported({ styles, body: text('plain', 'Bold') }).document.blocks).toEqual([P('plain')]);
  });

  it('makes a monospace font into code', () => {
    const body = para(
      run('see ') + run('npm run build', '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>'),
    );
    const parts = { body };
    expect(imported(parts).document.blocks[0]).toMatchObject({
      content: [
        { text: 'see ', marks: [] },
        { text: 'npm run build', marks: [{ type: 'code' }] },
      ],
    });
    expect(codes(parts)).not.toContain('direct-formatting');
  });

  it('counts another font as direct formatting', () => {
    const body = para(run('serif', '<w:rFonts w:ascii="Georgia"/>'));
    expect(diagnostic({ body }, 'direct-formatting')?.count).toBe(1);
  });
});

describe('links', () => {
  const link = (id: string, target: string, mode = 'External'): string =>
    `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${target}" TargetMode="${mode}"/>`;

  it('makes a link to an address into a link mark', () => {
    const body = para(`<w:hyperlink r:id="rId9">${run('the site')}</w:hyperlink>`);
    const { document } = imported({
      body,
      relationships: link('rId9', 'https://example.com/a?b=1&amp;c=2'),
    });
    expect(document.blocks).toEqual([
      P('the site', [{ type: 'link', href: 'https://example.com/a?b=1&c=2' }]),
    ]);
  });

  it('keeps a link inside the document as its text and reports it', () => {
    const body = para(`<w:hyperlink w:anchor="section1">${run('see below')}</w:hyperlink>`);
    expect(imported({ body }).document.blocks).toEqual([P('see below')]);
    expect(codes({ body })).toContain('internal-link');
  });

  it('keeps a link to an address that is not safe as its text and reports it', () => {
    const body = para(`<w:hyperlink r:id="rId9">${run('click')}</w:hyperlink>`);
    const parts = { body, relationships: link('rId9', 'javascript:alert(1)') };
    expect(imported(parts).document.blocks).toEqual([P('click')]);
    expect(diagnostic(parts, 'unsafe-link')?.count).toBe(1);
  });

  it('reads a HYPERLINK field, with the instruction hidden and the text linked', () => {
    const body = para(
      `<w:r><w:fldChar w:fldCharType="begin"/></w:r>` +
        `<w:r><w:instrText xml:space="preserve"> HYPERLINK "https://example.com/" </w:instrText></w:r>` +
        `<w:r><w:fldChar w:fldCharType="separate"/></w:r>${run('example')}` +
        `<w:r><w:fldChar w:fldCharType="end"/></w:r>`,
    );
    expect(imported({ body }).document.blocks).toEqual([
      P('example', [{ type: 'link', href: 'https://example.com/' }]),
    ]);
  });

  it('reads a simple HYPERLINK field', () => {
    const body = para(
      `<w:fldSimple w:instr=' HYPERLINK "mailto:a@example.com" '>${run('mail')}</w:fldSimple>`,
    );
    expect(imported({ body }).document.blocks).toEqual([
      P('mail', [{ type: 'link', href: 'mailto:a@example.com' }]),
    ]);
  });

  it('keeps the text that another field shows and hides its instruction', () => {
    const body = para(
      run('Page ') +
        `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> PAGE </w:instrText></w:r>` +
        `<w:r><w:fldChar w:fldCharType="separate"/></w:r>${run('3')}<w:r><w:fldChar w:fldCharType="end"/></w:r>`,
    );
    expect(imported({ body }).document.blocks).toEqual([P('Page 3')]);
  });

  it('keeps a field that spans paragraphs hidden only in its instruction', () => {
    const body =
      para(
        `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> QUOTE </w:instrText></w:r>` +
          `<w:r><w:fldChar w:fldCharType="separate"/></w:r>${run('Entry one')}`,
      ) +
      para(run('Entry two') + `<w:r><w:fldChar w:fldCharType="end"/></w:r>`) +
      text('After');
    expect(imported({ body }).document.blocks).toEqual([
      P('Entry one'),
      P('Entry two'),
      P('After'),
    ]);
  });
});

describe('tracked changes', () => {
  it('takes insertions as accepted and deletions as applied, and counts them', () => {
    const body = para(
      run('Keep ') +
        `<w:ins w:id="1">${run('added ')}</w:ins>` +
        `<w:del w:id="2"><w:r><w:delText>removed </w:delText></w:r></w:del>` +
        run('end'),
    );
    const parts = { body };
    expect(imported(parts).document.blocks).toEqual([P('Keep added end')]);
    expect(diagnostic(parts, 'tracked-changes')?.count).toBe(2);
  });

  it('joins a paragraph whose mark was deleted to the next one', () => {
    const body =
      para(run('First '), '<w:rPr><w:del w:id="1"/></w:rPr>') + text('second') + text('third');
    expect(imported({ body }).document.blocks).toEqual([P('First second'), P('third')]);
  });

  it('keeps text of a paragraph with a deleted mark at the end of the document', () => {
    const body = text('One') + para(run('Last'), '<w:rPr><w:del w:id="1"/></w:rPr>');
    expect(imported({ body }).document.blocks).toEqual([P('One'), P('Last')]);
  });
});

describe('content that is replaced or kept in another form', () => {
  const drawing = (name: string, embed: string): string =>
    `<w:r><w:drawing><wp:inline><wp:docPr id="1" name="${name}"/><a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:embed="${embed}"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
  const imageRel = (id: string, target: string): string =>
    `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${target}"/>`;

  it('puts an image in a placeholder paragraph that names its file', () => {
    const body = para(run('Look: ') + drawing('Picture 1', 'rId5'));
    const parts = { body, relationships: imageRel('rId5', 'media/image1.png') };
    expect(imported(parts).document.blocks).toEqual([P('Look:'), P('[Image: image1.png]')]);
    expect(diagnostic(parts, 'placeholder-image')?.count).toBe(1);
  });

  it('leaves only the placeholder when the paragraph holds only an image', () => {
    const body = para(drawing('Picture 1', 'rId5'));
    const parts = { body, relationships: imageRel('rId5', 'media/image2.jpeg') };
    expect(imported(parts).document.blocks).toEqual([P('[Image: image2.jpeg]')]);
  });

  it('names a drawing that is not a picture', () => {
    const body = para(
      `<w:r><w:drawing><wp:inline><wp:docPr id="1" name="Diagram 4"/><a:graphic><a:graphicData><wps:wsp/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`,
    );
    const parts = { body };
    expect(imported(parts).document.blocks).toEqual([P('[Drawing: Diagram 4]')]);
    expect(diagnostic(parts, 'placeholder-drawing')?.count).toBe(1);
  });

  it('puts an embedded object and an equation in placeholders', () => {
    const body =
      para(
        `<w:r><w:object><o:OLEObject xmlns:o="urn:schemas-microsoft-com:office:office" ProgID="Excel.Sheet.12"/></w:object></w:r>`,
      ) + para(`<m:oMath><m:r><m:t>x+y</m:t></m:r></m:oMath>`);
    expect(imported({ body }).document.blocks).toEqual([
      P('[Object: Excel.Sheet.12]'),
      P('[Equation: x+y]'),
    ]);
  });

  it('puts the text of a text box at the place of the box, from the first choice only', () => {
    const box = (content: string): string => `<w:txbxContent>${content}</w:txbxContent>`;
    const body = para(
      run('Host') +
        `<w:r><mc:AlternateContent><mc:Choice Requires="wps"><w:drawing><wp:inline><wp:docPr id="1" name="Box"/><a:graphic><a:graphicData><wps:wsp><wps:txbx>${box(text('In the box') + text('Second line'))}</wps:txbx></wps:wsp></a:graphicData></a:graphic></wp:inline></w:drawing></mc:Choice>` +
        `<mc:Fallback><w:pict><v:shape><v:textbox>${box(text('In the box'))}</v:textbox></v:shape></w:pict></mc:Fallback></mc:AlternateContent></w:r>`,
    );
    const parts = { body };
    expect(imported(parts).document.blocks).toEqual([P('Host'), P('In the box'), P('Second line')]);
    expect(diagnostic(parts, 'text-box')?.count).toBe(1);
  });

  it('puts a footnote and an endnote in a placeholder that holds their text', () => {
    const note = (name: string, id: string, body: string): string =>
      `<w:${name} w:id="${id}">${text(body)}</w:${name}>`;
    const parts = {
      footnotes:
        `<w:footnote w:type="separator" w:id="-1">${text('')}</w:footnote>` +
        note('footnote', '1', 'See the spec.'),
      endnotes: note('endnote', '2', 'Later.'),
      body: para(
        run('Claim') +
          `<w:r><w:footnoteReference w:id="1"/></w:r>` +
          run(' and more') +
          `<w:r><w:endnoteReference w:id="2"/></w:r>`,
      ),
    };
    expect(imported(parts).document.blocks).toEqual([
      P('Claim[Footnote: See the spec.] and more[Endnote: Later.]'),
    ]);
    expect(diagnostic(parts, 'footnote')?.count).toBe(2);
  });

  it('keeps the text of content controls', () => {
    const body =
      `<w:sdt><w:sdtContent>${text('Block level control')}</w:sdtContent></w:sdt>` +
      para(
        run('Before ') +
          `<w:sdt><w:sdtContent>${run('inline control')}</w:sdtContent></w:sdt>` +
          run(' after'),
      );
    expect(imported({ body }).document.blocks).toEqual([
      P('Block level control'),
      P('Before inline control after'),
    ]);
  });

  it('leaves out a symbol and counts it', () => {
    const body = para(run('a') + `<w:r><w:sym w:font="Wingdings" w:char="F0FC"/></w:r>` + run('b'));
    expect(imported({ body }).document.blocks).toEqual([P('ab')]);
    expect(diagnostic({ body }, 'symbol')?.count).toBe(1);
  });
});

describe('tables', () => {
  const cell = (content: string, properties = ''): string =>
    `<w:tc>${properties === '' ? '' : `<w:tcPr>${properties}</w:tcPr>`}${content}</w:tc>`;
  const row = (cells: string, properties = ''): string =>
    `<w:tr>${properties === '' ? '' : `<w:trPr>${properties}</w:trPr>`}${cells}</w:tr>`;
  const table = (rows: string, look = '<w:tblLook w:firstRow="1"/>'): string =>
    `<w:tbl><w:tblPr>${look}</w:tblPr>${rows}</w:tbl>`;
  const cells = (...values: string[]): string => values.map((v) => cell(text(v))).join('');
  const C = (value: string, marks: readonly Mark[] = []) => ({
    blocks:
      value === '' ? [] : [{ type: 'paragraph', content: [{ type: 'text', text: value, marks }] }],
  });

  it('makes a table of a first row that the look of the table marks as the header', () => {
    const body =
      text('Before') + table(row(cells('A', 'B')) + row(cells('1', '2'))) + text('After');
    expect(imported({ body }).document.blocks).toEqual([
      P('Before'),
      { type: 'table', header: [C('A'), C('B')], rows: [[C('1'), C('2')]] },
      P('After'),
    ]);
  });

  it('reads the look as a bit mask when it has no attributes of its own', () => {
    const body = table(row(cells('A')) + row(cells('1')), '<w:tblLook w:val="04A0"/>');
    expect(imported({ body }).document.blocks[0]).toMatchObject({ type: 'table' });
  });

  it('makes a table of a first row that repeats as a header, without a look', () => {
    const body = table(row(cells('A'), '<w:tblHeader/>') + row(cells('1')), '');
    expect(imported({ body }).document.blocks[0]).toMatchObject({
      type: 'table',
      header: [C('A')],
    });
  });

  it('keeps the marks of the text in a cell', () => {
    const bold = cell(para(run('B', '<w:b/>')));
    const body = table(row(cells('A')) + row(bold));
    expect(imported({ body }).document.blocks[0]).toMatchObject({
      rows: [[C('B', [{ type: 'strong' }])]],
    });
  });

  it('writes a table without a header row as a paragraph for each cell with text, and reports it', () => {
    const body = table(row(cells('Assets:', 'Data')) + row(cell(text('')) + cells('Only')), '');
    const parts = { body };
    expect(imported(parts).document.blocks).toEqual([P('Assets:'), P('Data'), P('Only')]);
    expect(diagnostic(parts, 'table-flattened')?.count).toBe(1);
  });

  it('writes a table with rows of different length as paragraphs', () => {
    const body = table(row(cells('A', 'B')) + row(cells('1')));
    const parts = { body };
    expect(imported(parts).document.blocks).toEqual([P('A'), P('B'), P('1')]);
    expect(codes(parts)).toContain('table-flattened');
  });

  it('keeps the paragraphs and the lists of a cell, with nothing to report', () => {
    const joined = cell(text('first') + text('second') + item('third', '1') + item('fourth', '1'));
    const body = table(row(cells('A')) + row(joined));
    const parts = { numbering: numbering('1', 'bullet'), body };
    expect(imported(parts).document.blocks[0]).toMatchObject({
      rows: [
        [
          {
            blocks: [
              { type: 'paragraph', content: [{ text: 'first' }] },
              { type: 'paragraph', content: [{ text: 'second' }] },
              {
                type: 'list',
                kind: 'bulleted',
                items: [
                  { blocks: [{ content: [{ text: 'third' }] }] },
                  { blocks: [{ content: [{ text: 'fourth' }] }] },
                ],
              },
            ],
          },
        ],
      ],
    });
    expect(codes(parts)).toEqual([]);
  });

  it('makes the paragraphs of a cell of the text between double line breaks', () => {
    const split = para(
      `<w:r><w:t>one</w:t><w:br/><w:t>still one</w:t><w:br/><w:br/><w:t>two</w:t></w:r>`,
    );
    const body = table(row(cells('A')) + row(cell(split)));
    expect(imported({ body }).document.blocks[0]).toMatchObject({
      rows: [
        [
          {
            blocks: [
              { type: 'paragraph', content: [{ text: 'one still one' }] },
              { type: 'paragraph', content: [{ text: 'two' }] },
            ],
          },
        ],
      ],
    });
  });

  it('nests the lists of a cell by their level, and takes a heading style there as a paragraph', () => {
    const defs = numbering('1', 'bullet') + numbering('2', 'decimal');
    const heading = para(run('Not a heading'), '<w:pStyle w:val="Heading1"/>');
    const body = table(
      row(cells('A')) + row(cell(heading + item('top', '2', 0) + item('sub', '1', 1))),
    );
    const parts = { styles: HEADING_STYLES, numbering: defs, body };
    expect(imported(parts).document.blocks[0]).toMatchObject({
      rows: [
        [
          {
            blocks: [
              { type: 'paragraph', content: [{ text: 'Not a heading' }] },
              {
                type: 'list',
                kind: 'numbered',
                items: [
                  { blocks: [{ content: [{ text: 'top' }] }, { type: 'list', kind: 'bulleted' }] },
                ],
              },
            ],
          },
        ],
      ],
    });
  });

  it('keeps the text of a merged cell in the first cell and leaves the covered ones empty', () => {
    const wide = cell(text('wide'), '<w:gridSpan w:val="2"/>');
    const tall = cell(text('tall'), '<w:vMerge w:val="restart"/>');
    const below = cell(para(''), '<w:vMerge/>');
    const body = table(
      row(cells('A', 'B', 'C')) +
        row(wide + cell(text('x'))) +
        row(tall + cells('y', 'z')) +
        row(below + cells('p', 'q')),
    );
    const parts = { body };
    expect(imported(parts).document.blocks[0]).toMatchObject({
      type: 'table',
      rows: [
        [C('wide'), C(''), C('x')],
        [C('tall'), C('y'), C('z')],
        [C(''), C('p'), C('q')],
      ],
    });
    expect(diagnostic(parts, 'merged-cells')?.count).toBe(3);
  });

  it('joins the text of a table inside a cell into a paragraph of the cell, and reports it', () => {
    const inner = `<w:tbl>${row(cells('in1', 'in2'))}</w:tbl>`;
    const body = table(row(cells('A')) + row(cell(text('outer') + inner + para(''))));
    const parts = { body };
    expect(imported(parts).document.blocks[0]).toMatchObject({
      rows: [[{ blocks: [C('outer').blocks[0], C('in1 in2').blocks[0]] }]],
    });
    expect(diagnostic(parts, 'nested-table')?.count).toBe(1);
  });

  it('leaves out a row that was deleted as a tracked change', () => {
    const body = table(
      row(cells('A')) + row(cells('gone'), '<w:del w:id="1"/>') + row(cells('kept')),
    );
    expect(imported({ body }).document.blocks[0]).toMatchObject({ rows: [[C('kept')]] });
  });

  it('writes the text of a table in a text box as paragraphs', () => {
    const inner = `<w:tbl>${row(cells('a', 'b'))}</w:tbl>`;
    const body = para(
      `<w:r><w:drawing><wp:inline><wp:docPr id="1" name="Box"/><a:graphic><a:graphicData><wps:wsp><wps:txbx><w:txbxContent>${inner}</w:txbxContent></wps:txbx></wps:wsp></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`,
    );
    expect(imported({ body }).document.blocks).toEqual([P('a'), P('b')]);
  });
});

describe('a table of contents', () => {
  const begin = (instruction: string): string =>
    `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> ${instruction} </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>`;
  const end = '<w:r><w:fldChar w:fldCharType="end"/></w:r>';
  const entry = (title: string): string =>
    `<w:hyperlink w:anchor="_Toc1">${run(title)}<w:r><w:tab/></w:r>` +
    `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> PAGEREF _Toc1 \\h </w:instrText></w:r>` +
    `<w:r><w:fldChar w:fldCharType="separate"/></w:r>${run('7')}<w:r><w:fldChar w:fldCharType="end"/></w:r></w:hyperlink>`;
  const toc = (instruction: string): string =>
    para(
      begin(instruction) + entry('Intro'),
      '<w:pStyle w:val="TOC1"/><w:tabs><w:tab w:val="right"/></w:tabs>',
    ) +
    para(entry('Method'), '<w:pStyle w:val="TOC1"/>') +
    para(end, '<w:pStyle w:val="TOC1"/>');
  const toBlock = (text: string): Block => ({ type: 'phrase', kind: 'toc', text });

  it('becomes a phrase-toc block with the depth of the field, and drops the entries', () => {
    const parts = { body: text('Before') + toc('TOC \\o "1-2" \\h \\z \\u') + text('After') };
    expect(imported(parts).document.blocks).toEqual([P('Before'), toBlock('depth: 2'), P('After')]);
    expect(diagnostic(parts, 'toc-field')?.count).toBe(1);
  });

  it('does not report the entries as empty paragraphs, links or direct formatting', () => {
    const parts = { body: toc('TOC \\o "1-3"') + text('After') };
    expect(codes(parts)).toEqual(['toc-field']);
  });

  it('has an empty body when the field names no depth', () => {
    expect(imported({ body: toc('TOC \\h') }).document.blocks).toEqual([toBlock('')]);
  });

  it('keeps a depth to the most that the project has', () => {
    expect(imported({ body: toc('TOC \\o "1-9"') }).document.blocks).toEqual([toBlock('depth: 6')]);
  });

  it('reads a simple field and one inside a content control', () => {
    const simple = para(
      `<w:fldSimple w:instr="TOC \\o &quot;1-4&quot;">${entry('Intro')}</w:fldSimple>`,
    );
    const wrapped = `<w:sdt><w:sdtContent>${text('Contents')}${toc('TOC \\o "1-1"')}</w:sdtContent></w:sdt>`;
    expect(imported({ body: simple + wrapped }).document.blocks).toEqual([
      toBlock('depth: 4'),
      P('Contents'),
      toBlock('depth: 1'),
    ]);
  });

  it('leaves the entries of a table of contents that is only text as they are', () => {
    const body = text('Intro', 'TOC1') + text('Method', 'TOC1');
    expect(imported({ body }).document.blocks).toEqual([P('Intro'), P('Method')]);
  });
});

describe('what is left out and counted', () => {
  it('counts comments, bookmarks, section breaks, and headers and footers', () => {
    const header = (id: string): string => `<w:headerReference w:type="default" r:id="${id}"/>`;
    const body =
      para(
        `<w:bookmarkStart w:id="0" w:name="b"/>${run('text')}<w:bookmarkEnd w:id="0"/>` +
          `<w:r><w:commentReference w:id="3"/></w:r>`,
        `<w:sectPr>${header('rId7')}</w:sectPr>`,
      ) +
      text('more') +
      `<w:sectPr>${header('rId7')}${header('rId8')}</w:sectPr>`;
    const { document, report } = imported({ body });
    expect(document.blocks).toEqual([P('text'), P('more')]);
    const count = (code: string): number | undefined =>
      report.diagnostics.find((d) => d.code === code)?.count;
    expect(count('comment')).toBe(1);
    expect(count('bookmark')).toBe(1);
    expect(count('section-break')).toBe(1);
    expect(count('header-footer')).toBe(2);
  });

  it('gives a place for each diagnostic, with the heading it is under', () => {
    const body = text('Method', 'Heading1') + para('') + text('Text');
    const empty = diagnostic({ styles: HEADING_STYLES, body }, 'empty-paragraph');
    expect(empty?.places).toEqual(['paragraph 2 under "Method"']);
  });

  it('keeps at most ten places and the full count', () => {
    const body = Array.from({ length: 25 }, () => para('')).join('');
    const empty = diagnostic({ body }, 'empty-paragraph');
    expect(empty?.count).toBe(25);
    expect(empty?.places).toHaveLength(10);
  });
});

describe('the title', () => {
  it('comes from the properties of the document', () => {
    const { document } = imported({
      title: 'From properties',
      styles: HEADING_STYLES,
      body: text('A heading', 'Heading1'),
    });
    expect(document.meta.title).toBe('From properties');
  });

  it('comes from the first heading when the properties have none', () => {
    const { document } = imported({
      styles: HEADING_STYLES,
      body: text('Intro') + text('First heading', 'Heading1'),
    });
    expect(document.meta.title).toBe('First heading');
  });

  it('is absent when there is neither', () => {
    expect(imported({ body: text('Only text') }).document.meta).toEqual({ fields: {} });
  });
});

describe('files that are refused', () => {
  const refusal = (bytes: Uint8Array) => {
    const result = importDocx(bytes);
    if (result.ok) throw new Error('The file was not refused.');
    return result;
  };

  it('refuses text that is not a ZIP package', () => {
    const result = refusal(new TextEncoder().encode('just some text'));
    expect(result.reason).toBe('not-a-docx');
  });

  it('refuses an old .doc or encrypted file, by its signature, and says so', () => {
    const result = refusal(Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
    expect(result.reason).toBe('not-a-docx');
    expect(result.message).toContain('.doc');
  });

  it('refuses a ZIP package that has no Word document', async () => {
    const { zipSync, strToU8 } = await import('fflate');
    const result = refusal(zipSync({ 'readme.txt': strToU8('hello') }));
    expect(result.reason).toBe('not-a-docx');
  });

  it('refuses a document that is not well-formed XML, with the reason', async () => {
    const { zipSync, strToU8 } = await import('fflate');
    const result = refusal(
      zipSync({ 'word/document.xml': strToU8('<w:document><w:body></w:document>') }),
    );
    expect(result.reason).toBe('unreadable');
    expect(result.message).toContain('could not be read');
  });
});
