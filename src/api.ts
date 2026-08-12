import type { AssetCacheManifest } from '@lib/assets/manifest';
import { migrateSceneDocument } from '@lib/scene/migrations';
import type { DesignVariant, HomeScene, PrivateHomeFileManifest, VariantMeta } from '@lib/scene/schemas';
import { traceDevError } from './store/error-store';

/** Thin client for the local sidecar (proxied via /api). */

export type ProjectId = string;

/** Server-side project metadata, as returned by GET /api/projects. */
export interface ProjectMeta {
  id: ProjectId;
  name: string;
  kind: 'home' | 'apartment' | 'sample';
  createdAt: string;
  hasScene: boolean;
}

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

export interface StorageStats {
  assetsBytes: number;
  appDataBytes: number;
  scenesBytes: number;
  backupsBytes: number;
  totalBytes: number;
}

/** Real on-disk usage: asset cache + app data + processed scenes (never raw/ contents). */
export async function fetchStorageStats(): Promise<StorageStats | null> {
  try {
    return await json<StorageStats>(await fetch('/api/storage'));
  } catch (e) {
    traceDevError('fetchStorageStats', e, 'network');
    return null;
  }
}

export interface AssetFetchStatus {
  running: boolean;
  done: boolean;
  error: string | null;
  lastLines: string[];
  /** False when the sidecar has no source checkout (packaged app) — hide the button. */
  available?: boolean;
}

/** Kick off the CC0 asset download (scripts/fetch-assets.ts) as a child process. */
export async function startAssetFetch(): Promise<boolean> {
  try {
    const res = await fetch('/api/assets/fetch', { method: 'POST' });
    return res.ok;
  } catch (e) {
    traceDevError('startAssetFetch', e, 'network');
    return false;
  }
}

// Note: this one THROWS on failure (no catch-to-idle) — a transient status-fetch
// error must not read as "download finished"; react-query keeps the last known
// status and the poll loop stays alive.
export async function fetchAssetFetchStatus(): Promise<AssetFetchStatus> {
  return json<AssetFetchStatus>(await fetch('/api/assets/fetch/status'));
}

/** Move a project's scene file(s) into the trash (never touches raw/ uploads). */
export async function trashProject(projectId: ProjectId): Promise<boolean> {
  try {
    const res = await fetch(`/api/projects/${projectId}/trash`, { method: 'POST' });
    return res.ok;
  } catch (e) {
    traceDevError('trashProject', e, 'network');
    return false;
  }
}

/** Restore a specific trashed set (the row the user clicked); newest when omitted. */
export async function restoreProject(projectId: ProjectId, trashedAt?: number): Promise<boolean> {
  try {
    const res = await fetch(`/api/projects/${projectId}/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(trashedAt !== undefined ? { trashedAt } : {}),
    });
    return res.ok;
  } catch (e) {
    traceDevError('restoreProject', e, 'network');
    return false;
  }
}

export interface TrashedProject {
  projectId: ProjectId;
  name: string;
  trashedAt: number;
}

export async function fetchTrashedProjects(): Promise<TrashedProject[]> {
  try {
    const data = await json<{ trashed: TrashedProject[] }>(await fetch('/api/projects/trashed'));
    return data.trashed;
  } catch (e) {
    traceDevError('fetchTrashedProjects', e, 'network');
    return [];
  }
}

// ---------------------------------------------------------------------------
// project CRUD (multi-project workspace)
// ---------------------------------------------------------------------------

export async function fetchProjects(): Promise<ProjectMeta[]> {
  try {
    const data = await json<{ projects: ProjectMeta[] }>(await fetch('/api/projects'));
    return data.projects;
  } catch (e) {
    traceDevError('fetchProjects', e, 'network');
    return [];
  }
}

/** Create a new project (server generates the id). Returns null on failure. */
export async function createProjectApi(name: string, kind?: 'home' | 'apartment'): Promise<ProjectMeta | null> {
  try {
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, ...(kind ? { kind } : {}) }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { ok: boolean; project: ProjectMeta };
    return data.project;
  } catch (e) {
    traceDevError('createProjectApi', e, 'network');
    return null;
  }
}

/** Rename a project (400 for built-ins — sample-home / my-home). */
export async function renameProjectApi(projectId: ProjectId, name: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/projects/${projectId}/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    return res.ok;
  } catch (e) {
    traceDevError('renameProjectApi', e, 'network');
    return false;
  }
}

/** Duplicate a project's scene into a new project (404 if the source has no scene). */
export async function duplicateProjectApi(projectId: ProjectId, name?: string): Promise<ProjectMeta | null> {
  try {
    const res = await fetch(`/api/projects/${projectId}/duplicate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(name ? { name } : {}),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { ok: boolean; project: ProjectMeta };
    return data.project;
  } catch (e) {
    traceDevError('duplicateProjectApi', e, 'network');
    return null;
  }
}
