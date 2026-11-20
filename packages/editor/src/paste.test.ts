// @vitest-environment jsdom
import { Editor } from '@tiptap/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Node as EditorNode } from '@tiptap/pm/model';
import { normalizePastedHtml } from './paste-html.js';
import { stanzaExtensions } from './editor.js';
import type { Notice } from './notice.js';
import { COMMANDS_STYLESHEET } from './styles.testing.js';

const stylesheet = COMMANDS_STYLESHEET.stylesheet;
const clean = (html: string): string => normalizePastedHtml(html, stylesheet);

const WORD = `<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta charset=utf-8>
<style>p.MsoNormal {margin:0cm; font-size:12.0pt}</style></head>
<body lang=EN-US style='tab-interval:36.0pt'><!--StartFragment-->
<p class=MsoNormal style='margin-bottom:0cm'><span style='font-size:12.0pt;font-family:"Times New Roman"'>Plain </span><b style='mso-bidi-font-weight:normal'><span style='font-size:12.0pt'>bold</span></b><o:p></o:p></p><!--EndFragment--></body></html>`;

const GOOGLE_DOCS = `<meta charset='utf-8'><meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1"><p dir="ltr" style="line-height:1.38;margin-top:0pt;"><span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;font-weight:700;font-style:normal;">Bold text</span><span style="font-size:11pt;font-weight:400;"> and plain</span></p></b>`;

describe('normalizePastedHtml', () => {
  it('reports an unknown project scheme instead of silently dropping a pasted destination', () => {
    const notice = vi.fn<(notice: Notice) => void>();
    expect(
      normalizePastedHtml('<a href="jira://PROJ-123">Ticket</a>', stylesheet, false, {}, notice),
    ).toBe('Ticket');
    expect(notice).toHaveBeenCalledOnce();
    expect(notice.mock.lastCall?.[0].code).toBe('paste-link-dropped');
    expect(notice.mock.lastCall?.[0].message).toContain('Unknown link scheme "jira"');
  });

  it('keeps configured short links, including the authored destination of copied resolved links', () => {
    const schemes = { jira: 'https://example.org/{id}' };
    const html =
      '<p><a href="https://example.org/PROJ-123" data-stanza-href="jira://PROJ-123"><strong>Ticket</strong></a></p>';
    expect(normalizePastedHtml(html, stylesheet, false, schemes)).toBe(
      '<p><a href="jira://PROJ-123"><strong>Ticket</strong></a></p>',
    );
    expect(
      normalizePastedHtml('<a href="jira://PROJ-123">Ticket</a>', stylesheet, false, schemes),
    ).toBe('<a href="jira://PROJ-123">Ticket</a>');
    expect(
      normalizePastedHtml(
        '<a href="https://example.org/" data-stanza-href="javascript:alert(1)">Ticket</a>',
        stylesheet,
        false,
        schemes,
      ),
    ).toBe('Ticket');
  });

  it('keeps the text and the bold of a paste from Word, and nothing of its looks', () => {
    expect(clean(WORD).trim()).toBe('<p>Plain <strong>bold</strong></p>');
  });

  it('does not take the wrapper of a paste from Google Docs for bold', () => {
    expect(clean(GOOGLE_DOCS)).toBe('<p><strong>Bold text</strong> and plain</p>');
  });

  it('turns bold and italic written as styles into marks', () => {
    expect(
      clean(
        '<p><span style="font-weight:bold">a</span><span style="font-style:italic">b</span><span style="font-weight:600;font-style:oblique">c</span><span style="font-weight:500">d</span></p>',
      ),
    ).toBe('<p><strong>a</strong><em>b</em><strong><em>c</em></strong>d</p>');
    expect(clean('<p><i style="font-style:normal">a</i><em>b</em></p>')).toBe('<p>a<em>b</em></p>');
  });

  it('removes scripts, styles, images, frames and every attribute', () => {
    const html =
      '<p class="x" id="k7m2q9x4zb" style="color:red" onclick="alert(1)">Hi<script>alert(1)</script><img src=x onerror=alert(1)><iframe src="https://evil.example"></iframe><style>p{color:red}</style></p>';
    expect(clean(html)).toBe('<p>Hi</p>');
  });

  it('keeps the links to a web page, a mail address and a block, and no other', () => {
    expect(
      clean(
        '<p><a href="https://example.org/a" target="_blank" onclick="x()">web</a> <a href="mailto:a@b.c">mail</a> <a href="#k7m2q9x4zb">block</a> <a href="javascript:alert(1)">script</a> <a href="data:text/html,x">data</a> <a>none</a></p>',
      ),
    ).toBe(
      '<p><a href="https://example.org/a">web</a> <a href="mailto:a@b.c">mail</a> <a href="#k7m2q9x4zb">block</a> script data none</p>',
    );
  });

  it('turns a line break into a space, and a division of text into a paragraph', () => {
    expect(clean('<p>one<br>two</p>')).toBe('<p>one two</p>');
    expect(clean('<div>one</div><div>two</div>')).toBe('<p>one</p><p>two</p>');
    expect(clean('<div><p>one</p><p>two</p></div>')).toBe('<p>one</p><p>two</p>');
  });

  it('keeps headings, lists, code and tables, without spans', () => {
    const html =
      '<h2 style="font-size:20pt">T</h2><ul><li>a</li><li>b</li></ul><pre><code>x</code></pre><table border=1><tbody><tr><th colspan="2">H</th></tr><tr><td rowspan="2" style="width:50%">c</td></tr></tbody></table>';
    expect(clean(html)).toBe(
      '<h2>T</h2><ul><li>a</li><li>b</li></ul><pre><code>x</code></pre><table><tbody><tr><th>H</th></tr><tr><td>c</td></tr></tbody></table>',
    );
  });

  it('keeps the name of a style when the stylesheet declares it, and only then', () => {
    expect(
      clean(
        '<p data-stanza-style="note">a</p><p data-stanza-style="nope">b</p><p data-stanza-style="table-plain">c</p><ul data-stanza-style="note"><li>d</li></ul><table data-stanza-style="table-plain"><tbody><tr><td>e</td></tr></tbody></table><table data-stanza-style="note"><tbody><tr><td>f</td></tr></tbody></table>',
      ),
    ).toBe(
      '<p data-stanza-style="note">a</p><p>b</p><p>c</p><ul data-stanza-style="note"><li>d</li></ul><table data-stanza-style="table-plain"><tbody><tr><td>e</td></tr></tbody></table><table><tbody><tr><td>f</td></tr></tbody></table>',
    );
    expect(
      clean(
        '<p><span data-stanza-style="marker">a</span><span data-stanza-style="note">b</span></p>',
      ),
    ).toBe('<p><span data-stanza-style="marker">a</span>b</p>');
  });

  it('keeps the paragraphs and lists of a cell, without style names, and flattens a table in a cell', () => {
    expect(
      clean(
        '<table><tbody><tr><td><p data-stanza-style="note">a</p><ul data-stanza-style="note"><li>b</li></ul></td></tr></tbody></table>',
      ),
    ).toBe('<table><tbody><tr><td><p>a</p><ul><li>b</li></ul></td></tr></tbody></table>');
    expect(
      clean(
        '<table><tbody><tr><td>outer<table><tbody><tr><td>in1</td><td>in2</td></tr></tbody></table></td></tr></tbody></table>',
      ),
    ).toBe('<table><tbody><tr><td>outer<p>in1</p><p>in2</p></td></tr></tbody></table>');
  });

  it('reduces a paste into a cell to paragraphs and lists, and leaves out a stanza block', () => {
    const html =
      '<h1>T</h1><pre>c</pre><table><tbody><tr><td>x</td></tr></tbody></table><div data-stanza-kind="toc">t</div><ul><li>l</li></ul>';
    expect(normalizePastedHtml(html, stylesheet, true)).toBe(
      '<p>T</p><p>c</p><p>x</p><ul><li>l</li></ul>',
    );
  });

  it('keeps a stanza block with its kind and body, and not one with a bad kind', () => {
    expect(
      clean(
        '<div data-stanza-kind="toc" data-stanza-text="depth: 2" class="x" id="y">toc</div><div data-stanza-kind="Not A Kind">x</div>',
      ),
    ).toBe('<div data-stanza-kind="toc" data-stanza-text="depth: 2"></div>');
  });
});

let element: HTMLElement;
let editor: Editor | undefined;
let notices: Notice[];

beforeEach(() => {
  // jsdom has no clipboard events, and the view only needs one to hand to its handlers.
  vi.stubGlobal('ClipboardEvent', class extends Event {});
  element = document.createElement('div');
  document.body.append(element);
  notices = [];
});
afterEach(() => {
  vi.unstubAllGlobals();
  editor?.destroy();
  editor = undefined;
  element.remove();
});

function open(...blocks: object[]): Editor {
  editor = new Editor({
    element,
    extensions: stanzaExtensions(
      () => stylesheet,
      (notice) => notices.push(notice),
    ),
    content: { type: 'doc', content: blocks },
  });
  return editor;
}

const paragraph = (value: string, attrs: object = {}) => ({
  type: 'paragraph',
  attrs,
  content: value === '' ? [] : [{ type: 'text', text: value }],
});

interface Run {
  text?: string;
  marks?: { type: string }[];
}
/** The runs of text of a block, as the editor writes them down. */
const runsOf = (current: Editor, block = 0): Run[] =>
  (current.getJSON() as unknown as { content: { content?: Run[] }[] }).content[block]?.content ??
  [];

function blocks(current: Editor): EditorNode[] {
  return current.state.doc.children.slice();
}

describe('pasting into the editor', () => {
  it('keeps the marks where the style allows them, and notes none', () => {
    const current = open(paragraph(''));
    current.view.pasteHTML('<p>Some <b>bold</b> text</p>');
    expect(runsOf(current).map((node) => node.marks?.[0]?.type)).toEqual([
      undefined,
      'strong',
      undefined,
    ]);
    expect(notices).toEqual([]);
  });

  it('takes the marks off the pasted text where the style does not allow them, and says so', () => {
    const current = open(paragraph('Before ', { style: 'plain' }), paragraph('Other'));
    current.commands.setTextSelection(8);
    current.view.pasteHTML('<p>Some <b>bold</b> and <a href="https://a.b">linked</a></p>');
    const runs = runsOf(current);
    const text = runs.map((node) => node.text).join('');
    expect(text).toBe('Before Some bold and linked');
    expect(runs.every((node) => node.marks === undefined)).toBe(true);
    expect(notices).toEqual([
      {
        code: 'paste-marks-dropped',
        message:
          'The style "plain" does not allow strong, link. They were removed from the pasted text.',
      },
    ]);
  });

  it('leaves the marks that were already there alone', () => {
    const current = open({
      type: 'paragraph',
      attrs: { style: 'plain' },
      content: [{ type: 'text', text: 'Marked', marks: [{ type: 'strong' }] }],
    });
    current.commands.setTextSelection(7);
    current.view.pasteHTML('<p>x</p>');
    expect(runsOf(current)[0]?.marks).toEqual([{ type: 'strong' }]);
  });

  it('never keeps an ID that the pasted HTML has, and keeps the style of a block that exists', () => {
    const current = open(paragraph(''));
    current.view.pasteHTML(
      '<h2 id="k7m2q9x4zb" data-stanza-style="note">Title</h2><p data-stanza-style="nope" id="a1b2c3d4e5">Text</p>',
    );
    const [heading, text] = blocks(current);
    expect(heading?.type.name).toBe('heading');
    // A pasted heading gets a new ID, and not the one in the HTML.
    expect(heading?.attrs['id']).toMatch(/^[0-9a-hjkmnp-tv-z]{10}$/);
    expect(heading?.attrs['id']).not.toBe('k7m2q9x4zb');
    expect(heading?.attrs).toMatchObject({ level: 2 });
    expect(text?.attrs).toMatchObject({ id: null, style: null });
  });

  it('pastes paragraphs and a list into a cell, and a heading there becomes a paragraph', () => {
    const current = open({
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [
            {
              type: 'tableCell',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }],
            },
          ],
        },
      ],
    });
    current.commands.setTextSelection(5);
    current.view.pasteHTML('<p>one</p><h1>Two</h1><ul><li>three</li></ul>');
    const cell = current.state.doc.firstChild?.firstChild?.firstChild;
    const kinds = (cell?.children ?? []).map((child) => child.type.name);
    expect(kinds).toContain('bulletList');
    expect(kinds).not.toContain('heading');
    expect(cell?.textContent).toContain('Two');
    expect(notices).toEqual([]);
  });

  it('keeps a pasted stanza block with its body', () => {
    const current = open(paragraph(''));
    current.view.pasteHTML('<div data-stanza-kind="toc" data-stanza-text="depth: 2">toc</div>');
    const found = blocks(current).find((node) => node.type.name === 'stanzaBlock');
    expect(found?.attrs).toMatchObject({ kind: 'toc', text: 'depth: 2', id: null });
  });

  it('has the editor write the names the paste keeps', () => {
    const current = open(paragraph('A note', { style: 'note' }));
    expect(current.view.dom.querySelector('p')?.getAttribute('data-stanza-style')).toBe('note');
  });
});
