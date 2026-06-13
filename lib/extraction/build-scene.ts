/**
 * buildSceneFromPrimitives — the shared spine (Phase 0).
 *
 * Turns a PrimitivePlan (emitted by any front door: CAD/DXF, vector-PDF,
 * raster-CV, manual trace) into a validated single-floor HomeScene: walls,
 * rooms (with floor/ceiling surfaces), openings, columns, stairs, and basic
 * lights. Two input modes converge here:
 *
 *   roomHints w/ rects  ─► buildArrangement (shared walls merged) ─┐
 *                                                                  ├─► Floor
 *   wall segments (CAD) ─► walls direct + detectRooms for rects  ─┘
 *
 * Dressing is intentionally minimal (library default materials, one point
 * light per room + a sun). Rich per-room furniture/materials stay a caller
 * concern — the my-home generator keeps its bespoke dressing and shares only
 * the geometry (buildArrangement), so its output is unchanged by this module.
 *
 * Coordinates in the plan are SOURCE units; `unitsToMm` scales to millimetres.
 */
import {
  type HomeScene,
  type Floor,
  type Wall,
  type Room,
  type Opening,
  type Light,
  type Stair,
  type FurnitureObject,
  type Vec2,
  type RoomKind,
  type EntitySource,
  OPEN_ROOM_KINDS,
} from '../scene/schemas';
import { buildArrangement, type ArrRoom, type WallSeg } from '../geometry/arrangement';
import { healWalls } from './heal-walls';
import { type WallLine } from './rooms-from-walls';
import { collapseDoubleWalls } from './wall-centerlines';
import { detectRoomsSealed } from './building-outline';
import { cloneLibrary } from '../styles/material-library';
import { DEFAULT_EXTERNAL_WALL_MM, DEFAULT_PARTITION_WALL_MM } from '../geometry/constants';
import type { PrimitivePlan, PrimRoomHint } from './primitive-plan';

const DEFAULT_WALL_H = 3000;
const DEFAULT_FLOOR_H = 3300;
const STUB = 80; // mm clear on each side of an opening (> the 50mm validator floor)

export interface BuildSceneOptions {
  id?: string;
  name?: string;
  floorId?: string;
  floorName?: string;
  level?: number;
  floorHeight?: number;
  wallHeight?: number;
  extThickness?: number;
  intThickness?: number;
  /** ISO timestamp for scene.meta; fixed default keeps the builder deterministic. */
  now?: string;
}

// PrimitivePlan provenance → scene-graph EntitySource.kind
const SOURCE_KIND: Record<PrimitivePlan['source'], EntitySource['kind']> = {
  cad: 'extracted',
  'vector-pdf': 'extracted',
  'raster-cv': 'extracted',
  traced: 'traced',
  manual: 'manual',
  sample: 'sample',
};
const BASE_CONF: Record<EntitySource['kind'], number> = {
  sample: 1,
  manual: 0.92,
  traced: 0.62,
  agent: 0.7,
  extracted: 0.5,
};

const v = (x: number, y: number): Vec2 => ({ x, y });
const scaleV = (p: Vec2, s: number): Vec2 => ({ x: p.x * s, y: p.y * s });
const centroidOf = (pts: Vec2[]): Vec2 => ({
  x: pts.reduce((a, p) => a + p.x, 0) / pts.length,
  y: pts.reduce((a, p) => a + p.y, 0) / pts.length,
});

/** Nearest point on segment a→b to p: returns param u∈[0,1] and perpendicular distance. */
function projectOntoSeg(p: Vec2, a: Vec2, b: Vec2): { u: number; dist: number } {
  const abx = b.x - a.x, aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  if (len2 < 1e-6) return { u: 0, dist: Math.hypot(p.x - a.x, p.y - a.y) };
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2));
  return { u: t, dist: Math.hypot(p.x - (a.x + t * abx), p.y - (a.y + t * aby)) };
}

function pickMat(lib: ReturnType<typeof cloneLibrary>, id: string, category?: string): string {
  if (lib.some((m) => m.id === id)) return id;
  if (category) {
    const byCat = lib.find((m) => m.category === category);
    if (byCat) return byCat.id;
  }
  return lib[0]!.id;
}

function slugId(prefix: string, label: string, used: Set<string>): string {
  const base = `${prefix}-` + (label || 'room').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  let id = base || prefix, n = 2;
  while (used.has(id)) id = `${base}-${n++}`;
  used.add(id);
  return id;
}

interface WallRec { id: string; a: Vec2; b: Vec2; lenMm: number; }

export function buildSceneFromPrimitives(plan: PrimitivePlan, opts: BuildSceneOptions = {}): HomeScene {
  const s = plan.unitsToMm;
  const floorId = opts.floorId ?? 'floor-0';
  const floorHeight = opts.floorHeight ?? DEFAULT_FLOOR_H;
  const wallH = opts.wallHeight ?? DEFAULT_WALL_H;
  const ext = opts.extThickness ?? DEFAULT_EXTERNAL_WALL_MM;
  const int = opts.intThickness ?? DEFAULT_PARTITION_WALL_MM;
  const now = opts.now ?? '1970-01-01T00:00:00.000Z';

  const srcKind = SOURCE_KIND[plan.source];
  const src = (mult = 1): EntitySource => ({ kind: srcKind, confidence: Math.max(0, Math.min(1, BASE_CONF[srcKind] * mult)) });

  const lib = cloneLibrary();
  const matWall = pickMat(lib, 'mat-paint-white', 'paint');
  const matFloor = pickMat(lib, 'mat-floor-marble-grey', 'marble');
  const matCeil = pickMat(lib, 'mat-ceiling-white', 'paint');
  const matStair = pickMat(lib, 'mat-stair-stone', 'stone');

  const walls: Wall[] = [];
  const wallRecs: WallRec[] = [];
  const rooms: Room[] = [];
  const lights: Light[] = [];
  const usedIds = new Set<string>();
  let autoDoors: string[] = [];

  const addWall = (a: Vec2, b: Vec2, thickness: number, height: number): WallRec => {
    const id = `w-${floorId}-${(walls.length + 1).toString().padStart(3, '0')}`;
    walls.push({ id, floorId, path: { pts: [a, b], bulges: [0] }, thickness, height, materialIds: { sideA: matWall, sideB: matWall }, source: src() });
    const rec: WallRec = { id, a, b, lenMm: Math.hypot(b.x - a.x, b.y - a.y) };
    wallRecs.push(rec);
    return rec;
  };

  // --- geometry: walls + room rects, via whichever input the plan carries ---
  type RoomBuild = { id: string; name: string; kind: RoomKind; openToSky: boolean; outer: Vec2[]; wallIds: string[] };
  const roomBuilds: RoomBuild[] = [];
  const segWallId = new Map<WallSeg, string>();

  const rectHints = plan.roomHints.filter((h): h is PrimRoomHint & { rect: NonNullable<PrimRoomHint['rect']> } => !!h.rect);

  if (plan.walls.length > 0) {
    // ---- CAD / segment path: walls are given; detect room rects from them ----
    // Split axis-aligned vs angled, then collapse double-line faces into single
    // centerlines (CAD draws each wall as two parallel lines; left raw they would
    // explode into phantom sliver-rooms between the faces).
    const axisLines: WallLine[] = [];
    const angled: Array<{ a: Vec2; b: Vec2 }> = [];
    for (const w of plan.walls) {
      const a = scaleV(w.a, s), b = scaleV(w.b, s);
      const dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y);
      if (dx <= 1 && dy > 1) axisLines.push({ orient: 'v', coord: (a.x + b.x) / 2, lo: Math.min(a.y, b.y), hi: Math.max(a.y, b.y) });
      else if (dy <= 1 && dx > 1) axisLines.push({ orient: 'h', coord: (a.y + b.y) / 2, lo: Math.min(a.x, b.x), hi: Math.max(a.x, b.x) });
      else if (dx > 1 || dy > 1) angled.push({ a, b });
    }
    // heal first (merge each face's collinear fragments + snap), THEN pair faces
    const centers = collapseDoubleWalls(healWalls(axisLines, { maxGap: 600 }), { maxThickness: 350, defaultThickness: ext });
    const lines: WallLine[] = [];
    for (const c of centers) {
      const a = c.orient === 'v' ? v(c.coord, c.lo) : v(c.lo, c.coord);
      const b = c.orient === 'v' ? v(c.coord, c.hi) : v(c.hi, c.coord);
      addWall(a, b, c.thickness, wallH);
      lines.push({ orient: c.orient, coord: c.coord, lo: c.lo, hi: c.hi });
    }
    for (const ag of angled) addWall(ag.a, ag.b, ext, wallH);
    // bridge door-width gaps so rooms close up instead of leaking to the exterior
    // seal the footprint perimeter so interior rooms don't leak out through door gaps,
    // then drop the giant bbox-spanning phantom the seal creates on non-convex /
    // stray-geometry footprints (no residential room exceeds ~250 m²).
    const rects = detectRoomsSealed(healWalls(lines, { maxGap: 1100 }), { coordTol: 10, minArea: 900 * 900 }).filter(
      (r) => (r.x1 - r.x0) * (r.y1 - r.y0) <= 250e6,
    );
    rects.forEach((r, i) => {
      const id = slugId('room', `r${i + 1}`, usedIds);
      const outer = [v(r.x0, r.y0), v(r.x1, r.y0), v(r.x1, r.y1), v(r.x0, r.y1)];
      // walls lying on this rect's boundary (axis-aligned, coord+extent match)
      const ids = wallRecs.filter((wr) => onRectEdge(wr, r)).map((wr) => wr.id);
      roomBuilds.push({ id, name: `Room ${i + 1}`, kind: 'other', openToSky: false, outer, wallIds: ids });
    });
  } else {
    // ---- rect-hint path (raster / traced): planar arrangement merges shared walls ----
    const built = rectHints.map((h, i) => {
      const r = h.rect!;
      const x0 = Math.min(r.x0, r.x1) * s, x1 = Math.max(r.x0, r.x1) * s;
      const y0 = Math.min(r.y0, r.y1) * s, y1 = Math.max(r.y0, r.y1) * s;
      const kind = (h.kind ?? 'other') as RoomKind;
      return {
        id: slugId('room', h.label ?? `r${i + 1}`, usedIds),
        name: h.label ?? `Room ${i + 1}`,
        kind,
        openToSky: h.openToSky ?? OPEN_ROOM_KINDS.has(kind),
        rect: { x0, y0, x1, y1 },
      };
    });
    const arr: ArrRoom[] = built.map((b) => ({ id: b.id, ...b.rect }));
    const segs = buildArrangement(arr);
    for (const seg of segs) {
      const a = seg.orient === 'v' ? v(seg.coord, seg.lo) : v(seg.lo, seg.coord);
      const b = seg.orient === 'v' ? v(seg.coord, seg.hi) : v(seg.hi, seg.coord);
      const exterior = seg.sideA === null || seg.sideB === null;
      const rec = addWall(a, b, exterior ? ext : int, wallH);
      segWallId.set(seg, rec.id);
    }
    for (const b of built) {
      const wallIds = segs.filter((seg) => seg.sideA === b.id || seg.sideB === b.id).map((seg) => segWallId.get(seg)!).filter(Boolean);
      roomBuilds.push({
        id: b.id,
        name: b.name,
        kind: b.kind,
        openToSky: b.openToSky,
        outer: [v(b.rect.x0, b.rect.y0), v(b.rect.x1, b.rect.y0), v(b.rect.x1, b.rect.y1), v(b.rect.x0, b.rect.y1)],
        wallIds,
      });
    }
    // auto-doors on shared walls when the plan carries no opening info
    if (plan.openings.length === 0) {
      const longestByPair = new Map<string, WallSeg>();
      for (const seg of segs) {
        if (!seg.sideA || !seg.sideB) continue;
        const key = [seg.sideA, seg.sideB].sort().join('|');
        const prev = longestByPair.get(key);
        if (!prev || seg.hi - seg.lo > prev.hi - prev.lo) longestByPair.set(key, seg);
      }
      autoDoors = [...longestByPair.values()].map((seg) => segWallId.get(seg)!).filter(Boolean);
    }
  }

  // --- room objects (boundary + surfaces + one light each) ---
  for (const rb of roomBuilds) {
    const c = centroidOf(rb.outer);
    const lightId = `l-${rb.id}`;
    lights.push({
      id: lightId,
      floorId,
      roomId: rb.id,
      kind: 'point',
      position: { x: c.x, y: c.y, elevation: rb.openToSky ? 3000 : 2700 },
      intensity: rb.openToSky ? 12 : 20,
      color: rb.openToSky ? '#eaf0ff' : '#ffe7c4',
      castShadow: false,
    });
    rooms.push({
      id: rb.id,
      floorId,
      name: rb.name,
      kind: rb.kind,
      openToSky: rb.openToSky,
      boundary: { outer: rb.outer, holes: [] },
      wallIds: rb.wallIds,
      floorSurface: { id: `${rb.id}-floor`, parentId: rb.id, kind: 'floor', materialId: matFloor },
      ...(rb.openToSky ? {} : { ceilingSurface: { id: `${rb.id}-ceiling`, parentId: rb.id, kind: 'ceiling' as const, materialId: matCeil } }),
      furnitureIds: [],
      lightIds: [lightId],
      styleTags: [],
      source: src(),
    });
  }
  lights.push({ id: `l-sun-${floorId}`, floorId, kind: 'sun', position: { x: -5000, y: -7000, elevation: 9000 }, intensity: 2.6, color: '#fff2dd', castShadow: true });

  // --- openings: explicit (snap to nearest wall) or the auto-doors above ---
  const openings: Opening[] = [];
  const placed = new Map<string, [number, number][]>();
  const addOpening = (wallId: string, lenMm: number, kind: Opening['kind'], uWant: number, widthWant: number, conf: number) => {
    if (lenMm < 700) return;
    const width = Math.max(500, Math.min(widthWant, lenMm - 2 * STUB - 20));
    const minU = (width / 2 + STUB) / lenMm;
    const u = Math.max(minU, Math.min(1 - minU, uWant));
    const half = width / 2 / lenMm;
    const span: [number, number] = [u - half, u + half];
    const taken = placed.get(wallId) ?? [];
    if (taken.some(([a, b]) => span[0] < b && a < span[1])) return; // overlaps an existing opening
    taken.push(span);
    placed.set(wallId, taken);
    openings.push({
      id: `o-${floorId}-${openings.length + 1}`,
      wallId,
      kind,
      u,
      width,
      sillHeight: kind === 'window' ? 900 : 0,
      headHeight: 2100,
      ...(kind === 'door' ? { swing: 'left' as const } : {}),
      source: { kind: srcKind, confidence: Math.max(0, Math.min(1, conf)) },
    });
  };

  for (const op of plan.openings) {
    const c = scaleV(op.center, s);
    let best: { wr: WallRec; u: number; dist: number } | null = null;
    for (const wr of wallRecs) {
      const { u, dist } = projectOntoSeg(c, wr.a, wr.b);
      if (!best || dist < best.dist) best = { wr, u, dist };
    }
    if (best && best.dist <= Math.max(600, (op.width * s) / 2 + 300)) {
      addOpening(best.wr.id, best.wr.lenMm, op.kind, best.u, op.width * s, op.confidence ?? 0.7);
    }
  }
  for (const wallId of autoDoors) {
    const wr = wallRecs.find((w) => w.id === wallId);
    if (wr) addOpening(wr.id, wr.lenMm, 'door', 0.5, 1000, 0.45);
  }

  // --- columns → partition furniture; stairs → Stair entities ---
  const objects: FurnitureObject[] = [];
  const roomAt = (p: Vec2): string | undefined =>
    roomBuilds.find((r) => pointInPoly(p, r.outer))?.id ?? roomBuilds[0]?.id;
  plan.columns.forEach((col, i) => {
    const c = scaleV(col.center, s);
    const rid = roomAt(c);
    if (!rid) return;
    const w = Math.max(120, col.width * s), d = Math.max(120, col.depth * s);
    objects.push({
      id: `col-${floorId}-${i + 1}`,
      roomId: rid,
      category: 'partition',
      name: 'Column (structural)',
      procedural: { kind: 'column' },
      transform: { x: c.x, y: c.y, elevation: 0, rotationY: 0 },
      dimensions: { w, d, h: wallH },
      footprint: [v(-w / 2, -d / 2), v(w / 2, -d / 2), v(w / 2, d / 2), v(-w / 2, d / 2)],
      materialIds: [matWall],
      source: src(),
    });
    const rm = rooms.find((r) => r.id === rid);
    if (rm) rm.furnitureIds = [...rm.furnitureIds, `col-${floorId}-${i + 1}`];
  });

  const stairs: Stair[] = plan.stairs.map((st, i) => ({
    id: `stair-${floorId}-${i + 1}`,
    floorId,
    kind: st.kind,
    position: scaleV(st.position, s),
    rotation: st.rotation,
    width: (st.width ?? 1000 / s) * s,
    totalRise: floorHeight,
    treadRun: 280,
    ...(st.kind === 'straight' ? {} : { flightSplit: 6 }),
    materialId: matStair,
    source: src(),
  }));

  const floor: Floor = { id: floorId, name: opts.floorName ?? 'Floor', level: opts.level ?? 0, floorHeight, rooms, walls, openings, objects, stairs, lights };

  return {
    schemaVersion: 1,
    id: opts.id ?? 'extracted-scene',
    name: opts.name ?? 'Extracted home',
    units: 'mm',
    floors: [floor],
    materials: lib,
    locks: [],
    referenceImages: [],
    meta: { createdAt: now, updatedAt: now, notes: `Built from a ${plan.source} PrimitivePlan.` },
  };

  // hoisted so the rect-path block can fill it before the openings pass runs
  function onRectEdge(wr: WallRec, r: { x0: number; y0: number; x1: number; y1: number }): boolean {
    const tol = 1;
    const vertical = Math.abs(wr.a.x - wr.b.x) <= tol;
    const horizontal = Math.abs(wr.a.y - wr.b.y) <= tol;
    if (vertical) {
      const x = (wr.a.x + wr.b.x) / 2;
      const onEdge = Math.abs(x - r.x0) <= tol || Math.abs(x - r.x1) <= tol;
      const lo = Math.min(wr.a.y, wr.b.y), hi = Math.max(wr.a.y, wr.b.y);
      return onEdge && lo <= r.y1 + tol && hi >= r.y0 - tol;
    }
    if (horizontal) {
      const y = (wr.a.y + wr.b.y) / 2;
      const onEdge = Math.abs(y - r.y0) <= tol || Math.abs(y - r.y1) <= tol;
      const lo = Math.min(wr.a.x, wr.b.x), hi = Math.max(wr.a.x, wr.b.x);
      return onEdge && lo <= r.x1 + tol && hi >= r.x0 - tol;
    }
    return false;
  }
}

/** Ray-cast point-in-polygon (plan space). */
function pointInPoly(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!, b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
