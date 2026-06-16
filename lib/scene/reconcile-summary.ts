/**
 * Display summary for the re-extraction diff/merge UI. Pure: turns a
 * reconcile() + applyRemap() into per-status counts (rooms / walls) plus the set
 * of furniture that would be orphaned by the merge (pieces in rooms the merge
 * deletes), so the panel can warn before the user applies. Mutates nothing.
 */
import { applyRemap, reconcile, type RemapApplication } from './reconcile';
import type { HomeScene, RemapStatus } from './schemas';

export type StatusCounts = Record<RemapStatus, number>;

const STATUSES: RemapStatus[] = ['kept', 'remapped', 'split', 'deleted', 'added', 'unresolved'];
const emptyCounts = (): StatusCounts =>
  STATUSES.reduce((acc, s) => ((acc[s] = 0), acc), {} as StatusCounts);

export interface ReconcileSummary {
  rooms: StatusCounts;
  walls: StatusCounts;
  /** Furniture in rooms the merge would DELETE — these references would be dropped. */
  orphanedFurnitureIds: string[];
  /** The safe migration + surfaced added/unresolved entities (from applyRemap). */
  application: RemapApplication;
  /** Number of ops the auto-merge patch would apply (0 = nothing to migrate). */
  patchOpCount: number;
  /** True if anything at all differs (any non-'kept' entry). */
  hasChanges: boolean;
}

export function reconcileSummary(oldScene: HomeScene, newScene: HomeScene): ReconcileSummary {
  const table = reconcile(oldScene, newScene);
  const rooms = emptyCounts();
  const walls = emptyCounts();
  const deletedRoomIds = new Set<string>();

  for (const e of table.entries) {
    const bucket = e.entityType === 'room' ? rooms : walls;
    bucket[e.status] += 1;
    if (e.entityType === 'room' && e.status === 'deleted' && e.oldId) deletedRoomIds.add(e.oldId);
  }

  const orphanedFurnitureIds = oldScene.floors
    .flatMap((f) => f.objects)
    .filter((o) => deletedRoomIds.has(o.roomId))
    .map((o) => o.id)
    .sort();

  const application = applyRemap(oldScene, newScene);
  return {
    rooms,
    walls,
    orphanedFurnitureIds,
    application,
    patchOpCount: application.patch?.ops.length ?? 0,
    hasChanges: table.entries.some((e) => e.status !== 'kept'),
  };
}
