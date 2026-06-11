import { existsSync, statSync } from 'node:fs';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
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

export const REPO_ROOT = path.resolve(import.meta.dirname, '..');
export const APP_DATA = path.join(REPO_ROOT, '.homecanvas');
export const PRIVATE_ROOT = path.join(REPO_ROOT, 'private-home-inputs');
export const ASSET_CACHE = path.join(REPO_ROOT, 'asset-cache');

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

export async function saveManualScene(scene: HomeScene): Promise<void> {
  await atomicWrite(manualScenePath(), JSON.stringify(scene, null, 2));
}

export async function loadScene(projectId: ProjectId): Promise<HomeScene | null> {
  const file = scenePath(projectId);
  // my-home: load whichever is newer — the generated trace or the wizard's
  // hand-tuned save — so fine-tuning in the wizard survives a reload, while a
  // fresh regenerate (newer file) takes over.
  if (projectId === 'my-home') {
    const manual = manualScenePath();
    const genT = existsSync(file) ? statSync(file).mtimeMs : -1;
    const manT = existsSync(manual) ? statSync(manual).mtimeMs : -1;
    const pick = manT > genT ? manual : genT >= 0 ? file : null;
    if (!pick) return null;
    return migrateSceneDocument(JSON.parse(await readFile(pick, 'utf8')));
  }
  if (!existsSync(file)) return null;
  return migrateSceneDocument(JSON.parse(await readFile(file, 'utf8')));
}

export async function saveScene(projectId: ProjectId, scene: HomeScene): Promise<void> {
  await atomicWrite(scenePath(projectId), JSON.stringify(scene, null, 2));
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
