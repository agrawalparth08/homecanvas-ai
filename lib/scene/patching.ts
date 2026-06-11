import { z } from 'zod';
import {
  EntityId,
  FurnitureSchema,
  HexColor,
  LightSchema,
  LockConstraintSchema,
  MaterialSchema,
  OpeningSchema,
  ReferenceImageSchema,
  RoomKind,
  RoomSchema,
  StairSchema,
  Vec2Schema,
  WallSchema,
} from './schemas';

/**
 * Domain-level scene edits. EVERY change — human UI, agent, script — is one of
 * these ops inside a ScenePatch, applied by the commit pipeline (commit.ts).
 * Nothing else may mutate the scene.
 */

export const SurfaceRef = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('roomFloor'), roomId: EntityId }),
  z.object({ kind: z.literal('roomCeiling'), roomId: EntityId }),
  z.object({ kind: z.literal('wallSide'), wallId: EntityId, side: z.enum(['sideA', 'sideB']) }),
]);
export type SurfaceRef = z.infer<typeof SurfaceRef>;

const TransformPatch = z.object({
  x: z.number().optional(),
  y: z.number().optional(),
  elevation: z.number().optional(),
  rotationY: z.number().optional(),
});

export const PatchOpSchema = z.discriminatedUnion('type', [
  // appearance
  z.object({ type: z.literal('assign_material_to_surface'), surface: SurfaceRef, materialId: EntityId }),
  /** Sugar: the reducer normalizes this into a derived paint material + assignment. */
  z.object({ type: z.literal('set_surface_color'), surface: SurfaceRef, color: HexColor }),
  z.object({ type: z.literal('add_material'), material: MaterialSchema }),
  z.object({
    type: z.literal('update_material'),
    materialId: EntityId,
    patch: MaterialSchema.omit({ id: true }).partial(),
  }),

  // furniture
  z.object({ type: z.literal('place_furniture'), object: FurnitureSchema }),
  z.object({ type: z.literal('remove_object'), objectId: EntityId }),
  z.object({ type: z.literal('transform_object'), objectId: EntityId, transform: TransformPatch }),
  z.object({
    type: z.literal('replace_object'),
    objectId: EntityId,
    object: FurnitureSchema.omit({ id: true }),
  }),

  // rooms
  z.object({ type: z.literal('add_room'), floorId: EntityId, room: RoomSchema }),
  z.object({ type: z.literal('remove_room'), roomId: EntityId }),
  z.object({
    type: z.literal('update_room_boundary'),
    roomId: EntityId,
    boundary: z.object({ outer: z.array(Vec2Schema).min(3), holes: z.array(z.array(Vec2Schema).min(3)) }),
  }),
  z.object({ type: z.literal('set_room_kind'), roomId: EntityId, kind: RoomKind, openToSky: z.boolean().optional() }),
  z.object({ type: z.literal('set_room_style_tags'), roomId: EntityId, styleTags: z.array(z.string()) }),
  z.object({ type: z.literal('rename_entity'), entityId: EntityId, name: z.string().min(1) }),

  // architecture
  z.object({ type: z.literal('add_wall'), floorId: EntityId, wall: WallSchema }),
  z.object({
    type: z.literal('update_wall'),
    wallId: EntityId,
    patch: z.object({
      path: z.object({ pts: z.array(Vec2Schema).min(2), bulges: z.array(z.number()) }).optional(),
      thickness: z.number().positive().optional(),
      height: z.number().positive().optional(),
    }),
  }),
  z.object({ type: z.literal('remove_wall'), wallId: EntityId }),
  z.object({ type: z.literal('add_opening'), floorId: EntityId, opening: OpeningSchema }),
  z.object({
    type: z.literal('update_opening'),
    openingId: EntityId,
    patch: OpeningSchema.omit({ id: true, wallId: true, source: true }).partial(),
  }),
  z.object({ type: z.literal('remove_opening'), openingId: EntityId }),
  z.object({ type: z.literal('add_stair'), floorId: EntityId, stair: StairSchema }),
  z.object({ type: z.literal('remove_stair'), stairId: EntityId }),
  z.object({
    type: z.literal('update_stair'),
    stairId: EntityId,
    patch: z.object({
      position: Vec2Schema.optional(),
      rotation: z.number().optional(),
      kind: z.enum(['straight', 'L', 'U']).optional(),
      turn: z.enum(['left', 'right']).optional(),
      width: z.number().positive().optional(),
      totalRise: z.number().positive().optional(),
      treadRun: z.number().positive().optional(),
      flightSplit: z.number().int().positive().optional(),
      materialId: EntityId.optional(),
    }),
  }),

  // lighting
  z.object({ type: z.literal('add_light'), floorId: EntityId, light: LightSchema }),
  z.object({
    type: z.literal('update_light'),
    lightId: EntityId,
    patch: LightSchema.omit({ id: true, floorId: true }).partial(),
  }),
  z.object({ type: z.literal('remove_light'), lightId: EntityId }),

  // locks
  z.object({ type: z.literal('set_lock'), lock: LockConstraintSchema }),
  z.object({ type: z.literal('remove_lock'), lockId: EntityId }),

  // scale: atomic per-floor geometry rewrite — NOT a parameter tweak
  z.object({
    type: z.literal('recalibrate_floor'),
    floorId: EntityId,
    factor: z.number().positive(),
    /** true => furniture keeps its real-world size, only positions rescale. */
    keepFurnitureSize: z.boolean(),
  }),

  // references
  z.object({ type: z.literal('add_reference_image'), image: ReferenceImageSchema }),
  z.object({ type: z.literal('remove_reference_image'), imageId: EntityId }),

  // 2D tracing (Phase 2): attach a plan underlay + scale calibration to a floor
  z.object({
    type: z.literal('set_floor_underlay'),
    floorId: EntityId,
    underlay: z.object({
      filePath: z.string().min(1),
      opacity: z.number().min(0).max(1),
      widthPx: z.number().positive(),
      heightPx: z.number().positive(),
      page: z.number().int().positive().optional(),
    }),
  }),
  z.object({ type: z.literal('clear_floor_underlay'), floorId: EntityId }),
  z.object({
    type: z.literal('set_floor_calibration'),
    floorId: EntityId,
    calibration: z.object({
      mmPerPx: z.number().positive(),
      originPx: Vec2Schema,
      rotationDeg: z.number(),
    }),
  }),
  z.object({ type: z.literal('set_underlay_opacity'), floorId: EntityId, opacity: z.number().min(0).max(1) }),
]);
export type PatchOp = z.infer<typeof PatchOpSchema>;

export const PatchOrigin = z.enum(['user', 'agent', 'system']);

export const ScenePatchSchema = z.object({
  id: z.string().min(1),
  ops: z.array(PatchOpSchema).min(1),
  origin: PatchOrigin,
  description: z.string().min(1),
});
export type ScenePatch = z.infer<typeof ScenePatchSchema>;

let patchCounter = 0;
export function newPatchId(): string {
  patchCounter += 1;
  return `patch-${Date.now().toString(36)}-${patchCounter}`;
}

export function makePatch(
  description: string,
  ops: PatchOp[],
  origin: z.infer<typeof PatchOrigin> = 'user',
): ScenePatch {
  return { id: newPatchId(), ops, origin, description };
}
