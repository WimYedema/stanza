// @vitest-environment jsdom
import { Editor } from '@tiptap/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Node as EditorNode } from '@tiptap/pm/model';
import { normalizePastedHtml } from './paste-html.js';
import { phraseExtensions } from './editor.js';
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
        '<p data-phrase-style="note">a</p><p data-phrase-style="nope">b</p><p data-phrase-style="table-plain">c</p><ul data-phrase-style="note"><li>d</li></ul><table data-phrase-style="table-plain"><tbody><tr><td>e</td></tr></tbody></table><table data-phrase-style="note"><tbody><tr><td>f</td></tr></tbody></table>',
      ),
    ).toBe(
      '<p data-phrase-style="note">a</p><p>b</p><p>c</p><ul data-phrase-style="note"><li>d</li></ul><table data-phrase-style="table-plain"><tbody><tr><td>e</td></tr></tbody></table><table><tbody><tr><td>f</td></tr></tbody></table>',
    );
    expect(
      clean(
        '<p><span data-phrase-style="marker">a</span><span data-phrase-style="note">b</span></p>',
      ),
    ).toBe('<p><span data-phrase-style="marker">a</span>b</p>');
  });

  it('keeps a phrase block with its kind and body, and not one with a bad kind', () => {
    expect(
      clean(
        '<div data-phrase-kind="toc" data-phrase-text="depth: 2" class="x" id="y">toc</div><div data-phrase-kind="Not A Kind">x</div>',
      ),
    ).toBe('<div data-phrase-kind="toc" data-phrase-text="depth: 2"></div>');
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
    extensions: phraseExtensions(
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
      '<h2 id="k7m2q9x4zb" data-phrase-style="note">Title</h2><p data-phrase-style="nope" id="a1b2c3d4e5">Text</p>',
    );
    const [heading, text] = blocks(current);
    expect(heading?.type.name).toBe('heading');
    expect(heading?.attrs).toMatchObject({ id: null, level: 2 });
    expect(text?.attrs).toMatchObject({ id: null, style: null });
  });

  it('keeps a pasted phrase block with its body', () => {
    const current = open(paragraph(''));
    current.view.pasteHTML('<div data-phrase-kind="toc" data-phrase-text="depth: 2">toc</div>');
    const found = blocks(current).find((node) => node.type.name === 'phraseBlock');
    expect(found?.attrs).toMatchObject({ kind: 'toc', text: 'depth: 2', id: null });
  });

  it('has the editor write the names the paste keeps', () => {
    const current = open(paragraph('A note', { style: 'note' }));
    expect(current.view.dom.querySelector('p')?.getAttribute('data-phrase-style')).toBe('note');
  });
});
