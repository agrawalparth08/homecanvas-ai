import { serve } from '@hono/node-server';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Hono } from 'hono';
import { detectPrivateHomeFiles } from '../lib/fixtures/private-home';
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
  saveScene,
  saveVariant,
} from './storage';

/**
 * Local sidecar — the app's only backend. Binds 127.0.0.1 exclusively and
 * checks Origin on every request: a random website must not be able to poke
 * a localhost API that reads/writes private files (CSRF/DNS-rebinding).
 */

const PORT = 4871;
const ALLOWED_ORIGINS = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);

const app = new Hono();

app.use('*', async (c, next) => {
  const origin = c.req.header('origin');
  // Same-origin requests proxied by Vite carry no Origin header — allow those;
  // anything cross-origin must be the dev SPA itself.
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return c.json({ error: 'forbidden origin' }, 403);
  }
  await next();
});

app.get('/api/health', (c) => c.json({ ok: true, name: 'homecanvas-sidecar' }));

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

// ---------------------------------------------------------------------------
// scenes
// ---------------------------------------------------------------------------

app.get('/api/scenes/:projectId', async (c) => {
  const projectId = c.req.param('projectId');
  if (!isProjectId(projectId)) return c.json({ error: 'unknown project' }, 404);
  const scene = await loadScene(projectId);
  return c.json({ scene });
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

serve({ fetch: app.fetch, port: PORT, hostname: '127.0.0.1' }, (info) => {
  console.log(`homecanvas sidecar listening on http://127.0.0.1:${info.port}`);
});
