import type { Floor, Opening, Wall } from '../scene/schemas';
import { JUNCTION_SNAP_MM, MIN_WALL_STUB_MM, MITER_CLAMP_FACTOR } from './constants';
import { add, angleOf, dist, dot, lerp, lineIntersection, normalize, perp, scale, sub, type Vec2 } from './vec';

/**
 * Wall-network mesh generator.
 *
 * Walls are edges between junction nodes. Instead of extruding each wall as an
 * independent box (z-fighting overlaps / L-gaps at corners), we compute mitered
 * corner points per junction by intersecting the offset edge lines of
 * angle-adjacent walls, then split each wall into prisms around its openings
 * (interval-merged, end-clamped). Geometry is a pure function of the scene
 * graph — no CSG anywhere.
 */

export interface GeoPrism {
  /** Plan footprint, ordered [aStart, aEnd, bEnd, bStart]; a = sideA (left of dir). */
  corners: [Vec2, Vec2, Vec2, Vec2];
  zMin: number;
  zMax: number;
  /** Axis range along the wall centerline, for continuous UVs. */
  sStart: number;
  sEnd: number;
}

export interface WallSolid {
  wallId: string;
  origin: Vec2;
  dir: Vec2;
  length: number;
  height: number;
  thickness: number;
  prisms: GeoPrism[];
  /** Openings actually cut (post merge/clamp), as s-intervals. */
  cutIntervals: { lo: number; hi: number; sill: number; head: number }[];
}

interface WallSeg {
  wall: Wall;
  start: Vec2;
  end: Vec2;
  dir: Vec2;
  length: number;
  half: number;
}

interface WallEnd {
  seg: WallSeg;
  /** true if this end is the segment's start point. */
  atStart: boolean;
  /** Direction pointing from the junction INTO the wall. */
  outward: Vec2;
  /** Corner on the CCW (left-of-outward) side — set during junction resolution. */
  cornerLeft?: Vec2;
  /** Corner on the CW (right-of-outward) side. */
  cornerRight?: Vec2;
}

function toSegment(wall: Wall): WallSeg | null {
  const start = wall.path.pts[0]!;
  const end = wall.path.pts[wall.path.pts.length - 1]!;
  const length = dist(start, end);
  if (length < 1) return null;
  return { wall, start, end, dir: normalize(sub(end, start)), length, half: wall.thickness / 2 };
}

/** Group wall endpoints into junctions by snap distance. */
function buildJunctions(segs: WallSeg[]): { point: Vec2; ends: WallEnd[] }[] {
  const junctions: { point: Vec2; ends: WallEnd[] }[] = [];
  const attach = (p: Vec2, end: WallEnd) => {
    for (const j of junctions) {
      if (dist(j.point, p) <= JUNCTION_SNAP_MM) {
        j.ends.push(end);
        return;
      }
    }
    junctions.push({ point: p, ends: [end] });
  };
  for (const seg of segs) {
    attach(seg.start, { seg, atStart: true, outward: seg.dir });
    attach(seg.end, { seg, atStart: false, outward: scale(seg.dir, -1) });
  }
  return junctions;
}

/**
 * Resolve the corner points around one junction.
 * Ends are sorted CCW by outward angle; the corner between consecutive ends
 * (A, B) is the intersection of A's left edge line with B's right edge line.
 */
function resolveJunction(point: Vec2, ends: WallEnd[]): void {
  if (ends.length === 1) {
    // Dead end: flush butt cap.
    const e = ends[0]!;
    const n = perp(e.outward);
    e.cornerLeft = add(point, scale(n, e.seg.half));
    e.cornerRight = add(point, scale(n, -e.seg.half));
    return;
  }

  const sorted = [...ends].sort((a, b) => angleOf(a.outward) - angleOf(b.outward));
  const n = sorted.length;
  for (let i = 0; i < n; i++) {
    const a = sorted[i]!;
    const b = sorted[(i + 1) % n]!;
    // A's left edge: parallel to a.outward, offset +half on the CCW side.
    const aLine = add(point, scale(perp(a.outward), a.seg.half));
    // B's right edge: parallel to b.outward, offset -half (CW side).
    const bLine = add(point, scale(perp(b.outward), -b.seg.half));
    let corner = lineIntersection(aLine, a.outward, bLine, b.outward);
    const maxMiter = MITER_CLAMP_FACTOR * Math.max(a.seg.half, b.seg.half);
    if (!corner) {
      // Collinear continuation: edges are parallel — use the averaged offset.
      const off = (a.seg.half + b.seg.half) / 2;
      corner = add(point, scale(perp(a.outward), off));
    } else if (dist(corner, point) > maxMiter) {
      // Acute junction: clamp the miter spike to a bevel-ish radius.
      corner = add(point, scale(normalize(sub(corner, point)), maxMiter));
    }
    a.cornerLeft = corner;
    b.cornerRight = corner;
  }
}

interface ResolvedWall {
  seg: WallSeg;
  /** sideA edge endpoints (left of start→end). */
  aStart: Vec2;
  aEnd: Vec2;
  /** sideB edge endpoints. */
  bStart: Vec2;
  bEnd: Vec2;
}

function resolveWalls(walls: Wall[]): ResolvedWall[] {
  const segs = walls.map(toSegment).filter((s): s is WallSeg => s !== null);
  const junctions = buildJunctions(segs);
  for (const j of junctions) resolveJunction(j.point, j.ends);

  const byWall = new Map<string, { start?: WallEnd; end?: WallEnd }>();
  for (const j of junctions) {
    for (const e of j.ends) {
      const slot = byWall.get(e.seg.wall.id) ?? {};
      if (e.atStart) slot.start = e;
      else slot.end = e;
      byWall.set(e.seg.wall.id, slot);
    }
  }

  const resolved: ResolvedWall[] = [];
  for (const seg of segs) {
    const ends = byWall.get(seg.wall.id);
    const s = ends?.start;
    const e = ends?.end;
    if (!s?.cornerLeft || !s.cornerRight || !e?.cornerLeft || !e.cornerRight) continue;
    resolved.push({
      seg,
      // At the start junction, outward == dir, so left == sideA.
      aStart: s.cornerLeft,
      bStart: s.cornerRight,
      // At the end junction, outward == -dir, so left == sideB.
      aEnd: e.cornerRight,
      bEnd: e.cornerLeft,
    });
  }
  return resolved;
}

/** Merge + clamp opening intervals along a wall of length L. */
export function openingIntervals(
  openings: Opening[],
  length: number,
  wallHeight: number,
): { lo: number; hi: number; sill: number; head: number }[] {
  const raw = openings
    .map((o) => ({
      lo: o.u * length - o.width / 2,
      hi: o.u * length + o.width / 2,
      sill: o.kind === 'window' ? o.sillHeight : 0,
      head: Math.min(o.headHeight, wallHeight),
    }))
    .map((iv) => ({
      ...iv,
      lo: Math.max(iv.lo, MIN_WALL_STUB_MM),
      hi: Math.min(iv.hi, length - MIN_WALL_STUB_MM),
    }))
    .filter((iv) => iv.hi - iv.lo > 1)
    .sort((a, b) => a.lo - b.lo);

  const merged: typeof raw = [];
  for (const iv of raw) {
    const last = merged[merged.length - 1];
    if (last && iv.lo < last.hi) {
      last.hi = Math.max(last.hi, iv.hi);
      last.sill = Math.min(last.sill, iv.sill);
      last.head = Math.max(last.head, iv.head);
    } else {
      merged.push({ ...iv });
    }
  }
  return merged;
}

function buildSolid(rw: ResolvedWall, openings: Opening[]): WallSolid {
  const { seg } = rw;
  const height = seg.wall.height;
  const s = (p: Vec2) => dot(sub(p, seg.start), seg.dir);

  // Edge parameterizations (the mitered quad's a/b edges are straight lines).
  const sA0 = s(rw.aStart);
  const sA1 = s(rw.aEnd);
  const sB0 = s(rw.bStart);
  const sB1 = s(rw.bEnd);
  const pointA = (c: number) => lerp(rw.aStart, rw.aEnd, (c - sA0) / (sA1 - sA0 || 1));
  const pointB = (c: number) => lerp(rw.bStart, rw.bEnd, (c - sB0) / (sB1 - sB0 || 1));

  const intervals = openingIntervals(openings, seg.length, height);

  const prisms: GeoPrism[] = [];
  /** Boundaries in s-space; null marks the true (mitered) wall ends. */
  type Cut = number | null;
  const cutsA = (c: Cut, end: boolean) => (c === null ? (end ? rw.aEnd : rw.aStart) : pointA(c));
  const cutsB = (c: Cut, end: boolean) => (c === null ? (end ? rw.bEnd : rw.bStart) : pointB(c));

  const pushPrism = (from: Cut, to: Cut, zMin: number, zMax: number) => {
    if (zMax - zMin < 1) return;
    const a0 = cutsA(from, false);
    const a1 = cutsA(to, true);
    const b1 = cutsB(to, true);
    const b0 = cutsB(from, false);
    prisms.push({
      corners: [a0, a1, b1, b0],
      zMin,
      zMax,
      sStart: from ?? Math.min(sA0, sB0),
      sEnd: to ?? Math.max(sA1, sB1),
    });
  };

  let cursor: Cut = null;
  for (const iv of intervals) {
    pushPrism(cursor, iv.lo, 0, height); // solid span before the opening
    if (iv.sill > 1) pushPrism(iv.lo, iv.hi, 0, iv.sill); // below sill
    if (iv.head < height - 1) pushPrism(iv.lo, iv.hi, iv.head, height); // lintel above
    cursor = iv.hi;
  }
  pushPrism(cursor, null, 0, height); // tail span to the mitered end

  return {
    wallId: seg.wall.id,
    origin: seg.start,
    dir: seg.dir,
    length: seg.length,
    height,
    thickness: seg.wall.thickness,
    prisms,
    cutIntervals: intervals,
  };
}

/** Build render-ready solids for every wall on a floor. */
export function buildWallNetwork(floor: Floor): WallSolid[] {
  const resolved = resolveWalls(floor.walls);
  const openingsByWall = new Map<string, Opening[]>();
  for (const o of floor.openings) {
    const list = openingsByWall.get(o.wallId);
    if (list) list.push(o);
    else openingsByWall.set(o.wallId, [o]);
  }
  return resolved.map((rw) => buildSolid(rw, openingsByWall.get(rw.seg.wall.id) ?? []));
}
