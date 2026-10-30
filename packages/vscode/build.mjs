// Builds the two bundles of the extension: the code for the extension host, and the code for the
// webview. The packages it uses must be built first (`tsc -b` at the root).
import { build } from 'esbuild';

await build({
  entryPoints: ['src/host/extension.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  outfile: 'dist/extension.cjs',
  external: ['vscode'],
  sourcemap: true,
  logLevel: 'warning',
});

await build({
  entryPoints: ['src/webview/main.ts'],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2022',
  outfile: 'dist/webview.js',
  sourcemap: true,
  logLevel: 'warning',
});

console.log('built dist/extension.cjs and dist/webview.js');
