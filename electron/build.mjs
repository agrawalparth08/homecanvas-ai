/**
 * Bundle the Electron main process and the Hono sidecar to standalone CJS files
 * under dist-electron/. The sidecar is TS (tsx in dev); a packaged app can't run
 * tsx, so esbuild inlines all the pure lib/ + server/ code into one file. Native
 * + runtime-resolved deps stay external.
 */
import { build } from 'esbuild';

const common = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  logLevel: 'info',
  // import.meta is empty in CJS output. The packaged app overrides every path
  // that used import.meta.dirname via env (HOMECANVAS_DATA_DIR / _BLENDER_SCRIPT),
  // but define a string fallback so path.resolve() never receives undefined and
  // crashes the sidecar on load, even if an env is somehow unset.
  define: { 'import.meta.dirname': '""' },
};

// Electron main — `electron` is provided by the runtime, never bundled.
await build({
  ...common,
  entryPoints: ['electron/main.ts'],
  outfile: 'dist-electron/main.cjs',
  external: ['electron'],
});

// Sidecar — onnxruntime-node is loaded via an opaque dynamic import and resolved
// from node_modules at runtime, so keep it external (and never pull in electron).
await build({
  ...common,
  entryPoints: ['server/index.ts'],
  outfile: 'dist-electron/sidecar.cjs',
  external: ['onnxruntime-node', 'electron'],
});

console.log('✓ electron bundles → dist-electron/{main,sidecar}.cjs');
