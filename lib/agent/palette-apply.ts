/**
 * Apply a reference-image palette to a room (Phase 5/6), pure + deterministic.
 *
 * A photo/moodboard is reduced (client-side) to Swatches + nearest-library
 * MaterialCandidates by lib/extraction/palette. This turns that into ScenePatch
 * ops: walls take the lightest extracted tone (as a paint colour), and the floor
 * takes the nearest floor-appropriate library material from the image — added to
 * the scene first so the assignment never dangles. No paid API, no network.
 */
import type { MaterialCandidate, Swatch } from '../extraction/palette';
import type { PatchOp } from '../scene/patching';
import type { HomeScene, Material, Room } from '../scene/schemas';
import { findWall } from '../scene/selectors';
import { MATERIAL_LIBRARY, cloneMaterial } from '../styles/material-library';
import { wallSideFacingRoom } from '../styles/apply';
import type { SurfaceTarget } from './intent';

export interface PaletteInput {
  swatches: Swatch[];
  candidates: MaterialCandidate[];
}

/** Library materials that make sense on a floor (vs paint/fabric/etc). */
const FLOOR_MAT = /^mat-(floor|tile|wood|stair|counter)/;

const luminance = (hex: string): number => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/**
 * Ops to recolour one room from the palette. `surface` narrows to walls/floor.
 * Emits add_material (for a borrowed library floor material) + assignments;
 * dedupe add_material across rooms at the caller.
 */
export function buildPaletteOps(
  scene: HomeScene,
  room: Room,
  input: PaletteInput,
  surface: SurfaceTarget,
): PatchOp[] {
  const ops: PatchOp[] = [];
  const top = input.swatches.slice(0, 5);
  const wallColor = [...top].sort((a, b) => luminance(b.hex) - luminance(a.hex))[0]?.hex;
  const floorLib: Material | undefined = (() => {
    const cand = input.candidates.find((c) => FLOOR_MAT.test(c.materialId));
    const m = cand ? MATERIAL_LIBRARY.find((x) => x.id === cand.materialId) : undefined;
    // DEEP-COPY the borrowed library entry — embedding the live singleton would
    // let immer's autoFreeze freeze the shared global on commit. Scene owns it.
    return m ? { ...cloneMaterial(m), sourceReference: 'palette:image' } : undefined;
  })();

  const doWalls = surface === 'walls' || surface === 'all';
  const doFloor = surface === 'floor' || surface === 'all';

  if (doWalls && wallColor) {
    for (const wallId of room.wallIds) {
      const found = findWall(scene, wallId);
      if (found) {
        ops.push({
          type: 'set_surface_color',
          surface: { kind: 'wallSide', wallId, side: wallSideFacingRoom(found.wall, room) },
          color: wallColor,
        });
      }
    }
  }
  if (doFloor && floorLib) {
    if (!scene.materials.some((m) => m.id === floorLib.id)) {
      ops.push({ type: 'add_material', material: floorLib });
    }
    ops.push({ type: 'assign_material_to_surface', surface: { kind: 'roomFloor', roomId: room.id }, materialId: floorLib.id });
  }
  return ops;
}
