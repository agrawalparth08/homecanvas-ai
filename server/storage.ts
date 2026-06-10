import { existsSync } from 'node:fs';
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

async function atomicWrite(filePath: string, data: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tmp, data);
  await rename(tmp, filePath);
}

export async function loadScene(projectId: ProjectId): Promise<HomeScene | null> {
  const file = scenePath(projectId);
  if (!existsSync(file)) {
    // my-home falls back to the manually traced scene when no generated one exists
    if (projectId === 'my-home' && existsSync(manualScenePath())) {
      const raw = JSON.parse(await readFile(manualScenePath(), 'utf8'));
      return migrateSceneDocument(raw);
    }
    return null;
  }
  const raw = JSON.parse(await readFile(file, 'utf8'));
  return migrateSceneDocument(raw);
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
