import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { HomeScene } from '../lib/scene/schemas';

/**
 * Client-viewer export: wraps the prebuilt standalone viewer bundle
 * (dist/viewer.js — three.js + the shared geometry core) and the scene JSON
 * into ONE self-contained HTML file a designer can send to a client. No cloud,
 * no links, no tracking: the file IS the deliverable.
 *
 * Bundle resolution: prefer a prebuilt dist/viewer.js (production + packaged
 * app); in dev, build it on demand with esbuild (a devDependency) and cache.
 */

const REPO_DIR = process.env.HOMECANVAS_REPO_DIR ?? path.resolve(import.meta.dirname || '', '..');
const PREBUILT = path.join(REPO_DIR, 'dist', 'viewer.js');
const STATIC_VIEWER = process.env.HOMECANVAS_STATIC_DIR ? path.join(process.env.HOMECANVAS_STATIC_DIR, 'viewer.js') : null;

let cachedBundle: string | null = null;

async function viewerBundle(): Promise<string | null> {
  if (cachedBundle) return cachedBundle;
  // Packaged app: the bundle ships inside the static dir. Dev/prod repo: dist/.
  for (const candidate of [STATIC_VIEWER, PREBUILT]) {
    if (candidate && existsSync(candidate)) {
      cachedBundle = await readFile(candidate, 'utf8');
      return cachedBundle;
    }
  }
  // Dev fallback: build on demand (esbuild is a devDependency of the repo).
  try {
    const { build } = await import('esbuild');
    const result = await build({
      entryPoints: [path.join(REPO_DIR, 'src/viewer/main.ts')],
      bundle: true,
      minify: true,
      format: 'iife',
      target: 'es2020',
      write: false,
      alias: { '@lib': path.join(REPO_DIR, 'lib') },
    });
    cachedBundle = result.outputFiles[0]?.text ?? null;
    return cachedBundle;
  } catch {
    return null;
  }
}

export async function viewerExportAvailable(): Promise<boolean> {
  return (await viewerBundle()) !== null;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/** Build the exported HTML, or null when no viewer bundle is available. */
export async function buildViewerHtml(scene: HomeScene, brand?: { name?: string }): Promise<string | null> {
  const bundle = await viewerBundle();
  if (!bundle) return null;
  const title = brand?.name?.trim() || scene.name || 'Home design';
  // `</script>`-safe embedding: escape `<` inside the JSON payload.
  const payload = JSON.stringify({ scene, brand: brand ?? {} }).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<title>${esc(title)}</title>
<style>
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; background: #0e0f15; color: #eef0f6;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  #stage { position: fixed; inset: 0; }
  #stage canvas { display: block; }
  .bar { position: fixed; top: 0; left: 0; right: 0; display: flex; align-items: center; gap: 10px;
    padding: 12px 16px; pointer-events: none; }
  #title { font-size: 15px; font-weight: 700; letter-spacing: -.2px;
    background: rgba(20,22,32,.55); backdrop-filter: blur(8px); padding: 8px 14px; border-radius: 11px; }
  #floors { display: flex; gap: 4px; margin-left: auto; pointer-events: auto;
    background: rgba(20,22,32,.55); backdrop-filter: blur(8px); border-radius: 11px; padding: 4px; }
  #floors:empty { display: none; }
  #floors button { border: 0; background: transparent; color: rgba(255,255,255,.72); font: inherit;
    font-size: 12.5px; font-weight: 600; padding: 6px 12px; border-radius: 8px; cursor: pointer; }
  #floors button.on { background: #4b46e5; color: #fff; }
  .views { position: fixed; bottom: 14px; left: 50%; transform: translateX(-50%); display: flex; gap: 4px;
    background: rgba(20,22,32,.55); backdrop-filter: blur(8px); border-radius: 11px; padding: 4px; }
  .views button { border: 0; background: transparent; color: rgba(255,255,255,.72); font: inherit;
    font-size: 12.5px; font-weight: 600; padding: 7px 14px; border-radius: 8px; cursor: pointer; }
  .views button:active { background: #4b46e5; color: #fff; }
  #credit { position: fixed; bottom: 14px; right: 14px; font-size: 11px; color: rgba(255,255,255,.45); }
  #credit a { color: rgba(255,255,255,.65); text-decoration: none; }
  #hint { position: fixed; bottom: 14px; left: 14px; font-size: 11px; color: rgba(255,255,255,.45); }
  @media (max-width: 600px) { #hint { display: none; } }
</style>
</head>
<body>
<div id="stage"></div>
<div class="bar"><span id="title"></span><div id="floors"></div></div>
<div class="views">
  <button id="view-orbit" type="button">Orbit</button>
  <button id="view-inside" type="button">Inside</button>
</div>
<span id="hint">drag to orbit · pinch/scroll to zoom</span>
<span id="credit">Made with <a href="https://tryhomecanvas.com">HomeCanvas</a></span>
<script>window.__HOMECANVAS__ = ${payload};</script>
<script>${bundle}</script>
</body>
</html>`;
}
