// Builds the bundles of the extension: the code for the extension host, and the code for the two
// webviews, the document editor and the style editor. The packages it uses must be built first
// (`tsc -b` at the root).
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { build } from 'esbuild';

mkdirSync('dist', { recursive: true });

await build({
  entryPoints: ['src/host/extension.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  outfile: 'dist/extension.cjs',
  external: ['vscode'],
  minify: true,
  sourcemap: true,
  logLevel: 'warning',
});

// The two webviews share most of their code (the editor, the parser), so they are built together as
// ES modules and that code goes into shared chunks, instead of a full copy in each bundle. Chunks of
// an earlier build are removed first, so that the package does not take along stale ones.
for (const name of readdirSync('dist', { withFileTypes: true })) {
  if (name.isFile() && name.name.startsWith('chunk-')) rmSync(join('dist', name.name));
}
await build({
  entryPoints: { webview: 'src/webview/main.ts', styles: 'src/webview/styles-main.ts' },
  bundle: true,
  splitting: true,
  platform: 'browser',
  format: 'esm',
  target: 'es2022',
  outdir: 'dist',
  chunkNames: 'chunk-[hash]',
  minify: true,
  sourcemap: true,
  logLevel: 'warning',
});

console.log('built dist/extension.cjs, dist/webview.js and dist/styles.js');
