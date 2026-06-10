import { centroid } from './geometry/rooms';
import type { HomeScene, RoomKind } from './scene/schemas';
import { floorElevation } from './scene/selectors';

/**
 * Guided POV tour: an ordered set of first-person camera stops, one per room,
 * walking from the entrance through each space. Rooms are authored in visiting
 * order, so we simply follow floor.rooms. Pure (no three.js) so it's testable.
 *
 * Coordinates returned are WORLD meters: plan (x,y)mm -> (x*MM, height, -y*MM).
 */

const MM = 0.001;
const EYE_H = 1.55; // standing eye height (m)
const LOOK_H = 1.15;

export interface TourStop {
  roomId: string;
  name: string;
  caption: string;
  eye: [number, number, number];
  look: [number, number, number];
}

const CAPTION: Partial<Record<RoomKind, string>> = {
  foyer: 'Entry — step inside from the gate.',
  terrace: 'Open terrace / balcony, out to the sky.',
  balcony: 'Balcony, open to the outside.',
  living: 'Living area — the main gathering space.',
  dining: 'Dining area.',
  kitchen: 'Kitchen.',
  passage: 'Passage connecting the rooms.',
  store: 'Store room.',
  bedroom: 'Bedroom.',
  masterBedroom: 'Master bedroom.',
  bathroom: 'Attached bathroom.',
  washArea: 'Wash area.',
  study: 'Bedroom / office.',
  pooja: 'Pooja room.',
};

function bbox(pts: { x: number; y: number }[]) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  return { x0, y0, x1, y1 };
}

export function computeTourStops(scene: HomeScene, floorId: string): TourStop[] {
  const floor = scene.floors.find((f) => f.id === floorId);
  if (!floor) return [];
  const elevM = floorElevation(scene, floorId) * MM;
  const rooms = floor.rooms;

  return rooms.map((room, i) => {
    const c = centroid(room.boundary.outer);
    const prevRoom = rooms[i - 1];
    // First stop: approach from the south (entry gate side).
    const prev = prevRoom ? centroid(prevRoom.boundary.outer) : { x: c.x, y: c.y - 4000 };

    const dx = c.x - prev.x;
    const dy = c.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;

    const b = bbox(room.boundary.outer);
    const halfMin = Math.min(b.x1 - b.x0, b.y1 - b.y0) / 2;
    const back = Math.min(2600, 800 + 0.6 * halfMin);

    // Stand backed off from the centre toward where we entered, but clamp
    // inside the room so the camera never sits in a wall.
    const inset = 500;
    const ex = Math.min(b.x1 - inset, Math.max(b.x0 + inset, c.x - ux * back));
    const ey = Math.min(b.y1 - inset, Math.max(b.y0 + inset, c.y - uy * back));

    return {
      roomId: room.id,
      name: room.name,
      caption: CAPTION[room.kind] ?? room.name,
      eye: [ex * MM, elevM + EYE_H, -ey * MM] as [number, number, number],
      look: [c.x * MM, elevM + LOOK_H, -c.y * MM] as [number, number, number],
    };
  });
}
