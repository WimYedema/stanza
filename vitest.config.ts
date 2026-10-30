import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Tests run against source, so they do not need a build first.
    alias: {
      '@phrase/core': fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)),
      '@phrase/format': fileURLToPath(new URL('./packages/format/src/index.ts', import.meta.url)),
      '@phrase/export-docx': fileURLToPath(
        new URL('./packages/export-docx/src/index.ts', import.meta.url),
      ),
      '@phrase/css': fileURLToPath(new URL('./packages/css/src/index.ts', import.meta.url)),
      '@phrase/project': fileURLToPath(new URL('./packages/project/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['packages/*/src/**/*.test.ts'],
    // Some tests go through many strings, and files in parallel slow each other down.
    testTimeout: 30_000,
  },
});
