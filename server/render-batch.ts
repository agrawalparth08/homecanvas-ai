import { existsSync, readdirSync } from 'node:fs';
import { copyFile, mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { polygonArea } from '../lib/geometry/rooms';
import type { FurnitureObject, HomeScene, Room } from '../lib/scene/schemas';
import { detectBlender, renderWithBlender } from './adapters/blender';
import { APP_DATA, ASSET_CACHE } from './storage';

/** First cached HDRI, if the CC0 asset pack is downloaded — lifts render quality. */
function cachedHdri(): string | null {
  const dir = path.join(ASSET_CACHE, 'hdris');
  if (!existsSync(dir)) return null;
  const hdr = readdirSync(dir).find((f) => f.endsWith('.hdr') || f.endsWith('.exr'));
  return hdr ? path.join(dir, hdr) : null;
}

/**
 * Batch render queue — "render every room overnight". Sequentially drives the
 * Blender Cycles adapter: one whole-floor 3/4 view per floor plus one eye-level
 * interior shot per room (wide 24mm lens, camera at the room's far corner
 * looking at its centre). Zero marginal cost per render is the product's core
 * economic argument — this makes it a button.
 *
 * One queue at a time (module state); files land in
 * APP_DATA/renders/<projectId>/<ts>/ and are served back per-file.
 */

const MM = 0.001;

interface BatchJob {
  label: string;
  cam?: string;
  target?: string;
}

export interface BatchState {
  running: boolean;
  projectId: string | null;
  total: number;
  done: number;
  current: string | null;
  error: string | null;
  outDir: string | null;
  files: string[];
}

let state: BatchState = { running: false, projectId: null, total: 0, done: 0, current: null, error: null, outDir: null, files: [] };
let runToken = 0;

export function batchStatus(): BatchState {
  return { ...state, files: [...state.files] };
}

// Wall-hugging categories don't make a view: standing "far from the rug" or
// aiming at curtains says nothing about where the clear sightline is.
const NON_BLOCKING = new Set(['rug', 'curtains', 'light', 'decor']);

function roomCamera(room: Room, objects: FurnitureObject[]): { cam: string; target: string } {
  const pts = room.boundary.outer;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const items = objects.filter((o) => o.roomId === room.id && !NON_BLOCKING.has(o.category));

  // Candidate: each corner pulled 12% inside the room, at standing eye height.
  // Pick the one FARTHEST from the nearest furniture piece — a camera jammed
  // behind a kitchen counter run renders nothing but the counter. Empty room:
  // any corner works, take the first.
  const w = maxX - minX;
  const h = maxY - minY;
  const corners: [number, number][] = [
    [minX + w * 0.12, minY + h * 0.12],
    [maxX - w * 0.12, minY + h * 0.12],
    [minX + w * 0.12, maxY - h * 0.12],
    [maxX - w * 0.12, maxY - h * 0.12],
  ];
  let best = corners[0]!;
  let bestScore = -Infinity;
  for (const corner of corners) {
    const score = items.length
      ? Math.min(...items.map((o) => Math.hypot(corner[0] - o.transform.x, corner[1] - o.transform.y)))
      : 0;
    if (score > bestScore) {
      bestScore = score;
      best = corner;
    }
  }

  // Aim mostly at the room centre, nudged 20% toward the furniture. Aiming AT
  // the furniture centroid backfires in small rooms — a bed two metres from
  // the lens fills the whole frame; the centre keeps the room readable while
  // the nudge still tips the composition toward what the client cares about.
  let tx = cx;
  let ty = cy;
  if (items.length) {
    const fx = items.reduce((s, o) => s + o.transform.x, 0) / items.length;
    const fy = items.reduce((s, o) => s + o.transform.y, 0) / items.length;
    tx = cx + (fx - cx) * 0.2;
    ty = cy + (fy - cy) * 0.2;
  }
  return {
    cam: `${(best[0] * MM).toFixed(3)},${(best[1] * MM).toFixed(3)},1.55`,
    target: `${(tx * MM).toFixed(3)},${(ty * MM).toFixed(3)},1.05`,
  };
}

const slug = (s: string) => s.replace(/[^a-zA-Z0-9-_ ]/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'render';

function buildJobs(scene: HomeScene): BatchJob[] {
  const jobs: BatchJob[] = [];
  // Labels become filenames; two rooms named "Bedroom" would collide and one
  // render would silently overwrite the other. Suffix duplicates -2, -3, …
  const used = new Set<string>();
  const unique = (base: string): string => {
    let label = base;
    let n = 2;
    while (used.has(label)) label = `${base}-${n++}`;
    used.add(label);
    return label;
  };
  for (const floor of scene.floors) {
    jobs.push({ label: unique(`${slug(floor.name)}-overview`) });
    for (const room of floor.rooms) {
      // Tiny slivers (closets, shafts) make degenerate interiors — skip < 2 m².
      if (Math.abs(polygonArea(room.boundary.outer)) * 1e-6 < 2) continue;
      jobs.push({ label: unique(`${slug(floor.name)}-${slug(room.name)}`), ...roomCamera(room, floor.objects) });
    }
  }
  return jobs;
}

export function startBatch(
  scene: HomeScene,
  projectId: string,
  opts: { samples?: number; gpu?: boolean } = {},
): { ok: true; total: number } | { ok: false; reason: string; code: number } {
  if (!detectBlender()) return { ok: false, reason: 'Blender not found — batch rendering uses Blender Cycles', code: 503 };
  if (state.running) return { ok: false, reason: 'a batch is already rendering', code: 409 };

  const jobs = buildJobs(scene);
  if (jobs.length === 0) return { ok: false, reason: 'nothing to render', code: 400 };

  const outDir = path.join(APP_DATA, 'renders', projectId, String(Date.now()));
  const myRun = ++runToken;
  state = { running: true, projectId, total: jobs.length, done: 0, current: jobs[0]!.label, error: null, outDir, files: [] };

  void (async () => {
    try {
      await mkdir(outDir, { recursive: true });
      for (const job of jobs) {
        if (myRun !== runToken) return; // superseded
        state.current = job.label;
        const hdri = cachedHdri();
        const result = await renderWithBlender(scene, {
          samples: opts.samples ?? 160,
          res: '1600x1000',
          gpu: opts.gpu ?? true,
          ...(hdri ? { hdri } : {}),
          ...(job.cam && job.target ? { cam: job.cam, target: job.target } : {}),
        });
        if (myRun !== runToken) return;
        if (!result.ok) {
          state = { ...state, running: false, error: `${job.label}: ${result.reason}` };
          return;
        }
        const dest = path.join(outDir, `${job.label}.png`);
        await copyFile(result.pngPath, dest);
        await unlink(result.pngPath).catch(() => undefined);
        state.files.push(`${job.label}.png`);
        state.done += 1;
      }
      state = { ...state, running: false, current: null };
    } catch (e) {
      if (myRun === runToken) state = { ...state, running: false, error: (e as Error).message };
    }
  })();

  return { ok: true, total: jobs.length };
}

/** Resolve a produced file inside the CURRENT batch dir only (no traversal). */
export function batchFilePath(name: string): string | null {
  if (!state.outDir || !/^[a-z0-9-_]+\.png$/.test(name)) return null;
  const resolved = path.join(state.outDir, name);
  return existsSync(resolved) ? resolved : null;
}
