import { existsSync, statSync } from 'node:fs';
import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { migrateSceneDocument } from '../lib/scene/migrations';
import {
  DesignVariantSchema,
  type DesignVariant,
  type HomeScene,
  type VariantMeta,
} from '../lib/scene/schemas';

/**
 * Local JSON persistence. Two roots:
 *  - .homecanvas/        app data for the sample project
 *  - private-home-inputs/  Parth's home (scene JSON under processed/scene-json,
 *                          variants under versions/ — per the project spec)
 * All writes are atomic (temp + rename) so a crash never half-writes a scene.
 */

// In dev, data lives under the repo. The packaged Electron app sets
// HOMECANVAS_DATA_DIR to a writable app-data dir (the .app bundle is read-only),
// keeping the same on-disk layout (.homecanvas / private-home-inputs / asset-cache).
const DATA_ROOT = process.env.HOMECANVAS_DATA_DIR ?? path.resolve(import.meta.dirname, '..');
export const REPO_ROOT = DATA_ROOT;
export const APP_DATA = path.join(DATA_ROOT, '.homecanvas');
export const PRIVATE_ROOT = path.join(DATA_ROOT, 'private-home-inputs');
export const ASSET_CACHE = path.join(DATA_ROOT, 'asset-cache');

export type ProjectId = 'sample-home' | 'my-home';

export function isProjectId(value: string): value is ProjectId {
  return value === 'sample-home' || value === 'my-home';
}

function scenePath(projectId: ProjectId): string {
  return projectId === 'my-home'
    ? path.join(PRIVATE_ROOT, 'processed', 'scene-json', 'my-home.scene.json')
    : path.join(APP_DATA, 'projects', 'sample-home', 'scene.json');
}

export function manualScenePath(): string {
  return path.join(PRIVATE_ROOT, 'processed', 'scene-json', 'my-home.manual.scene.json');
}

const AUTO_BACKUP_DIR = path.join(PRIVATE_ROOT, 'backups', 'auto');
const MAX_AUTO_BACKUPS = 20;
const AUTO_BACKUP_RE = /^my-home\..*\.json$/;

/** Keep only the newest MAX_AUTO_BACKUPS files in backups/auto/ (filenames are ISO-sortable). */
async function pruneAutoBackups(): Promise<void> {
  if (!existsSync(AUTO_BACKUP_DIR)) return;
  const entries = (await readdir(AUTO_BACKUP_DIR)).filter((f) => AUTO_BACKUP_RE.test(f)).sort();
  const excess = entries.length - MAX_AUTO_BACKUPS;
  if (excess <= 0) return;
  for (const name of entries.slice(0, excess)) {
    await unlink(path.join(AUTO_BACKUP_DIR, name));
  }
}

/**
 * Before my-home.scene.json (the canonical file) gets overwritten with
 * `nextContent`, snapshot whatever is currently on disk into backups/auto/.
 * No-ops when there's nothing on disk yet, or when the content is unchanged —
 * a save that doesn't actually change anything shouldn't burn a backup slot.
 */
async function backupCanonicalIfChanged(nextContent: string): Promise<void> {
  const file = scenePath('my-home');
  if (!existsSync(file)) return;
  const existing = await readFile(file, 'utf8');
  if (existing === nextContent) return;
  // Colons aren't valid in Windows filenames; substitute so the packaged
  // Electron app's Windows build can write these too. The substitution is
  // positional and uniform, so lexicographic sort still matches chrono order.
  const iso = new Date().toISOString().replace(/:/g, '-');
  await atomicWrite(path.join(AUTO_BACKUP_DIR, `my-home.${iso}.json`), existing);
  await pruneAutoBackups();
}

function variantsDir(projectId: ProjectId): string {
  return projectId === 'my-home'
    ? path.join(PRIVATE_ROOT, 'versions')
    : path.join(APP_DATA, 'projects', 'sample-home', 'variants');
}

export async function atomicWrite(filePath: string, data: string | Uint8Array): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tmp, data);
  await rename(tmp, filePath);
}

/** Resolve a path inside private-home-inputs/, rejecting any traversal escape. */
export function resolvePrivateFile(rel: string): string | null {
  const resolved = path.resolve(PRIVATE_ROOT, rel);
  if (resolved !== PRIVATE_ROOT && !resolved.startsWith(PRIVATE_ROOT + path.sep)) return null;
  return resolved;
}

/** Save an uploaded plan/photo into raw/; returns its path relative to PRIVATE_ROOT. */
export async function saveRawUpload(name: string, bytes: Uint8Array): Promise<string> {
  const safe = name.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(-120) || 'upload';
  const rel = path.join('raw', safe);
  await atomicWrite(path.join(PRIVATE_ROOT, rel), bytes);
  return rel;
}

/** Save a rasterized plan page PNG; returns its path relative to PRIVATE_ROOT. */
export async function saveRasterizedPage(name: string, png: Uint8Array): Promise<string> {
  const safe = name.replace(/[^a-zA-Z0-9._-]+/g, '_');
  const rel = path.join('processed', 'rasterized-pages', safe.endsWith('.png') ? safe : `${safe}.png`);
  await atomicWrite(path.join(PRIVATE_ROOT, rel), png);
  return rel;
}

/**
 * Save the wizard's manual-trace workspace. my-home.scene.json is the single
 * canonical file, so every manual save also writes it — the sidecar file
 * (my-home.manual.scene.json) exists only for the wizard's own re-read and as
 * a legacy fallback for scenes saved before writes were unified.
 */
export async function saveManualScene(scene: HomeScene): Promise<void> {
  const content = JSON.stringify(scene, null, 2);
  await backupCanonicalIfChanged(content);
  await atomicWrite(manualScenePath(), content);
  await atomicWrite(scenePath('my-home'), content);
}

export async function loadScene(projectId: ProjectId): Promise<HomeScene | null> {
  const file = scenePath(projectId);
  if (projectId === 'my-home') {
    const manual = manualScenePath();
    // One-time migration for pre-unification installs: if the wizard sidecar is
    // strictly newer than the canonical file, the user's latest hand-tuned edits
    // live THERE — promote them into the canonical (backing the canonical up
    // first) instead of silently loading the older scene. Post-unification saves
    // write manual-then-canonical, so canonical is never older and this no-ops.
    // (1s slack absorbs same-save mtime jitter.)
    if (existsSync(file) && existsSync(manual) && statSync(manual).mtimeMs > statSync(file).mtimeMs + 1000) {
      const content = await readFile(manual, 'utf8');
      await backupCanonicalIfChanged(content);
      await atomicWrite(file, content);
    }
    // my-home.scene.json is canonical. The manual sidecar is read only when
    // it's absent — a legacy scene saved before writes were unified.
    if (existsSync(file)) {
      return migrateSceneDocument(JSON.parse(await readFile(file, 'utf8')));
    }
    if (!existsSync(manual)) return null;
    return migrateSceneDocument(JSON.parse(await readFile(manual, 'utf8')));
  }
  if (!existsSync(file)) return null;
  return migrateSceneDocument(JSON.parse(await readFile(file, 'utf8')));
}

export async function saveScene(projectId: ProjectId, scene: HomeScene): Promise<void> {
  const content = JSON.stringify(scene, null, 2);
  if (projectId === 'my-home') {
    await backupCanonicalIfChanged(content);
  }
  await atomicWrite(scenePath(projectId), content);
}

const variantFile = (projectId: ProjectId, variantId: string): string =>
  path.join(variantsDir(projectId), `${variantId}.variant.json`);

export async function listVariants(projectId: ProjectId): Promise<VariantMeta[]> {
  const dir = variantsDir(projectId);
  if (!existsSync(dir)) return [];
  const out: VariantMeta[] = [];
  for (const entry of await readdir(dir)) {
    if (!entry.endsWith('.variant.json')) continue;
    try {
      const raw = JSON.parse(await readFile(path.join(dir, entry), 'utf8'));
      const parsed = DesignVariantSchema.safeParse(raw);
      if (parsed.success) out.push(parsed.data.meta);
    } catch {
      // unreadable variant — skip, never crash the listing
    }
  }
  return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function loadVariant(projectId: ProjectId, variantId: string): Promise<DesignVariant | null> {
  const file = variantFile(projectId, variantId);
  if (!existsSync(file)) return null;
  const raw = JSON.parse(await readFile(file, 'utf8'));
  const parsed = DesignVariantSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export async function saveVariant(projectId: ProjectId, variant: DesignVariant): Promise<void> {
  await atomicWrite(variantFile(projectId, variant.meta.id), JSON.stringify(variant, null, 2));
}
