import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Tests run against source, so they do not need a build first.
    alias: {
      '@stanza/core': fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)),
      '@stanza/format': fileURLToPath(new URL('./packages/format/src/index.ts', import.meta.url)),
      '@stanza/export-docx': fileURLToPath(
        new URL('./packages/export-docx/src/index.ts', import.meta.url),
      ),
      '@stanza/css': fileURLToPath(new URL('./packages/css/src/index.ts', import.meta.url)),
      '@stanza/import-docx': fileURLToPath(
        new URL('./packages/import-docx/src/index.ts', import.meta.url),
      ),
      '@stanza/editor': fileURLToPath(new URL('./packages/editor/src/index.ts', import.meta.url)),
      '@stanza/project': fileURLToPath(new URL('./packages/project/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['packages/*/src/**/*.test.ts'],
    // Some tests go through many strings, and files in parallel slow each other down.
    testTimeout: 30_000,
  },
});
