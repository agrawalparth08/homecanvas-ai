/**
 * Integration coverage for the two spine wirings added on top of the Phase-0
 * builder: Path A's any-angle polygon-room fallback, and Path Z's section-derived
 * storey height flowing into wall heights. Both exercise buildSceneFromPrimitives
 * end-to-end through scene validation.
 */
import { describe, it, expect } from 'vitest';
import { buildSceneFromPrimitives } from './build-scene';
import { parsePrimitivePlan } from './primitive-plan';
import { validateScene } from '../scene/validation';
import { sectionInputFromSegments } from './section-pdf';
import { parseSectionHeights } from './section-heights';

describe('Path A — angled-wall polygon room fallback', () => {
  it('recovers a room from a diamond of 45° walls (no axis rects)', () => {
    // A rotated square (diamond): four equal-length segments, none axis-aligned.
    const pts = [
      { x: 5000, y: 0 },
      { x: 10000, y: 5000 },
      { x: 5000, y: 10000 },
      { x: 0, y: 5000 },
    ];
    const walls = pts.map((a, i) => ({ a, b: pts[(i + 1) % pts.length]! }));
    const plan = parsePrimitivePlan({ source: 'cad', unitsToMm: 1, walls });

    const scene = buildSceneFromPrimitives(plan);
    expect(validateScene(scene).length).toBe(0);
    const floor = scene.floors[0]!;
    expect(floor.walls).toHaveLength(4);
    // axis detection finds nothing here; the polygon fallback must recover the room.
    expect(floor.rooms.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Path Z — section storey height drives wall height', () => {
  it('parses a 3-level section to ~3000mm and builds walls that tall', () => {
    const segs = [
      { x0: 0, y0: 0, x1: 400, y1: 0 },
      { x0: 0, y0: 3000, x1: 400, y1: 3000 },
      { x0: 0, y0: 6000, x1: 400, y1: 6000 },
      { x0: 0, y0: 0, x1: 50, y1: 6000 }, // a steep member — must be dropped
    ];
    const input = sectionInputFromSegments(segs, []);
    const { storeyHeightMm } = parseSectionHeights(input);
    expect(storeyHeightMm).toBeCloseTo(3000, 0);

    const plan = parsePrimitivePlan({
      source: 'traced',
      unitsToMm: 1,
      roomHints: [{ rect: { x0: 0, y0: 0, x1: 4000, y1: 3000 }, label: 'Room' }],
    });
    const scene = buildSceneFromPrimitives(plan, { wallHeight: storeyHeightMm });
    expect(validateScene(scene).length).toBe(0);
    const floor = scene.floors[0]!;
    expect(floor.walls.length).toBeGreaterThan(0);
    expect(floor.walls.every((w) => w.height === storeyHeightMm)).toBe(true);
  });
});
