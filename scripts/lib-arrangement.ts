/**
 * Planar-arrangement wall builder for axis-aligned room rectangles.
 *
 * The naive "one wall per room edge" approach doubles up walls wherever two
 * rooms share only PART of an edge (T-junctions), which is what made the first
 * my-home trace an unreadable maze. This builder instead:
 *   1. splits every shared coordinate line into elementary sub-segments at all
 *      room corners,
 *   2. records which room sits on each side of each sub-segment,
 *   3. merges consecutive collinear sub-segments with the same neighbours.
 * Result: each physical wall is ONE segment, shared cleanly between rooms.
 */

export interface ArrRoom {
  id: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface WallSeg {
  orient: 'v' | 'h';
  coord: number;
  lo: number;
  hi: number;
  /** vertical: [west, east]; horizontal: [south, north]. */
  sideA: string | null;
  sideB: string | null;
}

function elementarySegments(
  lines: Map<number, { lo: number; hi: number; room: string; sideAOwner: boolean }[]>,
): WallSeg[] {
  const out: WallSeg[] = [];
  for (const [coord, edges] of lines) {
    const pts = [...new Set(edges.flatMap((e) => [e.lo, e.hi]))].sort((a, b) => a - b);
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      if (b - a < 1) continue;
      let sideA: string | null = null; // west / south
      let sideB: string | null = null; // east / north
      for (const e of edges) {
        if (e.lo <= a && e.hi >= b) {
          if (e.sideAOwner) sideA = e.room;
          else sideB = e.room;
        }
      }
      if (sideA === null && sideB === null) continue;
      out.push({ orient: 'v', coord, lo: a, hi: b, sideA, sideB });
    }
  }
  return out;
}

function merge(segs: WallSeg[]): WallSeg[] {
  const merged: WallSeg[] = [];
  const byLine = new Map<string, WallSeg[]>();
  for (const s of segs) {
    const k = `${s.coord}|${s.sideA ?? ''}|${s.sideB ?? ''}`;
    (byLine.get(k) ?? byLine.set(k, []).get(k)!).push(s);
  }
  for (const group of byLine.values()) {
    group.sort((a, b) => a.lo - b.lo);
    let cur = { ...group[0]! };
    for (let i = 1; i < group.length; i++) {
      const s = group[i]!;
      if (s.lo <= cur.hi + 0.5) cur.hi = Math.max(cur.hi, s.hi);
      else {
        merged.push(cur);
        cur = { ...s };
      }
    }
    merged.push(cur);
  }
  return merged;
}

export function buildArrangement(rooms: ArrRoom[]): WallSeg[] {
  // vertical lines: x -> edges. sideAOwner = room is WEST of the line (room.x1 == x).
  const vlines = new Map<number, { lo: number; hi: number; room: string; sideAOwner: boolean }[]>();
  const hlines = new Map<number, { lo: number; hi: number; room: string; sideAOwner: boolean }[]>();
  const push = (
    m: Map<number, { lo: number; hi: number; room: string; sideAOwner: boolean }[]>,
    coord: number,
    lo: number,
    hi: number,
    room: string,
    sideAOwner: boolean,
  ) => {
    (m.get(coord) ?? m.set(coord, []).get(coord)!).push({ lo, hi, room, sideAOwner });
  };

  for (const r of rooms) {
    push(vlines, r.x0, r.y0, r.y1, r.id, false); // west edge: room east of line -> sideB
    push(vlines, r.x1, r.y0, r.y1, r.id, true); // east edge: room west of line -> sideA
    push(hlines, r.y0, r.x0, r.x1, r.id, false); // south edge: room north -> sideB
    push(hlines, r.y1, r.x0, r.x1, r.id, true); // north edge: room south -> sideA
  }

  const vSegs = elementarySegments(vlines).map((s) => ({ ...s, orient: 'v' as const }));
  const hSegsRaw = elementarySegments(hlines).map((s) => ({ ...s, orient: 'h' as const }));
  return [...merge(vSegs), ...merge(hSegsRaw)];
}

/** Find the merged wall separating two rooms (any orientation). */
export function wallBetween(segs: WallSeg[], a: string, b: string): WallSeg | null {
  return (
    segs.find(
      (s) => (s.sideA === a && s.sideB === b) || (s.sideA === b && s.sideB === a),
    ) ?? null
  );
}

/** Find a room's exterior wall on a compass side (the longest such segment). */
export function exteriorWall(segs: WallSeg[], room: string, side: 'n' | 's' | 'e' | 'w'): WallSeg | null {
  const candidates = segs.filter((s) => {
    if (side === 'w') return s.orient === 'v' && s.sideB === room && s.sideA === null;
    if (side === 'e') return s.orient === 'v' && s.sideA === room && s.sideB === null;
    if (side === 's') return s.orient === 'h' && s.sideB === room && s.sideA === null;
    return s.orient === 'h' && s.sideA === room && s.sideB === null; // n
  });
  candidates.sort((p, q) => q.hi - q.lo - (p.hi - p.lo));
  return candidates[0] ?? null;
}
