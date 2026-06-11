import {
  DEFAULT_PARTITION_WALL_MM,
  DEFAULT_WALL_HEIGHT_MM,
  DEFAULT_DOOR_WIDTH_MM,
  DEFAULT_DOOR_HEIGHT_MM,
  DEFAULT_WINDOW_SILL_MM,
  DEFAULT_WINDOW_HEAD_MM,
} from '../geometry/constants';
import { add, clamp01, dot, scale, sub, type Vec2 } from '../geometry/vec';
import { wallCenterlineLength } from '../geometry/walls-shared';
import type { Opening, Room, RoomKind, Wall } from '../scene/schemas';

/** Builders that turn 2D tracer gestures into scene entities (plan mm). */

let idCounter = 0;
export function traceId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

export function makeWall(
  floorId: string,
  a: Vec2,
  b: Vec2,
  opts: { id?: string; thickness?: number; height?: number; materialId?: string; confidence?: number } = {},
): Wall {
  return {
    id: opts.id ?? traceId('wall'),
    floorId,
    path: { pts: [a, b], bulges: [0] },
    thickness: opts.thickness ?? DEFAULT_PARTITION_WALL_MM,
    height: opts.height ?? DEFAULT_WALL_HEIGHT_MM,
    materialIds: { sideA: opts.materialId ?? 'mat-paint-white', sideB: opts.materialId ?? 'mat-paint-white' },
    source: { kind: 'traced', confidence: opts.confidence ?? 1 },
  };
}

/** Axis-aligned room from two opposite corners (plan mm). */
export function makeRoomRect(
  floorId: string,
  name: string,
  kind: RoomKind,
  a: Vec2,
  b: Vec2,
  opts: { id?: string; floorMaterialId?: string; ceilingMaterialId?: string; openToSky?: boolean } = {},
): Room {
  const x0 = Math.min(a.x, b.x);
  const x1 = Math.max(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const y1 = Math.max(a.y, b.y);
  const id = opts.id ?? traceId('room');
  const open = opts.openToSky ?? false;
  return {
    id,
    floorId,
    name,
    kind,
    openToSky: open,
    boundary: {
      outer: [
        { x: x0, y: y0 },
        { x: x1, y: y0 },
        { x: x1, y: y1 },
        { x: x0, y: y1 },
      ],
      holes: [],
    },
    wallIds: [],
    floorSurface: { id: `${id}-floor`, parentId: id, kind: 'floor', materialId: opts.floorMaterialId ?? 'mat-floor-oak' },
    ...(open
      ? {}
      : { ceilingSurface: { id: `${id}-ceiling`, parentId: id, kind: 'ceiling' as const, materialId: opts.ceilingMaterialId ?? 'mat-ceiling-white' } }),
    furnitureIds: [],
    lightIds: [],
    styleTags: [],
    source: { kind: 'traced', confidence: 1 },
  };
}

export interface WallProjection {
  wall: Wall;
  /** position along the wall centerline, 0..1 */
  u: number;
  point: Vec2;
  dist: number;
}

/** Project a point onto a wall's centerline; returns u (0..1), foot point and distance. */
export function projectOntoWall(p: Vec2, wall: Wall): WallProjection {
  const a = wall.path.pts[0]!;
  const b = wall.path.pts[wall.path.pts.length - 1]!;
  const ab = sub(b, a);
  const len2 = dot(ab, ab) || 1;
  const u = clamp01(dot(sub(p, a), ab) / len2);
  const point = add(a, scale(ab, u));
  return { wall, u, point, dist: Math.hypot(p.x - point.x, p.y - point.y) };
}

/** Nearest wall to a point, within tolMm of its centerline. */
export function nearestWall(p: Vec2, walls: Wall[], tolMm: number): WallProjection | null {
  let best: WallProjection | null = null;
  for (const wall of walls) {
    const proj = projectOntoWall(p, wall);
    if (proj.dist <= tolMm && (!best || proj.dist < best.dist)) best = proj;
  }
  return best;
}

export function makeOpening(
  wallId: string,
  kind: Opening['kind'],
  u: number,
  opts: { id?: string; width?: number; sillHeight?: number; headHeight?: number; swing?: Opening['swing'] } = {},
): Opening {
  const isWin = kind === 'window';
  return {
    id: opts.id ?? traceId('opening'),
    wallId,
    kind,
    u,
    width: opts.width ?? DEFAULT_DOOR_WIDTH_MM,
    sillHeight: opts.sillHeight ?? (isWin ? DEFAULT_WINDOW_SILL_MM : 0),
    headHeight: opts.headHeight ?? (isWin ? DEFAULT_WINDOW_HEAD_MM : DEFAULT_DOOR_HEIGHT_MM),
    ...(kind === 'door' ? { swing: opts.swing ?? 'left' } : {}),
    source: { kind: 'traced', confidence: 1 },
  };
}

/** Does an opening of `width` centered at `u` fit on the wall with min stubs? */
export function openingFits(wall: Wall, u: number, width: number, minStubMm = 50): boolean {
  const len = wallCenterlineLength(wall);
  const lo = u * len - width / 2;
  const hi = u * len + width / 2;
  return lo >= minStubMm && hi <= len - minStubMm;
}
