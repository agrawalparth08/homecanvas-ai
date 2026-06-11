import type { FurnitureObject } from '@lib/scene/schemas';

/**
 * Structural pillars are extracted from magenta column marks in the plan and
 * stored as furniture objects with a `column` procedural kind (see
 * scripts/generate-my-home-scene.ts). They CAN be deleted, but deleting one
 * should warn the user that the real-world structure may become unstable —
 * extraction also mislabels some non-structural magenta marks as pillars, so the
 * user is the final judge.
 */
export function isStructuralColumn(obj: Pick<FurnitureObject, 'procedural'>): boolean {
  return obj.procedural?.kind === 'column';
}

export const STRUCTURAL_DELETE_TITLE = 'Delete structural pillar?';
export const STRUCTURAL_DELETE_MESSAGE =
  'This is marked as a structural pillar (a load-bearing column). Removing a real pillar can make the building unstable. If this mark is not actually a pillar, deleting it here is fine. Delete it from the model?';
export const STRUCTURAL_DELETE_CONFIRM = 'Delete pillar';
