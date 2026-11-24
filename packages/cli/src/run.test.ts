import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { createProject } from '@stanza/project';
import { nodeStorage } from './node-storage.js';
import { run } from './run.js';

const EXAMPLE = fileURLToPath(new URL('../../../fixtures/example-project/', import.meta.url));

let work: string;
beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), 'stanza-cli-'));
  const project = join(work, 'project');
  // A build of the fixture may have left a build directory behind.
  cpSync(EXAMPLE, project, { recursive: true, filter: (source) => basename(source) !== 'build' });
  // A working copy on Windows may have CRLF, and a canonical project has LF.
  for (const file of [
    'stanza.yaml',
    'styles/default.yaml',
    'documents/introduction.stanza.md',
    'documents/reference.stanza.md',
  ]) {
    const path = join(project, ...file.split('/'));
    writeFileSync(path, readFileSync(path, 'utf8').replace(/\r\n/g, '\n'));
  }
});
afterEach(() => {
  rmSync(work, { recursive: true, force: true });
});

async function stanza(...argv: string[]): Promise<{ code: number; out: string; err: string }> {
  let out = '';
  let err = '';
  const code = await run(argv, {
    cwd: work,
    stdout: (text) => (out += text),
    stderr: (text) => (err += text),
  });
  return { code, out, err };
}

const bytesOf = (...path: string[]): Buffer => readFileSync(join(work, ...path));

describe('stanza validate', () => {
  it('suggests explicit list repairs without changing the project', async () => {
    const file = join(work, 'project', 'stanza.yaml');
    const before = `${readFileSync(file, 'utf8')}documents: [documents/introduction.stanza.md, gone.stanza.md]\n`;
    writeFileSync(file, before);
    const result = await stanza('validate', 'project');
    expect(result.code).toBe(1);
    expect(result.out).toContain(
      'Suggestion: remove "gone.stanza.md" from the documents list in stanza.yaml.',
    );
    expect(result.out).toContain(
      'Suggestion: add "documents/reference.stanza.md" to the documents list in stanza.yaml.',
    );
    expect(readFileSync(file, 'utf8')).toBe(before);
  });
  it('validates selected files with cross-document reference context and writes nothing', async () => {
    const first = join(work, 'project', 'documents', 'introduction.stanza.md');
    const second = join(work, 'project', 'documents', 'reference.stanza.md');
    const target = /<!-- stanza: #([0-9a-z]+)(?: | -->)/.exec(readFileSync(second, 'utf8'))?.[1];
    expect(target).toBeDefined();
    writeFileSync(second, `${readFileSync(second, 'utf8')}\n[Unrelated](#zzzzzzzzzz)\n`);
    writeFileSync(
      first,
      `---\nstanza-format: 1\ndocument-number: "EX-001"\n---\n\n[Other](#${target ?? ''})\n`,
    );
    const before = readFileSync(first);
    const result = await stanza(
      'validate',
      'project',
      '--file',
      'documents\\introduction.stanza.md',
    );
    expect(result.code).toBe(0);
    expect(result.out).toContain('Checked 1 document: 0 errors, 0 warnings.');
    expect(result.out).toContain('not a full-project check');
    expect(result.out).not.toContain('broken-reference');
    expect(readFileSync(first).equals(before)).toBe(true);
  });

  it('bounds displayed diagnostics without hiding the failure or total counts', async () => {
    writeFileSync(
      join(work, 'project', 'documents', 'bad.stanza.md'),
      '---\nstanza-format: 1\ndocument-number: "EX-003"\n---\n\n> unsupported quote\n\n[Missing](#aaaaaaaaaa) and [Missing too](#bbbbbbbbbb)\n',
    );
    const result = await stanza('validate', 'project', '--max-diagnostics', '1');
    expect(result.code).toBe(1);
    expect(result.out).toContain('warning blockquote-unsupported');
    expect(result.out).not.toContain(': error broken-reference:');
    expect(result.out).toContain('2 diagnostics omitted');
    expect(result.out).toContain('2 errors, 1 warning');
  });

  it('suggests a declared mark variant without changing the document or stylesheet', async () => {
    const file = join(work, 'project', 'documents', 'reference.stanza.md');
    const text = readFileSync(file, 'utf8').replace('# Reference', '# **Reference**');
    writeFileSync(file, text);
    const sheet = bytesOf('project', 'styles', 'default.yaml');
    const result = await stanza('validate', 'project');
    expect(result.code).toBe(1);
    expect(result.out).toContain(
      'Suggestion: declare the "strong" variant on style "heading-1" if intended.',
    );
    expect(readFileSync(file, 'utf8')).toBe(text);
    expect(bytesOf('project', 'styles', 'default.yaml').equals(sheet)).toBe(true);
  });
  it('keeps global duplicate-ID errors even when the later duplicate is unselected', async () => {
    const first = readFileSync(
      join(work, 'project', 'documents', 'introduction.stanza.md'),
      'utf8',
    );
    writeFileSync(join(work, 'project', 'documents', 'zz-duplicate.stanza.md'), first);
    const result = await stanza(
      'validate',
      'project',
      '--file',
      'documents/introduction.stanza.md',
    );
    expect(result.code).toBe(1);
    expect(result.out).toContain('zz-duplicate.stanza.md: error duplicate-id:');
  });

  it('reports an unknown selected file instead of succeeding with an empty selection', async () => {
    const result = await stanza('validate', 'project', '--file', 'missing.stanza.md');
    expect(result.code).toBe(1);
    expect(result.out).toContain('missing.stanza.md: error invalid-selection:');
  });

  it('accepts the example project', async () => {
    const result = await stanza('validate', 'project');
    expect(result.code).toBe(0);
    expect(result.out).toBe('Checked 2 documents: 0 errors, 0 warnings.\n');
  });

  it('uses the current directory by default', async () => {
    let out = '';
    const code = await run(['validate'], {
      cwd: join(work, 'project'),
      stdout: (text) => (out += text),
      stderr: () => undefined,
    });
    expect(code).toBe(0);
    expect(out).toContain('Checked 2 documents');
  });

  it('prints the problems of a document with file and line, and exits with 1', async () => {
    writeFileSync(
      join(work, 'project', 'documents', 'bad.stanza.md'),
      '---\nstanza-format: 1\ndocument-number: "N"\n---\n\n---\n\n<!-- stanza: .missing -->\nText\n',
    );
    const result = await stanza('validate', 'project');
    expect(result.code).toBe(1);
    expect(result.out).toContain('documents/bad.stanza.md:6: error thematic-break-unsupported: ');
    expect(result.out).toMatch(
      /documents\/bad\.stanza\.md: error unknown-style: .* \[blocks\[0\]\]/,
    );
    expect(result.out).toContain('Checked 3 documents: 2 errors, 0 warnings.');
  });

  it('exits with 2 when the project cannot be read', async () => {
    const result = await stanza('validate', 'nowhere');
    expect(result.code).toBe(2);
    expect(result.out).toContain('stanza.yaml: error file-unreadable: ');
  });
});

describe('stanza build', () => {
  it('reports a file that is open in Word instead of stopping, and writes the others', async () => {
    let out = '';
    const code = await run(['build', 'project'], {
      cwd: work,
      stdout: (text) => (out += text),
      stderr: () => undefined,
      // Windows refuses to write a file that Word has open; the storage does the same here.
      openStorage: (root) => {
        const storage = nodeStorage(root);
        return {
          ...storage,
          writeFile: (path, content) =>
            path.endsWith('introduction.docx')
              ? Promise.reject(Object.assign(new Error('EBUSY'), { code: 'EBUSY' }))
              : storage.writeFile(path, content),
        };
      },
    });
    expect(code).toBe(1);
    expect(out).toContain('output-not-written');
    expect(out).toContain('Wrote 1 file to build/.');
    expect(out).toContain('1 file could not be written; the others were.');
    expect(existsSync(join(work, 'project', 'build', 'documents', 'reference.docx'))).toBe(true);
  });

  it('builds without the protection with --protection none, and refuses other values', async () => {
    expect((await stanza('build', 'project', '--protection', 'none')).code).toBe(0);
    const settings = strFromU8(
      unzipSync(bytesOf('project', 'build', 'documents', 'introduction.docx'))[
        'word/settings.xml'
      ] ?? new Uint8Array(),
    );
    expect(settings).not.toContain('documentProtection');
    const wrong = await stanza('build', 'project', '--protection', 'read-only');
    expect(wrong.code).toBe(2);
    expect(wrong.err).toContain('--protection must be comments or none.');
  });

  it('writes one DOCX per document into build/ and says what it used', async () => {
    const result = await stanza('build', 'project');
    expect(result.code).toBe(0);
    expect(existsSync(join(work, 'project', 'build', 'documents', 'introduction.docx'))).toBe(true);
    expect(existsSync(join(work, 'project', 'build', 'documents', 'reference.docx'))).toBe(true);
    expect(result.out).toContain('Wrote 2 files to build/.');
    expect(result.out).toMatch(
      /stanza \d+\.\d+\.\d+, docx \d+\.\d+\.\d+, date 1980-01-01T00:00:00.000Z\./,
    );
  });

  it('writes the same bytes every time, with or without a date', async () => {
    for (const args of [[], ['--date', '2026-03-04']]) {
      await stanza('build', 'project', '--out', 'one', ...args);
      await stanza('build', 'project', '--out', 'two', ...args);
      expect(
        bytesOf('project', 'one', 'documents', 'reference.docx').equals(
          bytesOf('project', 'two', 'documents', 'reference.docx'),
        ),
      ).toBe(true);
    }
    await stanza('build', 'project', '--out', 'dated', '--date', '2026-03-04T05:06:07Z');
    expect(
      bytesOf('project', 'dated', 'documents', 'reference.docx').equals(
        bytesOf('project', 'one', 'documents', 'reference.docx'),
      ),
    ).toBe(false);
  });

  it('accepts a time with an offset, and a trailing slash in the output directory', async () => {
    const result = await stanza(
      'build',
      'project',
      '--date',
      '2026-03-04T06:06:07+01:00',
      '--out',
      'out/',
    );
    expect(result.code).toBe(0);
    expect(result.out).toContain('Wrote 2 files to out/.');
    expect(result.out).toContain('date 2026-03-04T05:06:07.000Z');
  });

  it('writes nothing when the project has errors', async () => {
    writeFileSync(
      join(work, 'project', 'documents', 'bad.stanza.md'),
      '---\nstanza-format: 1\ndocument-number: "N"\n---\n\n<!-- stanza: .missing -->\nText\n',
    );
    const result = await stanza('build', 'project');
    expect(result.code).toBe(1);
    expect(result.out).toContain('Nothing was written.');
    expect(existsSync(join(work, 'project', 'build'))).toBe(false);
  });
});

describe('stanza format', () => {
  it('reports stale paths read-only, dry-runs and fixes only selected reference hints', async () => {
    const source =
      '---\nstanza-format: 1\ndocument-number: "N-3"\n---\n\n[Introduction](old.stanza.md#k7m2q9x4zb)\n';
    const selected = join(work, 'project', 'notes.stanza.md');
    const unselected = join(work, 'project', 'unselected.stanza.md');
    writeFileSync(selected, source);
    writeFileSync(unselected, source.replace('N-3', 'N-4'));
    const before = readFileSync(unselected);
    const validate = await stanza('validate', 'project', '--file', 'notes.stanza.md');
    expect(validate.code).toBe(0);
    expect(validate.out).toContain('stale-reference-path');
    expect(validate.out).toContain('documents/introduction.stanza.md#k7m2q9x4zb');
    expect(readFileSync(selected, 'utf8')).toBe(source);
    const args = ['format', 'project', '--file', 'notes.stanza.md', '--fix-references'];
    expect((await stanza(...args, '--check')).code).toBe(1);
    expect(readFileSync(selected, 'utf8')).toBe(source);
    expect((await stanza(...args)).code).toBe(0);
    expect(readFileSync(selected, 'utf8')).toBe(
      source.replace('old.stanza.md', 'documents/introduction.stanza.md'),
    );
    expect(readFileSync(unselected).equals(before)).toBe(true);
    expect((await stanza(...args, '--check')).code).toBe(0);
    expect((await stanza('validate', 'project', '--fix-references')).code).toBe(2);
    expect((await stanza('format', selected, '--fix-references')).code).toBe(2);
  });
  const crlf = (...path: string[]): void => {
    const file = join(work, ...path);
    writeFileSync(file, readFileSync(file, 'utf8').replace(/\n/g, '\r\n'));
  };
  const introduction = join('project', 'documents', 'introduction.stanza.md');

  it('checks and formats repeated selected files without touching an unselected document', async () => {
    const selected = ['documents/introduction.stanza.md', 'documents/reference.stanza.md'];
    const unselected = join(work, 'project', 'documents', 'unselected.stanza.md');
    const untouched = '---\nstanza-format: 1\n---\n\n* keep this\n';
    writeFileSync(unselected, untouched);
    crlf(introduction);
    const before = bytesOf(introduction);
    const selection = selected.flatMap((file) => ['--file', file]);
    const checked = await stanza('format', 'project', ...selection, '--check');
    expect(checked.code).toBe(1);
    expect(checked.out).toContain('Checked 2 documents: 1 not canonical');
    expect(bytesOf(introduction).equals(before)).toBe(true);

    expect((await stanza('format', 'project', ...selection)).code).toBe(0);
    expect(readFileSync(unselected, 'utf8')).toBe(untouched);
    expect((await stanza('format', 'project', ...selection, '--check')).code).toBe(0);
  });

  it('leaves the example project as it is', async () => {
    const before = bytesOf(introduction);
    const result = await stanza('format', 'project');
    expect(result.code).toBe(0);
    expect(result.out).toBe('Checked 2 documents: 0 reformatted, 0 refused.\n');
    expect(bytesOf(introduction).equals(before)).toBe(true);
  });

  it('rewrites a document that is not canonical, once', async () => {
    const canonical = bytesOf(introduction);
    crlf(introduction);
    const result = await stanza('format', 'project');
    expect(result.code).toBe(0);
    expect(result.out).toContain('reformatted documents/introduction.stanza.md\n');
    expect(result.out).toContain('Checked 2 documents: 1 reformatted, 0 refused.');
    expect(bytesOf(introduction).equals(canonical)).toBe(true);
    expect((await stanza('format', 'project')).out).toContain('0 reformatted');
  });

  it('with --check, lists the documents that are not canonical, writes nothing, and exits with 1', async () => {
    crlf(introduction);
    const before = bytesOf(introduction);
    const result = await stanza('format', 'project', '--check');
    expect(result.code).toBe(1);
    expect(result.out).toContain('not canonical documents/introduction.stanza.md\n');
    expect(result.out).toContain('Checked 2 documents: 1 not canonical, 0 refused.');
    expect(bytesOf(introduction).equals(before)).toBe(true);
    expect((await stanza('format', 'project', '--check')).code).toBe(1);
  });

  it('exits with 0 when checking a canonical project', async () => {
    expect((await stanza('format', 'project', '--check')).code).toBe(0);
  });

  it('refuses a document with something the model cannot keep, and leaves it as it was', async () => {
    const file = join(work, 'project', 'documents', 'html.stanza.md');
    writeFileSync(file, '---\nstanza-format: 1\n---\n\n<div>raw</div>\n');
    const before = readFileSync(file);
    const result = await stanza('format', 'project');
    expect(result.code).toBe(1);
    expect(result.out).toContain('documents/html.stanza.md:5: warning html-unsupported: ');
    expect(result.out).toContain('Checked 3 documents: 0 reformatted, 1 refused.');
    expect(readFileSync(file).equals(before)).toBe(true);
  });

  it('formats a single document, which needs no project file', async () => {
    const file = join(work, 'solo.stanza.md');
    writeFileSync(file, '---\r\nstanza-format: 1\r\n---\r\n\r\n* one\r\n');
    const result = await stanza('format', 'solo.stanza.md');
    expect(result.code).toBe(0);
    expect(result.out).toContain('reformatted solo.stanza.md\n');
    expect(readFileSync(file, 'utf8')).toBe('---\nstanza-format: 1\n---\n\n- one\n');
  });

  it('exits with 2 when the document cannot be read', async () => {
    const result = await stanza('format', 'missing.stanza.md');
    expect(result.code).toBe(2);
    expect(result.out).toContain('missing.stanza.md: error file-unreadable: ');
  });
});

describe('stanza usage', () => {
  it('shows help and the versions', async () => {
    const help = await stanza('--help');
    expect(help.code).toBe(0);
    expect(help.out).toContain('Usage: stanza <command> [project] [options]');
    const version = await stanza('--version');
    expect(version.code).toBe(0);
    expect(version.out).toMatch(/^stanza \d+\.\d+\.\d+ \(docx \d+\.\d+\.\d+\)\n$/);
  });

  it.each([
    [[], 'no command given'],
    [['publish'], 'unknown command "publish"'],
    [['validate', 'a', 'b'], 'unexpected argument "b"'],
    [['validate', '--nope'], 'nope'],
    [['validate', '--out', 'x'], '--out, --date and --protection apply to build only'],
    [['format', '--date', '2026-03-04'], '--out, --date and --protection apply to build only'],
    [['build', '--check'], '--check applies to format and migrate only'],
    [['validate', '--check'], '--check applies to format and migrate only'],
    [['build', '--file', 'a.stanza.md'], '--file applies to validate and format only'],
    [['validate', '--file', '../a.stanza.md'], '--file must name a relative'],
    [['validate', '--file', 'styles/default.yaml'], '--file must name a relative'],
    [['format', 'a.stanza.md', '--file', 'a.stanza.md'], '--file needs a project directory'],
    [
      ['format', '--file', 'a.stanza.md', '--fix-stylesheet'],
      '--fix-stylesheet cannot be combined',
    ],
    [['format', '--max-diagnostics', '1'], '--max-diagnostics applies to validate only'],
    [['validate', '--max-diagnostics', '0'], '--max-diagnostics must be a positive safe integer'],
    [['validate', '--max-diagnostics', '1.5'], '--max-diagnostics must be a positive safe integer'],
    [['build', '--date', '2026-13-45'], '--date must be'],
    [['build', '--date', '2026-03-04T10:00'], '--date must be'],
    [['build', '--date', '1979-12-31'], '--date must be'],
    [['build', '--out', '../x'], '--out must be a relative path'],
    [['build', '--out', '/x'], '--out must be a relative path'],
    [['import'], 'import needs a Word file'],
    [['import', 'notes.txt'], 'import needs a Word file'],
    [['import', 'a.docx', 'project', 'x'], 'unexpected argument "x"'],
    [['import', 'a.docx', '--check'], 'import takes no options'],
    [['adopt'], 'adopt needs a Markdown file'],
    [['adopt', 'notes.txt'], 'adopt needs a Markdown file'],
    [['adopt', 'a.md', 'project', 'x'], 'unexpected argument "x"'],
    [['adopt', 'a.md', '--check'], 'adopt takes no options'],
  ])('refuses %j with exit code 2 and the usage', async (argv, message) => {
    const result = await stanza(...argv);
    expect(result.code).toBe(2);
    expect(result.err).toContain(message);
    expect(result.err).toContain('Usage: stanza');
    expect(result.out).toBe('');
  });
});

describe('stanza import', () => {
  const WORD =
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
    '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Scope</w:t></w:r></w:p>' +
    '<w:p><w:r><w:rPr><w:color w:val="FF0000"/></w:rPr><w:t>Some text.</w:t></w:r></w:p>' +
    '</w:body></w:document>';
  const writeWord = (name = 'Meeting notes.docx'): void => {
    writeFileSync(join(work, name), zipSync({ 'word/document.xml': strToU8(WORD) }));
  };
  const documentsOf = (...path: string[]): string => join(work, 'plain', 'documents', ...path);

  // A plain project has no required fields, which the example project has.
  beforeEach(async () => {
    await createProject(nodeStorage(join(work, 'plain')), {
      title: 'Plain',
      randomBytes: () => Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
    });
  });

  it('adds the content as a new document, names it after the file and lists the losses', async () => {
    writeWord();
    const result = await stanza('import', 'Meeting notes.docx', 'plain');
    expect(result.code).toBe(0);
    expect(result.out).toContain(
      'Imported Meeting notes.docx as documents/meeting-notes.stanza.md (1 ID assigned).',
    );
    expect(result.out).toContain('info: Direct formatting');
    const text = readFileSync(documentsOf('meeting-notes.stanza.md'), 'utf8');
    expect(text).toContain('# Scope');
    expect(text).toContain('Some text.');
    expect((await stanza('validate', 'plain')).out).toBe(
      'Checked 2 documents: 0 errors, 0 warnings.\n',
    );
  });

  it('shows what the project says about the new document, and exits with 1 for an error', async () => {
    writeWord();
    const result = await stanza('import', 'Meeting notes.docx', 'project');
    expect(result.code).toBe(1);
    expect(result.out).toContain('missing-field');
    expect(existsSync(join(work, 'project', 'documents', 'meeting-notes.stanza.md'))).toBe(true);
  });

  it('uses the current directory by default', async () => {
    writeWord();
    let out = '';
    const code = await run(['import', '../Meeting notes.docx'], {
      cwd: join(work, 'plain'),
      stdout: (text) => (out += text),
      stderr: () => undefined,
    });
    expect(code).toBe(0);
    expect(out).toContain('documents/meeting-notes.stanza.md');
  });

  it('never writes over a document: a second import gets a number', async () => {
    writeWord();
    await stanza('import', 'Meeting notes.docx', 'plain');
    const first = readFileSync(documentsOf('meeting-notes.stanza.md'), 'utf8');
    const again = await stanza('import', 'Meeting notes.docx', 'plain');
    expect(again.out).toContain('documents/meeting-notes-2.stanza.md');
    expect(readFileSync(documentsOf('meeting-notes.stanza.md'), 'utf8')).toBe(first);
    expect(existsSync(documentsOf('meeting-notes-2.stanza.md'))).toBe(true);
  });

  it('says so, with exit code 2, when the Word file cannot be read', async () => {
    const result = await stanza('import', 'missing.docx', 'plain');
    expect(result.code).toBe(2);
    expect(result.err).toContain('cannot read missing.docx');
  });

  it('refuses a file that is not a DOCX, and writes nothing', async () => {
    writeFileSync(join(work, 'old.docx'), Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0, 0]));
    const result = await stanza('import', 'old.docx', 'plain');
    expect(result.code).toBe(2);
    expect(result.err).toContain('old Word file');
    expect(existsSync(documentsOf('old.stanza.md'))).toBe(false);
  });

  it('refuses a folder that is not a project', async () => {
    writeWord();
    const result = await stanza('import', 'Meeting notes.docx', 'nowhere');
    expect(result.code).toBe(2);
    expect(result.err).toContain('no project in order');
  });
});

describe('stanza adopt', () => {
  const MARKDOWN = '# Meeting notes\n\nSome *text*.\n\n> quoted\n\n---\n';
  const writeMarkdown = (name = 'Meeting notes.md', text = MARKDOWN): void => {
    writeFileSync(join(work, name), text);
  };
  const documentsOf = (...path: string[]): string => join(work, 'plain', 'documents', ...path);

  beforeEach(async () => {
    await createProject(nodeStorage(join(work, 'plain')), {
      title: 'Plain',
      randomBytes: () => Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
    });
  });

  it('adds the Markdown as a new document, leaves the original and lists the losses', async () => {
    writeMarkdown();
    const result = await stanza('adopt', 'Meeting notes.md', 'plain');
    expect(result.code).toBe(0);
    expect(result.out).toContain(
      'Adopted Meeting notes.md as documents/meeting-notes.stanza.md (1 ID assigned).',
    );
    expect(result.out).toContain('warning: Thematic breaks (horizontal rules) were left out.');
    expect(result.out).toContain('info: Block quotes were written as ordinary blocks.');
    const text = readFileSync(documentsOf('meeting-notes.stanza.md'), 'utf8');
    expect(text).toContain('# Meeting notes');
    expect(text).toContain('Some *text*.');
    expect(readFileSync(join(work, 'Meeting notes.md'), 'utf8')).toBe(MARKDOWN);
    expect((await stanza('validate', 'plain')).out).toBe(
      'Checked 2 documents: 0 errors, 0 warnings.\n',
    );
  });

  it('shows what the project says about the new document, and exits with 1 for an error', async () => {
    writeMarkdown();
    const result = await stanza('adopt', 'Meeting notes.md', 'project');
    expect(result.code).toBe(1);
    expect(result.out).toContain('missing-field');
    expect(existsSync(join(work, 'project', 'documents', 'meeting-notes.stanza.md'))).toBe(true);
  });

  it('never writes over a document: a second adoption gets a number', async () => {
    writeMarkdown();
    await stanza('adopt', 'Meeting notes.md', 'plain');
    const first = readFileSync(documentsOf('meeting-notes.stanza.md'), 'utf8');
    const again = await stanza('adopt', 'Meeting notes.md', 'plain');
    expect(again.out).toContain('documents/meeting-notes-2.stanza.md');
    expect(readFileSync(documentsOf('meeting-notes.stanza.md'), 'utf8')).toBe(first);
  });

  it('says so, with exit code 2, when the file cannot be read', async () => {
    const result = await stanza('adopt', 'missing.md', 'plain');
    expect(result.code).toBe(2);
    expect(result.err).toContain('cannot read missing.md');
  });

  it('refuses a file that is a Stanza document already, and writes nothing', async () => {
    writeMarkdown('doc.md', '---\nstanza-format: 1\ntitle: T\n---\n\nText\n');
    const result = await stanza('adopt', 'doc.md', 'plain');
    expect(result.code).toBe(2);
    expect(result.err).toContain('is a Stanza document');
    expect(existsSync(documentsOf('doc.stanza.md'))).toBe(false);
  });

  it('refuses a folder that is not a project', async () => {
    writeMarkdown();
    const result = await stanza('adopt', 'Meeting notes.md', 'nowhere');
    expect(result.code).toBe(2);
    expect(result.err).toContain('no project in order');
  });
});

describe('stanza format --assign-ids', () => {
  const IDS = ['aaaaaaaaaa', 'bbbbbbbbbb', 'cccccccccc'];
  async function assign(...argv: string[]): Promise<{ code: number; out: string; err: string }> {
    let out = '';
    let err = '';
    let next = 0;
    const code = await run(argv, {
      cwd: work,
      stdout: (text) => (out += text),
      stderr: (text) => (err += text),
      generateId: () => IDS[next++] ?? 'zzzzzzzzzz',
    });
    return { code, out, err };
  }
  const reference = (): string => join(work, 'project', 'documents', 'reference.stanza.md');
  const withoutIds = (): void => {
    writeFileSync(
      reference(),
      readFileSync(reference(), 'utf8').replace(/<!-- stanza: #\w+ -->\n(?=#)/g, ''),
    );
  };

  it('adds the missing IDs, and then has nothing left to do', async () => {
    withoutIds();
    expect((await stanza('validate', 'project')).out).toContain('warning missing-id');
    const result = await assign('format', 'project', '--assign-ids');
    expect(result.code).toBe(0);
    expect(result.out).toMatch(/reformatted documents\/reference\.stanza\.md \(\d IDs? assigned\)/);
    expect(result.out).toMatch(/Checked 2 documents: 1 reformatted, 0 refused, \d IDs? assigned\./);
    expect(readFileSync(reference(), 'utf8')).toContain('<!-- stanza: #aaaaaaaaaa -->');
    const again = await assign('format', 'project', '--assign-ids');
    expect(again.out).toBe('Checked 2 documents: 0 reformatted, 0 refused, 0 IDs assigned.\n');
  });

  it('counts a missing ID as not canonical when checking, and writes nothing', async () => {
    withoutIds();
    const before = readFileSync(reference(), 'utf8');
    const result = await assign('format', 'project', '--assign-ids', '--check');
    expect(result.code).toBe(1);
    expect(result.out).toMatch(
      /not canonical documents\/reference\.stanza\.md \(\d IDs? missing\)/,
    );
    expect(readFileSync(reference(), 'utf8')).toBe(before);
  });

  it('needs a project, and belongs to format', async () => {
    const single = await assign('format', 'project/documents/reference.stanza.md', '--assign-ids');
    expect(single.code).toBe(2);
    expect(single.err).toContain('--assign-ids needs a project directory');
    const other = await assign('build', 'project', '--assign-ids');
    expect(other.code).toBe(2);
    expect(other.err).toContain('--assign-ids applies to format only');
  });

  it('uses random IDs of the right shape by default', async () => {
    withoutIds();
    const result = await stanza('format', 'project', '--assign-ids');
    expect(result.code).toBe(0);
    expect(readFileSync(reference(), 'utf8')).toMatch(/<!-- stanza: #[0-9a-hjkmnp-tv-z]{10} -->/);
    expect((await stanza('validate', 'project')).out).toBe(
      'Checked 2 documents: 0 errors, 0 warnings.\n',
    );
  });
});

describe('stanza format --fix-stylesheet', () => {
  const sheet = (): string => join(work, 'project', 'styles', 'default.yaml');
  // A stylesheet from before ADR 0065, with the colors written in the styles.
  const withRawColors = (): string => {
    const raw = readFileSync(sheet(), 'utf8')
      .replace('background: surface', "background: '#F2F2F2'")
      .replace('highlight: white', "highlight: '#123456'");
    writeFileSync(sheet(), raw);
    return raw;
  };

  it('is suggested by validate, and moves the colors into tokens', async () => {
    withRawColors();
    const invalid = await stanza('validate', 'project');
    expect(invalid.code).toBe(1);
    expect(invalid.out).toContain('error raw-color');
    expect(invalid.out).toContain('stanza format --fix-stylesheet');

    const fixed = await stanza('format', 'project', '--fix-stylesheet');
    expect(fixed.code).toBe(0);
    expect(fixed.out).toContain(
      'reformatted styles/default.yaml (2 values to tokens, 1 token added)',
    );
    const text = readFileSync(sheet(), 'utf8');
    expect(text).toContain('background: surface');
    expect(text).toContain('highlight: color-123456');
    expect(text).toContain("color-123456: '#123456'");
    expect((await stanza('validate', 'project')).code).toBe(0);

    const again = await stanza('format', 'project', '--fix-stylesheet');
    expect(again.out).toBe('Checked 2 documents: 0 reformatted, 0 refused.\n');
    expect(readFileSync(sheet(), 'utf8')).toBe(text);
  });

  it('only lists the stylesheet when checking', async () => {
    const raw = withRawColors();
    const result = await stanza('format', 'project', '--fix-stylesheet', '--check');
    expect(result.code).toBe(1);
    expect(result.out).toContain('not canonical styles/default.yaml (2 values to tokens');
    expect(readFileSync(sheet(), 'utf8')).toBe(raw);
  });

  it('needs a project, and belongs to format', async () => {
    const single = await stanza(
      'format',
      'project/documents/reference.stanza.md',
      '--fix-stylesheet',
    );
    expect(single.code).toBe(2);
    expect(single.err).toContain('--fix-stylesheet needs a project directory');
    const other = await stanza('validate', 'project', '--fix-stylesheet');
    expect(other.code).toBe(2);
    expect(other.err).toContain('--fix-stylesheet applies to format only');
  });
});

describe('stanza migrate', () => {
  /** Turns the copied example project back into a Phrase project, as it was before the rename. */
  function makeLegacy(): void {
    const project = join(work, 'project');
    const files = [
      ['stanza.yaml', 'phrase.yaml'],
      ['styles/default.yaml', 'styles/default.yaml'],
      ['documents/introduction.stanza.md', 'documents/introduction.phrase.md'],
      ['documents/reference.stanza.md', 'documents/reference.phrase.md'],
    ];
    for (const [from = '', to = ''] of files) {
      const text = readFileSync(join(project, ...from.split('/')), 'utf8')
        .replace(/^stanza-format:/gm, 'phrase-format:')
        .replace(/^<!-- stanza:/gm, '<!-- phrase:')
        .replace(/\(stanza:/g, '(phrase:');
      rmSync(join(project, ...from.split('/')));
      writeFileSync(join(project, ...to.split('/')), text);
    }
  }

  it('reports a Phrase project in validate and names the fix', async () => {
    makeLegacy();
    const result = await stanza('validate', 'project');
    expect(result.code).toBe(1);
    expect(result.out).toContain('phrase.yaml: error legacy-format:');
    expect(result.out).toContain('stanza migrate');
  });

  it('lists the files with --check and writes nothing', async () => {
    makeLegacy();
    const result = await stanza('migrate', 'project', '--check');
    expect(result.code).toBe(1);
    expect(result.out).toContain('to migrate phrase.yaml -> stanza.yaml');
    expect(result.out).toContain(
      'to migrate documents/introduction.phrase.md -> documents/introduction.stanza.md',
    );
    expect(existsSync(join(work, 'project', 'phrase.yaml'))).toBe(true);
    expect(existsSync(join(work, 'project', 'stanza.yaml'))).toBe(false);
  });

  it('migrates the files, after which the project validates and a second run does nothing', async () => {
    makeLegacy();
    const result = await stanza('migrate', 'project');
    expect(result.code).toBe(0);
    expect(result.out).toContain('Migrated 4 files; IDs are unchanged.');
    for (const file of ['phrase.yaml', 'documents/introduction.phrase.md']) {
      expect(existsSync(join(work, 'project', ...file.split('/')))).toBe(false);
    }
    expect(readFileSync(join(work, 'project', 'stanza.yaml'), 'utf8')).toContain(
      'stanza-format: 1',
    );
    expect((await stanza('validate', 'project')).code).toBe(0);
    const again = await stanza('migrate', 'project');
    expect(again.code).toBe(0);
    expect(again.out).toContain('nothing to migrate');
  });
});

describe('stanza review push (ADR 0088)', () => {
  const DOCUMENT = 'project/documents/introduction.stanza.md';
  const pushed = (): string => join(work, 'review', 'introduction.docx');
  /** The pushed file as Word leaves it after a save: only the modified time changes. */
  const saveInWord = (): void => {
    const files = unzipSync(readFileSync(pushed()));
    const core = strFromU8(files['docProps/core.xml'] ?? new Uint8Array());
    files['docProps/core.xml'] = strToU8(
      core.replace(
        /(<dcterms:modified\b[^>]*>)[^<]*/,
        (_match, open: string) => `${open}2026-11-24T17:37:12.1234567Z`,
      ),
    );
    writeFileSync(pushed(), zipSync(files));
  };

  it('writes the document to a folder, replaces it, and refuses a save that was not pulled', async () => {
    mkdirSync(join(work, 'review'));
    const first = await stanza('review', 'push', DOCUMENT, 'review', 'project');
    expect(first.err).toBe('');
    expect(first.code).toBe(0);
    expect(first.out).toBe(
      'Wrote review/introduction.docx, built from documents/introduction.stanza.md.\n',
    );
    const again = await stanza('review', 'push', DOCUMENT, 'review', 'project');
    expect(again.out).toBe(
      'Replaced review/introduction.docx, built from documents/introduction.stanza.md.\n',
    );

    saveInWord();
    const saved = readFileSync(pushed());
    const refused = await stanza('review', 'push', DOCUMENT, 'review', 'project');
    expect(refused.code).toBe(2);
    expect(refused.err).toContain(
      'review/introduction.docx was saved in Word on 2026-11-24 17:37 UTC, after it was pushed, and that version has not been pulled.',
    );
    expect(readFileSync(pushed())).toEqual(saved);

    const forced = await stanza('review', 'push', DOCUMENT, 'review', 'project', '--force');
    expect(forced.out).toContain('Replaced review/introduction.docx');
    expect(readFileSync(pushed())).not.toEqual(saved);
  });

  it('says that the comments of a file it replaces are no longer in it', async () => {
    mkdirSync(join(work, 'review'));
    await stanza('review', 'push', DOCUMENT, 'review', 'project');
    const files = unzipSync(readFileSync(pushed()));
    files['word/comments.xml'] = strToU8(
      '<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
        '<w:comment w:id="0" w:author="Ada"><w:p><w:r><w:t>Why?</w:t></w:r></w:p></w:comment>' +
        '</w:comments>',
    );
    writeFileSync(pushed(), zipSync(files));
    const again = await stanza('review', 'push', DOCUMENT, 'review', 'project');
    expect(again.out).toContain(
      '  review/introduction.docx had 1 comment. The new file is a clean copy of the document, so they are no longer in it; they stay in the review documents, where none of their threads is open.\n',
    );
  });

  it('writes a new file beside it with --new, and to a path that is given', async () => {
    mkdirSync(join(work, 'review'));
    await stanza('review', 'push', DOCUMENT, 'review', 'project');
    const fresh = await stanza('review', 'push', DOCUMENT, 'review', 'project', '--new');
    expect(fresh.code).toBe(0);
    expect(fresh.out).toMatch(/^Wrote review\/introduction-\d{4}-\d{2}-\d{2}\.docx, /);
    const named = await stanza('review', 'push', DOCUMENT, 'review/for-anna.docx', 'project');
    expect(named.out).toContain('Wrote review/for-anna.docx');
    expect(existsSync(join(work, 'review', 'for-anna.docx'))).toBe(true);
  });

  it('says what is wrong with the arguments', async () => {
    expect((await stanza('review', 'push', DOCUMENT, 'nowhere', 'project')).err).toContain(
      'the destination nowhere must be a folder that exists, or a .docx file.',
    );
    expect((await stanza('review', 'push', 'elsewhere/a.stanza.md', '.', 'project')).err).toContain(
      'elsewhere/a.stanza.md is not in the project project.',
    );
    expect((await stanza('build', 'project', '--new')).err).toContain(
      '--new and --force apply to review push only.',
    );
  });
});

describe('stanza review inspect', () => {
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  /** A reviewed file: one comment in the bookmark of the first heading, one before any bookmark. */
  const writeReviewed = (): void => {
    const body =
      `<w:p><w:commentRangeStart w:id="1"/><w:r><w:t>Title</w:t></w:r><w:commentRangeEnd w:id="1"/></w:p>` +
      `<w:p><w:bookmarkStart w:id="1" w:name="stanza_k7m2q9x4zb"/><w:commentRangeStart w:id="0"/>` +
      `<w:r><w:t>Heading</w:t></w:r><w:commentRangeEnd w:id="0"/><w:bookmarkEnd w:id="1"/></w:p>`;
    const comments =
      `<w:comment w:id="0" w:author="Manager" w:date="2026-11-21T10:00:00Z"><w:p><w:r><w:t>Why?</w:t></w:r></w:p></w:comment>` +
      `<w:comment w:id="1" w:author="Manager"><w:p><w:r><w:t>On the title.</w:t></w:r></w:p></w:comment>`;
    writeFileSync(
      join(work, 'reviewed.docx'),
      zipSync({
        'word/document.xml': strToU8(`<w:document ${W}><w:body>${body}</w:body></w:document>`),
        'word/comments.xml': strToU8(`<w:comments ${W}>${comments}</w:comments>`),
      }),
    );
  };

  it('lists comments by document and heading, and reports the rest', async () => {
    writeReviewed();
    const result = await stanza('review', 'inspect', 'reviewed.docx', 'project');
    expect(result.code).toBe(1);
    expect(result.out).toContain(
      'reviewed.docx: 1 bookmark, 2 comments, built from documents/introduction.stanza.md.',
    );
    expect(result.out).toContain('documents/introduction.stanza.md: ');
    // Without commentsExtensible.xml, `w:date` is local time whatever its `Z` says (ADR 0084).
    expect(result.out).toContain(
      '(#k7m2q9x4zb)\n    Manager, 2026-11-21 10:00 (time zone unknown): Why?',
    );
    expect(result.out).toContain('Not placed: 1 comment without a block of the project.');
    expect(result.out).toContain('    Manager: On the title.');
    expect(result.out).toContain(
      'no bookmark in the file (added since the build, or lost in review)',
    );
  });

  it('needs inspect or pull and a Word file', async () => {
    const result = await stanza('review', 'reviewed.docx');
    expect(result.code).toBe(2);
    expect(result.err).toContain('review needs inspect or pull and a Word file');
  });

  it('pulls the comments into a new review document, and keeps it out of the build', async () => {
    writeReviewed();
    const result = await stanza('review', 'pull', 'reviewed.docx', 'project');
    expect(result.code).toBe(0);
    expect(result.out).toContain(
      'Wrote reviews/introduction-undated.stanza.md, the review of documents/introduction.stanza.md.',
    );
    expect(result.out).toContain('Edits not checked: the file has no revision stamp.');
    const written = readFileSync(
      join(work, 'project', 'reviews', 'introduction-undated.stanza.md'),
      'utf8',
    );
    expect(written).toContain('reviews: "documents/introduction.stanza.md"');
    expect(written).toContain('Status: open.');
    const built = await stanza('build', 'project');
    expect(built.out).toContain('Wrote 2 files to build/.');
  });
});
