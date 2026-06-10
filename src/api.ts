import type { AssetCacheManifest } from '@lib/assets/manifest';
import { migrateSceneDocument } from '@lib/scene/migrations';
import type { DesignVariant, HomeScene, PrivateHomeFileManifest, VariantMeta } from '@lib/scene/schemas';

/** Thin client for the local sidecar (proxied via /api). */

export type ProjectId = 'sample-home' | 'my-home';

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

export async function fetchPrivateManifest(): Promise<PrivateHomeFileManifest | null> {
  try {
    const data = await json<{ exists: boolean; manifest: PrivateHomeFileManifest | null }>(
      await fetch('/api/private-home/manifest'),
    );
    return data.manifest;
  } catch {
    return null;
  }
}

export async function fetchScene(projectId: ProjectId): Promise<HomeScene | null> {
  try {
    const data = await json<{ scene: unknown | null }>(await fetch(`/api/scenes/${projectId}`));
    return data.scene ? migrateSceneDocument(data.scene) : null;
  } catch {
    return null;
  }
}

export async function persistScene(projectId: ProjectId, scene: HomeScene): Promise<boolean> {
  try {
    const res = await fetch(`/api/scenes/${projectId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(scene),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchVariants(projectId: ProjectId): Promise<VariantMeta[]> {
  try {
    const data = await json<{ variants: VariantMeta[] }>(await fetch(`/api/variants/${projectId}`));
    return data.variants;
  } catch {
    return [];
  }
}

export async function fetchVariant(projectId: ProjectId, variantId: string): Promise<DesignVariant | null> {
  try {
    const data = await json<{ variant: DesignVariant }>(
      await fetch(`/api/variants/${projectId}/${variantId}`),
    );
    return data.variant;
  } catch {
    return null;
  }
}

export async function saveVariantRemote(projectId: ProjectId, variant: DesignVariant): Promise<boolean> {
  try {
    const res = await fetch(`/api/variants/${projectId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(variant),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchAssetManifest(): Promise<AssetCacheManifest> {
  try {
    return await json<AssetCacheManifest>(await fetch('/api/assets/manifest'));
  } catch {
    return { schemaVersion: 1, downloadedAt: '', hdris: {}, textures: {} };
  }
}

export function assetUrl(relPath: string): string {
  return `/api/assets/file/${relPath.split(/[\\/]/).map(encodeURIComponent).join('/')}`;
}
