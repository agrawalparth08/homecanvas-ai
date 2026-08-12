/**
 * Bundle the standalone client-viewer entry (src/viewer/main.ts) into
 * dist/viewer.js — a single IIFE with three.js + the shared geometry core
 * inlined. The sidecar embeds this bundle into exported client-viewer HTML
 * files. Run as part of `npm run build`; the dev sidecar also builds it
 * on demand when dist/viewer.js is missing.
 */
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

await build({
  entryPoints: [path.join(root, 'src/viewer/main.ts')],
  outfile: path.join(root, 'dist/viewer.js'),
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2020',
  logLevel: 'info',
  alias: { '@lib': path.join(root, 'lib') },
});
console.log('✓ client viewer bundle → dist/viewer.js');
