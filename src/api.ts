import type { AssetCacheManifest } from '@lib/assets/manifest';
import { migrateSceneDocument } from '@lib/scene/migrations';
import type { DesignVariant, HomeScene, PrivateHomeFileManifest, VariantMeta } from '@lib/scene/schemas';
import { traceDevError } from './store/error-store';

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
  } catch (e) {
    traceDevError('fetchPrivateManifest', e, 'network');
    return null;
  }
}

export async function fetchScene(projectId: ProjectId): Promise<HomeScene | null> {
  try {
    const data = await json<{ scene: unknown | null }>(await fetch(`/api/scenes/${projectId}`));
    return data.scene ? migrateSceneDocument(data.scene) : null;
  } catch (e) {
    traceDevError('fetchScene', e, 'network');
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
  } catch (e) {
    traceDevError('persistScene', e, 'network');
    return false;
  }
}

export async function fetchVariants(projectId: ProjectId): Promise<VariantMeta[]> {
  try {
    const data = await json<{ variants: VariantMeta[] }>(await fetch(`/api/variants/${projectId}`));
    return data.variants;
  } catch (e) {
    traceDevError('fetchVariants', e, 'network');
    return [];
  }
}

export async function fetchVariant(projectId: ProjectId, variantId: string): Promise<DesignVariant | null> {
  try {
    const data = await json<{ variant: DesignVariant }>(
      await fetch(`/api/variants/${projectId}/${variantId}`),
    );
    return data.variant;
  } catch (e) {
    traceDevError('fetchVariant', e, 'network');
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
  } catch (e) {
    traceDevError('saveVariantRemote', e, 'network');
    return false;
  }
}

export async function fetchAssetManifest(): Promise<AssetCacheManifest> {
  try {
    return await json<AssetCacheManifest>(await fetch('/api/assets/manifest'));
  } catch (e) {
    traceDevError('fetchAssetManifest', e, 'network');
    return { schemaVersion: 1, downloadedAt: '', hdris: {}, textures: {}, models: {} };
  }
}

export function assetUrl(relPath: string): string {
  return `/api/assets/file/${relPath.split(/[\\/]/).map(encodeURIComponent).join('/')}`;
}

export function privateFileUrl(relPath: string): string {
  return `/api/private-home/file/${relPath.split(/[\\/]/).map(encodeURIComponent).join('/')}`;
}

/** Best-effort auto-trace of a CAD file (DXF). Returns room candidate count. */
export async function autoTracePrivate(filePath: string): Promise<{ ok: boolean; count?: number; reason?: string }> {
  try {
    const res = await fetch('/api/private-home/auto-trace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath }),
    });
    return (await res.json()) as { ok: boolean; count?: number; reason?: string };
  } catch (e) {
    traceDevError('autoTracePrivate', e, 'network');
    return { ok: false, reason: 'request failed' };
  }
}

export interface SceneIssue {
  severity: string;
  message: string;
  entityId?: string;
}

export interface BuildSceneResult {
  ok: boolean;
  scene?: HomeScene;
  summary?: { rooms: number; walls: number; openings: number };
  /** Geometry errors found in the auto-built scene — fixable in the verify wizard. */
  issues?: SceneIssue[];
  reason?: string;
}

/** Build a validated HomeScene from a client-extracted PrimitivePlan (no-CAD path). */
export async function buildSceneFromPlan(plan: unknown): Promise<BuildSceneResult> {
  try {
    const res = await fetch('/api/private-home/build-scene', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan }),
    });
    return (await res.json()) as BuildSceneResult;
  } catch (e) {
    traceDevError('buildSceneFromPlan', e, 'network');
    return { ok: false, reason: (e as Error).message };
  }
}

/** Upload a plan/photo into private-home-inputs/raw/ (local copy only). */
export async function uploadPrivateFile(name: string, dataUrl: string): Promise<string | null> {
  try {
    const res = await fetch('/api/private-home/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, dataUrl }),
    });
    if (!res.ok) return null;
    return ((await res.json()) as { filePath: string }).filePath;
  } catch (e) {
    traceDevError('uploadPrivateFile', e, 'network');
    return null;
  }
}

/** Persist a client-rasterized PNG; returns its private-relative path. */
export async function saveRasterizedPage(name: string, dataUrl: string): Promise<string | null> {
  try {
    const res = await fetch('/api/private-home/rasterized', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, dataUrl }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { filePath: string };
    return data.filePath;
  } catch (e) {
    traceDevError('saveRasterizedPage', e, 'network');
    return null;
  }
}

export async function saveManualScene(scene: HomeScene): Promise<boolean> {
  try {
    const res = await fetch('/api/private-home/manual-scene', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(scene),
    });
    return res.ok;
  } catch (e) {
    traceDevError('saveManualScene', e, 'network');
    return false;
  }
}
