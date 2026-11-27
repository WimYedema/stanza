import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { activationLine, OpenTimer, timingFile } from './startup-times.js';

describe('OpenTimer', () => {
  it('times each stage from the open request, once', () => {
    let now = 1000;
    const lines: string[] = [];
    const marks: unknown[] = [];
    const timer = new OpenTimer(
      'a.stanza.md',
      (line) => lines.push(line),
      (mark, at, file) => marks.push([mark, at, file]),
      () => now,
    );
    now = 1120;
    timer.webviewReady();
    now = 1150;
    timer.hostStep('find project');
    now = 1200;
    timer.initSent();
    timer.hostStep('too late');
    now = 1300;
    timer.webviewReady();
    expect(timer.painted('visible', 1300, [{ name: 'editor', ms: 70.4 }])).toBe(true);
    now = 2400.4;
    // Painted at 1500, but the host was busy until 2400.4.
    expect(timer.painted('editable', 1500)).toBe(true);
    expect(timer.painted('editable', 1600)).toBe(false);
    expect(lines).toEqual([
      'Stanza host: find project 30 ms, until sent 50 ms.',
      'Stanza startup: visible after 300 ms (webview ready after 120 ms, document sent after 200 ms) (a.stanza.md).',
      'Stanza webview: editor 70 ms.',
      'Stanza startup: editable after 500 ms, the host heard of it 900 ms later (a.stanza.md).',
    ]);
    expect(marks).toEqual([
      ['open', 1000, 'a.stanza.md'],
      ['webview-ready', 1120, 'a.stanza.md'],
      ['init-sent', 1200, 'a.stanza.md'],
      ['visible', 1300, 'a.stanza.md'],
      ['visible-received', 1300, 'a.stanza.md'],
      ['editable', 1500, 'a.stanza.md'],
      ['editable-received', 2400.4, 'a.stanza.md'],
    ]);
  });
});

describe('a paint time that cannot be right', () => {
  it('takes the arrival of the message instead', () => {
    let now = 1000;
    const marks: unknown[] = [];
    const timer = new OpenTimer(
      'a.stanza.md',
      () => undefined,
      (mark, at) => marks.push([mark, at]),
      () => now,
    );
    now = 1200;
    timer.painted('visible', 900);
    now = 1300;
    timer.painted('editable', 5000);
    expect(marks).toEqual([
      ['open', 1000],
      ['visible', 1200],
      ['visible-received', 1200],
      ['editable', 1300],
      ['editable-received', 1300],
    ]);
  });
});

describe('timingFile', () => {
  it('writes nothing without a file, and JSON lines with one', () => {
    expect(timingFile(undefined)).toBeUndefined();
    expect(timingFile('')).toBeUndefined();
    const folder = mkdtempSync(join(tmpdir(), 'stanza-timing-'));
    try {
      const path = join(folder, 'marks.jsonl');
      const record = timingFile(path);
      record?.('loaded', 5);
      record?.('open', 7.5, 'b.stanza.md');
      expect(readFileSync(path, 'utf8')).toBe(
        '{"mark":"loaded","at":5}\n{"mark":"open","at":7.5,"file":"b.stanza.md"}\n',
      );
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
});

describe('activationLine', () => {
  it('names activation, loading and the start of the host apart', () => {
    expect(activationLine({ hostStart: 0, loaded: 400, start: 650, end: 700 })).toBe(
      'Stanza activation: 50 ms, after 250 ms loading the extension and 400 ms from the start of the extension host.',
    );
  });
});
