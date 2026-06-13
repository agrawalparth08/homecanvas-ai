/**
 * Polygon room detection for ANY-ANGLE walls (Path A hybrid fallback).
 *
 * build-scene's CAD path uses detectRoomsSealed, which only finds axis-aligned
 * rectangles — angled / diagonal walls form no rooms there. This is the general
 * planar-graph face extractor: given wall centerline SEGMENTS at any angle, it
 * returns the minimal interior polygons (the rooms).
 *
 * Standard minimal-cycle / planar-subdivision face extraction:
 *   1. Split every segment at all pairwise intersections; snap-merge endpoints
 *      and intersections within snapTol into shared vertices.
 *   2. Build an undirected planar graph; drop degree-<2 dangles.
 *   3. Walk faces via the half-edge rule "next = most-clockwise turn": for each
 *      directed edge u→v, the next directed edge leaves v along the neighbor that
 *      is the first one clockwise from the reverse direction v→u. This is the
 *      textbook left-most / minimal-cycle traversal; every interior face is a
 *      CCW (positive-area) loop, the unbounded face is CW (negative).
 *   4. Drop the outer face and faces below minArea.
 *   5. Normalize each ring to CCW; area is the shoelace area in mm².
 *
 * Pure, deterministic: plain functions over plain data, no DOM/network/time/RNG.
 */
import type { Vec2 } from '@lib/geometry/vec';

export interface WallSeg {
  a: Vec2;
  b: Vec2;
}
/** outer ring is CCW; area in mm². */
export interface PolyRoom {
  outer: Vec2[];
  area: number;
}
export interface PolygonRoomOptions {
  /** merge endpoints/intersections within this (mm). */
  snapTol?: number;
  /** drop faces below this (mm²). */
  minArea?: number;
}

const DEFAULT_SNAP = 25;
const DEFAULT_MIN_AREA = 810000; // 0.9 m²

interface Pt {
  x: number;
  y: number;
}

/** Shoelace signed area; positive when ring is CCW (y-up math convention). */
function signedArea(ring: Pt[]): number {
  let s = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    s += (b.x - a.x) * (b.y + a.y);
  }
  // (b.x-a.x)(b.y+a.y) summed = 2*(CW area); negate so CCW > 0.
  return -s / 2;
}

/**
 * Segment-segment intersection params. Returns the interpolation params (ta on
 * p→p2, tb on q→q2) when the *open-ish* interiors cross, else null. Endpoints
 * are handled by the vertex snap, so we only need genuine crossings here; we use
 * an inclusive [0,1] range with a tiny epsilon so T-junctions split the through
 * segment.
 */
function segIntersect(p: Pt, p2: Pt, q: Pt, q2: Pt): { ta: number; tb: number } | null {
  const r = { x: p2.x - p.x, y: p2.y - p.y };
  const s = { x: q2.x - q.x, y: q2.y - q.y };
  const denom = r.x * s.y - r.y * s.x;
  if (Math.abs(denom) < 1e-9) return null; // parallel / collinear: snap handles overlaps
  const qp = { x: q.x - p.x, y: q.y - p.y };
  const ta = (qp.x * s.y - qp.y * s.x) / denom;
  const tb = (qp.x * r.y - qp.y * r.x) / denom;
  const eps = 1e-9;
  if (ta < -eps || ta > 1 + eps || tb < -eps || tb > 1 + eps) return null;
  return { ta, tb };
}

export function detectRoomsPolygonal(segs: WallSeg[], opts: PolygonRoomOptions = {}): PolyRoom[] {
  const snapTol = opts.snapTol ?? DEFAULT_SNAP;
  const minArea = opts.minArea ?? DEFAULT_MIN_AREA;
  if (segs.length === 0) return [];

  // --- 1. split at all pairwise intersections, collect split points per segment ---
  // For each input segment, gather the params t∈[0,1] where it should break.
  const splits: number[][] = segs.map(() => [0, 1]);
  for (let i = 0; i < segs.length; i++) {
    const si = segs[i]!;
    for (let j = i + 1; j < segs.length; j++) {
      const sj = segs[j]!;
      const hit = segIntersect(si.a, si.b, sj.a, sj.b);
      if (!hit) continue;
      splits[i]!.push(Math.min(1, Math.max(0, hit.ta)));
      splits[j]!.push(Math.min(1, Math.max(0, hit.tb)));
    }
  }

  // Materialize sub-edges as coordinate pairs, then snap-cluster all coordinates.
  const rawEdges: Array<[Pt, Pt]> = [];
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i]!;
    const ts = [...new Set(splits[i]!)].sort((a, b) => a - b);
    for (let k = 0; k + 1 < ts.length; k++) {
      const t0 = ts[k]!;
      const t1 = ts[k + 1]!;
      const a: Pt = { x: s.a.x + (s.b.x - s.a.x) * t0, y: s.a.y + (s.b.y - s.a.y) * t0 };
      const b: Pt = { x: s.a.x + (s.b.x - s.a.x) * t1, y: s.a.y + (s.b.y - s.a.y) * t1 };
      rawEdges.push([a, b]);
    }
  }

  // --- snap-merge vertices: cluster points within snapTol, average each cluster ---
  const verts: Pt[] = [];
  const vertId = (p: Pt): number => {
    for (let k = 0; k < verts.length; k++) {
      const q = verts[k]!;
      if (Math.hypot(q.x - p.x, q.y - p.y) <= snapTol) return k;
    }
    verts.push({ x: p.x, y: p.y });
    return verts.length - 1;
  };

  // --- 2. undirected planar graph (deduped, no self-loops) ---
  const adj = new Map<number, Set<number>>();
  const link = (u: number, w: number) => {
    if (u === w) return;
    (adj.get(u) ?? adj.set(u, new Set()).get(u)!).add(w);
    (adj.get(w) ?? adj.set(w, new Set()).get(w)!).add(u);
  };
  for (const [a, b] of rawEdges) link(vertId(a), vertId(b));

  // Iteratively prune degree-<2 dangles (a chain of stubs peels off step by step).
  let pruned = true;
  while (pruned) {
    pruned = false;
    for (const [u, nbrs] of adj) {
      if (nbrs.size < 2 && nbrs.size > 0) {
        for (const w of nbrs) adj.get(w)!.delete(u);
        nbrs.clear();
        pruned = true;
      }
    }
  }

  // --- 3. half-edge face traversal ---
  // Precompute, per vertex, neighbors sorted CCW by angle, for O(1) "next" lookup.
  const ang = (u: number, w: number): number => {
    const a = verts[u]!;
    const b = verts[w]!;
    return Math.atan2(b.y - a.y, b.x - a.x);
  };
  const sortedNbrs = new Map<number, number[]>();
  for (const [u, nbrs] of adj) {
    if (nbrs.size === 0) continue;
    sortedNbrs.set(u, [...nbrs].sort((p, q) => ang(u, p) - ang(u, q)));
  }

  // For directed edge u→v, the next directed edge is v→w where w is the neighbor
  // of v immediately COUNTER-clockwise from the incoming direction v→u (the
  // left-most turn). Taking the left-most turn at every vertex traces the minimal
  // interior cycles as CCW (positive-area) loops; the unbounded face comes out CW.
  const key = (u: number, v: number) => u * (verts.length + 1) + v;
  const nextHalfEdge = (u: number, v: number): number => {
    const ring = sortedNbrs.get(v)!;
    const back = ang(v, u);
    // locate the incoming direction v→u in v's CCW-sorted ring, then step one CCW
    let idx = 0;
    let bestDiff = Infinity;
    for (let i = 0; i < ring.length; i++) {
      const d = Math.abs(ang(v, ring[i]!) - back);
      const dd = Math.min(d, Math.abs(d - 2 * Math.PI));
      if (dd < bestDiff) {
        bestDiff = dd;
        idx = i;
      }
    }
    const nxt = (idx + 1) % ring.length;
    return ring[nxt]!;
  };

  // Walk every directed half-edge exactly once into closed faces.
  const visited = new Set<number>();
  const faces: number[][] = [];
  for (const [u, nbrs] of adj) {
    for (const v of nbrs) {
      if (visited.has(key(u, v))) continue;
      const face: number[] = [];
      let cu = u;
      let cv = v;
      // guard against pathological non-termination (every edge has 2 dirs)
      const limit = adj.size * 4 + 8;
      let steps = 0;
      while (!visited.has(key(cu, cv)) && steps++ < limit) {
        visited.add(key(cu, cv));
        face.push(cu);
        const w = nextHalfEdge(cu, cv);
        cu = cv;
        cv = w;
      }
      if (face.length >= 3) faces.push(face);
    }
  }

  // --- 4 & 5. keep positive-area (CCW = interior) faces above minArea ---
  const rooms: PolyRoom[] = [];
  for (const face of faces) {
    const ring = face.map((id) => verts[id]!);
    const area = signedArea(ring);
    // CW faces (area<0) are exterior/unbounded; interior faces come out CCW.
    if (area <= 0) continue;
    if (area < minArea) continue;
    rooms.push({ outer: ring.map((p) => ({ x: p.x, y: p.y })), area });
  }

  // Stable order (largest first) so output is deterministic regardless of walk order.
  rooms.sort((a, b) => b.area - a.area);
  return rooms;
}
