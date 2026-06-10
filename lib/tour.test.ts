import { describe, expect, it } from 'vitest';
import { buildSampleHome } from './fixtures/sample-home';
import { computeTourStops } from './tour';

describe('computeTourStops', () => {
  const scene = buildSampleHome();
  const floorId = scene.floors[0]!.id;

  it('produces one stop per room in authored order', () => {
    const stops = computeTourStops(scene, floorId);
    const rooms = scene.floors[0]!.rooms;
    expect(stops).toHaveLength(rooms.length);
    expect(stops.map((s) => s.roomId)).toEqual(rooms.map((r) => r.id));
  });

  it('places the eye at standing height and inside the room bounds', () => {
    const stops = computeTourStops(scene, floorId);
    const rooms = scene.floors[0]!.rooms;
    for (const stop of stops) {
      const room = rooms.find((r) => r.id === stop.roomId)!;
      const xs = room.boundary.outer.map((p) => p.x);
      const ys = room.boundary.outer.map((p) => p.y);
      const eyeXmm = stop.eye[0] * 1000;
      const eyeYmm = -stop.eye[2] * 1000; // world z -> plan y
      expect(eyeXmm).toBeGreaterThanOrEqual(Math.min(...xs) - 1);
      expect(eyeXmm).toBeLessThanOrEqual(Math.max(...xs) + 1);
      expect(eyeYmm).toBeGreaterThanOrEqual(Math.min(...ys) - 1);
      expect(eyeYmm).toBeLessThanOrEqual(Math.max(...ys) + 1);
      expect(stop.eye[1]).toBeCloseTo(1.55, 2); // standing eye height
    }
  });

  it('returns empty for an unknown floor', () => {
    expect(computeTourStops(scene, 'nope')).toEqual([]);
  });

  it('each stop has a non-empty caption', () => {
    for (const stop of computeTourStops(scene, floorId)) {
      expect(stop.caption.length).toBeGreaterThan(0);
    }
  });
});
