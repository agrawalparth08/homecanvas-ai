import type { FurnitureObject } from '../scene/schemas';

/**
 * GPU-instancing planner (perf pass core).
 *
 * Identical furniture pieces are drawn as one InstancedMesh per batch. This pure
 * function buckets objects by *renderable identity* (same asset/procedural kind +
 * same catalog dimensions) and emits, per batch, the per-instance transforms plus
 * a flat instanceIndex -> entityId map so the R3F layer can resolve clicks back to
 * the scene graph. No three import: we emit plain numbers; the renderer builds the
 * actual matrices. Deterministic, input-order-stable — no RNG, no clock.
 */

export interface InstanceXform {
  x: number;
  y: number;
  elevation: number;
  rotationY: number;
  entityId: string;
}

export interface InstanceBatch {
  key: string;
  /** Present only for glTF-backed objects; procedural batches omit it. */
  assetRef?: string;
  /** Renderable kind: the asset key, or 'proc:<procedural.kind>'. */
  kind: string;
  /** Catalog dimensions for the batch, rounded to whole mm. */
  w: number;
  d: number;
  h: number;
  instances: InstanceXform[];
}

export interface InstancePlan {
  batches: InstanceBatch[];
  /** key -> entityId for each instance index, parallel to batch.instances. */
  instanceToEntity: Record<string, string[]>;
}

/** Round to whole mm so float jitter in extracted dims never splits a batch. */
function roundMm(n: number): number {
  return Math.round(n);
}

/**
 * Renderable kind: the glTF asset key when present, else the procedural kind.
 * `procedural` is schema-optional, so an object with neither still gets a stable
 * placeholder ('proc:?') rather than crashing — such objects all share one batch.
 */
function kindOf(obj: FurnitureObject): string {
  if (obj.assetRef != null) return obj.assetRef;
  return 'proc:' + (obj.procedural?.kind ?? '?');
}

/**
 * Group furniture into instanced batches. Objects merge iff they share both
 * renderable kind and rounded (w,d,h). First-seen order is preserved across
 * batches and within each batch, so the plan is fully deterministic.
 */
export function buildInstanceBatches(objects: FurnitureObject[]): InstancePlan {
  const byKey = new Map<string, InstanceBatch>();
  const batches: InstanceBatch[] = [];
  const instanceToEntity: Record<string, string[]> = {};

  for (const obj of objects) {
    const kind = kindOf(obj);
    const w = roundMm(obj.dimensions.w);
    const d = roundMm(obj.dimensions.d);
    const h = roundMm(obj.dimensions.h);
    const key = kind + '|' + [w, d, h].join('x');

    let batch = byKey.get(key);
    if (batch === undefined) {
      batch = {
        key,
        // exactOptionalPropertyTypes: only attach assetRef when actually present.
        ...(obj.assetRef != null ? { assetRef: obj.assetRef } : {}),
        kind,
        w,
        d,
        h,
        instances: [],
      };
      byKey.set(key, batch);
      batches.push(batch);
      instanceToEntity[key] = [];
    }

    batch.instances.push({
      x: obj.transform.x,
      y: obj.transform.y,
      elevation: obj.transform.elevation,
      rotationY: obj.transform.rotationY,
      entityId: obj.id,
    });
    // instanceToEntity[key] was initialized alongside the batch above.
    instanceToEntity[key]!.push(obj.id);
  }

  return { batches, instanceToEntity };
}

/** A renderable instanced batch: a representative object (geometry + materials) + per-instance transforms. */
export interface InstancedRenderBatch {
  key: string;
  rep: FurnitureObject;
  instances: InstanceXform[];
}

export interface FurniturePartition {
  /** Groups of ≥`min` identical procedural pieces to draw as InstancedMeshes. */
  batches: InstancedRenderBatch[];
  /** Everything else — drawn as individual meshes (selected/glTF/preview/too-few). */
  individual: FurnitureObject[];
}

export interface PartitionOpts {
  /** Pieces backed by a cached glTF model — never instanced (their own meshes). */
  isGltf?: (obj: FurnitureObject) => boolean;
  /** The selected entity id — always individual, so selection + drag are untouched. */
  selectedId?: string | null;
  /** Tracing-preview (override) active — instance nothing (local-pick path). */
  preview?: boolean;
  /** Minimum identical pieces before instancing pays off (default 4). */
  min?: number;
}

const toXform = (o: FurnitureObject): InstanceXform => ({
  x: o.transform.x,
  y: o.transform.y,
  elevation: o.transform.elevation,
  rotationY: o.transform.rotationY,
  entityId: o.id,
});

/**
 * Partition furniture into instanced batches + individuals for the renderer.
 * Pure + deterministic (input-order stable). A batch needs the SAME procedural
 * kind, rounded dimensions AND materials (different materials never share a mesh).
 * The selected piece, glTF-backed pieces and the tracing preview are forced
 * individual so selection, drag, glTF and local-pick are never affected.
 */
export function partitionForInstancing(objects: FurnitureObject[], opts: PartitionOpts = {}): FurniturePartition {
  const { isGltf = () => false, selectedId = null, preview = false, min = 4 } = opts;
  const individual: FurnitureObject[] = [];
  const groups = new Map<string, FurnitureObject[]>();

  for (const obj of objects) {
    if (preview || obj.id === selectedId || isGltf(obj)) {
      individual.push(obj);
      continue;
    }
    const kind = obj.procedural?.kind ?? obj.category;
    const d = obj.dimensions;
    const key = `${kind}|${roundMm(d.w)}x${roundMm(d.d)}x${roundMm(d.h)}|${obj.materialIds.join(',')}`;
    const g = groups.get(key);
    if (g) g.push(obj);
    else groups.set(key, [obj]);
  }

  const batches: InstancedRenderBatch[] = [];
  for (const [key, objs] of groups) {
    if (objs.length >= min) batches.push({ key, rep: objs[0]!, instances: objs.map(toXform) });
    else individual.push(...objs);
  }
  return { batches, individual };
}
