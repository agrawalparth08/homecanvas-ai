import { describe, expect, it } from 'vitest';
import { MIN_WALL_STUB_MM } from './constants';
import { buildWallNetwork, openingIntervals } from './walls';
import type { Floor, Opening, Wall } from '../scene/schemas';
import { sourceSample } from '../scene/schemas';

const mkWall = (id: string, x0: number, y0: number, x1: number, y1: number, thickness = 200, height = 3000): Wall => ({
  id,
  floorId: 'f0',
  path: { pts: [{ x: x0, y: y0 }, { x: x1, y: y1 }], bulges: [0] },
  thickness,
  height,
  materialIds: { sideA: 'm', sideB: 'm' },
  source: sourceSample(),
});

const mkOpening = (id: string, wallId: string, u: number, width: number, sill: number, head: number): Opening => ({
  id,
  wallId,
  kind: sill > 0 ? 'window' : 'door',
  u,
  width,
  sillHeight: sill,
  headHeight: head,
  source: sourceSample(),
});

const mkFloor = (walls: Wall[], openings: Opening[] = []): Floor => ({
  id: 'f0',
  name: 'F',
  level: 0,
  floorHeight: 3000,
  rooms: [],
  walls,
  openings,
  objects: [],
  stairs: [],
  lights: [],
});

describe('openingIntervals', () => {
  it('merges overlapping openings into one cut', () => {
    const merged = openingIntervals(
      [mkOpening('a', 'w', 0.4, 1000, 0, 2100), mkOpening('b', 'w', 0.5, 1000, 900, 2100)],
      5000,
      3000,
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]!.lo).toBe(1500);
    expect(merged[0]!.hi).toBe(3000);
    expect(merged[0]!.sill).toBe(0); // door wins: full-height cut at the bottom
    expect(merged[0]!.head).toBe(2100);
  });

  it('clamps openings to keep minimum stubs', () => {
    const merged = openingIntervals([mkOpening('a', 'w', 0.0, 1000, 0, 2100)], 4000, 3000);
    expect(merged[0]!.lo).toBe(MIN_WALL_STUB_MM);
  });

  it('caps opening heads at wall height', () => {
    const merged = openingIntervals([mkOpening('a', 'w', 0.5, 800, 0, 9999)], 4000, 3000);
    expect(merged[0]!.head).toBe(3000);
  });
});

describe('buildWallNetwork', () => {
  it('renders a lone wall as one full prism with flush caps', () => {
    const [solid] = buildWallNetwork(mkFloor([mkWall('w1', 0, 0, 4000, 0)]));
    expect(solid!.prisms).toHaveLength(1);
    const p = solid!.prisms[0]!;
    // flush butt caps: corners exactly at the segment ends, offset by half thickness
    expect(p.corners[0]).toEqual({ x: 0, y: 100 }); // aStart (left of +x is +y)
    expect(p.corners[3]).toEqual({ x: 0, y: -100 }); // bStart
    expect(p.corners[1]).toEqual({ x: 4000, y: 100 }); // aEnd
    expect(p.corners[2]).toEqual({ x: 4000, y: -100 }); // bEnd
    expect(p.zMin).toBe(0);
    expect(p.zMax).toBe(3000);
  });

  it('miters a 90° corner: both walls share the corner point, no overlap', () => {
    const w1 = mkWall('w1', 0, 0, 4000, 0);
    const w2 = mkWall('w2', 4000, 0, 4000, 3000);
    const solids = buildWallNetwork(mkFloor([w1, w2]));
    const s1 = solids.find((s) => s.wallId === 'w1')!;
    const s2 = solids.find((s) => s.wallId === 'w2')!;

    // Outer corner of the L (below-right): w1 sideB meets w2 sideB at (4100, -100).
    const w1OuterEnd = s1.prisms[0]!.corners[2];
    const w2OuterStart = s2.prisms[0]!.corners[3];
    expect(w1OuterEnd.x).toBeCloseTo(4100, 5);
    expect(w1OuterEnd.y).toBeCloseTo(-100, 5);
    expect(w2OuterStart.x).toBeCloseTo(w1OuterEnd.x, 5);
    expect(w2OuterStart.y).toBeCloseTo(w1OuterEnd.y, 5);

    // Inner corner: (3900, 100) shared as well.
    const w1InnerEnd = s1.prisms[0]!.corners[1];
    const w2InnerStart = s2.prisms[0]!.corners[0];
    expect(w1InnerEnd.x).toBeCloseTo(3900, 5);
    expect(w1InnerEnd.y).toBeCloseTo(100, 5);
    expect(w2InnerStart.x).toBeCloseTo(w1InnerEnd.x, 5);
    expect(w2InnerStart.y).toBeCloseTo(w1InnerEnd.y, 5);
  });

  it('miters a 45° junction without a spike (clamped)', () => {
    const w1 = mkWall('w1', 0, 0, 4000, 0);
    const w2 = mkWall('w2', 4000, 0, 7000, 150); // ~2.9° — extremely acute continuation
    const solids = buildWallNetwork(mkFloor([w1, w2]));
    for (const s of solids) {
      for (const p of s.prisms) {
        for (const c of p.corners) {
          // No corner may run away more than the clamp radius from the junction
          expect(Math.abs(c.y)).toBeLessThanOrEqual(4 * 100 + 1);
        }
      }
    }
  });

  it('handles collinear continuation (straight T-join) via parallel fallback', () => {
    const w1 = mkWall('w1', 0, 0, 2000, 0);
    const w2 = mkWall('w2', 2000, 0, 5000, 0);
    const solids = buildWallNetwork(mkFloor([w1, w2]));
    const s1 = solids.find((s) => s.wallId === 'w1')!;
    expect(s1.prisms[0]!.corners[1]).toEqual({ x: 2000, y: 100 });
  });

  it('splits a wall around a door: pier, lintel, pier', () => {
    const wall = mkWall('w1', 0, 0, 4000, 0);
    const door = mkOpening('d1', 'w1', 0.5, 1000, 0, 2100);
    const [solid] = buildWallNetwork(mkFloor([wall], [door]));
    // left pier (full height), lintel above the door, right pier
    expect(solid!.prisms).toHaveLength(3);
    const [left, lintel, right] = solid!.prisms;
    expect(left!.zMax).toBe(3000);
    expect(left!.sEnd).toBe(1500);
    expect(lintel!.zMin).toBe(2100);
    expect(lintel!.zMax).toBe(3000);
    expect(right!.sStart).toBe(2500);
  });

  it('splits a wall around a window: pier, sill, lintel, pier', () => {
    const wall = mkWall('w1', 0, 0, 4000, 0);
    const window = mkOpening('win', 'w1', 0.5, 1200, 900, 2100);
    const [solid] = buildWallNetwork(mkFloor([wall], [window]));
    expect(solid!.prisms).toHaveLength(4);
    const sill = solid!.prisms.find((p) => p.zMin === 0 && p.zMax === 900);
    const lintel = solid!.prisms.find((p) => p.zMin === 2100);
    expect(sill).toBeDefined();
    expect(lintel).toBeDefined();
  });

  it('keeps continuous s-coordinates across splits for seamless UVs', () => {
    const wall = mkWall('w1', 0, 0, 4000, 0);
    const door = mkOpening('d1', 'w1', 0.4, 800, 0, 2100);
    const [solid] = buildWallNetwork(mkFloor([wall], [door]));
    const piers = solid!.prisms.filter((p) => p.zMin === 0 && p.zMax === 3000);
    expect(piers[0]!.sEnd).toBe(1200);
    expect(piers[1]!.sStart).toBe(2000); // same axis, no UV reset
  });

  it('drops degenerate walls instead of crashing', () => {
    const wall = mkWall('w1', 0, 0, 0.5, 0);
    expect(buildWallNetwork(mkFloor([wall]))).toHaveLength(0);
  });
});
