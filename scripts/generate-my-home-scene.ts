/**
 * Generate a "my home" scene from a MANUAL TRACE of Parth's penthouse plans
 * (private-home-inputs/raw/{lower,upper} floor final plan.pdf).
 *
 * This is the Phase-1 manual/traced path (the automatic extractor is Phase 3).
 * Geometry is digitized by eye from the plans on a consistent grid — room
 * topology, names and adjacencies are faithful; exact dimensions are
 * approximate, so every entity is marked source.kind = 'traced' with modest
 * confidence. Parth refines real dimensions in the tracing wizard (Phase 2).
 *
 * Output: private-home-inputs/processed/scene-json/my-home.scene.json
 *
 *   npx tsx scripts/generate-my-home-scene.ts
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { MATERIAL_LIBRARY } from '../lib/styles/material-library';
import { HomeSceneSchema, type Floor, type HomeScene, type Light, type Opening, type Room, type RoomKind, type Stair, type Wall } from '../lib/scene/schemas';
import { validateScene } from '../lib/scene/validation';
import { DEFAULT_EXTERNAL_WALL_MM, DEFAULT_PARTITION_WALL_MM, DEFAULT_PARAPET_HEIGHT_MM } from '../lib/geometry/constants';

const FLOOR_H = 3300;
const WALL_H = 3000;
const PARAPET = DEFAULT_PARAPET_HEIGHT_MM;
const EXT = DEFAULT_EXTERNAL_WALL_MM;
const INT = DEFAULT_PARTITION_WALL_MM;

// shared grid (mm), digitized from the plans. origin SW, +x east, +y north.
const XS = [0, 3600, 5400, 7400, 8400, 12000];
const YS = [0, 3000, 6000, 8600, 11200, 14000, 17000];
const BBOX = { x0: XS[0]!, y0: YS[0]!, x1: XS[XS.length - 1]!, y1: YS[YS.length - 1]! };

const traced = (confidence: number) => ({ kind: 'traced' as const, confidence });

interface RoomSpec {
  id: string;
  name: string;
  kind: RoomKind;
  cell: [number, number, number, number]; // xi0, yi0, xi1, yi1 (grid indices)
  floorMat: string;
}
type VoidSpec = [number, number, number, number]; // grid indices

const FLOOR_MAT: Partial<Record<RoomKind, string>> = {
  living: 'mat-floor-marble-ivory',
  dining: 'mat-floor-marble-ivory',
  foyer: 'mat-floor-marble-ivory',
  masterBedroom: 'mat-floor-walnut',
  bedroom: 'mat-floor-oak',
  study: 'mat-floor-oak',
  store: 'mat-floor-oak',
  kitchen: 'mat-tile-grey',
  bathroom: 'mat-tile-grey',
  washArea: 'mat-tile-grey',
  terrace: 'mat-floor-terracotta',
};

const rect = (c: [number, number, number, number]) => ({
  x0: XS[c[0]]!,
  y0: YS[c[1]]!,
  x1: XS[c[2]]!,
  y1: YS[c[3]]!,
});

const isOpenKind = (k: RoomKind) => k === 'terrace' || k === 'balcony';

// --- wall network derived from room + void edges (deduped) -----------------

interface EdgeAgg {
  a: { x: number; y: number };
  b: { x: number; y: number };
  indoor: boolean; // any non-open room shares this edge -> full-height building wall
  onBbox: boolean;
  rooms: string[];
}

function edgeKey(ax: number, ay: number, bx: number, by: number): string {
  const [p, q] = ax < bx || (ax === bx && ay <= by) ? [[ax, ay], [bx, by]] : [[bx, by], [ax, ay]];
  return `${p[0]},${p[1]}|${q[0]},${q[1]}`;
}

function onBbox(ax: number, ay: number, bx: number, by: number): boolean {
  if (ax === bx && (ax === BBOX.x0 || ax === BBOX.x1)) return true;
  if (ay === by && (ay === BBOX.y0 || ay === BBOX.y1)) return true;
  return false;
}

function buildFloor(
  id: string,
  name: string,
  level: number,
  rooms: RoomSpec[],
  voids: VoidSpec[],
  stairs: Stair[],
): Floor {
  const edges = new Map<string, EdgeAgg>();
  const addEdge = (ax: number, ay: number, bx: number, by: number, roomId: string | null, indoor: boolean) => {
    const key = edgeKey(ax, ay, bx, by);
    let agg = edges.get(key);
    if (!agg) {
      agg = { a: { x: ax, y: ay }, b: { x: bx, y: by }, indoor: false, onBbox: onBbox(ax, ay, bx, by), rooms: [] };
      edges.set(key, agg);
    }
    if (indoor) agg.indoor = true;
    if (roomId) agg.rooms.push(roomId);
  };
  const rectEdges = (r: { x0: number; y0: number; x1: number; y1: number }, roomId: string | null, indoor: boolean) => {
    addEdge(r.x0, r.y0, r.x1, r.y0, roomId, indoor); // south
    addEdge(r.x1, r.y0, r.x1, r.y1, roomId, indoor); // east
    addEdge(r.x1, r.y1, r.x0, r.y1, roomId, indoor); // north
    addEdge(r.x0, r.y1, r.x0, r.y0, roomId, indoor); // west
  };

  for (const spec of rooms) rectEdges(rect(spec.cell), spec.id, !isOpenKind(spec.kind));
  for (const v of voids) rectEdges(rect(v), null, false);

  // emit walls
  const walls: Wall[] = [];
  const wallIdByKey = new Map<string, string>();
  let n = 0;
  for (const [key, agg] of edges) {
    const len = Math.hypot(agg.b.x - agg.a.x, agg.b.y - agg.a.y);
    if (len < 100) continue;
    const wallId = `w-${id}-${(++n).toString().padStart(3, '0')}`;
    wallIdByKey.set(key, wallId);
    walls.push({
      id: wallId,
      floorId: id,
      path: { pts: [agg.a, agg.b], bulges: [0] },
      thickness: agg.onBbox ? EXT : INT,
      height: agg.indoor ? WALL_H : PARAPET,
      materialIds: { sideA: 'mat-paint-white', sideB: 'mat-paint-white' },
      source: traced(0.55),
    });
  }

  // openings: windows on long exterior building walls, doors on long partitions
  const openings: Opening[] = [];
  let oN = 0;
  for (const [key, agg] of edges) {
    const wallId = wallIdByKey.get(key);
    if (!wallId) continue;
    if (!agg.indoor) continue; // no openings in parapets/railings
    const len = Math.hypot(agg.b.x - agg.a.x, agg.b.y - agg.a.y);
    if (agg.onBbox) {
      if (len < 2000) continue;
      const width = Math.min(1800, Math.max(900, Math.round(len * 0.4)));
      openings.push({ id: `o-${id}-${++oN}`, wallId, kind: 'window', u: 0.5, width, sillHeight: 900, headHeight: 2100, source: traced(0.4) });
    } else {
      if (len < 1600) continue;
      openings.push({ id: `o-${id}-${++oN}`, wallId, kind: 'door', u: 0.5, width: 900, sillHeight: 0, headHeight: 2100, swing: 'left', source: traced(0.4) });
    }
  }

  // rooms with surfaces + wall refs
  const roomObjs: Room[] = rooms.map((spec) => {
    const r = rect(spec.cell);
    const open = isOpenKind(spec.kind);
    const keys = [
      edgeKey(r.x0, r.y0, r.x1, r.y0),
      edgeKey(r.x1, r.y0, r.x1, r.y1),
      edgeKey(r.x1, r.y1, r.x0, r.y1),
      edgeKey(r.x0, r.y1, r.x0, r.y0),
    ];
    const wallIds = keys.map((k) => wallIdByKey.get(k)).filter((w): w is string => Boolean(w));
    const room: Room = {
      id: spec.id,
      floorId: id,
      name: spec.name,
      kind: spec.kind,
      openToSky: open,
      boundary: {
        outer: [
          { x: r.x0, y: r.y0 },
          { x: r.x1, y: r.y0 },
          { x: r.x1, y: r.y1 },
          { x: r.x0, y: r.y1 },
        ],
        holes: [],
      },
      wallIds,
      floorSurface: { id: `${spec.id}-floor`, parentId: spec.id, kind: 'floor', materialId: spec.floorMat },
      ...(open
        ? {}
        : { ceilingSurface: { id: `${spec.id}-ceiling`, parentId: spec.id, kind: 'ceiling' as const, materialId: 'mat-ceiling-white' } }),
      furnitureIds: [],
      lightIds: [`l-${spec.id}`],
      styleTags: [],
      source: traced(0.6),
    };
    return room;
  });

  // one warm light per room (cooler/brighter over terraces)
  const lights: Light[] = rooms.map((spec) => {
    const r = rect(spec.cell);
    const open = isOpenKind(spec.kind);
    return {
      id: `l-${spec.id}`,
      floorId: id,
      roomId: spec.id,
      kind: 'point',
      position: { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2, elevation: open ? 3000 : 2700 },
      intensity: open ? 12 : 20,
      color: open ? '#eaf0ff' : '#ffe7c4',
      castShadow: false,
    };
  });
  lights.push({
    id: `l-sun-${id}`,
    floorId: id,
    kind: 'sun',
    position: { x: -5000, y: -7000, elevation: 9000 },
    intensity: 2.6,
    color: '#fff2dd',
    castShadow: true,
  });

  return { id, name, level, floorHeight: FLOOR_H, rooms: roomObjs, walls, openings, objects: [], stairs, lights };
}

// --- floor specs (digitized from the plans) --------------------------------

const LOWER_ROOMS: RoomSpec[] = [
  { id: 'l-terrace', name: 'Terrace', kind: 'terrace', cell: [0, 0, 2, 1], floorMat: FLOOR_MAT.terrace! },
  { id: 'l-waiting', name: 'Waiting', kind: 'foyer', cell: [2, 0, 3, 1], floorMat: FLOOR_MAT.foyer! },
  { id: 'l-foyer', name: 'Personal Foyer', kind: 'foyer', cell: [4, 0, 5, 1], floorMat: FLOOR_MAT.foyer! },
  { id: 'l-drawing', name: 'Drawing Room', kind: 'living', cell: [0, 1, 3, 2], floorMat: FLOOR_MAT.living! },
  { id: 'l-kitchen', name: 'Kitchen', kind: 'kitchen', cell: [0, 2, 1, 3], floorMat: FLOOR_MAT.kitchen! },
  { id: 'l-dining', name: 'Dining / Store', kind: 'dining', cell: [1, 2, 3, 3], floorMat: FLOOR_MAT.dining! },
  { id: 'l-wash', name: 'Wash', kind: 'washArea', cell: [0, 3, 1, 4], floorMat: FLOOR_MAT.washArea! },
  { id: 'l-toilet2', name: 'Toilet', kind: 'bathroom', cell: [2, 3, 3, 4], floorMat: FLOOR_MAT.bathroom! },
  { id: 'l-guest', name: 'Guest Room', kind: 'bedroom', cell: [0, 4, 1, 6], floorMat: FLOOR_MAT.bedroom! },
  { id: 'l-store', name: 'Store', kind: 'store', cell: [1, 4, 2, 5], floorMat: FLOOR_MAT.store! },
  { id: 'l-guesttoilet', name: 'Guest Toilet', kind: 'bathroom', cell: [1, 5, 2, 6], floorMat: FLOOR_MAT.bathroom! },
  { id: 'l-daughter', name: 'Daughter Room', kind: 'bedroom', cell: [2, 4, 3, 6], floorMat: FLOOR_MAT.bedroom! },
  { id: 'l-bedroom', name: 'Bedroom', kind: 'bedroom', cell: [3, 4, 5, 6], floorMat: FLOOR_MAT.bedroom! },
];
const LOWER_VOIDS: VoidSpec[] = [[4, 1, 5, 4]];

const UPPER_ROOMS: RoomSpec[] = [
  { id: 'u-terrace1', name: 'Terrace 1', kind: 'terrace', cell: [0, 0, 3, 2], floorMat: 'mat-floor-kota' },
  { id: 'u-lounge', name: 'Lounge', kind: 'living', cell: [0, 2, 2, 3], floorMat: FLOOR_MAT.living! },
  { id: 'u-bedoffice', name: 'Bedroom 1 / Office', kind: 'study', cell: [2, 2, 4, 3], floorMat: FLOOR_MAT.study! },
  { id: 'u-toilet', name: 'Toilet', kind: 'bathroom', cell: [2, 3, 3, 4], floorMat: FLOOR_MAT.bathroom! },
  { id: 'u-master', name: 'Master Room', kind: 'masterBedroom', cell: [2, 4, 4, 6], floorMat: FLOOR_MAT.masterBedroom! },
  { id: 'u-bedroom', name: 'Bedroom', kind: 'bedroom', cell: [4, 4, 5, 6], floorMat: FLOOR_MAT.bedroom! },
  { id: 'u-terrace2', name: 'Terrace 2', kind: 'terrace', cell: [0, 4, 2, 6], floorMat: 'mat-floor-terracotta' },
];
const UPPER_VOIDS: VoidSpec[] = [[4, 0, 5, 4]];

const LOWER_STAIR: Stair = {
  id: 'stair-main',
  floorId: 'floor-lower',
  kind: 'L',
  position: { x: XS[1]! + 200, y: YS[3]! + 200 },
  rotation: Math.PI / 2, // ascend north
  width: 1500,
  totalRise: FLOOR_H,
  treadRun: 280,
  flightSplit: 6,
  turn: 'right',
  materialId: 'mat-stair-stone',
  crossFloorLink: { upperFloorId: 'floor-upper' },
  source: traced(0.5),
};

async function main(): Promise<void> {
  const now = new Date().toISOString();
  const lower = buildFloor('floor-lower', 'Lower Floor', 0, LOWER_ROOMS, LOWER_VOIDS, [LOWER_STAIR]);
  const upper = buildFloor('floor-upper', 'Upper Floor', 1, UPPER_ROOMS, UPPER_VOIDS, []);

  const scene: HomeScene = {
    schemaVersion: 1,
    id: 'my-home',
    name: 'My Penthouse (traced from plans)',
    units: 'mm',
    floors: [lower, upper],
    materials: [...MATERIAL_LIBRARY],
    locks: [],
    referenceImages: [],
    meta: {
      createdAt: now,
      updatedAt: now,
      notes: 'Manually traced from lower/upper floor final plans. Dimensions approximate — confirm in the tracing wizard (Phase 2).',
    },
  };

  const parsed = HomeSceneSchema.safeParse(scene);
  if (!parsed.success) {
    console.error('schema validation FAILED:\n', parsed.error.message);
    process.exit(1);
  }
  const issues = validateScene(parsed.data);
  const errors = issues.filter((i) => i.severity === 'error');
  for (const i of issues) console.log(`  [${i.severity}] ${i.entityId ?? ''} ${i.message}`);
  if (errors.length > 0) {
    console.error(`\n${errors.length} validation error(s) — not writing.`);
    process.exit(1);
  }

  const out = path.resolve(import.meta.dirname, '..', 'private-home-inputs', 'processed', 'scene-json', 'my-home.scene.json');
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(parsed.data, null, 2));

  const counts = scene.floors.map((f) => `${f.name}: ${f.rooms.length} rooms, ${f.walls.length} walls, ${f.openings.length} openings`);
  console.log(`\nWrote ${out}`);
  for (const c of counts) console.log('  ' + c);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
