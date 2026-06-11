import { z } from 'zod';

/**
 * The scene graph is the single source of truth for the whole app.
 * Everything here is zod-first: types are inferred, never hand-written twice.
 *
 * Geometry convention: plan space, millimeters, +x east, +y north.
 * Every persisted artifact carries `schemaVersion` (see migrations.ts).
 */

export const SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// primitives
// ---------------------------------------------------------------------------

export const EntityId = z.string().min(1);
export type EntityId = z.infer<typeof EntityId>;

export const Vec2Schema = z.object({ x: z.number().finite(), y: z.number().finite() });
export type Vec2 = z.infer<typeof Vec2Schema>;

export const HexColor = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{6})$/, 'expected #rrggbb hex color');
export type HexColor = z.infer<typeof HexColor>;

export const SourceKind = z.enum(['sample', 'manual', 'traced', 'extracted', 'agent']);

export const EntitySource = z.object({
  kind: SourceKind,
  /** 0..1 — below the review threshold entities render ghosted and queue for review. */
  confidence: z.number().min(0).max(1),
  jobId: z.string().optional(),
  /** Original pixel-space reference from the underlay, kept so recalibration is lossless. */
  pixelRef: z.object({ pts: z.array(Vec2Schema) }).optional(),
});
export type EntitySource = z.infer<typeof EntitySource>;

export const sourceSample = (): EntitySource => ({ kind: 'sample', confidence: 1 });
export const sourceManual = (): EntitySource => ({ kind: 'manual', confidence: 1 });

// ---------------------------------------------------------------------------
// materials
// ---------------------------------------------------------------------------

export const MaterialCategory = z.enum([
  'paint',
  'limewash',
  'texturedPlaster',
  'wallpaper',
  'wood',
  'marble',
  'granite',
  'ceramicTile',
  'terrazzo',
  'terracotta',
  'stone',
  'concrete',
  'brass',
  'metal',
  'cane',
  'fabric',
  'leather',
  'glass',
  'jaali',
  'other',
]);
export type MaterialCategory = z.infer<typeof MaterialCategory>;

export const MaterialSchema = z.object({
  id: EntityId,
  name: z.string().min(1),
  category: MaterialCategory,
  baseColor: HexColor,
  pbr: z.object({
    roughness: z.number().min(0).max(1),
    metallic: z.number().min(0).max(1),
    /** Key into the local CC0 asset cache (lib/assets); absent => flat procedural. */
    textureSetRef: z.string().optional(),
    normalStrength: z.number().min(0).max(2).optional(),
    /** Multiplies the diffuse texture (e.g. tint an ivory marble grey). Default white = texture as-is. */
    tint: HexColor.optional(),
    /** Plan-mm covered by one texture repeat. */
    repeatScale: z.number().positive(),
  }),
  styleTags: z.array(z.string()),
  /** Provenance, e.g. a ReferenceImage id or "stylepack:japandi". */
  sourceReference: z.string().optional(),
});
export type Material = z.infer<typeof MaterialSchema>;

// ---------------------------------------------------------------------------
// architecture
// ---------------------------------------------------------------------------

export const WallSchema = z
  .object({
    id: EntityId,
    floorId: EntityId,
    /**
     * Centerline path. v1 generators handle straight 2-point walls;
     * bulges (DXF-style arc factors per segment) are stored now so curved
     * walls need no schema migration later.
     */
    path: z.object({
      pts: z.array(Vec2Schema).min(2),
      bulges: z.array(z.number()),
    }),
    thickness: z.number().positive(),
    height: z.number().positive(),
    /** sideA = left of start→end direction, sideB = right. */
    materialIds: z.object({ sideA: EntityId, sideB: EntityId }),
    source: EntitySource,
  })
  .refine((w) => w.path.bulges.length === w.path.pts.length - 1, {
    message: 'bulges must have one entry per path segment',
  });
export type Wall = z.infer<typeof WallSchema>;

export const OpeningKind = z.enum(['door', 'window', 'opening']);
export type OpeningKind = z.infer<typeof OpeningKind>;

export const OpeningSchema = z.object({
  id: EntityId,
  wallId: EntityId,
  kind: OpeningKind,
  /** Center position along the wall axis, normalized 0..1 of centerline length. */
  u: z.number().min(0).max(1),
  width: z.number().positive(),
  sillHeight: z.number().min(0),
  headHeight: z.number().positive(),
  swing: z.enum(['left', 'right', 'sliding', 'none']).optional(),
  source: EntitySource,
});
export type Opening = z.infer<typeof OpeningSchema>;

export const RoomKind = z.enum([
  'living',
  'bedroom',
  'masterBedroom',
  'kidsRoom',
  'kitchen',
  'dining',
  'bathroom',
  'study',
  'foyer',
  'passage',
  'utility',
  'washArea',
  'balcony',
  'terrace',
  'pooja',
  'store',
  'other',
]);
export type RoomKind = z.infer<typeof RoomKind>;

/** Room kinds that are open to sky / semi-open by default. */
export const OPEN_ROOM_KINDS: ReadonlySet<z.infer<typeof RoomKind>> = new Set([
  'terrace',
  'balcony',
  'washArea',
]);

export const SurfaceKind = z.enum(['floor', 'ceiling', 'wallFace']);

export const SurfaceSchema = z.object({
  id: EntityId,
  parentId: EntityId,
  kind: SurfaceKind,
  materialId: EntityId,
});
export type Surface = z.infer<typeof SurfaceSchema>;

export const RoomSchema = z.object({
  id: EntityId,
  floorId: EntityId,
  name: z.string().min(1),
  kind: RoomKind,
  /** Terraces/balconies/wash areas: true => no ceiling surface, sky lighting. */
  openToSky: z.boolean(),
  boundary: z.object({
    outer: z.array(Vec2Schema).min(3),
    holes: z.array(z.array(Vec2Schema).min(3)),
  }),
  wallIds: z.array(EntityId),
  floorSurface: SurfaceSchema,
  ceilingSurface: SurfaceSchema.optional(),
  furnitureIds: z.array(EntityId),
  lightIds: z.array(EntityId),
  styleTags: z.array(z.string()),
  source: EntitySource,
});
export type Room = z.infer<typeof RoomSchema>;

export const StairSchema = z.object({
  id: EntityId,
  /** Floor the stair rises FROM. */
  floorId: EntityId,
  kind: z.enum(['straight', 'L', 'U']),
  /** Plan position of the first step's leading edge center. */
  position: Vec2Schema,
  /** Direction of ascent in radians (0 = +x east). */
  rotation: z.number(),
  width: z.number().positive(),
  totalRise: z.number().positive(),
  treadRun: z.number().positive(),
  /** For L/U stairs: steps in the first flight before the landing. */
  flightSplit: z.number().int().positive().optional(),
  /** L turns left or right when ascending. */
  turn: z.enum(['left', 'right']).optional(),
  materialId: EntityId,
  crossFloorLink: z
    .object({
      upperFloorId: EntityId,
      /** Room on the upper floor whose boundary holes include the stairwell. */
      slabHoleRoomId: EntityId.optional(),
    })
    .optional(),
  source: EntitySource,
});
export type Stair = z.infer<typeof StairSchema>;

// ---------------------------------------------------------------------------
// furniture & lighting
// ---------------------------------------------------------------------------

export const FurnitureCategory = z.enum([
  'sofa',
  'chair',
  'bed',
  'wardrobe',
  'diningTable',
  'coffeeTable',
  'tvUnit',
  'rug',
  'curtains',
  'light',
  'plant',
  'decor',
  'kitchenUnit',
  'bathroomFixture',
  'storage',
  'console',
  'poojaUnit',
  'partition',
  'other',
]);
export type FurnitureCategory = z.infer<typeof FurnitureCategory>;

export const FurnitureSchema = z.object({
  id: EntityId,
  roomId: EntityId,
  category: FurnitureCategory,
  name: z.string().min(1),
  /** Key into the local glTF asset cache; absent => procedural placeholder. */
  assetRef: z.string().optional(),
  procedural: z
    .object({
      kind: z.string(),
      params: z.record(z.string(), z.number()).optional(),
    })
    .optional(),
  transform: z.object({
    x: z.number(),
    y: z.number(),
    elevation: z.number(),
    rotationY: z.number(),
  }),
  dimensions: z.object({
    w: z.number().positive(),
    d: z.number().positive(),
    h: z.number().positive(),
  }),
  /** Local-space footprint polygon (origin at transform, unrotated). */
  footprint: z.array(Vec2Schema).min(3),
  materialIds: z.array(EntityId),
  source: EntitySource,
});
export type FurnitureObject = z.infer<typeof FurnitureSchema>;

export const LightSchema = z.object({
  id: EntityId,
  floorId: EntityId,
  roomId: EntityId.optional(),
  kind: z.enum(['ambient', 'sun', 'point', 'spot', 'area']),
  position: z.object({ x: z.number(), y: z.number(), elevation: z.number() }).optional(),
  intensity: z.number().min(0),
  color: HexColor,
  /** Perf-critical: at most 1-2 shadow casters per scene. */
  castShadow: z.boolean(),
  /** Photo Mode treats 'area' lights as physical rect emitters at windows. */
  photoModeRole: z.enum(['area', 'env']).optional(),
});
export type Light = z.infer<typeof LightSchema>;

// ---------------------------------------------------------------------------
// locks, references, floors, scene
// ---------------------------------------------------------------------------

export const LockConstraintSchema = z.object({
  id: EntityId,
  /** Any entity whose serialized form changes in a commit must not be in here. */
  entityIds: z.array(EntityId).min(1),
  reason: z.string().optional(),
  createdAt: z.string(),
});
export type LockConstraint = z.infer<typeof LockConstraintSchema>;

export const ReferenceImageSchema = z.object({
  id: EntityId,
  kind: z.enum(['sitePhoto', 'tile', 'furniture', 'palette', 'moodboard']),
  roomId: EntityId.optional(),
  /** Path under private-home-inputs/ — never leaves the machine. */
  filePath: z.string().min(1),
  extractedPalette: z.array(HexColor).optional(),
  notes: z.string().optional(),
});
export type ReferenceImage = z.infer<typeof ReferenceImageSchema>;

export const FloorSchema = z.object({
  id: EntityId,
  name: z.string().min(1),
  /** 0 = ground. Elevation of floor slab top = sum of levels below (v1: level * floorHeight). */
  level: z.number().int(),
  floorHeight: z.number().positive(),
  /** Per-floor: each level may be traced from a different image at a different scale. */
  calibration: z
    .object({
      mmPerPx: z.number().positive(),
      originPx: Vec2Schema,
      rotationDeg: z.number(),
    })
    .optional(),
  /** 2D underlay shown in overlay/tracing modes (P2+). */
  underlay: z
    .object({
      filePath: z.string(),
      opacity: z.number().min(0).max(1),
      widthPx: z.number().positive(),
      heightPx: z.number().positive(),
      page: z.number().int().positive().optional(),
    })
    .optional(),
  rooms: z.array(RoomSchema),
  walls: z.array(WallSchema),
  openings: z.array(OpeningSchema),
  objects: z.array(FurnitureSchema),
  stairs: z.array(StairSchema),
  lights: z.array(LightSchema),
});
export type Floor = z.infer<typeof FloorSchema>;

export const HomeSceneSchema = z.object({
  schemaVersion: z.number().int().positive(),
  id: EntityId,
  name: z.string().min(1),
  units: z.literal('mm'),
  floors: z.array(FloorSchema).min(1),
  materials: z.array(MaterialSchema),
  locks: z.array(LockConstraintSchema),
  referenceImages: z.array(ReferenceImageSchema),
  meta: z.object({
    createdAt: z.string(),
    updatedAt: z.string(),
    notes: z.string().optional(),
  }),
});
export type HomeScene = z.infer<typeof HomeSceneSchema>;

// ---------------------------------------------------------------------------
// styles & variants
// ---------------------------------------------------------------------------

/** A material template a style pack instantiates into a concrete Material on apply. */
export const MaterialSpec = MaterialSchema.omit({ id: true });
export type MaterialSpec = z.infer<typeof MaterialSpec>;

export const BudgetTier = z.enum(['budget', 'moderate', 'premium']);

export const StylePackSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  palette: z.array(HexColor).min(3),
  wallPaint: MaterialSpec,
  accentWall: MaterialSpec.optional(),
  floorMaterial: MaterialSpec,
  wetFloorMaterial: MaterialSpec.optional(),
  ceiling: MaterialSpec.optional(),
  furnitureFamilies: z.array(z.string()),
  lightingNotes: z.string(),
  textileNotes: z.string(),
  decorElements: z.array(z.string()),
  budgetTier: BudgetTier,
  reasoning: z.string(),
  /** Per-room-kind overrides, e.g. kitchen gets the wet floor. */
  roomOverrides: z
    .partialRecord(
      RoomKind,
      z.object({
        wallPaint: MaterialSpec.optional(),
        floorMaterial: MaterialSpec.optional(),
      }),
    )
    .optional(),
});
export type StylePack = z.infer<typeof StylePackSchema>;

export const VariantMetaSchema = z.object({
  schemaVersion: z.number().int().positive(),
  id: EntityId,
  projectId: z.string().min(1),
  name: z.string().min(1),
  /** Branch lineage: variant this one was created from (shared entity ids). */
  baseVariantId: EntityId.optional(),
  styleTags: z.array(z.string()),
  createdAt: z.string(),
});
export type VariantMeta = z.infer<typeof VariantMetaSchema>;

export const DesignVariantSchema = z.object({
  meta: VariantMetaSchema,
  scene: HomeSceneSchema,
});
export type DesignVariant = z.infer<typeof DesignVariantSchema>;

// ---------------------------------------------------------------------------
// projects, files, jobs (P0 definitions; pipelines arrive in P2/P3)
// ---------------------------------------------------------------------------

export const ProjectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(['sample', 'myHome']),
  createdAt: z.string(),
});
export type Project = z.infer<typeof ProjectSchema>;

export const UploadedFileSchema = z.object({
  id: z.string().min(1),
  fileName: z.string().min(1),
  filePath: z.string().min(1),
  mimeType: z.string(),
  bytes: z.number().int().nonnegative(),
  role: z.enum([
    'floorPlan',
    'elevation',
    'section',
    'dimensions',
    'electrical',
    'furnitureLayout',
    'materialSpec',
    'builderDoc',
    'referenceImage',
    'sitePhoto',
    'cad',
    'unknown',
  ]),
  addedAt: z.string(),
});
export type UploadedFile = z.infer<typeof UploadedFileSchema>;

export const PrivateHomeFileManifestSchema = z.object({
  schemaVersion: z.number().int().positive(),
  scannedAt: z.string(),
  rootDir: z.string(),
  files: z.array(UploadedFileSchema),
  hasFloorPlan: z.boolean(),
  hasCad: z.boolean(),
  hasSitePhotos: z.boolean(),
  hasReferences: z.boolean(),
  hasManualScene: z.boolean(),
  hasGeneratedScene: z.boolean(),
});
export type PrivateHomeFileManifest = z.infer<typeof PrivateHomeFileManifestSchema>;

export const ConfidenceIssueSchema = z.object({
  id: z.string().min(1),
  entityId: EntityId.optional(),
  severity: z.enum(['info', 'warning', 'error']),
  kind: z.string().min(1),
  message: z.string().min(1),
  suggestedFix: z.string().optional(),
});
export type ConfidenceIssue = z.infer<typeof ConfidenceIssueSchema>;

export const FloorPlanExtractionJobSchema = z.object({
  id: z.string().min(1),
  status: z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled']),
  inputFileId: z.string(),
  /** Idempotency: hash of input file + params; duplicate submissions are no-ops. */
  idempotencyKey: z.string(),
  progress: z.number().min(0).max(1),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
  heartbeatAt: z.string().optional(),
  error: z.string().optional(),
});
export type FloorPlanExtractionJob = z.infer<typeof FloorPlanExtractionJobSchema>;

export const FloorPlanExtractionResultSchema = z.object({
  jobId: z.string(),
  scene: HomeSceneSchema,
  issues: z.array(ConfidenceIssueSchema),
  overallConfidence: z.number().min(0).max(1),
});
export type FloorPlanExtractionResult = z.infer<typeof FloorPlanExtractionResultSchema>;

// ---------------------------------------------------------------------------
// re-extraction reconciliation + extraction review (P6) — sibling artifacts,
// not part of HomeScene, so no SCHEMA_VERSION bump / migration needed.
// ---------------------------------------------------------------------------

export const RemapStatus = z.enum(['kept', 'remapped', 'split', 'deleted', 'added', 'unresolved']);
export type RemapStatus = z.infer<typeof RemapStatus>;

export const RemapEntrySchema = z.object({
  status: RemapStatus,
  entityType: z.enum(['room', 'wall']),
  /** Present except for 'added'. */
  oldId: EntityId.optional(),
  /** The matched new id for kept/remapped/added. */
  newId: EntityId.optional(),
  /** The new ids an old entity split into. */
  newIds: z.array(EntityId).optional(),
  /** Match score (IoU or overlap ratio) when applicable. */
  score: z.number().optional(),
});
export type RemapEntry = z.infer<typeof RemapEntrySchema>;

export const RemapTableSchema = z.object({ entries: z.array(RemapEntrySchema) });
export type RemapTable = z.infer<typeof RemapTableSchema>;

export const ExtractionReviewSchema = z.object({
  issues: z.array(ConfidenceIssueSchema),
  /** Fraction of the floor extent covered by room polygons, [0,1]. */
  coverage: z.number().min(0).max(1),
  summary: z.string(),
});
export type ExtractionReview = z.infer<typeof ExtractionReviewSchema>;

// ---------------------------------------------------------------------------
// geometry corrections (P6) — proposal → patch, previewed then committed
// ---------------------------------------------------------------------------

export const GeometryCorrectionKind = z.enum(['resizeWall', 'deleteWall']);
export type GeometryCorrectionKind = z.infer<typeof GeometryCorrectionKind>;

export const GeometryCorrectionProposalSchema = z.object({
  id: z.string().min(1),
  targetEntityId: EntityId,
  kind: GeometryCorrectionKind,
  params: z.object({ thickness: z.number().positive().optional() }),
  rationale: z.string(),
  confidence: z.number().min(0).max(1),
});
export type GeometryCorrectionProposal = z.infer<typeof GeometryCorrectionProposalSchema>;

// ---------------------------------------------------------------------------
// room boards + variant diff (P7) — pure descriptors over a scene
// ---------------------------------------------------------------------------

export const RoomBoardSchema = z.object({
  roomId: EntityId,
  name: z.string(),
  kind: RoomKind,
  palette: z.array(HexColor),
  materials: z.array(z.object({ id: EntityId, name: z.string(), baseColor: HexColor })),
  furniture: z.array(z.object({ id: EntityId, name: z.string(), category: FurnitureCategory })),
  styleTags: z.array(z.string()),
});
export type RoomBoard = z.infer<typeof RoomBoardSchema>;

export const SceneDiffSchema = z.object({
  changedRooms: z.array(EntityId),
  recoloredRooms: z.array(EntityId),
  addedRoomIds: z.array(EntityId),
  removedRoomIds: z.array(EntityId),
  addedObjectIds: z.array(EntityId),
  removedObjectIds: z.array(EntityId),
  /** Objects present in both but whose transform changed (a layout edit). */
  movedObjectIds: z.array(EntityId),
  summary: z.string(),
});
export type SceneDiff = z.infer<typeof SceneDiffSchema>;
