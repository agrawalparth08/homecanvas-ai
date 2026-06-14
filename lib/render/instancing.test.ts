import { describe, expect, it } from 'vitest';
import type { FurnitureObject } from '../scene/schemas';
import { buildInstanceBatches } from './instancing';

/** Minimal valid FurnitureObject; overrides patch the fields a case cares about. */
function makeObj(over: Partial<FurnitureObject> & { id: string }): FurnitureObject {
  return {
    roomId: 'room-1',
    category: 'sofa',
    name: 'piece',
    transform: { x: 0, y: 0, elevation: 0, rotationY: 0 },
    dimensions: { w: 2000, d: 900, h: 800 },
    footprint: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
    ],
    materialIds: [],
    source: { kind: 'manual', confidence: 1 },
    ...over,
  };
}

describe('buildInstanceBatches', () => {
  it('groups 3 identical sofas + 1 different chair into 2 batches', () => {
    const objects: FurnitureObject[] = [
      makeObj({ id: 's1', assetRef: 'sofa.glb', transform: { x: 1, y: 0, elevation: 0, rotationY: 0 } }),
      makeObj({ id: 's2', assetRef: 'sofa.glb', transform: { x: 2, y: 0, elevation: 0, rotationY: 0 } }),
      makeObj({ id: 's3', assetRef: 'sofa.glb', transform: { x: 3, y: 0, elevation: 0, rotationY: 0 } }),
      makeObj({
        id: 'c1',
        category: 'chair',
        assetRef: 'chair.glb',
        dimensions: { w: 500, d: 500, h: 900 },
      }),
    ];

    const plan = buildInstanceBatches(objects);

    expect(plan.batches).toHaveLength(2);
    const sofa = plan.batches[0]!;
    const chair = plan.batches[1]!;

    // Input order preserved: sofa batch first (it appeared first).
    expect(sofa.assetRef).toBe('sofa.glb');
    expect(sofa.kind).toBe('sofa.glb');
    expect(sofa.instances).toHaveLength(3);
    expect(chair.instances).toHaveLength(1);

    // Per-instance transforms carried through, in input order.
    expect(sofa.instances.map((i) => i.x)).toEqual([1, 2, 3]);
    expect(sofa.instances[0]!.entityId).toBe('s1');

    // Catalog dims recorded on the batch.
    expect(chair.w).toBe(500);
    expect(chair.h).toBe(900);

    // instanceToEntity maps each batch key to ordered entity ids.
    expect(plan.instanceToEntity[sofa.key]).toEqual(['s1', 's2', 's3']);
    expect(plan.instanceToEntity[chair.key]).toEqual(['c1']);
  });

  it('does not merge objects that differ only in dimensions', () => {
    const objects: FurnitureObject[] = [
      makeObj({ id: 'a', assetRef: 'sofa.glb', dimensions: { w: 2000, d: 900, h: 800 } }),
      makeObj({ id: 'b', assetRef: 'sofa.glb', dimensions: { w: 2200, d: 900, h: 800 } }),
    ];

    const plan = buildInstanceBatches(objects);

    expect(plan.batches).toHaveLength(2);
    expect(plan.batches[0]!.instances).toHaveLength(1);
    expect(plan.batches[1]!.instances).toHaveLength(1);
    expect(plan.batches[0]!.key).not.toBe(plan.batches[1]!.key);
  });

  it('returns an empty plan for empty input', () => {
    const plan = buildInstanceBatches([]);
    expect(plan).toEqual({ batches: [], instanceToEntity: {} });
  });

  it('keys procedural objects by proc:<kind> and omits assetRef; sub-mm dims merge', () => {
    const objects: FurnitureObject[] = [
      makeObj({
        id: 'p1',
        assetRef: undefined,
        procedural: { kind: 'boxTable' },
        dimensions: { w: 1000.2, d: 600, h: 750 },
      }),
      makeObj({
        id: 'p2',
        assetRef: undefined,
        procedural: { kind: 'boxTable' },
        // 999.8 and 1000.2 both round to 1000 -> same batch as p1.
        dimensions: { w: 999.8, d: 600, h: 750 },
      }),
    ];

    const plan = buildInstanceBatches(objects);

    expect(plan.batches).toHaveLength(1);
    const batch = plan.batches[0]!;
    expect(batch.kind).toBe('proc:boxTable');
    expect(batch.assetRef).toBeUndefined();
    expect('assetRef' in batch).toBe(false); // truly omitted, not set to undefined
    expect(batch.w).toBe(1000);
    expect(plan.instanceToEntity[batch.key]).toEqual(['p1', 'p2']);
  });
});
