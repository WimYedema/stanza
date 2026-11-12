import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { createProject } from '@phrase/project';
import { nodeStorage } from './node-storage.js';
import { run } from './run.js';

const EXAMPLE = fileURLToPath(new URL('../../../fixtures/example-project/', import.meta.url));

let work: string;
beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), 'phrase-cli-'));
  const project = join(work, 'project');
  // A build of the fixture may have left a build directory behind.
  cpSync(EXAMPLE, project, { recursive: true, filter: (source) => basename(source) !== 'build' });
  // A working copy on Windows may have CRLF, and a canonical project has LF.
  for (const file of [
    'phrase.yaml',
    'styles/default.yaml',
    'documents/introduction.phrase.md',
    'documents/reference.phrase.md',
  ]) {
    const path = join(project, ...file.split('/'));
    writeFileSync(path, readFileSync(path, 'utf8').replace(/\r\n/g, '\n'));
  }
});
afterEach(() => {
  rmSync(work, { recursive: true, force: true });
});

async function phrase(...argv: string[]): Promise<{ code: number; out: string; err: string }> {
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

describe('phrase validate', () => {
  it('accepts the example project', async () => {
    const result = await phrase('validate', 'project');
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
      join(work, 'project', 'documents', 'bad.phrase.md'),
      '---\nphrase-format: 1\ndocument-number: "N"\n---\n\n---\n\n<!-- phrase: .missing -->\nText\n',
    );
    const result = await phrase('validate', 'project');
    expect(result.code).toBe(1);
    expect(result.out).toContain('documents/bad.phrase.md:6: error thematic-break-unsupported: ');
    expect(result.out).toMatch(
      /documents\/bad\.phrase\.md: error unknown-style: .* \[blocks\[0\]\]/,
    );
    expect(result.out).toContain('Checked 3 documents: 2 errors, 0 warnings.');
  });

  it('exits with 2 when the project cannot be read', async () => {
    const result = await phrase('validate', 'nowhere');
    expect(result.code).toBe(2);
    expect(result.out).toContain('phrase.yaml: error file-unreadable: ');
  });
});

describe('phrase build', () => {
  it('writes one DOCX per document into build/ and says what it used', async () => {
    const result = await phrase('build', 'project');
    expect(result.code).toBe(0);
    expect(existsSync(join(work, 'project', 'build', 'documents', 'introduction.docx'))).toBe(true);
    expect(existsSync(join(work, 'project', 'build', 'documents', 'reference.docx'))).toBe(true);
    expect(result.out).toContain('Wrote 2 files to build/.');
    expect(result.out).toMatch(
      /phrase \d+\.\d+\.\d+, docx \d+\.\d+\.\d+, date 1980-01-01T00:00:00.000Z\./,
    );
  });

  it('writes the same bytes every time, with or without a date', async () => {
    for (const args of [[], ['--date', '2026-03-04']]) {
      await phrase('build', 'project', '--out', 'one', ...args);
      await phrase('build', 'project', '--out', 'two', ...args);
      expect(
        bytesOf('project', 'one', 'documents', 'reference.docx').equals(
          bytesOf('project', 'two', 'documents', 'reference.docx'),
        ),
      ).toBe(true);
    }
    await phrase('build', 'project', '--out', 'dated', '--date', '2026-03-04T05:06:07Z');
    expect(
      bytesOf('project', 'dated', 'documents', 'reference.docx').equals(
        bytesOf('project', 'one', 'documents', 'reference.docx'),
      ),
    ).toBe(false);
  });

  it('accepts a time with an offset, and a trailing slash in the output directory', async () => {
    const result = await phrase(
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
      join(work, 'project', 'documents', 'bad.phrase.md'),
      '---\nphrase-format: 1\ndocument-number: "N"\n---\n\n<!-- phrase: .missing -->\nText\n',
    );
    const result = await phrase('build', 'project');
    expect(result.code).toBe(1);
    expect(result.out).toContain('Nothing was written.');
    expect(existsSync(join(work, 'project', 'build'))).toBe(false);
  });
});

describe('phrase format', () => {
  const crlf = (...path: string[]): void => {
    const file = join(work, ...path);
    writeFileSync(file, readFileSync(file, 'utf8').replace(/\n/g, '\r\n'));
  };
  const introduction = join('project', 'documents', 'introduction.phrase.md');

  it('leaves the example project as it is', async () => {
    const before = bytesOf(introduction);
    const result = await phrase('format', 'project');
    expect(result.code).toBe(0);
    expect(result.out).toBe('Checked 2 documents: 0 reformatted, 0 refused.\n');
    expect(bytesOf(introduction).equals(before)).toBe(true);
  });

  it('rewrites a document that is not canonical, once', async () => {
    const canonical = bytesOf(introduction);
    crlf(introduction);
    const result = await phrase('format', 'project');
    expect(result.code).toBe(0);
    expect(result.out).toContain('reformatted documents/introduction.phrase.md\n');
    expect(result.out).toContain('Checked 2 documents: 1 reformatted, 0 refused.');
    expect(bytesOf(introduction).equals(canonical)).toBe(true);
    expect((await phrase('format', 'project')).out).toContain('0 reformatted');
  });

  it('with --check, lists the documents that are not canonical, writes nothing, and exits with 1', async () => {
    crlf(introduction);
    const before = bytesOf(introduction);
    const result = await phrase('format', 'project', '--check');
    expect(result.code).toBe(1);
    expect(result.out).toContain('not canonical documents/introduction.phrase.md\n');
    expect(result.out).toContain('Checked 2 documents: 1 not canonical, 0 refused.');
    expect(bytesOf(introduction).equals(before)).toBe(true);
    expect((await phrase('format', 'project', '--check')).code).toBe(1);
  });

  it('exits with 0 when checking a canonical project', async () => {
    expect((await phrase('format', 'project', '--check')).code).toBe(0);
  });

  it('refuses a document with something the model cannot keep, and leaves it as it was', async () => {
    const file = join(work, 'project', 'documents', 'html.phrase.md');
    writeFileSync(file, '---\nphrase-format: 1\n---\n\n<div>raw</div>\n');
    const before = readFileSync(file);
    const result = await phrase('format', 'project');
    expect(result.code).toBe(1);
    expect(result.out).toContain('documents/html.phrase.md:5: warning html-unsupported: ');
    expect(result.out).toContain('Checked 3 documents: 0 reformatted, 1 refused.');
    expect(readFileSync(file).equals(before)).toBe(true);
  });

  it('formats a single document, which needs no project file', async () => {
    const file = join(work, 'solo.phrase.md');
    writeFileSync(file, '---\r\nphrase-format: 1\r\n---\r\n\r\n* one\r\n');
    const result = await phrase('format', 'solo.phrase.md');
    expect(result.code).toBe(0);
    expect(result.out).toContain('reformatted solo.phrase.md\n');
    expect(readFileSync(file, 'utf8')).toBe('---\nphrase-format: 1\n---\n\n- one\n');
  });

  it('exits with 2 when the document cannot be read', async () => {
    const result = await phrase('format', 'missing.phrase.md');
    expect(result.code).toBe(2);
    expect(result.out).toContain('missing.phrase.md: error file-unreadable: ');
  });
});

describe('phrase usage', () => {
  it('shows help and the versions', async () => {
    const help = await phrase('--help');
    expect(help.code).toBe(0);
    expect(help.out).toContain('Usage: phrase <command> [project] [options]');
    const version = await phrase('--version');
    expect(version.code).toBe(0);
    expect(version.out).toMatch(/^phrase \d+\.\d+\.\d+ \(docx \d+\.\d+\.\d+\)\n$/);
  });

  it.each([
    [[], 'no command given'],
    [['publish'], 'unknown command "publish"'],
    [['validate', 'a', 'b'], 'unexpected argument "b"'],
    [['validate', '--nope'], 'nope'],
    [['validate', '--out', 'x'], '--out and --date apply to build only'],
    [['format', '--date', '2026-03-04'], '--out and --date apply to build only'],
    [['build', '--check'], '--check applies to format only'],
    [['validate', '--check'], '--check applies to format only'],
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
    const result = await phrase(...argv);
    expect(result.code).toBe(2);
    expect(result.err).toContain(message);
    expect(result.err).toContain('Usage: phrase');
    expect(result.out).toBe('');
  });
});

describe('phrase import', () => {
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
    const result = await phrase('import', 'Meeting notes.docx', 'plain');
    expect(result.code).toBe(0);
    expect(result.out).toContain(
      'Imported Meeting notes.docx as documents/meeting-notes.phrase.md (1 ID assigned).',
    );
    expect(result.out).toContain('info: Direct formatting');
    const text = readFileSync(documentsOf('meeting-notes.phrase.md'), 'utf8');
    expect(text).toContain('# Scope');
    expect(text).toContain('Some text.');
    expect((await phrase('validate', 'plain')).out).toBe(
      'Checked 2 documents: 0 errors, 0 warnings.\n',
    );
  });

  it('shows what the project says about the new document, and exits with 1 for an error', async () => {
    writeWord();
    const result = await phrase('import', 'Meeting notes.docx', 'project');
    expect(result.code).toBe(1);
    expect(result.out).toContain('missing-field');
    expect(existsSync(join(work, 'project', 'documents', 'meeting-notes.phrase.md'))).toBe(true);
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
    expect(out).toContain('documents/meeting-notes.phrase.md');
  });

  it('never writes over a document: a second import gets a number', async () => {
    writeWord();
    await phrase('import', 'Meeting notes.docx', 'plain');
    const first = readFileSync(documentsOf('meeting-notes.phrase.md'), 'utf8');
    const again = await phrase('import', 'Meeting notes.docx', 'plain');
    expect(again.out).toContain('documents/meeting-notes-2.phrase.md');
    expect(readFileSync(documentsOf('meeting-notes.phrase.md'), 'utf8')).toBe(first);
    expect(existsSync(documentsOf('meeting-notes-2.phrase.md'))).toBe(true);
  });

  it('says so, with exit code 2, when the Word file cannot be read', async () => {
    const result = await phrase('import', 'missing.docx', 'plain');
    expect(result.code).toBe(2);
    expect(result.err).toContain('cannot read missing.docx');
  });

  it('refuses a file that is not a DOCX, and writes nothing', async () => {
    writeFileSync(join(work, 'old.docx'), Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0, 0]));
    const result = await phrase('import', 'old.docx', 'plain');
    expect(result.code).toBe(2);
    expect(result.err).toContain('old Word file');
    expect(existsSync(documentsOf('old.phrase.md'))).toBe(false);
  });

  it('refuses a folder that is not a project', async () => {
    writeWord();
    const result = await phrase('import', 'Meeting notes.docx', 'nowhere');
    expect(result.code).toBe(2);
    expect(result.err).toContain('no project in order');
  });
});

describe('phrase adopt', () => {
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
    const result = await phrase('adopt', 'Meeting notes.md', 'plain');
    expect(result.code).toBe(0);
    expect(result.out).toContain(
      'Adopted Meeting notes.md as documents/meeting-notes.phrase.md (1 ID assigned).',
    );
    expect(result.out).toContain('warning: Thematic breaks (horizontal rules) were left out.');
    expect(result.out).toContain('info: Block quotes were written as ordinary blocks.');
    const text = readFileSync(documentsOf('meeting-notes.phrase.md'), 'utf8');
    expect(text).toContain('# Meeting notes');
    expect(text).toContain('Some *text*.');
    expect(readFileSync(join(work, 'Meeting notes.md'), 'utf8')).toBe(MARKDOWN);
    expect((await phrase('validate', 'plain')).out).toBe(
      'Checked 2 documents: 0 errors, 0 warnings.\n',
    );
  });

  it('shows what the project says about the new document, and exits with 1 for an error', async () => {
    writeMarkdown();
    const result = await phrase('adopt', 'Meeting notes.md', 'project');
    expect(result.code).toBe(1);
    expect(result.out).toContain('missing-field');
    expect(existsSync(join(work, 'project', 'documents', 'meeting-notes.phrase.md'))).toBe(true);
  });

  it('never writes over a document: a second adoption gets a number', async () => {
    writeMarkdown();
    await phrase('adopt', 'Meeting notes.md', 'plain');
    const first = readFileSync(documentsOf('meeting-notes.phrase.md'), 'utf8');
    const again = await phrase('adopt', 'Meeting notes.md', 'plain');
    expect(again.out).toContain('documents/meeting-notes-2.phrase.md');
    expect(readFileSync(documentsOf('meeting-notes.phrase.md'), 'utf8')).toBe(first);
  });

  it('says so, with exit code 2, when the file cannot be read', async () => {
    const result = await phrase('adopt', 'missing.md', 'plain');
    expect(result.code).toBe(2);
    expect(result.err).toContain('cannot read missing.md');
  });

  it('refuses a file that is a Phrase document already, and writes nothing', async () => {
    writeMarkdown('doc.md', '---\nphrase-format: 1\ntitle: T\n---\n\nText\n');
    const result = await phrase('adopt', 'doc.md', 'plain');
    expect(result.code).toBe(2);
    expect(result.err).toContain('is a Phrase document');
    expect(existsSync(documentsOf('doc.phrase.md'))).toBe(false);
  });

  it('refuses a folder that is not a project', async () => {
    writeMarkdown();
    const result = await phrase('adopt', 'Meeting notes.md', 'nowhere');
    expect(result.code).toBe(2);
    expect(result.err).toContain('no project in order');
  });
});

describe('phrase format --assign-ids', () => {
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
  const reference = (): string => join(work, 'project', 'documents', 'reference.phrase.md');
  const withoutIds = (): void => {
    writeFileSync(
      reference(),
      readFileSync(reference(), 'utf8').replace(/<!-- phrase: #\w+ -->\n(?=#)/g, ''),
    );
  };

  it('adds the missing IDs, and then has nothing left to do', async () => {
    withoutIds();
    expect((await phrase('validate', 'project')).out).toContain('warning missing-id');
    const result = await assign('format', 'project', '--assign-ids');
    expect(result.code).toBe(0);
    expect(result.out).toMatch(/reformatted documents\/reference\.phrase\.md \(\d IDs? assigned\)/);
    expect(result.out).toMatch(/Checked 2 documents: 1 reformatted, 0 refused, \d IDs? assigned\./);
    expect(readFileSync(reference(), 'utf8')).toContain('<!-- phrase: #aaaaaaaaaa -->');
    const again = await assign('format', 'project', '--assign-ids');
    expect(again.out).toBe('Checked 2 documents: 0 reformatted, 0 refused, 0 IDs assigned.\n');
  });

  it('counts a missing ID as not canonical when checking, and writes nothing', async () => {
    withoutIds();
    const before = readFileSync(reference(), 'utf8');
    const result = await assign('format', 'project', '--assign-ids', '--check');
    expect(result.code).toBe(1);
    expect(result.out).toMatch(
      /not canonical documents\/reference\.phrase\.md \(\d IDs? missing\)/,
    );
    expect(readFileSync(reference(), 'utf8')).toBe(before);
  });

  it('needs a project, and belongs to format', async () => {
    const single = await assign('format', 'project/documents/reference.phrase.md', '--assign-ids');
    expect(single.code).toBe(2);
    expect(single.err).toContain('--assign-ids needs a project directory');
    const other = await assign('build', 'project', '--assign-ids');
    expect(other.code).toBe(2);
    expect(other.err).toContain('--assign-ids applies to format only');
  });

  it('uses random IDs of the right shape by default', async () => {
    withoutIds();
    const result = await phrase('format', 'project', '--assign-ids');
    expect(result.code).toBe(0);
    expect(readFileSync(reference(), 'utf8')).toMatch(/<!-- phrase: #[0-9a-hjkmnp-tv-z]{10} -->/);
    expect((await phrase('validate', 'project')).out).toBe(
      'Checked 2 documents: 0 errors, 0 warnings.\n',
    );
  });
});

describe('phrase format --fix-stylesheet', () => {
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
    const invalid = await phrase('validate', 'project');
    expect(invalid.code).toBe(1);
    expect(invalid.out).toContain('error raw-color');
    expect(invalid.out).toContain('phrase format --fix-stylesheet');

    const fixed = await phrase('format', 'project', '--fix-stylesheet');
    expect(fixed.code).toBe(0);
    expect(fixed.out).toContain(
      'reformatted styles/default.yaml (2 values to tokens, 1 token added)',
    );
    const text = readFileSync(sheet(), 'utf8');
    expect(text).toContain('background: surface');
    expect(text).toContain('highlight: color-123456');
    expect(text).toContain("color-123456: '#123456'");
    expect((await phrase('validate', 'project')).code).toBe(0);

    const again = await phrase('format', 'project', '--fix-stylesheet');
    expect(again.out).toBe('Checked 2 documents: 0 reformatted, 0 refused.\n');
    expect(readFileSync(sheet(), 'utf8')).toBe(text);
  });

  it('only lists the stylesheet when checking', async () => {
    const raw = withRawColors();
    const result = await phrase('format', 'project', '--fix-stylesheet', '--check');
    expect(result.code).toBe(1);
    expect(result.out).toContain('not canonical styles/default.yaml (2 values to tokens');
    expect(readFileSync(sheet(), 'utf8')).toBe(raw);
  });

  it('needs a project, and belongs to format', async () => {
    const single = await phrase(
      'format',
      'project/documents/reference.phrase.md',
      '--fix-stylesheet',
    );
    expect(single.code).toBe(2);
    expect(single.err).toContain('--fix-stylesheet needs a project directory');
    const other = await phrase('validate', 'project', '--fix-stylesheet');
    expect(other.code).toBe(2);
    expect(other.err).toContain('--fix-stylesheet applies to format only');
  });
});
