import { describe, expect, it } from 'vitest';
import type { Floor, HomeScene, Room, Vec2 } from '../scene/schemas';
import { sourceSample } from '../scene/schemas';
import { checkSceneScale } from './scene-plausibility';

// --- minimal scene builders (only the fields checkSceneScale reads matter) ---

const surf = (id: string) => ({ id, parentId: 'room', kind: 'floor' as const, materialId: 'm' });

/** A rectangular room from (0,0)-origin width×height in mm. */
function rect(id: string, ox: number, oy: number, w: number, h: number): Room {
  const outer: Vec2[] = [
    { x: ox, y: oy },
    { x: ox + w, y: oy },
    { x: ox + w, y: oy + h },
    { x: ox, y: oy + h },
  ];
  return {
    id,
    floorId: 'f0',
    name: id,
    kind: 'other',
    openToSky: false,
    boundary: { outer, holes: [] },
    wallIds: [],
    floorSurface: surf(id),
    furnitureIds: [],
    lightIds: [],
    styleTags: [],
    source: sourceSample(),
  };
}

/** Floor with walls forming a bbox spanning the union of the given rooms. */
function floor(id: string, level: number, rooms: Room[]): Floor {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rooms) {
    for (const p of r.boundary.outer) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  const corners: Vec2[] = Number.isFinite(minX)
    ? [
        { x: minX, y: minY },
        { x: maxX, y: minY },
        { x: maxX, y: maxY },
        { x: minX, y: maxY },
      ]
    : [];
  const walls =
    corners.length > 0
      ? [
          {
            id: `${id}-wall`,
            floorId: id,
            path: { pts: corners, bulges: [0, 0, 0] },
            thickness: 115,
            height: 2700,
            materialIds: { sideA: 'm', sideB: 'm' },
            source: sourceSample(),
          },
        ]
      : [];
  return {
    id,
    name: id,
    level,
    floorHeight: 2700,
    rooms,
    walls,
    openings: [],
    objects: [],
    stairs: [],
    lights: [],
  };
}

function scene(floors: Floor[]): HomeScene {
  return {
    schemaVersion: 1,
    id: 'scene',
    name: 'test',
    units: 'mm',
    floors,
    materials: [],
    locks: [],
    referenceImages: [],
    meta: { createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  };
}

/** Scale every room/wall coordinate of a scene by k (deterministic resize). */
function scaleScene(s: HomeScene, k: number): HomeScene {
  return {
    ...s,
    floors: s.floors.map((f) => ({
      ...f,
      rooms: f.rooms.map((r) => ({
        ...r,
        boundary: {
          outer: r.boundary.outer.map((p) => ({ x: p.x * k, y: p.y * k })),
          holes: r.boundary.holes.map((h) => h.map((p) => ({ x: p.x * k, y: p.y * k }))),
        },
      })),
      walls: f.walls.map((w) => ({
        ...w,
        path: { ...w.path, pts: w.path.pts.map((p) => ({ x: p.x * k, y: p.y * k })) },
      })),
    })),
  };
}

// A normal home: a 4×5 m room and a 3×3 m room side by side (all mm).
const normalHome = scene([floor('f0', 0, [rect('r1', 0, 0, 4000, 5000), rect('r2', 4000, 0, 3000, 3000)])]);

describe('checkSceneScale', () => {
  it('flags a normal home as plausible without suggesting calibration', () => {
    const res = checkSceneScale(normalHome);
    expect(res.plausible).toBe(true);
    expect(res.suggestCalibration).toBe(false);
    expect(res.issues).toHaveLength(0);
    // 7m wide (4000+3000), 5m deep => 35 m^2 footprint.
    expect(res.metrics.widthM).toBe(7);
    expect(res.metrics.depthM).toBe(5);
    expect(res.metrics.footprintM2).toBe(35);
    expect(res.metrics.maxRoomM2).toBe(20); // 4×5
  });

  it('flags the SAME geometry scaled down 100x as implausible + calibration with a size issue', () => {
    const tiny = scaleScene(normalHome, 1 / 100);
    const res = checkSceneScale(tiny);
    expect(res.plausible).toBe(false);
    expect(res.suggestCalibration).toBe(true);
    // 0.07 m × 0.05 m footprint — collapsed scale.
    const codes = res.issues.map((i) => i.code);
    expect(codes).toContain('footprint');
    expect(codes).toContain('span');
    expect(codes).toContain('tinyRooms');
  });

  it('flags a giant 5000×5000 m scene as implausible + calibration', () => {
    const giant = scaleScene(normalHome, 1000); // 4000mm*1000 = 4,000,000 mm = 4000 m per room edge
    const res = checkSceneScale(giant);
    expect(res.plausible).toBe(false);
    expect(res.suggestCalibration).toBe(true);
    expect(res.issues.map((i) => i.code)).toContain('footprint');
    expect(res.issues.map((i) => i.code)).toContain('span');
  });

  it('treats an empty scene (no rooms) as not-plausible, no calibration', () => {
    const empty = scene([floor('f0', 0, [])]);
    const res = checkSceneScale(empty);
    expect(res.plausible).toBe(false);
    expect(res.suggestCalibration).toBe(false);
    expect(res.issues).toEqual([{ code: 'empty', message: expect.any(String) }]);
    expect(res.metrics.footprintM2).toBe(0);
  });

  it('checks the ground floor (level 0) regardless of floor order', () => {
    // Upper floor first, with an absurd scale; ground floor is the normal home.
    const upper = floor('f1', 1, [rect('u1', 0, 0, 4_000_000, 4_000_000)]);
    const ground = floor('f0', 0, [rect('r1', 0, 0, 4000, 5000)]);
    const res = checkSceneScale(scene([upper, ground]));
    expect(res.plausible).toBe(true);
    expect(res.metrics.footprintM2).toBe(20); // ground 4×5, not the giant upper
  });

  it('falls back to the largest-footprint floor when no level-0 floor exists', () => {
    const a = floor('fa', 2, [rect('a1', 0, 0, 4000, 5000)]); // 20 m^2
    const b = floor('fb', 3, [rect('b1', 0, 0, 1000, 1000)]); // 1 m^2 (mis-scaled if alone)
    const res = checkSceneScale(scene([b, a]));
    // Largest footprint (floor a) is plausible.
    expect(res.plausible).toBe(true);
    expect(res.metrics.footprintM2).toBe(20);
  });

  it('rounds all metrics to one decimal', () => {
    const odd = scene([floor('f0', 0, [rect('r1', 0, 0, 3333, 3333)])]);
    const res = checkSceneScale(odd);
    for (const v of Object.values(res.metrics)) {
      expect(Math.round(v * 10) / 10).toBe(v);
    }
  });
});
