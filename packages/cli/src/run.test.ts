import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { run } from './run.js';

const EXAMPLE = fileURLToPath(new URL('../../../fixtures/example-project/', import.meta.url));

let work: string;
beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), 'phrase-cli-'));
  cpSync(EXAMPLE, join(work, 'project'), { recursive: true });
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
    [['build', '--date', '2026-13-45'], '--date must be'],
    [['build', '--date', '2026-03-04T10:00'], '--date must be'],
    [['build', '--date', '1979-12-31'], '--date must be'],
    [['build', '--out', '../x'], '--out must be a relative path'],
    [['build', '--out', '/x'], '--out must be a relative path'],
  ])('refuses %j with exit code 2 and the usage', async (argv, message) => {
    const result = await phrase(...argv);
    expect(result.code).toBe(2);
    expect(result.err).toContain(message);
    expect(result.err).toContain('Usage: phrase');
    expect(result.out).toBe('');
  });
});
