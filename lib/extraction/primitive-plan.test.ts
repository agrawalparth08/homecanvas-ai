import { describe, it, expect } from 'vitest';
import {
  PrimitivePlanSchema,
  parsePrimitivePlan,
  computeBounds,
  type PrimitivePlan,
} from './primitive-plan';

const fullPlan: unknown = {
  unitsToMm: 25.4,
  source: 'cad',
  walls: [
    { a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, thickness: 9, layer: 'A-WALL' },
    // angled wall (D2 hybrid path must survive the schema)
    { a: { x: 100, y: 0 }, b: { x: 160, y: 60 }, role: 'parapet' },
  ],
  openings: [{ kind: 'door', center: { x: 50, y: 0 }, width: 36, hostWallIndex: 0, confidence: 0.9 }],
  columns: [{ center: { x: 10, y: 10 }, width: 6, depth: 6 }],
  stairs: [{ position: { x: 80, y: 40 }, kind: 'L', rotation: 1.57, width: 40 }],
  roomHints: [
    { rect: { x0: 0, y0: 0, x1: 100, y1: 100 }, label: 'LIVING', kind: 'living' },
    { polygon: [{ x: 100, y: 0 }, { x: 160, y: 60 }, { x: 100, y: 60 }], label: 'TERRACE', kind: 'terrace', openToSky: true },
  ],
  labels: [{ text: 'LIVING', x: 50, y: 50 }],
};

describe('PrimitivePlanSchema', () => {
  it('round-trips a full plan (incl. angled wall + polygon room)', () => {
    const plan = parsePrimitivePlan(fullPlan);
    expect(plan.walls).toHaveLength(2);
    expect(plan.walls[1]!.role).toBe('parapet');
    expect(plan.roomHints[1]!.polygon).toHaveLength(3);
    // re-parsing the parsed output is stable
    expect(parsePrimitivePlan(plan)).toEqual(plan);
  });

  it('applies defaults for a minimal plan', () => {
    const plan = parsePrimitivePlan({ source: 'manual' });
    expect(plan.schemaVersion).toBe(1);
    expect(plan.unitsToMm).toBe(1);
    expect(plan.walls).toEqual([]);
    expect(plan.roomHints).toEqual([]);
  });

  it('defaults wall.role to "wall" and stair fields', () => {
    const plan = parsePrimitivePlan({
      source: 'cad',
      walls: [{ a: { x: 0, y: 0 }, b: { x: 1, y: 0 } }],
      stairs: [{ position: { x: 0, y: 0 } }],
    });
    expect(plan.walls[0]!.role).toBe('wall');
    expect(plan.stairs[0]!.kind).toBe('straight');
    expect(plan.stairs[0]!.rotation).toBe(0);
  });

  it('rejects NaN / infinite coordinates', () => {
    expect(() =>
      parsePrimitivePlan({ source: 'cad', walls: [{ a: { x: NaN, y: 0 }, b: { x: 1, y: 0 } }] }),
    ).toThrow();
  });

  it('rejects a non-positive wall thickness', () => {
    expect(() =>
      parsePrimitivePlan({ source: 'cad', walls: [{ a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, thickness: 0 }] }),
    ).toThrow();
  });

  it('rejects an opening with no width', () => {
    expect(() =>
      parsePrimitivePlan({ source: 'cad', openings: [{ kind: 'door', center: { x: 0, y: 0 } }] }),
    ).toThrow();
  });

  it('rejects a room hint with neither rect nor polygon', () => {
    const res = PrimitivePlanSchema.safeParse({ source: 'cad', roomHints: [{ label: 'X' }] });
    expect(res.success).toBe(false);
  });

  it('rejects an unknown provenance source', () => {
    expect(() => parsePrimitivePlan({ source: 'guesswork' })).toThrow();
  });
});

describe('computeBounds', () => {
  it('spans walls and room hints', () => {
    const plan = parsePrimitivePlan(fullPlan) as PrimitivePlan;
    expect(computeBounds(plan)).toEqual({ x0: 0, y0: 0, x1: 160, y1: 100 });
  });

  it('returns undefined for an empty plan', () => {
    expect(computeBounds(parsePrimitivePlan({ source: 'manual' }))).toBeUndefined();
  });
});
