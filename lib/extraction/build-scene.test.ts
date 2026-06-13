import { describe, it, expect } from 'vitest';
import { buildSceneFromPrimitives } from './build-scene';
import { parsePrimitivePlan } from './primitive-plan';
import { HomeSceneSchema } from '../scene/schemas';
import { validateScene } from '../scene/validation';
import { DEFAULT_PARTITION_WALL_MM, DEFAULT_EXTERNAL_WALL_MM } from '../geometry/constants';

const NOW = '2026-01-01T00:00:00.000Z';
const errorsOf = (scene: Parameters<typeof validateScene>[0]) =>
  validateScene(scene).filter((i) => i.severity === 'error');

describe('buildSceneFromPrimitives — rect-hint path', () => {
  const plan = parsePrimitivePlan({
    source: 'traced',
    unitsToMm: 1,
    roomHints: [
      { rect: { x0: 0, y0: 0, x1: 4000, y1: 3000 }, label: 'Living', kind: 'living' },
      { rect: { x0: 4000, y0: 0, x1: 7000, y1: 3000 }, label: 'Kitchen', kind: 'kitchen' },
    ],
  });
  const scene = buildSceneFromPrimitives(plan, { now: NOW });
  const floor = scene.floors[0]!;

  it('produces a schema-valid scene with no validation errors', () => {
    expect(HomeSceneSchema.safeParse(scene).success).toBe(true);
    expect(errorsOf(scene)).toEqual([]);
  });

  it('makes two rooms with floor + ceiling surfaces', () => {
    expect(floor.rooms).toHaveLength(2);
    for (const r of floor.rooms) {
      expect(r.floorSurface.kind).toBe('floor');
      expect(r.ceilingSurface).toBeDefined();
      expect(r.lightIds).toHaveLength(1);
    }
  });

  it('merges the shared wall into ONE interior wall (no doubling)', () => {
    const sharedVertical = floor.walls.filter(
      (w) => Math.abs(w.path.pts[0]!.x - 4000) < 1 && Math.abs(w.path.pts[1]!.x - 4000) < 1,
    );
    expect(sharedVertical).toHaveLength(1);
    expect(sharedVertical[0]!.thickness).toBe(DEFAULT_PARTITION_WALL_MM);
    // exterior walls use the thicker spec
    const extWall = floor.walls.find((w) => Math.abs(w.path.pts[0]!.x - 0) < 1 && Math.abs(w.path.pts[1]!.x - 0) < 1);
    expect(extWall!.thickness).toBe(DEFAULT_EXTERNAL_WALL_MM);
  });

  it('auto-places a door on the shared wall when no openings are given', () => {
    const shared = floor.walls.find((w) => Math.abs(w.path.pts[0]!.x - 4000) < 1)!;
    const door = floor.openings.find((o) => o.wallId === shared.id);
    expect(door).toBeDefined();
    expect(door!.kind).toBe('door');
    expect(door!.u).toBeGreaterThan(0);
    expect(door!.u).toBeLessThan(1);
  });

  it('marks terraces open-to-sky with no ceiling', () => {
    const t = buildSceneFromPrimitives(
      parsePrimitivePlan({ source: 'traced', roomHints: [{ rect: { x0: 0, y0: 0, x1: 3000, y1: 3000 }, kind: 'terrace' }] }),
      { now: NOW },
    );
    const room = t.floors[0]!.rooms[0]!;
    expect(room.openToSky).toBe(true);
    expect(room.ceilingSurface).toBeUndefined();
  });
});

describe('buildSceneFromPrimitives — CAD/segment path', () => {
  const plan = parsePrimitivePlan({
    source: 'cad',
    unitsToMm: 1,
    walls: [
      { a: { x: 0, y: 0 }, b: { x: 4000, y: 0 } },
      { a: { x: 4000, y: 0 }, b: { x: 4000, y: 3000 } },
      { a: { x: 4000, y: 3000 }, b: { x: 0, y: 3000 } },
      { a: { x: 0, y: 3000 }, b: { x: 0, y: 0 } },
    ],
  });
  const scene = buildSceneFromPrimitives(plan, { now: NOW });
  const floor = scene.floors[0]!;

  it('keeps the four CAD walls and validates', () => {
    expect(floor.walls).toHaveLength(4);
    expect(HomeSceneSchema.safeParse(scene).success).toBe(true);
    expect(errorsOf(scene)).toEqual([]);
  });

  it('detects the enclosed room', () => {
    expect(floor.rooms.length).toBeGreaterThanOrEqual(1);
    expect(floor.rooms[0]!.wallIds.length).toBeGreaterThan(0);
  });
});

describe('buildSceneFromPrimitives — scaling, openings, columns, stairs', () => {
  it('scales source units to mm via unitsToMm', () => {
    const inches = buildSceneFromPrimitives(
      parsePrimitivePlan({ source: 'cad', unitsToMm: 25.4, walls: [{ a: { x: 0, y: 0 }, b: { x: 100, y: 0 } }] }),
      { now: NOW },
    );
    const w = inches.floors[0]!.walls[0]!;
    const len = Math.hypot(w.path.pts[1]!.x - w.path.pts[0]!.x, w.path.pts[1]!.y - w.path.pts[0]!.y);
    expect(len).toBeCloseTo(2540, 3); // 100 in × 25.4
  });

  it('snaps an explicit opening onto the nearest wall', () => {
    const scene = buildSceneFromPrimitives(
      parsePrimitivePlan({
        source: 'cad',
        walls: [{ a: { x: 0, y: 0 }, b: { x: 4000, y: 0 } }],
        openings: [{ kind: 'window', center: { x: 2000, y: 0 }, width: 1200 }],
      }),
      { now: NOW },
    );
    const o = scene.floors[0]!.openings;
    expect(o).toHaveLength(1);
    expect(o[0]!.kind).toBe('window');
    expect(o[0]!.u).toBeCloseTo(0.5, 1);
    expect(o[0]!.sillHeight).toBe(900);
  });

  it('includes columns (as partitions) and stairs, and stays valid', () => {
    const scene = buildSceneFromPrimitives(
      parsePrimitivePlan({
        source: 'cad',
        roomHints: [{ rect: { x0: 0, y0: 0, x1: 5000, y1: 5000 }, kind: 'living' }],
        columns: [{ center: { x: 2500, y: 2500 }, width: 300, depth: 300 }],
        stairs: [{ position: { x: 1000, y: 1000 }, kind: 'L', rotation: 0 }],
      }),
      { now: NOW },
    );
    const floor = scene.floors[0]!;
    const col = floor.objects.find((o) => o.procedural?.kind === 'column');
    expect(col).toBeDefined();
    expect(col!.category).toBe('partition');
    expect(floor.stairs).toHaveLength(1);
    expect(floor.stairs[0]!.kind).toBe('L');
    expect(errorsOf(scene)).toEqual([]);
  });
});
