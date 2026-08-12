import { serve } from '@hono/node-server';
import { spawn } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { mkdir, readFile, readdir, rename, unlink } from 'node:fs/promises';
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
  APP_DATA,
  ASSET_CACHE,
  PRIVATE_ROOT,
  isProjectId,
  listVariants,
  loadScene,
  loadVariant,
  manualScenePath,
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

// ---------------------------------------------------------------------------
// storage meter
// ---------------------------------------------------------------------------

/** Recursively sum file bytes under `dir` (sizes only — never reads content). */
async function dirSize(dir: string): Promise<number> {
  if (!existsSync(dir)) return 0;
  let total = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += await dirSize(full);
    } else if (entry.isFile()) {
      try {
        total += statSync(full).size;
      } catch {
        // race: file removed between readdir and stat — skip, don't fail the meter
      }
    }
  }
  return total;
}

app.get('/api/storage', async (c) => {
  const [assetsBytes, appDataBytes, processedBytes, versionsBytes, backupsBytes] = await Promise.all([
    dirSize(ASSET_CACHE),
    dirSize(APP_DATA),
    // Scoped to processed/ (never raw/ — that's the private upload itself).
    dirSize(path.join(PRIVATE_ROOT, 'processed')),
    dirSize(path.join(PRIVATE_ROOT, 'versions')),
    // Auto-backups + trash the app itself writes — counted so the meter matches
    // reality (trashing a project must not LOOK like freed space).
    dirSize(path.join(PRIVATE_ROOT, 'backups')),
  ]);
  const scenesBytes = processedBytes + versionsBytes;
  return c.json({
    assetsBytes,
    appDataBytes,
    scenesBytes,
    backupsBytes,
    totalBytes: assetsBytes + appDataBytes + scenesBytes + backupsBytes,
  });
});

// ---------------------------------------------------------------------------
// in-app asset fetch (spawns scripts/fetch-assets.ts instead of a terminal)
// ---------------------------------------------------------------------------

// This file lives at <repo>/server/index.ts — resolve the repo root from here
// rather than from storage's (possibly redirected) DATA_ROOT, since the fetcher
// script + node_modules/.bin/tsx only exist in the real source repo. In the
// packaged Electron bundle import.meta.dirname compiles to "" (esbuild CJS), so
// the paths won't exist and the feature reports itself unavailable — honest 501
// instead of a broken spawn. HOMECANVAS_REPO_DIR can point a packaged app at a
// source checkout if the user has one.
const REPO_DIR = process.env.HOMECANVAS_REPO_DIR ?? path.resolve(import.meta.dirname || '', '..');
const FETCH_TSX_BIN = path.join(REPO_DIR, 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx');
const FETCH_SCRIPT = path.join(REPO_DIR, 'scripts', 'fetch-assets.ts');
const assetFetchAvailable = () => existsSync(FETCH_TSX_BIN) && existsSync(FETCH_SCRIPT);

interface FetchAssetsState {
  running: boolean;
  done: boolean;
  error: string | null;
  lastLines: string[];
}
let fetchState: FetchAssetsState = { running: false, done: false, error: null, lastLines: [] };
// Run token: handlers from a superseded run must never clobber a newer run's
// status (a stale `close` flipping running=false would let two children race).
let fetchRunId = 0;
let fetchChild: ReturnType<typeof spawn> | null = null;

function pushFetchLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return;
  fetchState.lastLines.push(trimmed);
  if (fetchState.lastLines.length > 20) fetchState.lastLines.shift();
}

app.post('/api/assets/fetch', (c) => {
  if (!assetFetchAvailable()) {
    return c.json({ error: 'asset download needs the source repo (run npm run fetch:assets from a checkout)' }, 501);
  }
  // Guard on the actual child, not just the flag — a wedged flag must not block
  // forever, and a live child must never be doubled.
  if (fetchState.running && fetchChild && fetchChild.exitCode === null) {
    return c.json({ error: 'already running' }, 409);
  }
  const myRun = ++fetchRunId;
  fetchState = { running: true, done: false, error: null, lastLines: [] };
  let child;
  try {
    child = spawn(FETCH_TSX_BIN, [FETCH_SCRIPT], { cwd: REPO_DIR });
  } catch (e) {
    fetchState = { running: false, done: false, error: (e as Error).message, lastLines: [] };
    return c.json({ error: (e as Error).message }, 500);
  }
  fetchChild = child;
  const onOutput = (buf: Buffer) => {
    if (myRun !== fetchRunId) return;
    for (const line of buf.toString('utf8').split('\n')) pushFetchLine(line);
  };
  child.stdout?.on('data', onOutput);
  child.stderr?.on('data', onOutput);
  child.on('error', (e) => {
    if (myRun !== fetchRunId) return;
    fetchState = { ...fetchState, running: false, done: false, error: e.message };
  });
  child.on('close', (code) => {
    if (myRun !== fetchRunId) return;
    fetchState = {
      ...fetchState,
      running: false,
      done: code === 0,
      error: code === 0 ? null : `fetch-assets exited with code ${code}`,
    };
  });
  return c.json({ ok: true });
});

app.get('/api/assets/fetch/status', (c) => c.json({ ...fetchState, available: assetFetchAvailable() }));

// ---------------------------------------------------------------------------
// project trash / restore (scene files only — never touches raw/ uploads)
// ---------------------------------------------------------------------------

const sampleTrashDir = () => path.join(APP_DATA, 'trash');
const sampleLiveScene = () => path.join(APP_DATA, 'projects', 'sample-home', 'scene.json');
const myHomeTrashDir = () => path.join(PRIVATE_ROOT, 'backups', 'trash');
const myHomeLiveScene = () => path.join(PRIVATE_ROOT, 'processed', 'scene-json', 'my-home.scene.json');
// Matches both `my-home.scene.<ts>.json` and `my-home.manual.scene.<ts>.json` —
// a trashed/restored pair always shares one timestamp so they group as one set.
const MY_HOME_TRASH_RE = /^my-home\.(?:scene|manual\.scene)\.(\d+)\.json$/;
const SAMPLE_TRASH_RE = /^scene\.(\d+)\.json$/;

async function newestTimestamp(dir: string, re: RegExp): Promise<number | null> {
  if (!existsSync(dir)) return null;
  let newest: number | null = null;
  for (const entry of await readdir(dir)) {
    const m = entry.match(re);
    if (!m) continue;
    const ts = Number(m[1]);
    if (newest === null || ts > newest) newest = ts;
  }
  return newest;
}

/** Keep only the newest `keep` trashed sets (files grouped by timestamp). */
async function pruneTrash(dir: string, re: RegExp, keep = 10): Promise<void> {
  if (!existsSync(dir)) return;
  const byTs = new Map<number, string[]>();
  for (const entry of await readdir(dir)) {
    const m = entry.match(re);
    if (!m) continue;
    const ts = Number(m[1]);
    byTs.set(ts, [...(byTs.get(ts) ?? []), entry]);
  }
  const excess = [...byTs.keys()].sort((a, b) => b - a).slice(keep);
  for (const ts of excess) {
    for (const name of byTs.get(ts) ?? []) await unlink(path.join(dir, name));
  }
}

/**
 * Move the my-home pair (canonical + manual sidecar) into trash under one
 * timestamp. Rolls the first rename back if the second fails, so a set is
 * always all-or-nothing on disk.
 */
async function trashMyHomePair(ts: number): Promise<void> {
  const dir = myHomeTrashDir();
  await mkdir(dir, { recursive: true });
  const liveScene = myHomeLiveScene();
  const liveManual = manualScenePath();
  const trashedScene = path.join(dir, `my-home.scene.${ts}.json`);
  const movedScene = existsSync(liveScene);
  if (movedScene) await rename(liveScene, trashedScene);
  try {
    if (existsSync(liveManual)) await rename(liveManual, path.join(dir, `my-home.manual.scene.${ts}.json`));
  } catch (e) {
    if (movedScene) await rename(trashedScene, liveScene); // roll back the half-moved set
    throw e;
  }
}

app.post('/api/projects/:id/trash', async (c) => {
  const id = c.req.param('id');
  if (!isProjectId(id)) return c.json({ error: 'unknown project' }, 404);
  const ts = Date.now();
  if (id === 'sample-home') {
    const live = sampleLiveScene();
    if (!existsSync(live)) return c.json({ error: 'nothing to trash' }, 404);
    const dir = sampleTrashDir();
    await mkdir(dir, { recursive: true });
    await rename(live, path.join(dir, `scene.${ts}.json`));
    await pruneTrash(dir, SAMPLE_TRASH_RE);
    return c.json({ ok: true, trashedAt: ts });
  }
  if (!existsSync(myHomeLiveScene()) && !existsSync(manualScenePath())) {
    return c.json({ error: 'nothing to trash' }, 404);
  }
  await trashMyHomePair(ts);
  await pruneTrash(myHomeTrashDir(), MY_HOME_TRASH_RE);
  return c.json({ ok: true, trashedAt: ts });
});

// Restores the set the user CLICKED (`trashedAt` in the body; newest when absent).
// If a live scene exists it is swapped into trash first — restore must never be a
// dead end, and nothing is ever deleted by it.
app.post('/api/projects/:id/restore', async (c) => {
  const id = c.req.param('id');
  if (!isProjectId(id)) return c.json({ error: 'unknown project' }, 404);
  const body = (await c.req.json().catch(() => ({}))) as { trashedAt?: number };
  const requested = typeof body.trashedAt === 'number' && Number.isInteger(body.trashedAt) ? body.trashedAt : null;

  if (id === 'sample-home') {
    const dir = sampleTrashDir();
    const ts = requested ?? (await newestTimestamp(dir, SAMPLE_TRASH_RE));
    if (ts === null) return c.json({ error: 'nothing trashed' }, 404);
    const trashed = path.join(dir, `scene.${ts}.json`);
    if (!existsSync(trashed)) return c.json({ error: 'that trashed version no longer exists' }, 404);
    const live = sampleLiveScene();
    if (existsSync(live)) {
      // Swap: the current live scene becomes a new trash set, never overwritten.
      await rename(live, path.join(dir, `scene.${Date.now()}.json`));
    }
    await mkdir(path.dirname(live), { recursive: true });
    await rename(trashed, live);
    await pruneTrash(dir, SAMPLE_TRASH_RE);
    return c.json({ ok: true, restoredAt: ts });
  }

  const dir = myHomeTrashDir();
  const ts = requested ?? (await newestTimestamp(dir, MY_HOME_TRASH_RE));
  if (ts === null) return c.json({ error: 'nothing trashed' }, 404);
  const trashedScene = path.join(dir, `my-home.scene.${ts}.json`);
  const trashedManual = path.join(dir, `my-home.manual.scene.${ts}.json`);
  if (!existsSync(trashedScene) && !existsSync(trashedManual)) {
    return c.json({ error: 'that trashed version no longer exists' }, 404);
  }
  if (existsSync(myHomeLiveScene()) || existsSync(manualScenePath())) {
    await trashMyHomePair(Date.now()); // swap the live pair into trash first
  }
  const liveScene = myHomeLiveScene();
  await mkdir(path.dirname(liveScene), { recursive: true });
  const movedScene = existsSync(trashedScene);
  if (movedScene) await rename(trashedScene, liveScene);
  try {
    if (existsSync(trashedManual)) await rename(trashedManual, manualScenePath());
  } catch (e) {
    if (movedScene) await rename(liveScene, trashedScene); // roll back
    throw e;
  }
  await pruneTrash(dir, MY_HOME_TRASH_RE);
  return c.json({ ok: true, restoredAt: ts });
});

app.get('/api/projects/trashed', async (c) => {
  const out: { projectId: 'sample-home' | 'my-home'; trashedAt: number }[] = [];
  const groups: [( 'sample-home' | 'my-home'), string, RegExp][] = [
    ['sample-home', sampleTrashDir(), SAMPLE_TRASH_RE],
    ['my-home', myHomeTrashDir(), MY_HOME_TRASH_RE],
  ];
  for (const [projectId, dir, re] of groups) {
    if (!existsSync(dir)) continue;
    const seen = new Set<number>();
    for (const entry of await readdir(dir)) {
      const m = entry.match(re);
      if (!m) continue;
      const ts = Number(m[1]);
      if (seen.has(ts)) continue;
      seen.add(ts);
      out.push({ projectId, trashedAt: ts });
    }
  }
  out.sort((a, b) => b.trashedAt - a.trashedAt);
  return c.json({ trashed: out });
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
// Don't orphan a running asset-fetch child when the sidecar goes down.
process.on('exit', () => fetchChild?.kill());

serve({ fetch: app.fetch, port: PORT, hostname: '127.0.0.1' }, (info) => {
  console.log(`homecanvas sidecar listening on http://127.0.0.1:${info.port}`);
});
