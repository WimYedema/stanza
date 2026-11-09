import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

const restrictImports = (group, message) => ({
  'no-restricted-imports': ['error', { patterns: [{ group, message }] }],
});

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '.venv/**',
      'spikes/**',
      'word-examples/**',
      '*.config.*',
      'packages/*/build.mjs',
    ],
  },
  eslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: [
          'packages/*/tsconfig.json',
          'packages/*/tsconfig.test.json',
          'packages/vscode/tsconfig.webview.json',
        ],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['packages/core/src/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: restrictImports(
      ['@phrase/*', 'node:*'],
      'core must not import other packages or Node built-ins.',
    ),
  },
  {
    files: ['packages/format/src/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: restrictImports(
      ['@phrase/*', '!@phrase/core', 'node:*'],
      'format may import only @phrase/core and no Node built-ins.',
    ),
  },
  {
    files: ['packages/export-docx/src/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: restrictImports(
      ['@phrase/*', '!@phrase/core', 'node:*'],
      'export-docx may import only @phrase/core and no Node built-ins.',
    ),
  },
  {
    files: ['packages/import-docx/src/**/*.ts'],
    ignores: ['**/*.test.ts', '**/*.testing.ts'],
    rules: restrictImports(
      ['@phrase/*', '!@phrase/core', 'node:*'],
      'import-docx may import only @phrase/core and no Node built-ins.',
    ),
  },
  {
    files: ['packages/css/src/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: restrictImports(
      ['@phrase/*', '!@phrase/core', 'node:*'],
      'css may import only @phrase/core and no Node built-ins.',
    ),
  },
  {
    files: ['packages/editor/src/**/*.ts'],
    ignores: ['**/*.test.ts', '**/*.testing.ts'],
    rules: restrictImports(
      ['@phrase/*', '!@phrase/core', '!@phrase/css', 'node:*'],
      'editor may import only core and css, and no Node built-ins.',
    ),
  },
  {
    files: ['packages/project/src/**/*.ts'],
    ignores: ['**/*.test.ts', '**/*.testing.ts'],
    rules: restrictImports(
      [
        '@phrase/*',
        '!@phrase/core',
        '!@phrase/format',
        '!@phrase/export-docx',
        '!@phrase/import-docx',
        'node:*',
      ],
      'project may import core, format, export-docx and import-docx, and no Node built-ins.',
    ),
  },
  {
    files: ['packages/vscode/src/host/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: restrictImports(
      ['@phrase/*', '!@phrase/core', '!@phrase/format', '!@phrase/project'],
      'The host side of the extension may import core, format and project, and not the editor.',
    ),
  },
  {
    files: ['packages/vscode/src/webview/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: restrictImports(
      [
        '@phrase/*',
        '!@phrase/core',
        '!@phrase/css',
        '!@phrase/format',
        '!@phrase/editor',
        'vscode',
        'node:*',
      ],
      'The webview may import core, css, format and the editor, and not vscode or Node.',
    ),
  },
  {
    files: ['packages/vscode/src/shared/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: restrictImports(
      ['@phrase/*', 'vscode', 'node:*'],
      'The messages are plain data and import nothing.',
    ),
  },
  {
    files: ['packages/cli/src/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: restrictImports(
      ['@phrase/*', '!@phrase/core', '!@phrase/project'],
      'cli may import only core and project.',
    ),
  },
);
