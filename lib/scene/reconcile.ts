/**
 * Re-extraction reconciliation (Phase 6), pure + deterministic.
 *
 * When a plan is re-extracted, entity ids are fresh — but the user may have
 * edited, locked, materialed, or furnished the old entities. reconcile() matches
 * old↔new geometry and emits a RemapTable (kept/remapped/split/deleted/added/
 * unresolved) WITHOUT mutating anything. A separate apply step (deferred) turns
 * a confirmed table into ScenePatches through the commit pipeline so locks still
 * gate it — never a silent replace.
 *
 * Rooms match by axis-aligned bbox-IoU (extracted rooms are rectilinear, so
 * bbox-IoU is exact) plus a containment rule for splits. Walls match by collinear
 * centerline overlap. No CV, no RNG, no GPU — operates on extracted geometry.
 */
import { makePatch, type PatchOp, type ScenePatch } from './patching';
import { wallOpenings } from './selectors';
import type { HomeScene, RemapEntry, RemapTable, Room, Wall } from './schemas';
import { MIN_WALL_STUB_MM } from '../geometry/constants';
import type { Vec2 } from '../geometry/vec';

/** Total polyline length of a centerline. */
function pathLength(pts: Vec2[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
  return len;
}

const ROOM_MATCH_IOU = 0.6; // 1:1 match
const ROOM_WEAK_IOU = 0.15; // below MATCH but non-trivial => ambiguous, not deleted
const SPLIT_CONTAINMENT = 0.7; // a new room mostly inside an old room
const SPLIT_COVERAGE = 0.6; // split children together cover this much of the old
const WALL_MATCH_OVERLAP = 0.5;
const WALL_WEAK_OVERLAP = 0.2; // collinear partial match -> 'unresolved', not silent delete
const WALL_COLLINEAR_TOL = 60; // mm perpendicular distance to count as the same line

interface Bbox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function bbox(poly: Vec2[]): Bbox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

const area = (b: Bbox) => Math.max(0, b.maxX - b.minX) * Math.max(0, b.maxY - b.minY);

function intersectArea(a: Bbox, b: Bbox): number {
  const w = Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX));
  const h = Math.max(0, Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY));
  return w * h;
}

function iou(a: Bbox, b: Bbox): number {
  const inter = intersectArea(a, b);
  const union = area(a) + area(b) - inter;
  return union <= 0 ? 0 : inter / union;
}

/** How much of `child` lies inside `parent` (0..1). */
function containment(child: Bbox, parent: Bbox): number {
  const ca = area(child);
  return ca <= 0 ? 0 : intersectArea(child, parent) / ca;
}

function reconcileRooms(oldRooms: Room[], newRooms: Room[]): RemapEntry[] {
  const olds = oldRooms.map((r) => ({ id: r.id, box: bbox(r.boundary.outer) }));
  const news = newRooms.map((r) => ({ id: r.id, box: bbox(r.boundary.outer) }));
  const claimed = new Set<string>();
  const entries: RemapEntry[] = [];

  for (const o of olds) {
    // exclude already-claimed news so one new room can't be claimed twice
    // (1:1 by a duplicate old, or as a split child then re-claimed 1:1).
    const scored = news
      .filter((n) => !claimed.has(n.id))
      .map((n) => ({ n, score: iou(o.box, n.box) }))
      .sort((a, b) => b.score - a.score || (a.n.id < b.n.id ? -1 : 1));
    const best = scored[0];

    if (best && best.score >= ROOM_MATCH_IOU) {
      claimed.add(best.n.id);
      entries.push({
        status: best.n.id === o.id ? 'kept' : 'remapped',
        entityType: 'room',
        oldId: o.id,
        newId: best.n.id,
        score: best.score,
      });
      continue;
    }

    // split: ≥2 new rooms mostly contained in the old, together covering it
    const children = news.filter((n) => !claimed.has(n.id) && containment(n.box, o.box) >= SPLIT_CONTAINMENT);
    const childCover = children.reduce((s, c) => s + intersectArea(c.box, o.box), 0) / (area(o.box) || 1);
    if (children.length >= 2 && childCover >= SPLIT_COVERAGE) {
      children.forEach((c) => claimed.add(c.id));
      entries.push({
        status: 'split',
        entityType: 'room',
        oldId: o.id,
        newIds: children.map((c) => c.id).sort(),
        score: childCover,
      });
      continue;
    }

    if (best && best.score >= ROOM_WEAK_IOU) {
      claimed.add(best.n.id); // spoken-for pending user confirmation, not a free orphan
      entries.push({ status: 'unresolved', entityType: 'room', oldId: o.id, newId: best.n.id, score: best.score });
    } else {
      entries.push({ status: 'deleted', entityType: 'room', oldId: o.id });
    }
  }

  for (const n of news) {
    if (!claimed.has(n.id)) entries.push({ status: 'added', entityType: 'room', newId: n.id });
  }
  return entries;
}

interface Seg {
  a: Vec2;
  b: Vec2;
}

const span = (w: Wall): Seg => ({ a: w.path.pts[0]!, b: w.path.pts[w.path.pts.length - 1]! });
const segLen = (s: Seg) => Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);

/** Collinear overlap ratio of two centerline segments (0 if not collinear). */
function overlapRatio(s1: Seg, s2: Seg): number {
  const len1 = segLen(s1);
  const len2 = segLen(s2);
  if (len1 === 0 || len2 === 0) return 0;
  const dx = (s1.b.x - s1.a.x) / len1;
  const dy = (s1.b.y - s1.a.y) / len1;
  // direction must be parallel (cross of unit dirs ~ 0)
  const ux2 = (s2.b.x - s2.a.x) / len2;
  const uy2 = (s2.b.y - s2.a.y) / len2;
  if (Math.abs(dx * uy2 - dy * ux2) > 0.06) return 0; // ~3.4°
  // s2 endpoints must lie near s1's infinite line (perp distance)
  const perp = (p: Vec2) => Math.abs((p.x - s1.a.x) * -dy + (p.y - s1.a.y) * dx);
  if (perp(s2.a) > WALL_COLLINEAR_TOL || perp(s2.b) > WALL_COLLINEAR_TOL) return 0;
  // project all endpoints onto s1's axis, measure interval overlap
  const proj = (p: Vec2) => (p.x - s1.a.x) * dx + (p.y - s1.a.y) * dy;
  const lo1 = 0;
  const hi1 = len1;
  const p2a = proj(s2.a);
  const p2b = proj(s2.b);
  const lo2 = Math.min(p2a, p2b);
  const hi2 = Math.max(p2a, p2b);
  const overlap = Math.max(0, Math.min(hi1, hi2) - Math.max(lo1, lo2));
  return overlap / Math.max(len1, len2);
}

function reconcileWalls(oldWalls: Wall[], newWalls: Wall[]): RemapEntry[] {
  const olds = oldWalls.map((w) => ({ id: w.id, seg: span(w) }));
  const news = newWalls.map((w) => ({ id: w.id, seg: span(w) }));
  const claimed = new Set<string>();
  const entries: RemapEntry[] = [];

  for (const o of olds) {
    const scored = news
      .filter((n) => !claimed.has(n.id))
      .map((n) => ({ n, score: overlapRatio(o.seg, n.seg) }))
      .sort((a, b) => b.score - a.score || (a.n.id < b.n.id ? -1 : 1));
    const best = scored[0];
    if (best && best.score >= WALL_MATCH_OVERLAP) {
      claimed.add(best.n.id);
      entries.push({
        status: best.n.id === o.id ? 'kept' : 'remapped',
        entityType: 'wall',
        oldId: o.id,
        newId: best.n.id,
        score: best.score,
      });
    } else if (best && best.score >= WALL_WEAK_OVERLAP) {
      // collinear but only partially overlapping — surface for confirmation
      // instead of silently deleting (which would drop the user's edits).
      claimed.add(best.n.id);
      entries.push({ status: 'unresolved', entityType: 'wall', oldId: o.id, newId: best.n.id, score: best.score });
    } else {
      entries.push({ status: 'deleted', entityType: 'wall', oldId: o.id });
    }
  }
  for (const n of news) {
    if (!claimed.has(n.id)) entries.push({ status: 'added', entityType: 'wall', newId: n.id });
  }
  return entries;
}

/**
 * Compute the remap between an old scene and a freshly re-extracted one. Pure:
 * returns a RemapTable, mutates nothing. Matching is per-floor by index (floor 0
 * ↔ floor 0) since cross-floor registration is out of scope for v1.
 */
export function reconcile(oldScene: HomeScene, newScene: HomeScene): RemapTable {
  const entries: RemapEntry[] = [];
  const floors = Math.max(oldScene.floors.length, newScene.floors.length);
  for (let i = 0; i < floors; i++) {
    const o = oldScene.floors[i];
    const n = newScene.floors[i];
    entries.push(...reconcileRooms(o?.rooms ?? [], n?.rooms ?? []));
    entries.push(...reconcileWalls(o?.walls ?? [], n?.walls ?? []));
  }
  return { entries };
}

export interface RemapApplication {
  /** Auto-applicable migration (geometry updates + deletes); null if nothing safe. */
  patch: ScenePatch | null;
  /** New entities to add — surfaced, NOT auto-applied (add ordering needs review). */
  added: RemapEntry[];
  /** Ambiguous matches (split / weak) for the diff-merge UI to resolve. */
  unresolved: RemapEntry[];
}

/**
 * Turn a reconcile into a SAFE migration. 'remapped' entities keep their OLD id
 * and only their geometry is updated — so the user's materials, locks and
 * furniture references survive. 'deleted' → remove. 'added'/'split'/'unresolved'
 * are returned for the user, never silently applied. The patch routes through
 * the commit pipeline, so a remap that would rewrite a LOCKED entity is rejected
 * there, not applied behind the lock's back.
 */
export function applyRemap(oldScene: HomeScene, newScene: HomeScene): RemapApplication {
  const ops: PatchOp[] = [];
  const added: RemapEntry[] = [];
  const unresolved: RemapEntry[] = [];
  const floors = Math.max(oldScene.floors.length, newScene.floors.length);

  for (let i = 0; i < floors; i++) {
    const of = oldScene.floors[i];
    const nf = newScene.floors[i];
    for (const e of reconcileRooms(of?.rooms ?? [], nf?.rooms ?? [])) {
      if (e.status === 'remapped' && e.oldId && e.newId) {
        const nr = nf?.rooms.find((r) => r.id === e.newId);
        if (nr) ops.push({ type: 'update_room_boundary', roomId: e.oldId, boundary: nr.boundary });
      } else if (e.status === 'deleted' && e.oldId) {
        ops.push({ type: 'remove_room', roomId: e.oldId });
      } else if (e.status === 'added') {
        added.push(e);
      } else if (e.status === 'split' || e.status === 'unresolved') {
        unresolved.push(e);
      }
    }
    for (const e of reconcileWalls(of?.walls ?? [], nf?.walls ?? [])) {
      if (e.status === 'remapped' && e.oldId && e.newId) {
        const nw = nf?.walls.find((w) => w.id === e.newId);
        if (!nw) continue;
        const pts = nw.path.pts;
        // normalize a possibly-stale bulges array (re-extraction output is noisy)
        const bulges =
          nw.path.bulges.length === pts.length - 1 ? nw.path.bulges : new Array(Math.max(0, pts.length - 1)).fill(0);
        // would shrinking this wall push an existing opening past the 50mm stubs?
        const newLen = pathLength(pts);
        const fits = (of ? wallOpenings(of, e.oldId) : []).every((op) => {
          const c = op.u * newLen;
          return c - op.width / 2 >= MIN_WALL_STUB_MM && c + op.width / 2 <= newLen - MIN_WALL_STUB_MM;
        });
        if (fits) {
          ops.push({ type: 'update_wall', wallId: e.oldId, patch: { path: { pts, bulges } } });
        } else {
          // auto-applying would orphan an opening and hard-fail the atomic commit —
          // route to the review queue instead.
          unresolved.push(e);
        }
      } else if (e.status === 'deleted' && e.oldId) {
        ops.push({ type: 'remove_wall', wallId: e.oldId });
      } else if (e.status === 'added') {
        added.push(e);
      } else if (e.status === 'unresolved') {
        unresolved.push(e);
      }
    }
  }

  const patch = ops.length > 0 ? makePatch('Reconcile re-extracted geometry', ops, 'system') : null;
  return { patch, added, unresolved };
}
