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
import path from 'node:path';
import { MATERIAL_LIBRARY } from '../lib/styles/material-library';
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

const FLOOR_MAT: Record<string, string> = {
  living: 'mat-floor-marble-ivory',
  dining: 'mat-floor-marble-ivory',
  foyer: 'mat-floor-marble-ivory',
  masterBedroom: 'mat-floor-walnut',
  bedroom: 'mat-floor-oak',
  study: 'mat-floor-oak',
  store: 'mat-floor-oak',
  passage: 'mat-floor-marble-ivory',
  kitchen: 'mat-tile-grey',
  bathroom: 'mat-tile-grey',
  washArea: 'mat-tile-grey',
  terrace: 'mat-floor-terracotta',
};

function buildFloor(
  id: string,
  name: string,
  level: number,
  rooms: RoomRect[],
  doors: DoorSpec[],
  windows: WinSpec[],
  furniture: FurnSpec[],
  stairs: Stair[],
): Floor {
  const arrRooms: ArrRoom[] = rooms.map((r) => ({ id: r.id, ...r.rect }));
  const segs = buildArrangement(arrRooms);
  const openIds = new Set(rooms.filter((r) => isOpen(r.kind)).map((r) => r.id));

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

  // openings
  const openings: Opening[] = [];
  let on = 0;
  const addOpening = (seg: WallSeg | null, kind: Opening['kind']) => {
    if (!seg) return;
    const wallId = segWallId.get(seg);
    if (!wallId) return;
    const isWin = kind === 'window';
    const wallLen = seg.hi - seg.lo;
    const want = isWin ? 1500 : 1000;
    const width = Math.min(want, wallLen - 220); // keep >=110mm stubs each side
    if (width < 600) return; // wall too short for a sensible opening
    openings.push({
      id: `o-${id}-${++on}`,
      wallId,
      kind,
      u: 0.5,
      width,
      sillHeight: isWin ? 900 : 0,
      headHeight: 2100,
      ...(kind === 'door' ? { swing: 'left' as const } : {}),
      source: traced(0.45),
    });
  };
  for (const d of doors) {
    if ('a' in d) addOpening(wallBetween(segs, d.a, d.b), 'door');
    else addOpening(exteriorWall(segs, d.room, d.side), 'door');
  }
  for (const w of windows) addOpening(exteriorWall(segs, w.room, w.side), 'window');

  // rooms (boundary + surfaces + wall refs)
  const roomObjs: Room[] = rooms.map((r) => {
    const open = isOpen(r.kind);
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
      furnitureIds: furniture.filter((f) => f.roomId === r.id).map((f) => f.id),
      lightIds: [`l-${r.id}`],
      styleTags: [],
      source: traced(0.6),
    };
  });

  // furniture
  const objects: FurnitureObject[] = furniture.map((f) => {
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

  // lights
  const lights: Light[] = rooms.map((r) => {
    const c = centroid(r.rect);
    const open = isOpen(r.kind);
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
// LOWER FLOOR — authored in visiting order (entry at south, y=0)
// ---------------------------------------------------------------------------

const r = (x0: number, y0: number, x1: number, y1: number) => ({ x0, y0, x1, y1 });
const room = (id: string, name: string, kind: RoomKind, rect: RoomRect['rect'], mat?: string): RoomRect => ({
  id,
  name,
  kind,
  rect,
  floorMat: mat ?? FLOOR_MAT[kind] ?? 'mat-floor-oak',
});

const LOWER: RoomRect[] = [
  room('l-entrance', 'Entrance', 'foyer', r(4000, 0, 7000, 3000)),
  room('l-terrace', 'Terrace / Balcony', 'terrace', r(0, 0, 4000, 4200)),
  room('l-living', 'Living Area', 'living', r(7000, 0, 11000, 6000)),
  room('l-kitchen', 'Kitchen', 'kitchen', r(0, 4200, 4000, 8200)),
  room('l-passage', 'Passage', 'passage', r(4000, 3000, 7000, 15000)),
  room('l-stairs', 'Staircase', 'passage', r(7000, 6000, 9500, 9500)),
  room('l-store', 'Store Room', 'store', r(9500, 6000, 11000, 9500)),
  room('l-bed1', 'Bedroom 1', 'bedroom', r(0, 13000, 4000, 17000)),
  room('l-bath1', 'Bathroom 1', 'bathroom', r(4000, 15000, 5500, 17000)),
  room('l-bed2', 'Bedroom 2', 'bedroom', r(7000, 13000, 11000, 17000)),
  room('l-bath2', 'Bathroom 2', 'bathroom', r(5500, 15000, 7000, 17000)),
];

const LOWER_DOORS: DoorSpec[] = [
  { room: 'l-entrance', side: 's' }, // main entry gate
  { a: 'l-entrance', b: 'l-terrace' },
  { a: 'l-entrance', b: 'l-living' },
  { a: 'l-entrance', b: 'l-passage' },
  { a: 'l-passage', b: 'l-kitchen' },
  { a: 'l-passage', b: 'l-living' },
  { a: 'l-passage', b: 'l-stairs' },
  { a: 'l-stairs', b: 'l-store' },
  { a: 'l-passage', b: 'l-bed1' },
  { a: 'l-passage', b: 'l-bed2' },
  { a: 'l-bed1', b: 'l-bath1' },
  { a: 'l-bed2', b: 'l-bath2' },
];

const LOWER_WINDOWS: WinSpec[] = [
  { room: 'l-living', side: 's' },
  { room: 'l-living', side: 'e' },
  { room: 'l-kitchen', side: 'w' },
  { room: 'l-bed1', side: 'w' },
  { room: 'l-bed1', side: 'n' },
  { room: 'l-bed2', side: 'e' },
  { room: 'l-bed2', side: 'n' },
];

const LOWER_FURN: FurnSpec[] = [
  { id: 'l-f-sofa', roomId: 'l-living', category: 'sofa', name: 'Sofa', kind: 'sofa', w: 2300, d: 950, h: 850, rot: 0, mats: ['mat-fabric-linen', 'mat-wood-teak'] },
  { id: 'l-f-coffee', roomId: 'l-living', category: 'coffeeTable', name: 'Coffee Table', kind: 'table', w: 1100, d: 600, h: 430, rot: 0, mats: ['mat-wood-teak'] },
  { id: 'l-f-counter', roomId: 'l-kitchen', category: 'kitchenUnit', name: 'Kitchen Counter', kind: 'counter', w: 3000, d: 600, h: 900, rot: 0, mats: ['mat-counter-granite', 'mat-wood-teak'] },
  { id: 'l-f-bed1', roomId: 'l-bed1', category: 'bed', name: 'Queen Bed', kind: 'bed', w: 1600, d: 2050, h: 550, rot: 0, mats: ['mat-fabric-linen', 'mat-wood-teak'] },
  { id: 'l-f-bed2', roomId: 'l-bed2', category: 'bed', name: 'Queen Bed', kind: 'bed', w: 1600, d: 2050, h: 550, rot: 0, mats: ['mat-fabric-rust', 'mat-wood-teak'] },
  { id: 'l-f-plant', roomId: 'l-terrace', category: 'plant', name: 'Planter', kind: 'plant', w: 600, d: 600, h: 1400, rot: 0, mats: ['mat-paint-terracotta'] },
];

const LOWER_STAIR: Stair = {
  id: 'stair-main',
  floorId: 'floor-lower',
  kind: 'L',
  position: { x: 7300, y: 6300 },
  rotation: Math.PI / 2,
  width: 1200,
  totalRise: FLOOR_H,
  treadRun: 280,
  flightSplit: 6,
  turn: 'right',
  materialId: 'mat-stair-stone',
  crossFloorLink: { upperFloorId: 'floor-upper' },
  source: traced(0.5),
};

// ---------------------------------------------------------------------------
// UPPER FLOOR — cleaner approximation (refine in wizard)
// ---------------------------------------------------------------------------

const UPPER: RoomRect[] = [
  room('u-stairs', 'Staircase', 'passage', r(7000, 6000, 9500, 9500)),
  room('u-passage', 'Passage', 'passage', r(4500, 5500, 7000, 15000)),
  room('u-lounge', 'Lounge', 'living', r(0, 5500, 4500, 11000)),
  room('u-office', 'Bedroom / Office', 'study', r(4500, 0, 8000, 5500)),
  room('u-terrace1', 'Terrace 1', 'terrace', r(0, 0, 4500, 5500), 'mat-floor-kota'),
  room('u-terrace2', 'Terrace 2', 'terrace', r(8000, 0, 11000, 5500)),
  room('u-master', 'Master Bedroom', 'masterBedroom', r(7000, 9500, 11000, 15000)),
  room('u-masterbath', 'Master Bath', 'bathroom', r(9000, 15000, 11000, 17000)),
  room('u-bed', 'Bedroom', 'bedroom', r(0, 11000, 4500, 17000)),
];

const UPPER_DOORS: DoorSpec[] = [
  { a: 'u-stairs', b: 'u-passage' },
  { a: 'u-passage', b: 'u-lounge' },
  { a: 'u-passage', b: 'u-office' },
  { a: 'u-lounge', b: 'u-terrace1' },
  { a: 'u-office', b: 'u-terrace2' },
  { a: 'u-passage', b: 'u-master' },
  { a: 'u-master', b: 'u-masterbath' },
  { a: 'u-passage', b: 'u-bed' },
];

const UPPER_WINDOWS: WinSpec[] = [
  { room: 'u-master', side: 'e' },
  { room: 'u-master', side: 'n' },
  { room: 'u-bed', side: 'w' },
  { room: 'u-bed', side: 'n' },
  { room: 'u-office', side: 'n' },
  { room: 'u-lounge', side: 'w' },
];

const UPPER_FURN: FurnSpec[] = [
  { id: 'u-f-lsofa', roomId: 'u-lounge', category: 'sofa', name: 'Lounge Sofa', kind: 'sofa', w: 2300, d: 950, h: 850, rot: 0, mats: ['mat-fabric-linen', 'mat-wood-teak'] },
  { id: 'u-f-mbed', roomId: 'u-master', category: 'bed', name: 'King Bed', kind: 'bed', w: 1900, d: 2150, h: 550, rot: 0, mats: ['mat-fabric-emerald', 'mat-wood-teak'] },
  { id: 'u-f-bed', roomId: 'u-bed', category: 'bed', name: 'Queen Bed', kind: 'bed', w: 1600, d: 2050, h: 550, rot: 0, mats: ['mat-fabric-linen', 'mat-wood-teak'] },
  { id: 'u-f-desk', roomId: 'u-office', category: 'console', name: 'Desk', kind: 'table', w: 1600, d: 700, h: 750, rot: 0, mats: ['mat-wood-teak'] },
];

async function main(): Promise<void> {
  const now = new Date().toISOString();
  const lower = buildFloor('floor-lower', 'Lower Floor', 0, LOWER, LOWER_DOORS, LOWER_WINDOWS, LOWER_FURN, [LOWER_STAIR]);
  const upper = buildFloor('floor-upper', 'Upper Floor', 1, UPPER, UPPER_DOORS, UPPER_WINDOWS, UPPER_FURN, []);

  const scene: HomeScene = {
    schemaVersion: 1,
    id: 'my-home',
    name: 'My Penthouse (traced from plans)',
    units: 'mm',
    floors: [lower, upper],
    materials: [...MATERIAL_LIBRARY],
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
