/**
 * Generate the "my home" scene from a manual trace of Parth's penthouse,
 * authored to match the owner-described ground-floor flow:
 *   entrance → terrace → living → kitchen → passage → stairs → store
 *   → 2 bedrooms, each with an attached bathroom.
 *
 * Rooms are explicit rectangles; walls come from a planar-arrangement builder
 * (scripts/lib-arrangement.ts) so shared walls are single, merged segments — no
 * doubled walls. Doors and windows are placed deliberately (not auto-spammed).
 * Rooms are authored in VISITING ORDER, which the in-app POV tour follows.
 *
 * Dimensions are approximate (source.kind = 'traced'); refine in the Phase-2
 * tracing wizard. Output: private-home-inputs/processed/scene-json/my-home.scene.json
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { cloneLibrary } from '../lib/styles/material-library';
import {
  HomeSceneSchema,
  type Floor,
  type FurnitureObject,
  type HomeScene,
  type Light,
  type Opening,
  type Room,
  type RoomKind,
  type Stair,
  type Wall,
} from '../lib/scene/schemas';
import { validateScene } from '../lib/scene/validation';
import { DEFAULT_EXTERNAL_WALL_MM, DEFAULT_PARTITION_WALL_MM, DEFAULT_PARAPET_HEIGHT_MM } from '../lib/geometry/constants';
import { matchWindowToWall } from '../lib/extraction/geometry';
import { buildArrangement, exteriorWall, wallBetween, type ArrRoom, type WallSeg } from './lib-arrangement';

const FLOOR_H = 3300;
const WALL_H = 3000;
const PARAPET = DEFAULT_PARAPET_HEIGHT_MM;
const EXT = DEFAULT_EXTERNAL_WALL_MM;
const INT = DEFAULT_PARTITION_WALL_MM;

const traced = (c: number) => ({ kind: 'traced' as const, confidence: c });

type Side = 'n' | 's' | 'e' | 'w';
interface RoomRect {
  id: string;
  name: string;
  kind: RoomKind;
  rect: { x0: number; y0: number; x1: number; y1: number };
  floorMat: string;
  /** explicit open-to-sky override (traced terraces / cut-out courts). */
  openToSky?: boolean;
  /** plan CUT OUT (slab void); rendered as an open court, no doors into it. */
  isVoid?: boolean;
}
type DoorSpec = { a: string; b: string } | { room: string; side: Side };
interface WinSpec {
  room: string;
  side: Side;
}
interface FurnSpec {
  id: string;
  roomId: string;
  category: FurnitureObject['category'];
  name: string;
  kind: string;
  w: number;
  d: number;
  h: number;
  rot: number;
  mats: string[];
}

const isOpen = (k: RoomKind) => k === 'terrace' || k === 'balcony';
const roomOpen = (r: RoomRect) => r.openToSky ?? isOpen(r.kind);
const centroid = (r: RoomRect['rect']) => ({ x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 });
const rectFootprint = (w: number, d: number) => [
  { x: -w / 2, y: -d / 2 },
  { x: w / 2, y: -d / 2 },
  { x: w / 2, y: d / 2 },
  { x: -w / 2, y: d / 2 },
];

function segToWall(id: string, floorId: string, s: WallSeg): Wall {
  const a = s.orient === 'v' ? { x: s.coord, y: s.lo } : { x: s.lo, y: s.coord };
  const b = s.orient === 'v' ? { x: s.coord, y: s.hi } : { x: s.hi, y: s.coord };
  const exterior = s.sideA === null || s.sideB === null;
  return {
    id,
    floorId,
    path: { pts: [a, b], bulges: [0] },
    thickness: exterior ? EXT : INT,
    height: WALL_H, // parapet override applied later if both sides open/empty
    materialIds: { sideA: 'mat-paint-white', sideB: 'mat-paint-white' },
    source: traced(0.55),
  };
}

/** One representative furniture piece per room kind, clamped to fit the room. */
function autoFurnitureFor(rooms: RoomRect[]): FurnSpec[] {
  const out: FurnSpec[] = [];
  const fit = (rect: RoomRect['rect'], w: number, d: number): [number, number] => [
    Math.max(400, Math.min(w, Math.abs(rect.x1 - rect.x0) - 600)),
    Math.max(400, Math.min(d, Math.abs(rect.y1 - rect.y0) - 600)),
  ];
  for (const rm of rooms) {
    if (rm.isVoid) continue;
    const add = (category: FurnitureObject['category'], name: string, kind: string, w: number, d: number, h: number, mats: string[]) => {
      const [fw, fd] = fit(rm.rect, w, d);
      out.push({ id: `${rm.id}-${kind}`, roomId: rm.id, category, name, kind, w: fw, d: fd, h, rot: 0, mats });
    };
    switch (rm.kind) {
      case 'masterBedroom': add('bed', 'King Bed', 'bed', 1900, 2150, 550, ['mat-fabric-emerald', 'mat-wood-teak']); break;
      case 'bedroom': add('bed', 'Bed', 'bed', 1600, 2050, 550, ['mat-fabric-linen', 'mat-wood-teak']); break;
      case 'kidsRoom': add('bed', 'Bed', 'bed', 1200, 1900, 550, ['mat-fabric-rust', 'mat-wood-teak']); break;
      case 'living': add('sofa', 'Sofa', 'sofa', 2300, 950, 850, ['mat-fabric-linen', 'mat-wood-teak']); break;
      case 'dining': add('diningTable', 'Dining Table', 'table', 1600, 900, 750, ['mat-wood-teak']); break;
      case 'kitchen': add('kitchenUnit', 'Kitchen Counter', 'counter', 3000, 650, 900, ['mat-counter-granite', 'mat-wood-teak']); break;
      case 'study': add('console', 'Desk', 'table', 1600, 700, 750, ['mat-wood-teak']); break;
      case 'terrace': add('plant', 'Planter', 'plant', 700, 700, 1400, ['mat-paint-terracotta']); break;
      default: break;
    }
  }
  return out;
}

function buildFloor(
  id: string,
  name: string,
  level: number,
  rooms: RoomRect[],
  doors: DoorSpec[],
  windows: WinSpec[],
  furniture: FurnSpec[],
  stairs: Stair[],
  auto = false,
  features: PlanFeatures = { windows: [], pillars: [] },
): Floor {
  // CUT OUT voids stay in the wall arrangement (so they're enclosed by
  // full-height envelope walls) but get NO floor/ceiling — a real opening, not
  // a floored court. Only real rooms become Room objects with surfaces.
  const realRooms = rooms.filter((r) => !r.isVoid);
  const voids = rooms.filter((r) => r.isVoid);
  const arrRooms: ArrRoom[] = rooms.map((r) => ({ id: r.id, ...r.rect }));
  const segs = buildArrangement(arrRooms);
  const openIds = new Set(realRooms.filter((r) => roomOpen(r)).map((r) => r.id)); // voids excluded → full-height shaft walls
  const voidIds = new Set(voids.map((r) => r.id));
  const roomById = new Map(realRooms.map((r) => [r.id, r]));
  const furn = auto ? autoFurnitureFor(realRooms) : furniture;

  const walls: Wall[] = [];
  const segWallId = new Map<WallSeg, string>();
  let wn = 0;
  for (const s of segs) {
    const wall = segToWall(`w-${id}-${(++wn).toString().padStart(3, '0')}`, id, s);
    // parapet height only if NO indoor room touches the wall (terrace rail / open edge)
    const indoor = [s.sideA, s.sideB].some((rid) => rid && !openIds.has(rid));
    if (!indoor) wall.height = PARAPET;
    walls.push(wall);
    segWallId.set(s, wall.id);
  }

  // openings — one shared placer with correct stubs + overlap-skipping.
  const openings: Opening[] = [];
  let on = 0;
  const wallOpen = new Map<string, [number, number][]>();
  const placeOpening = (seg: WallSeg | null, kind: Opening['kind'], u: number, widthWant: number, conf: number) => {
    if (!seg) return;
    const wallId = segWallId.get(seg);
    if (!wallId) return;
    const wallLen = seg.hi - seg.lo;
    if (wallLen < 900) return;
    const STUB = 80; // mm each side (> the 50mm the validator requires)
    const width = Math.max(600, Math.min(widthWant, wallLen - 2 * STUB - 20));
    const minU = (width / 2 + STUB) / wallLen;
    const uu = Math.max(minU, Math.min(1 - minU, u));
    const half = width / 2 / wallLen;
    const [uS, uE] = [uu - half, uu + half];
    const placed = wallOpen.get(wallId) ?? [];
    if (placed.some(([s, e]) => uS < e && s < uE)) return; // would overlap another opening
    placed.push([uS, uE]);
    wallOpen.set(wallId, placed);
    openings.push({
      id: `o-${id}-${++on}`, wallId, kind, u: uu, width,
      sillHeight: kind === 'window' ? 900 : 0, headHeight: 2100,
      ...(kind === 'door' ? { swing: 'left' as const } : {}),
      source: traced(conf),
    });
  };
  const addOpening = (seg: WallSeg | null, kind: Opening['kind']) =>
    placeOpening(seg, kind, 0.5, kind === 'window' ? 1500 : 1000, 0.45);

  if (auto) {
    // Windows first, from the plan's orange markings (real position + width).
    // Prefer the exterior face so a window never lands on an interior door wall.
    for (const win of features.windows) {
      const m = matchWindowToWall(win, segs);
      if (m) placeOpening(m.seg, 'window', m.u, win.width, 0.6);
    }
    // One door per adjacent room pair, on their longest shared wall (never into a
    // CUT OUT void or across a terrace parapet); skips any window overlap.
    const longestByPair = new Map<string, WallSeg>();
    for (const s of segs) {
      if (!s.sideA || !s.sideB) continue;
      if (voidIds.has(s.sideA) || voidIds.has(s.sideB)) continue;
      const ra = roomById.get(s.sideA), rb = roomById.get(s.sideB);
      if (ra && rb && roomOpen(ra) && roomOpen(rb)) continue;
      const key = [s.sideA, s.sideB].sort().join('|');
      const prev = longestByPair.get(key);
      if (!prev || s.hi - s.lo > prev.hi - prev.lo) longestByPair.set(key, s);
    }
    for (const s of longestByPair.values()) addOpening(s, 'door');
  } else {
    for (const d of doors) {
      if ('a' in d) addOpening(wallBetween(segs, d.a, d.b), 'door');
      else addOpening(exteriorWall(segs, d.room, d.side), 'door');
    }
    for (const w of windows) addOpening(exteriorWall(segs, w.room, w.side), 'window');
  }

  // rooms (boundary + surfaces + wall refs) — voids omitted (no floor)
  const roomObjs: Room[] = realRooms.map((r) => {
    const open = roomOpen(r);
    const wallIds = segs
      .filter((s) => s.sideA === r.id || s.sideB === r.id)
      .map((s) => segWallId.get(s)!)
      .filter(Boolean);
    return {
      id: r.id,
      floorId: id,
      name: r.name,
      kind: r.kind,
      openToSky: open,
      boundary: {
        outer: [
          { x: r.rect.x0, y: r.rect.y0 },
          { x: r.rect.x1, y: r.rect.y0 },
          { x: r.rect.x1, y: r.rect.y1 },
          { x: r.rect.x0, y: r.rect.y1 },
        ],
        holes: [],
      },
      wallIds,
      floorSurface: { id: `${r.id}-floor`, parentId: r.id, kind: 'floor', materialId: r.floorMat },
      ...(open ? {} : { ceilingSurface: { id: `${r.id}-ceiling`, parentId: r.id, kind: 'ceiling' as const, materialId: 'mat-ceiling-white' } }),
      furnitureIds: furn.filter((f) => f.roomId === r.id).map((f) => f.id),
      lightIds: [`l-${r.id}`],
      styleTags: [],
      source: traced(0.6),
    };
  });

  // furniture
  const objects: FurnitureObject[] = furn.map((f) => {
    const room = rooms.find((r) => r.id === f.roomId)!;
    const c = centroid(room.rect);
    return {
      id: f.id,
      roomId: f.roomId,
      category: f.category,
      name: f.name,
      procedural: { kind: f.kind },
      transform: { x: c.x, y: c.y, elevation: 0, rotationY: f.rot },
      dimensions: { w: f.w, d: f.d, h: f.h },
      footprint: rectFootprint(f.w, f.d),
      materialIds: f.mats,
      source: traced(0.5),
    };
  });

  // structural pillars (magenta in the plan) — full-height columns at their real
  // positions. Deletable in the editor, but behind a structural-instability
  // warning (isStructuralColumn / ConfirmDialog), since extraction also picks up
  // some non-structural magenta marks.
  const roomAt = (x: number, y: number) =>
    realRooms.find((r) => x >= r.rect.x0 && x <= r.rect.x1 && y >= r.rect.y0 && y <= r.rect.y1)?.id ?? realRooms[0]?.id;
  features.pillars.forEach((p, pi) => {
    const cx = (p.x0 + p.x1) / 2, cy = (p.y0 + p.y1) / 2;
    const w = Math.max(150, Math.abs(p.x1 - p.x0)), d = Math.max(150, Math.abs(p.y1 - p.y0));
    const rid = roomAt(cx, cy);
    if (!rid) return;
    const oid = `pillar-${id}-${pi}`;
    objects.push({
      id: oid, roomId: rid, category: 'partition', name: 'Pillar (structural)',
      procedural: { kind: 'column' },
      transform: { x: cx, y: cy, elevation: 0, rotationY: 0 },
      dimensions: { w, d, h: WALL_H },
      footprint: rectFootprint(w, d),
      materialIds: ['mat-paint-white'],
      source: traced(0.7),
    });
    const rm = roomObjs.find((r) => r.id === rid);
    if (rm) rm.furnitureIds = [...rm.furnitureIds, oid];
  });

  // lights
  const lights: Light[] = realRooms.map((r) => {
    const c = centroid(r.rect);
    const open = roomOpen(r);
    return {
      id: `l-${r.id}`,
      floorId: id,
      roomId: r.id,
      kind: 'point',
      position: { x: c.x, y: c.y, elevation: open ? 3000 : 2700 },
      intensity: open ? 12 : 20,
      color: open ? '#eaf0ff' : '#ffe7c4',
      castShadow: false,
    };
  });
  lights.push({ id: `l-sun-${id}`, floorId: id, kind: 'sun', position: { x: -5000, y: -7000, elevation: 9000 }, intensity: 2.6, color: '#fff2dd', castShadow: true });

  return { id, name, level, floorHeight: FLOOR_H, rooms: roomObjs, walls, openings, objects, stairs, lights };
}

// ---------------------------------------------------------------------------
// Both floors are traced from the real plan PDFs (scripts/trace/{lower,upper}-rooms.json),
// loaded + converted to mm by loadTracedFloor() in main(); doors/windows/furniture
// are auto-generated from the wall arrangement.
// ---------------------------------------------------------------------------

const LOWER_STAIR: Stair = {
  id: 'stair-main',
  floorId: 'floor-lower',
  kind: 'L',
  position: { x: 2350, y: 8650 },
  rotation: Math.PI / 2, // ascend north, into the upper-floor passage
  width: 1200,
  totalRise: FLOOR_H,
  treadRun: 280,
  flightSplit: 6,
  turn: 'right',
  materialId: 'mat-stair-stone',
  crossFloorLink: { upperFloorId: 'floor-upper' },
  source: traced(0.5),
};

/**
 * Load the LOWER floor traced from the real plan PDF (scripts/trace/lower-rooms.json,
 * pixel rectangles in the 998x1418 underlay space). Converts px -> mm with the
 * dimension-derived scale, flips Y so north is +y, normalises the origin, and
 * marks CUT OUT voids as open-to-sky courts.
 */
const TRACE_MM_PER_PX = 16.47; // 4/6 plan dimensions agree (2743mm = 166.6px)
// Both plan sheets are the same size/scale, so a single pixel frame stacks the
// floors in one world: origin sits just outside the shared building outline.
const TRACE_ORIGIN_X = 130;
const TRACE_BOTTOM_PX = 1330;
interface TracedRoom {
  label: string;
  kind: RoomKind;
  x0: number; y0: number; x1: number; y1: number;
  openToSky?: boolean;
  isVoid?: boolean;
}
interface WinFeature { orient: 'v' | 'h'; coord: number; lo: number; hi: number; width: number; }
interface PillarFeature { x0: number; y0: number; x1: number; y1: number; }
interface PlanFeatures { windows: WinFeature[]; pillars: PillarFeature[]; }
/** Plan features extracted by colour (windows from orange, pillars from magenta). */
function loadFeatures(fileName: string): PlanFeatures {
  try {
    return JSON.parse(readFileSync(path.resolve(import.meta.dirname, 'trace', fileName), 'utf8')) as PlanFeatures;
  } catch {
    return { windows: [], pillars: [] };
  }
}
function slugId(prefix: string, label: string, used: Set<string>): string {
  const base = `${prefix}-` + label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  let id = base, n = 2;
  while (used.has(id)) id = `${base}-${n++}`;
  used.add(id);
  return id;
}
/**
 * Load a floor traced from its plan PDF (pixel rectangles in the 998x1418
 * underlay). px -> mm via the dimension-derived scale, Y flipped (north +y),
 * in the shared frame so the floors align. CUT OUT voids become open courts.
 */
function loadTracedFloor(fileName: string, prefix: string): RoomRect[] {
  const file = path.resolve(import.meta.dirname, 'trace', fileName);
  const raw = JSON.parse(readFileSync(file, 'utf8')) as TracedRoom[];
  const used = new Set<string>();
  return raw.map((rm) => {
    const X0 = (rm.x0 - TRACE_ORIGIN_X) * TRACE_MM_PER_PX;
    const X1 = (rm.x1 - TRACE_ORIGIN_X) * TRACE_MM_PER_PX;
    const Yb = (TRACE_BOTTOM_PX - rm.y1) * TRACE_MM_PER_PX; // image bottom -> south
    const Yt = (TRACE_BOTTOM_PX - rm.y0) * TRACE_MM_PER_PX;
    const open = rm.isVoid ? true : rm.openToSky;
    return {
      id: slugId(prefix, rm.label, used),
      name: rm.label,
      kind: rm.kind,
      rect: { x0: Math.round(Math.min(X0, X1)), y0: Math.round(Yb), x1: Math.round(Math.max(X0, X1)), y1: Math.round(Yt) },
      // grey marble everywhere; terraces get grey matt tiles (per current brief)
      floorMat: rm.kind === 'terrace' || rm.kind === 'balcony' ? 'mat-tile-grey-matt' : 'mat-floor-marble-grey',
      ...(open ? { openToSky: true } : {}),
      ...(rm.isVoid ? { isVoid: true } : {}),
    } satisfies RoomRect;
  });
}

async function main(): Promise<void> {
  const now = new Date().toISOString();
  const tracedLower = loadTracedFloor('lower-rooms.json', 'l');
  const tracedUpper = loadTracedFloor('upper-rooms.json', 'u');
  const lowerStairRoom = tracedLower.find((r) => /stair/i.test(r.name));
  const stair: Stair = lowerStairRoom ? { ...LOWER_STAIR, position: centroid(lowerStairRoom.rect) } : LOWER_STAIR;
  const lower = buildFloor('floor-lower', 'Lower Floor', 0, tracedLower, [], [], [], [stair], true, loadFeatures('lower-features.json'));
  const upper = buildFloor('floor-upper', 'Upper Floor', 1, tracedUpper, [], [], [], [], true, loadFeatures('upper-features.json'));

  // Attach the plan underlay + calibration so the tracing wizard opens with the
  // real plan dimmed behind the traced geometry, already pixel-aligned (the
  // calibration is the exact inverse of loadTracedFloor's px->mm mapping).
  const calibration = { mmPerPx: TRACE_MM_PER_PX, originPx: { x: TRACE_ORIGIN_X, y: TRACE_BOTTOM_PX }, rotationDeg: 0 };
  lower.calibration = calibration;
  lower.underlay = { filePath: 'processed/rasterized-pages/floor-lower-lower_floor_final_plan.png', opacity: 0.5, widthPx: 998, heightPx: 1418, page: 1 };
  upper.calibration = calibration;
  upper.underlay = { filePath: 'processed/rasterized-pages/floor-upper-upper_floor_final_plan.png', opacity: 0.5, widthPx: 998, heightPx: 1418, page: 1 };

  const scene: HomeScene = {
    schemaVersion: 1,
    id: 'my-home',
    name: 'My Penthouse (traced from plans)',
    units: 'mm',
    floors: [lower, upper],
    materials: cloneLibrary(),
    locks: [],
    referenceImages: [],
    meta: { createdAt: now, updatedAt: now, notes: 'Manually traced to match the owner-described layout. Dimensions approximate — refine in the tracing wizard.' },
  };

  const parsed = HomeSceneSchema.safeParse(scene);
  if (!parsed.success) {
    console.error('schema FAILED:\n', parsed.error.message);
    process.exit(1);
  }
  const issues = validateScene(parsed.data);
  const errors = issues.filter((i) => i.severity === 'error');
  for (const i of issues) console.log(`  [${i.severity}] ${i.entityId ?? ''} ${i.message}`);
  if (errors.length) {
    console.error(`\n${errors.length} validation error(s) — not writing.`);
    process.exit(1);
  }

  const out = path.resolve(import.meta.dirname, '..', 'private-home-inputs', 'processed', 'scene-json', 'my-home.scene.json');
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(parsed.data, null, 2));
  console.log(`\nWrote ${out}`);
  for (const f of scene.floors) console.log(`  ${f.name}: ${f.rooms.length} rooms, ${f.walls.length} walls, ${f.openings.length} openings`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
