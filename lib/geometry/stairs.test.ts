import { describe, expect, it } from 'vitest';
import { sourceSample, type Stair } from '../scene/schemas';
import { buildStair, stairStepCount } from './stairs';

const mkStair = (overrides: Partial<Stair> = {}): Stair => ({
  id: 's1',
  floorId: 'f0',
  kind: 'straight',
  position: { x: 0, y: 0 },
  rotation: 0,
  width: 1000,
  totalRise: 3000,
  treadRun: 280,
  materialId: 'm',
  source: sourceSample(),
  ...overrides,
});

describe('stairs', () => {
  it('picks a comfortable step count', () => {
    expect(stairStepCount(3000)).toBe(17);
    expect(stairStepCount(300)).toBe(2);
  });

  it('straight stair: one prism per step, top step reaches the full rise', () => {
    const solid = buildStair(mkStair());
    expect(solid.prisms).toHaveLength(solid.stepCount);
    const top = solid.prisms[solid.prisms.length - 1]!;
    expect(top.zMax).toBeCloseTo(3000, 6);
    // steps ascend monotonically
    for (let i = 1; i < solid.prisms.length; i++) {
      expect(solid.prisms[i]!.zMax).toBeGreaterThan(solid.prisms[i - 1]!.zMax);
    }
  });

  it('L stair: adds a landing prism and turns the second flight', () => {
    const solid = buildStair(mkStair({ kind: 'L', flightSplit: 9, turn: 'right' }));
    expect(solid.prisms).toHaveLength(solid.stepCount + 1); // + landing
    // second-flight steps move in -y (turn right from +x ascent)
    const last = solid.prisms[solid.prisms.length - 1]!;
    const minY = Math.min(...last.corners.map((c) => c.y));
    expect(minY).toBeLessThan(-500);
  });

  it('applies position and rotation to all corners', () => {
    const solid = buildStair(mkStair({ position: { x: 1000, y: 2000 }, rotation: Math.PI / 2 }));
    // ascending +y now: all corners should be at x within width/2 of 1000
    for (const p of solid.prisms) {
      for (const c of p.corners) {
        expect(Math.abs(c.x - 1000)).toBeLessThanOrEqual(501);
        expect(c.y).toBeGreaterThanOrEqual(1999);
      }
    }
  });
});
