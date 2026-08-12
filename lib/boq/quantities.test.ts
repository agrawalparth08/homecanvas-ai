import { describe, expect, it } from 'vitest';
import { buildSampleHome } from '../fixtures/sample-home';
import { polygonArea } from '../geometry/rooms';
import { quantitiesToCsv } from './csv';
import { sceneQuantities } from './quantities';

describe('sceneQuantities', () => {
  const scene = buildSampleHome();
  const q = sceneQuantities(scene);

  it('covers every room on every floor', () => {
    const roomCount = scene.floors.reduce((n, f) => n + f.rooms.length, 0);
    expect(q.rooms).toHaveLength(roomCount);
  });

  it('floor areas reconcile with polygon math (holes subtracted)', () => {
    for (const rq of q.rooms) {
      const room = scene.floors.flatMap((f) => f.rooms).find((r) => r.id === rq.roomId)!;
      const holes = room.boundary.holes.reduce((s, h) => s + Math.abs(polygonArea(h)), 0);
      const expected = Math.max(0, Math.abs(polygonArea(room.boundary.outer)) - holes) / 1e6;
      expect(rq.floorAreaM2).toBeCloseTo(expected, 6);
      expect(rq.floorAreaM2).toBeGreaterThan(0);
    }
  });

  it('wall paint areas are positive and openings reduce them', () => {
    // Every room with walls gets some wall area…
    const withWalls = q.rooms.filter((r) => Object.keys(r.wallAreaByMaterialM2).length > 0);
    expect(withWalls.length).toBeGreaterThan(0);
    for (const rq of withWalls) {
      for (const area of Object.values(rq.wallAreaByMaterialM2)) expect(area).toBeGreaterThan(0);
    }
    // …and a wall with a door yields LESS than gross length×height would.
    const floor = scene.floors[0]!;
    const doorWall = floor.openings[0] && floor.walls.find((w) => w.id === floor.openings[0]!.wallId);
    if (doorWall) {
      const room = floor.rooms.find((r) => r.wallIds.includes(doorWall.id));
      if (room) {
        const rq = q.rooms.find((r) => r.roomId === room.id)!;
        const total = Object.values(rq.wallAreaByMaterialM2).reduce((a, b) => a + b, 0);
        const gross = room.wallIds.reduce((sum, wid) => {
          const w = floor.walls.find((x) => x.id === wid);
          if (!w) return sum;
          let len = 0;
          for (let i = 0; i < w.path.pts.length - 1; i++) {
            const a = w.path.pts[i]!;
            const b = w.path.pts[i + 1]!;
            len += Math.hypot(b.x - a.x, b.y - a.y);
          }
          return sum + (len * w.height) / 1e6;
        }, 0);
        expect(total).toBeLessThan(gross);
      }
    }
  });

  it('material totals reconcile with per-room sums', () => {
    const floorTotal = q.totals.filter((t) => t.surface === 'floor').reduce((a, t) => a + t.areaM2, 0);
    const roomFloorTotal = q.rooms.reduce((a, r) => a + r.floorAreaM2, 0);
    expect(floorTotal).toBeCloseTo(roomFloorTotal, 6);
    for (const t of q.totals) {
      expect(t.materialName).toBeTruthy();
      expect(t.areaM2).toBeGreaterThan(0);
    }
  });

  it('furniture schedule counts objects per room by name', () => {
    const allCounts = q.rooms.reduce((n, r) => n + Object.values(r.furniture).reduce((a, b) => a + b, 0), 0);
    const objectCount = scene.floors.reduce((n, f) => n + f.objects.length, 0);
    expect(allCounts).toBe(objectCount);
  });
});

describe('quantitiesToCsv', () => {
  it('emits all three sections with escaped cells', () => {
    const scene = buildSampleHome();
    const csv = quantitiesToCsv(scene);
    expect(csv).toContain('MATERIAL TOTALS');
    expect(csv).toContain('PER-ROOM BREAKDOWN');
    expect(csv).toContain('FURNITURE SCHEDULE');
    expect(csv).toContain('Rate (per m2)');
    // no unescaped stray quotes breaking rows
    for (const line of csv.split('\n')) {
      expect((line.match(/"/g)?.length ?? 0) % 2).toBe(0);
    }
  });
});
