import { serve } from '@hono/node-server';
import { existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Hono } from 'hono';
import { detectPrivateHomeFiles } from '../lib/fixtures/private-home';
import { autoTraceDxf, autoTraceDxfToScene } from '../lib/extraction/auto-trace';
import { buildSceneFromPrimitives } from '../lib/extraction/build-scene';
import { parsePrimitivePlan } from '../lib/extraction/primitive-plan';
import { bridgeEnabled, readResult, writeRequest } from './bridge';
import { autoAnswer, bridgeAutoEnabled } from './bridge-auto';
import { buildSceneExport } from './export';
import { detectBlender, readRender, renderWithBlender } from './adapters/blender';
import { cubicasaAvailable, runCubicasaSidecar } from './adapters/cubicasa';
import { DesignVariantSchema, HomeSceneSchema } from '../lib/scene/schemas';
import { hasErrors, validateScene } from '../lib/scene/validation';
import { EMPTY_ASSET_MANIFEST } from '../lib/assets/manifest';
import {
  ASSET_CACHE,
  PRIVATE_ROOT,
  isProjectId,
  listVariants,
  loadScene,
  loadVariant,
  resolvePrivateFile,
  saveManualScene,
  saveRasterizedPage,
  saveRawUpload,
  saveScene,
  saveVariant,
} from './storage';

/**
 * Local sidecar — the app's only backend. Binds 127.0.0.1 exclusively and
 * checks Origin on every request: a random website must not be able to poke
 * a localhost API that reads/writes private files (CSRF/DNS-rebinding).
 */

const PORT = Number(process.env.HOMECANVAS_PORT) || 4871;
const ALLOWED_ORIGINS = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  // Packaged Electron app: the window is served by this sidecar, so same-origin
  // POSTs carry this Origin (GETs carry none). Derived from PORT so it matches.
  `http://127.0.0.1:${PORT}`,
  `http://localhost:${PORT}`,
]);
// DNS-rebinding defense: after a rebind the browser still sends the attacker's
// hostname in Host, so a strict Host allow-list rejects it even on a no-Origin
// GET (which is how same-origin reads evade the Origin check).
const ALLOWED_HOSTS = new Set([
  `127.0.0.1:${PORT}`,
  `localhost:${PORT}`,
]);

const app = new Hono();

app.use('*', async (c, next) => {
  const host = c.req.header('host');
  if (!host || !ALLOWED_HOSTS.has(host)) {
    return c.json({ error: 'forbidden host' }, 403);
  }
  const origin = c.req.header('origin');
  // Same-origin requests proxied by Vite carry no Origin header — allow those;
  // anything cross-origin must be the dev SPA itself.
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return c.json({ error: 'forbidden origin' }, 403);
  }
  await next();
});

app.get('/api/health', (c) => c.json({ ok: true, name: 'homecanvas-sidecar' }));

// Optional "max quality" render via headless Blender Cycles (the quality ceiling).
app.get('/api/render/blender/available', (c) => c.json({ available: !!detectBlender() }));

app.post('/api/render/blender', async (c) => {
  const body = (await c.req.json().catch(() => null)) as
    | { scene?: unknown; samples?: number; res?: string; gpu?: boolean; hdri?: string }
    | null;
  const parsed = HomeSceneSchema.safeParse(body?.scene);
  if (!parsed.success) return c.json({ error: 'invalid scene' }, 400);
  const result = await renderWithBlender(parsed.data, {
    samples: typeof body?.samples === 'number' ? body.samples : 128,
    res: typeof body?.res === 'string' ? body.res : '1280x800',
    gpu: body?.gpu === true,
    ...(typeof body?.hdri === 'string' ? { hdri: body.hdri } : {}),
  });
  if (!result.ok) return c.json({ error: result.reason }, 503);
  return c.body(await readRender(result.pngPath), 200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
});

// Optional CubiCasa5k extraction booster (gitignored, user-converted model + onnxruntime).
app.get('/api/extract/cubicasa/available', async (c) => c.json({ available: await cubicasaAvailable() }));

app.post('/api/extract/cubicasa', async (c) => {
  const w = Number(c.req.query('w'));
  const h = Number(c.req.query('h'));
  const mmPerPx = Number(c.req.query('mmPerPx')) || 10;
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return c.json({ error: 'bad dims' }, 400);
  const rgba = new Uint8Array(await c.req.arrayBuffer());
  if (rgba.length < w * h * 4) return c.json({ error: 'rgba payload too small' }, 400);
  const plan = await runCubicasaSidecar(rgba, w, h, mmPerPx);
  if (!plan) return c.json({ error: 'cubicasa unavailable' }, 503);
  return c.json({ plan });
});

// ---------------------------------------------------------------------------
// private home manifest
// ---------------------------------------------------------------------------

app.get('/api/private-home/manifest', async (c) => {
  if (!existsSync(PRIVATE_ROOT)) {
    return c.json({ exists: false, manifest: null });
  }
  const manifest = await detectPrivateHomeFiles(PRIVATE_ROOT);
  return c.json({ exists: true, manifest });
});

// Serve a private file (PDF/image) so the browser can rasterize/display it.
app.get('/api/private-home/file/*', async (c) => {
  const rel = decodeURIComponent(c.req.path.replace('/api/private-home/file/', ''));
  const resolved = resolvePrivateFile(rel);
  if (!resolved || !existsSync(resolved)) return c.json({ error: 'not found' }, 404);
  const data = await readFile(resolved);
  const ext = path.extname(resolved).toLowerCase();
  const type =
    ext === '.pdf'
      ? 'application/pdf'
      : ext === '.png'
        ? 'image/png'
        : ext === '.jpg' || ext === '.jpeg'
          ? 'image/jpeg'
          : 'application/octet-stream';
  return c.body(new Uint8Array(data), 200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
});

// Save a client-rasterized plan page (base64 PNG) -> returns its private path.
app.post('/api/private-home/rasterized', async (c) => {
  const body = (await c.req.json()) as { name?: string; dataUrl?: string };
  if (!body.name || !body.dataUrl) return c.json({ error: 'name and dataUrl required' }, 400);
  const base64 = body.dataUrl.replace(/^data:image\/png;base64,/, '');
  const png = Buffer.from(base64, 'base64');
  const rel = await saveRasterizedPage(body.name, new Uint8Array(png));
  return c.json({ ok: true, filePath: rel });
});

// Upload a plan/photo into raw/ (local copy only — never leaves the machine).
app.post('/api/private-home/upload', async (c) => {
  const body = (await c.req.json()) as { name?: string; dataUrl?: string };
  if (!body.name || !body.dataUrl) return c.json({ error: 'name and dataUrl required' }, 400);
  const comma = body.dataUrl.indexOf(',');
  const bytes = Buffer.from(comma >= 0 ? body.dataUrl.slice(comma + 1) : body.dataUrl, 'base64');
  if (bytes.length === 0) return c.json({ error: 'empty file' }, 400);
  const rel = await saveRawUpload(body.name, new Uint8Array(bytes));
  return c.json({ ok: true, filePath: rel });
});

// Best-effort auto-trace of a CAD file (DXF = reliable; PDFs use the wizard).
app.post('/api/private-home/auto-trace', async (c) => {
  const { filePath } = (await c.req.json()) as { filePath?: string };
  if (!filePath) return c.json({ error: 'filePath required' }, 400);
  const abs = resolvePrivateFile(filePath);
  if (!abs || !existsSync(abs)) return c.json({ error: 'file not found' }, 404);
  if (!filePath.toLowerCase().endsWith('.dxf')) {
    return c.json({ ok: false, reason: 'Auto-trace currently supports DXF (clean CAD). For PDFs/scans, use the tracing wizard.' });
  }
  try {
    const res = autoTraceDxf(await readFile(abs, 'utf8'), { minArea: 100 * 100 });
    return c.json({ ok: true, count: res.rooms.length, unitsToMm: res.unitsToMm, rooms: res.rooms });
  } catch (e) {
    return c.json({ ok: false, reason: (e as Error).message });
  }
});

// Build a full HomeScene from a CAD file (DXF) or a posted PrimitivePlan, via the
// shared spine (buildSceneFromPrimitives). Returns a validated scene the verify
// wizard opens for correction instead of starting blank.
app.post('/api/private-home/build-scene', async (c) => {
  let body: { filePath?: string; plan?: unknown };
  try {
    body = (await c.req.json()) as { filePath?: string; plan?: unknown };
  } catch {
    return c.json({ ok: false, reason: 'invalid JSON body' }, 400);
  }
  const opts = { id: 'extracted', name: 'Imported home', now: new Date().toISOString() };
  try {
    let scene;
    if (body.filePath) {
      const abs = resolvePrivateFile(body.filePath);
      if (!abs || !existsSync(abs)) return c.json({ ok: false, reason: 'file not found' }, 404);
      if (!body.filePath.toLowerCase().endsWith('.dxf')) {
        return c.json({ ok: false, reason: 'build-scene from a file currently supports DXF (clean CAD). For PDFs/scans, use the tracing wizard.' });
      }
      scene = autoTraceDxfToScene(await readFile(abs, 'utf8'), opts);
    } else if (body.plan !== undefined) {
      scene = buildSceneFromPrimitives(parsePrimitivePlan(body.plan), opts);
    } else {
      return c.json({ ok: false, reason: 'provide a `filePath` (.dxf) or a `plan` (PrimitivePlan)' }, 400);
    }
    const parsed = HomeSceneSchema.safeParse(scene);
    if (!parsed.success) return c.json({ ok: false, reason: 'built scene failed schema validation', detail: parsed.error.message }, 422);
    // Geometry errors are EXPECTED from messy raster extraction. Don't dead-end:
    // return the imperfect scene + the flagged issues so the verify wizard can open
    // it for correction (its whole purpose) instead of throwing the extraction away.
    const issues = validateScene(parsed.data).filter((i) => i.severity === 'error');
    const floor = parsed.data.floors[0]!;
    return c.json({
      ok: true,
      scene: parsed.data,
      summary: { rooms: floor.rooms.length, walls: floor.walls.length, openings: floor.openings.length },
      issues,
    });
  } catch (e) {
    return c.json({ ok: false, reason: (e as Error).message });
  }
});

// Save the traced scene to my-home.manual.scene.json.
app.put('/api/private-home/manual-scene', async (c) => {
  const body = await c.req.json();
  const parsed = HomeSceneSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'invalid scene', detail: parsed.error.message }, 400);
  await saveManualScene(parsed.data);
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// scenes
// ---------------------------------------------------------------------------

app.get('/api/scenes/:projectId', async (c) => {
  const projectId = c.req.param('projectId');
  if (!isProjectId(projectId)) return c.json({ error: 'unknown project' }, 404);
  try {
    return c.json({ scene: await loadScene(projectId) });
  } catch (e) {
    return c.json({ error: 'scene could not be loaded', detail: (e as Error).message }, 422);
  }
});

app.get('/api/scenes/:projectId/export', async (c) => {
  const projectId = c.req.param('projectId');
  if (!isProjectId(projectId)) return c.json({ error: 'unknown project' }, 404);
  let scene;
  try {
    scene = await loadScene(projectId);
  } catch (e) {
    // a corrupt/edited on-disk scene throws in migrate/validate — surface a 422,
    // not an unhandled 500.
    return c.json({ error: 'scene could not be loaded', detail: (e as Error).message }, 422);
  }
  if (!scene) return c.json({ error: 'no scene to export' }, 404);
  const { filename, json } = buildSceneExport(scene);
  return c.body(json, 200, {
    'Content-Type': 'application/json',
    'Content-Disposition': `attachment; filename="${filename}"`,
  });
});

app.put('/api/scenes/:projectId', async (c) => {
  const projectId = c.req.param('projectId');
  if (!isProjectId(projectId)) return c.json({ error: 'unknown project' }, 404);
  const body = await c.req.json();
  const parsed = HomeSceneSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'invalid scene', detail: parsed.error.message }, 400);
  const issues = validateScene(parsed.data);
  if (hasErrors(issues)) {
    return c.json({ error: 'scene failed validation', issues: issues.filter((i) => i.severity === 'error') }, 400);
  }
  await saveScene(projectId, parsed.data);
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// variants
// ---------------------------------------------------------------------------

app.get('/api/variants/:projectId', async (c) => {
  const projectId = c.req.param('projectId');
  if (!isProjectId(projectId)) return c.json({ error: 'unknown project' }, 404);
  return c.json({ variants: await listVariants(projectId) });
});

app.get('/api/variants/:projectId/:variantId', async (c) => {
  const projectId = c.req.param('projectId');
  if (!isProjectId(projectId)) return c.json({ error: 'unknown project' }, 404);
  const variant = await loadVariant(projectId, c.req.param('variantId'));
  if (!variant) return c.json({ error: 'variant not found' }, 404);
  return c.json({ variant });
});

app.post('/api/variants/:projectId', async (c) => {
  const projectId = c.req.param('projectId');
  if (!isProjectId(projectId)) return c.json({ error: 'unknown project' }, 404);
  const body = await c.req.json();
  const parsed = DesignVariantSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'invalid variant', detail: parsed.error.message }, 400);
  if (parsed.data.meta.projectId !== projectId) {
    return c.json({ error: 'variant projectId mismatch' }, 400);
  }
  await saveVariant(projectId, parsed.data);
  return c.json({ ok: true, id: parsed.data.meta.id });
});

// ---------------------------------------------------------------------------
// Claude Code bridge (human-driven, local file exchange; off by default)
// ---------------------------------------------------------------------------

app.get('/api/bridge/status', (c) => c.json({ enabled: bridgeEnabled(), auto: bridgeAutoEnabled() }));

app.post('/api/bridge/request', async (c) => {
  if (!bridgeEnabled()) {
    return c.json({ error: 'bridge disabled', hint: 'start the sidecar with HOMECANVAS_ENABLE_BRIDGE=1' }, 403);
  }
  const body = (await c.req.json()) as { message?: string; scene?: unknown; selectedEntityId?: string };
  if (!body.message || !body.message.trim()) return c.json({ error: 'message required' }, 400);
  const parsed = HomeSceneSchema.safeParse(body.scene);
  if (!parsed.success) return c.json({ error: 'invalid scene', detail: parsed.error.message }, 400);
  const { id, contentHash } = await writeRequest({
    message: body.message,
    scene: parsed.data,
    now: Date.now(),
    ...(body.selectedEntityId ? { selectedEntityId: body.selectedEntityId } : {}),
  });
  // Opt-in: answer it automatically via the local `claude` CLI (non-blocking;
  // the client polls GET /api/bridge/request/:id for the result).
  if (bridgeAutoEnabled()) autoAnswer(id).catch((e) => console.error('autoAnswer failed', e));
  return c.json({ ok: true, id, contentHash, auto: bridgeAutoEnabled() });
});

app.get('/api/bridge/request/:id', async (c) => {
  const result = await readResult(c.req.param('id'), Date.now());
  return c.json(result);
});

// ---------------------------------------------------------------------------
// asset cache (CC0, downloaded by scripts/fetch-assets.ts)
// ---------------------------------------------------------------------------

app.get('/api/assets/manifest', async (c) => {
  const file = path.join(ASSET_CACHE, 'manifest.json');
  if (!existsSync(file)) return c.json(EMPTY_ASSET_MANIFEST);
  return c.json(JSON.parse(await readFile(file, 'utf8')));
});

app.get('/api/assets/file/*', async (c) => {
  const rel = c.req.path.replace('/api/assets/file/', '');
  const resolved = path.resolve(ASSET_CACHE, decodeURIComponent(rel));
  // path-traversal guard: must stay inside the cache
  if (!resolved.startsWith(ASSET_CACHE + path.sep)) return c.json({ error: 'forbidden' }, 403);
  if (!existsSync(resolved)) return c.json({ error: 'not found' }, 404);
  const data = await readFile(resolved);
  const ext = path.extname(resolved).toLowerCase();
  const type = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.png' ? 'image/png' : 'application/octet-stream';
  return c.body(new Uint8Array(data), 200, { 'Content-Type': type, 'Cache-Control': 'max-age=3600' });
});

// Packaged app: serve the built SPA from this same origin (single origin → no
// CORS; the Host/Origin gate above still applies). Registered AFTER every /api
// route so those match first. Dev leaves HOMECANVAS_STATIC_DIR unset (Vite serves
// the SPA), making this a no-op.
const STATIC_DIR = process.env.HOMECANVAS_STATIC_DIR;
if (STATIC_DIR) {
  const MIME: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript',
    '.mjs': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.ttf': 'font/ttf',
    '.wasm': 'application/wasm',
    '.glb': 'model/gltf-binary',
    '.gltf': 'model/gltf+json',
    '.hdr': 'image/vnd.radiance',
    '.map': 'application/json',
  };
  app.get('/*', async (c) => {
    if (c.req.path.startsWith('/api')) return c.notFound();
    const rel = decodeURIComponent(c.req.path).replace(/^\/+/, '');
    const candidate = path.resolve(STATIC_DIR, rel);
    const inside = candidate === STATIC_DIR || candidate.startsWith(STATIC_DIR + path.sep);
    const isFile = inside && existsSync(candidate) && statSync(candidate).isFile();
    // Real file → serve it; anything else → index.html (SPA client-side routing).
    const file = isFile ? candidate : path.join(STATIC_DIR, 'index.html');
    const data = await readFile(file);
    const type = MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
    const cache = isFile && rel.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'no-cache';
    return c.body(new Uint8Array(data), 200, { 'Content-Type': type, 'Cache-Control': cache });
  });
}

// Defense in depth: a single bridge/subprocess failure must never take down the
// whole local backend.
process.on('unhandledRejection', (e) => console.error('unhandledRejection', e));
process.on('uncaughtException', (e) => console.error('uncaughtException', e));

serve({ fetch: app.fetch, port: PORT, hostname: '127.0.0.1' }, (info) => {
  console.log(`homecanvas sidecar listening on http://127.0.0.1:${info.port}`);
});
