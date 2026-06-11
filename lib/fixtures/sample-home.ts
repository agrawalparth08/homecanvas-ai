import {
  DEFAULT_EXTERNAL_WALL_MM,
  DEFAULT_PARAPET_HEIGHT_MM,
  DEFAULT_PARTITION_WALL_MM,
  DEFAULT_WALL_HEIGHT_MM,
} from '../geometry/constants';
import { cloneLibrary } from '../styles/material-library';
import {
  SCHEMA_VERSION,
  sourceSample,
  type FurnitureObject,
  type HomeScene,
  type Opening,
  type Room,
  type RoomKind,
  type Vec2,
  type Wall,
} from '../scene/schemas';

/**
 * Anonymized demo home: a 10.8m × 8.4m two-level penthouse with a terrace,
 * an L feature stair in the living room, and a terrace den. Committed so the
 * repo demos without any private data; Parth's real home (private-home-inputs/)
 * is the primary fixture from Phase 2 on.
 */

const EXT = DEFAULT_EXTERNAL_WALL_MM;
const INT = DEFAULT_PARTITION_WALL_MM;
const H = DEFAULT_WALL_HEIGHT_MM;
const PARAPET = DEFAULT_PARAPET_HEIGHT_MM;

const GROUND = 'floor-ground';
const TERRACE = 'floor-terrace';

const wall = (
  id: string,
  floorId: string,
  a: Vec2,
  b: Vec2,
  thickness: number,
  height = H,
  materials: { sideA: string; sideB: string } = { sideA: 'mat-paint-white', sideB: 'mat-paint-white' },
): Wall => ({
  id,
  floorId,
  path: { pts: [a, b], bulges: [0] },
  thickness,
  height,
  materialIds: materials,
  source: sourceSample(),
});

const opening = (
  id: string,
  wallId: string,
  kind: Opening['kind'],
  u: number,
  width: number,
  opts: Partial<Pick<Opening, 'sillHeight' | 'headHeight' | 'swing'>> = {},
): Opening => ({
  id,
  wallId,
  kind,
  u,
  width,
  sillHeight: opts.sillHeight ?? (kind === 'window' ? 900 : 0),
  headHeight: opts.headHeight ?? 2100,
  ...(opts.swing !== undefined ? { swing: opts.swing } : {}),
  source: sourceSample(),
});

const rect = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

const room = (
  id: string,
  floorId: string,
  name: string,
  kind: RoomKind,
  outer: Vec2[],
  wallIds: string[],
  opts: {
    holes?: Vec2[][];
    openToSky?: boolean;
    floorMaterial?: string;
    furnitureIds?: string[];
    lightIds?: string[];
  } = {},
): Room => {
  const openToSky = opts.openToSky ?? false;
  return {
    id,
    floorId,
    name,
    kind,
    openToSky,
    boundary: { outer, holes: opts.holes ?? [] },
    wallIds,
    floorSurface: {
      id: `${id}-floor`,
      parentId: id,
      kind: 'floor',
      materialId: opts.floorMaterial ?? 'mat-floor-oak',
    },
    ...(openToSky
      ? {}
      : {
          ceilingSurface: {
            id: `${id}-ceiling`,
            parentId: id,
            kind: 'ceiling' as const,
            materialId: 'mat-ceiling-white',
          },
        }),
    furnitureIds: opts.furnitureIds ?? [],
    lightIds: opts.lightIds ?? [],
    styleTags: [],
    source: sourceSample(),
  };
};

const rectFootprint = (w: number, d: number): Vec2[] => [
  { x: -w / 2, y: -d / 2 },
  { x: w / 2, y: -d / 2 },
  { x: w / 2, y: d / 2 },
  { x: -w / 2, y: d / 2 },
];

const furn = (
  id: string,
  roomId: string,
  category: FurnitureObject['category'],
  name: string,
  proceduralKind: string,
  x: number,
  y: number,
  rotationY: number,
  w: number,
  d: number,
  h: number,
  materialIds: string[],
): FurnitureObject => ({
  id,
  roomId,
  category,
  name,
  procedural: { kind: proceduralKind },
  transform: { x, y, elevation: 0, rotationY },
  dimensions: { w, d, h },
  footprint: rectFootprint(w, d),
  materialIds,
  source: sourceSample(),
});

export function buildSampleHome(): HomeScene {
  const now = '2026-06-10T00:00:00.000Z';

  // ---- ground floor architecture -----------------------------------------
  const groundWalls: Wall[] = [
    wall('w-ext-s', GROUND, { x: 0, y: 0 }, { x: 10800, y: 0 }, EXT),
    wall('w-ext-e', GROUND, { x: 10800, y: 0 }, { x: 10800, y: 8400 }, EXT),
    wall('w-ext-n', GROUND, { x: 10800, y: 8400 }, { x: 0, y: 8400 }, EXT),
    wall('w-ext-w', GROUND, { x: 0, y: 8400 }, { x: 0, y: 0 }, EXT),
    wall('w-int-spine', GROUND, { x: 4500, y: 0 }, { x: 4500, y: 8400 }, INT),
    wall('w-int-living-n', GROUND, { x: 0, y: 4800 }, { x: 4500, y: 4800 }, INT),
    wall('w-int-east-n', GROUND, { x: 4500, y: 4800 }, { x: 10800, y: 4800 }, INT),
    wall('w-int-kitchen', GROUND, { x: 7200, y: 0 }, { x: 7200, y: 4800 }, INT),
    wall('w-int-bed2', GROUND, { x: 7800, y: 4800 }, { x: 7800, y: 8400 }, INT),
    wall('w-int-bath', GROUND, { x: 7800, y: 6600 }, { x: 10800, y: 6600 }, INT),
  ];

  const groundOpenings: Opening[] = [
    opening('o-main-door', 'w-ext-s', 'door', 2000 / 10800, 1100, { swing: 'left' }),
    opening('o-dining-window', 'w-ext-s', 'window', 5850 / 10800, 1500),
    opening('o-kitchen-window', 'w-ext-e', 'window', 1800 / 8400, 1500),
    opening('o-bath-window', 'w-ext-e', 'window', 5700 / 8400, 750, { sillHeight: 1400, headHeight: 2100 }),
    opening('o-master-window-n', 'w-ext-n', 'window', (10800 - 2250) / 10800, 1800),
    opening('o-bed2-window-n', 'w-ext-n', 'window', (10800 - 6100) / 10800, 1500),
    opening('o-living-window', 'w-ext-w', 'window', (8400 - 2400) / 8400, 1800),
    opening('o-master-window-w', 'w-ext-w', 'window', (8400 - 6600) / 8400, 1500),
    opening('o-living-dining', 'w-int-spine', 'opening', 2400 / 8400, 1500, { headHeight: 2400 }),
    opening('o-passage', 'w-int-spine', 'opening', 6600 / 8400, 1200, { headHeight: 2400 }),
    opening('o-master-door', 'w-int-living-n', 'door', 3600 / 4500, 900, { swing: 'right' }),
    opening('o-bed2-door', 'w-int-east-n', 'door', (6000 - 4500) / 6300, 900, { swing: 'left' }),
    opening('o-kitchen-pass', 'w-int-kitchen', 'opening', 0.5, 1200, { headHeight: 2400 }),
    opening('o-bath-door', 'w-int-bed2', 'door', (5700 - 4800) / 3600, 750, { swing: 'right' }),
    opening('o-stairhall-door', 'w-int-bed2', 'door', (7500 - 4800) / 3600, 900, { swing: 'left' }),
  ];

  const groundRooms: Room[] = [
    room('room-living', GROUND, 'Living Room', 'living', rect(0, 0, 4500, 4800), ['w-ext-s', 'w-ext-w', 'w-int-spine', 'w-int-living-n'], {
      floorMaterial: 'mat-floor-oak',
      furnitureIds: ['f-sofa', 'f-coffee', 'f-rug', 'f-tv', 'f-plant'],
      lightIds: ['l-living'],
    }),
    room('room-master', GROUND, 'Master Bedroom', 'masterBedroom', rect(0, 4800, 4500, 8400), ['w-ext-w', 'w-ext-n', 'w-int-spine', 'w-int-living-n'], {
      floorMaterial: 'mat-floor-oak',
      furnitureIds: ['f-bed-master', 'f-wardrobe-master'],
      lightIds: ['l-master'],
    }),
    room('room-dining', GROUND, 'Dining', 'dining', rect(4500, 0, 7200, 4800), ['w-ext-s', 'w-int-spine', 'w-int-kitchen', 'w-int-east-n'], {
      floorMaterial: 'mat-floor-marble-ivory',
      furnitureIds: ['f-dining'],
      lightIds: ['l-dining'],
    }),
    room('room-kitchen', GROUND, 'Kitchen', 'kitchen', rect(7200, 0, 10800, 4800), ['w-ext-s', 'w-ext-e', 'w-int-kitchen', 'w-int-east-n'], {
      floorMaterial: 'mat-tile-grey',
      furnitureIds: ['f-counter'],
      lightIds: ['l-kitchen'],
    }),
    room('room-bed2', GROUND, 'Bedroom 2', 'bedroom', rect(4500, 4800, 7800, 8400), ['w-int-east-n', 'w-int-spine', 'w-int-bed2', 'w-ext-n'], {
      floorMaterial: 'mat-floor-oak',
      furnitureIds: ['f-bed2', 'f-wardrobe2'],
      lightIds: ['l-bed2'],
    }),
    room('room-bath', GROUND, 'Bathroom', 'bathroom', rect(7800, 4800, 10800, 6600), ['w-int-bed2', 'w-int-east-n', 'w-ext-e', 'w-int-bath'], {
      floorMaterial: 'mat-tile-grey',
    }),
    room('room-stairhall', GROUND, 'Stair Hall', 'foyer', rect(7800, 6600, 10800, 8400), ['w-int-bed2', 'w-int-bath', 'w-ext-e', 'w-ext-n'], {
      floorMaterial: 'mat-floor-marble-ivory',
    }),
  ];

  const groundFurniture: FurnitureObject[] = [
    furn('f-sofa', 'room-living', 'sofa', '3-Seater Sofa', 'sofa', 2200, 1100, 0, 2300, 950, 850, ['mat-fabric-linen', 'mat-wood-teak']),
    furn('f-coffee', 'room-living', 'coffeeTable', 'Coffee Table', 'table', 2200, 2300, 0, 1100, 600, 430, ['mat-wood-teak']),
    furn('f-rug', 'room-living', 'rug', 'Living Rug', 'rug', 2200, 2300, 0, 2600, 1800, 20, ['mat-rug-wool']),
    furn('f-tv', 'room-living', 'tvUnit', 'TV Unit', 'tvUnit', 2200, 4450, Math.PI, 1900, 450, 500, ['mat-wood-teak']),
    furn('f-plant', 'room-living', 'plant', 'Areca Palm', 'plant', 4100, 400, 0, 450, 450, 1500, ['mat-cane-natural']),
    furn('f-bed-master', 'room-master', 'bed', 'King Bed', 'bed', 2250, 6700, 0, 1900, 2150, 550, ['mat-fabric-linen', 'mat-wood-teak']),
    furn('f-wardrobe-master', 'room-master', 'wardrobe', 'Wardrobe', 'wardrobe', 1300, 8120, 0, 2400, 620, 2200, ['mat-wood-teak']),
    furn('f-dining', 'room-dining', 'diningTable', 'Dining Table (6)', 'diningTable', 5850, 2400, 0, 1800, 1000, 750, ['mat-wood-teak']),
    furn('f-counter', 'room-kitchen', 'kitchenUnit', 'Kitchen Counter', 'counter', 9100, 420, 0, 3200, 620, 900, ['mat-counter-granite', 'mat-wood-teak']),
    furn('f-bed2', 'room-bed2', 'bed', 'Queen Bed', 'bed', 6150, 6700, 0, 1600, 2050, 550, ['mat-fabric-rust', 'mat-wood-teak']),
    furn('f-wardrobe2', 'room-bed2', 'wardrobe', 'Wardrobe', 'wardrobe', 5400, 8120, 0, 1800, 620, 2200, ['mat-wood-teak']),
  ];

  // ---- terrace floor -------------------------------------------------------
  const terraceWalls: Wall[] = [
    wall('p-s', TERRACE, { x: 0, y: 0 }, { x: 10800, y: 0 }, EXT, PARAPET),
    wall('p-e', TERRACE, { x: 10800, y: 0 }, { x: 10800, y: 4800 }, EXT, PARAPET),
    wall('p-n', TERRACE, { x: 7200, y: 8400 }, { x: 0, y: 8400 }, EXT, PARAPET),
    wall('p-w', TERRACE, { x: 0, y: 8400 }, { x: 0, y: 0 }, EXT, PARAPET),
    wall('w-den-s', TERRACE, { x: 7200, y: 4800 }, { x: 10800, y: 4800 }, INT),
    wall('w-den-w', TERRACE, { x: 7200, y: 4800 }, { x: 7200, y: 8400 }, INT),
    wall('w-den-n', TERRACE, { x: 10800, y: 8400 }, { x: 7200, y: 8400 }, EXT),
    wall('w-den-e', TERRACE, { x: 10800, y: 4800 }, { x: 10800, y: 8400 }, EXT),
  ];

  const terraceOpenings: Opening[] = [
    opening('o-den-door', 'w-den-w', 'door', (6600 - 4800) / 3600, 900, { swing: 'left' }),
    opening('o-den-window', 'w-den-s', 'window', 0.5, 1500),
  ];

  const terraceRooms: Room[] = [
    room(
      'room-terrace',
      TERRACE,
      'Terrace',
      'terrace',
      [
        { x: 0, y: 0 },
        { x: 10800, y: 0 },
        { x: 10800, y: 4800 },
        { x: 7200, y: 4800 },
        { x: 7200, y: 8400 },
        { x: 0, y: 8400 },
      ],
      ['p-s', 'p-e', 'p-n', 'p-w', 'w-den-s', 'w-den-w'],
      {
        openToSky: true,
        floorMaterial: 'mat-floor-terracotta',
        // Stairwell void over the living-room feature stair.
        holes: [rect(250, 2650, 3300, 3900)],
        furnitureIds: ['f-terrace-seat', 'f-terrace-plant'],
      },
    ),
    room('room-den', TERRACE, 'Terrace Den', 'study', rect(7200, 4800, 10800, 8400), ['w-den-s', 'w-den-w', 'w-den-n', 'w-den-e'], {
      floorMaterial: 'mat-floor-oak',
      furnitureIds: ['f-den-desk'],
      lightIds: ['l-den'],
    }),
  ];

  const terraceFurniture: FurnitureObject[] = [
    furn('f-terrace-seat', 'room-terrace', 'chair', 'Cane Lounge Set', 'sofa', 2400, 6800, -Math.PI / 2, 1800, 800, 750, ['mat-cane-natural', 'mat-fabric-rust']),
    furn('f-terrace-plant', 'room-terrace', 'plant', 'Terrace Planter', 'plant', 5800, 600, 0, 600, 600, 1400, ['mat-paint-terracotta']),
    furn('f-den-desk', 'room-den', 'console', 'Study Desk', 'table', 9000, 7800, Math.PI, 1600, 700, 750, ['mat-wood-teak']),
  ];

  const scene: HomeScene = {
    schemaVersion: SCHEMA_VERSION,
    id: 'sample-home',
    name: 'Sample Penthouse (2BHK + Terrace)',
    units: 'mm',
    floors: [
      {
        id: GROUND,
        name: 'Ground Floor',
        level: 0,
        floorHeight: 3000,
        rooms: groundRooms,
        walls: groundWalls,
        openings: groundOpenings,
        objects: groundFurniture,
        stairs: [
          {
            id: 'stair-main',
            floorId: GROUND,
            kind: 'L',
            position: { x: 450, y: 350 },
            rotation: Math.PI / 2, // ascend +y along the west wall
            width: 900,
            totalRise: 3000,
            treadRun: 280,
            flightSplit: 9,
            turn: 'right',
            materialId: 'mat-stair-stone',
            crossFloorLink: { upperFloorId: TERRACE, slabHoleRoomId: 'room-terrace' },
            source: sourceSample(),
          },
        ],
        lights: [
          { id: 'l-sun', floorId: GROUND, kind: 'sun', intensity: 3, color: '#fff2dd', castShadow: true, position: { x: -4000, y: -6000, elevation: 8000 } },
          { id: 'l-living', floorId: GROUND, roomId: 'room-living', kind: 'point', intensity: 25, color: '#ffe7c4', castShadow: false, position: { x: 2200, y: 2400, elevation: 2700 } },
          { id: 'l-master', floorId: GROUND, roomId: 'room-master', kind: 'point', intensity: 20, color: '#ffe7c4', castShadow: false, position: { x: 2250, y: 6600, elevation: 2700 } },
          { id: 'l-dining', floorId: GROUND, roomId: 'room-dining', kind: 'point', intensity: 22, color: '#ffe2b8', castShadow: false, position: { x: 5850, y: 2400, elevation: 2500 }, photoModeRole: 'area' },
          { id: 'l-kitchen', floorId: GROUND, roomId: 'room-kitchen', kind: 'point', intensity: 22, color: '#fff0d8', castShadow: false, position: { x: 9000, y: 2400, elevation: 2700 } },
          { id: 'l-bed2', floorId: GROUND, roomId: 'room-bed2', kind: 'point', intensity: 18, color: '#ffe7c4', castShadow: false, position: { x: 6150, y: 6600, elevation: 2700 } },
        ],
      },
      {
        id: TERRACE,
        name: 'Terrace',
        level: 1,
        floorHeight: 3000,
        rooms: terraceRooms,
        walls: terraceWalls,
        openings: terraceOpenings,
        objects: terraceFurniture,
        stairs: [],
        lights: [
          { id: 'l-den', floorId: TERRACE, roomId: 'room-den', kind: 'point', intensity: 20, color: '#ffe7c4', castShadow: false, position: { x: 9000, y: 6600, elevation: 2700 } },
        ],
      },
    ],
    materials: cloneLibrary(),
    locks: [],
    referenceImages: [],
    meta: { createdAt: now, updatedAt: now, notes: 'Anonymized demo fixture — not a real home.' },
  };

  return scene;
}
