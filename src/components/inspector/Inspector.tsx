import { polygonArea } from '@lib/geometry/rooms';
import { makePatch } from '@lib/scene/patching';
import type { HomeScene, Material } from '@lib/scene/schemas';
import { findEntity, lockedEntityIds } from '@lib/scene/selectors';
import { mmToDisplay } from '@lib/geometry/scale';
import { useEditor } from '../../store/editor-store';

function MaterialSelect({
  scene,
  value,
  onChange,
  label,
}: {
  scene: HomeScene;
  value: string;
  onChange: (materialId: string) => void;
  label: string;
}) {
  const sorted = [...scene.materials].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <label className="block text-xs text-neutral-400">
      {label}
      <select
        className="mt-1 w-full rounded border border-panel-border bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {sorted.map((m: Material) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function ColorRow({ label, onPick }: { label: string; onPick: (color: string) => void }) {
  return (
    <label className="flex items-center justify-between text-xs text-neutral-400">
      {label}
      <input
        type="color"
        className="h-7 w-12 cursor-pointer rounded border border-panel-border bg-transparent"
        onChange={(e) => onPick(e.target.value)}
      />
    </label>
  );
}

function LockToggle({ scene, entityId }: { scene: HomeScene; entityId: string }) {
  const applyPatch = useEditor((s) => s.applyPatch);
  const locked = lockedEntityIds(scene).has(entityId);
  const toggle = () => {
    if (locked) {
      const lock = scene.locks.find((l) => l.entityIds.includes(entityId));
      if (lock) applyPatch(makePatch(`Unlock ${entityId}`, [{ type: 'remove_lock', lockId: lock.id }]));
    } else {
      applyPatch(
        makePatch(`Lock ${entityId}`, [
          { type: 'set_lock', lock: { id: `lock-${entityId}`, entityIds: [entityId], createdAt: new Date().toISOString() } },
        ]),
      );
    }
  };
  return (
    <button
      onClick={toggle}
      className={`w-full rounded border px-2 py-1.5 text-xs ${
        locked
          ? 'border-amber-600 bg-amber-950 text-amber-300'
          : 'border-panel-border bg-neutral-900 text-neutral-300 hover:border-neutral-500'
      }`}
    >
      {locked ? '🔒 Locked — suggestions will not touch this' : '🔓 Unlocked — click to lock'}
    </button>
  );
}

export function Inspector() {
  const scene = useEditor((s) => s.scene);
  const selection = useEditor((s) => s.selection);
  const applyPatch = useEditor((s) => s.applyPatch);

  if (!scene) return null;
  if (!selection) {
    return (
      <div className="p-4 text-sm text-neutral-500">
        Click a room floor, wall, stair or furniture piece to inspect it.
      </div>
    );
  }
  const found = findEntity(scene, selection.id);
  if (!found) return <div className="p-4 text-sm text-neutral-500">Selection no longer exists.</div>;

  const header = (title: string, subtitle: string) => (
    <div>
      <div className="text-sm font-semibold text-neutral-100">{title}</div>
      <div className="text-xs text-neutral-500">{subtitle}</div>
    </div>
  );

  return (
    <div className="flex flex-col gap-4 p-4">
      {found.type === 'room' && (
        <>
          {header(found.entity.name, `${found.entity.kind} · ${(polygonArea(found.entity.boundary.outer) / 1e6).toFixed(1)} m²${found.entity.openToSky ? ' · open to sky' : ''}`)}
          <MaterialSelect
            scene={scene}
            label="Floor material"
            value={found.entity.floorSurface.materialId}
            onChange={(materialId) =>
              applyPatch(
                makePatch(`Floor of ${found.entity.name}`, [
                  { type: 'assign_material_to_surface', surface: { kind: 'roomFloor', roomId: found.entity.id }, materialId },
                ]),
              )
            }
          />
          {found.entity.ceilingSurface && (
            <MaterialSelect
              scene={scene}
              label="Ceiling material"
              value={found.entity.ceilingSurface.materialId}
              onChange={(materialId) =>
                applyPatch(
                  makePatch(`Ceiling of ${found.entity.name}`, [
                    { type: 'assign_material_to_surface', surface: { kind: 'roomCeiling', roomId: found.entity.id }, materialId },
                  ]),
                )
              }
            />
          )}
          <ColorRow
            label="Quick floor color"
            onPick={(color) =>
              applyPatch(
                makePatch(`Color floor of ${found.entity.name}`, [
                  { type: 'set_surface_color', surface: { kind: 'roomFloor', roomId: found.entity.id }, color },
                ]),
              )
            }
          />
          {found.entity.styleTags.length > 0 && (
            <div className="text-xs text-neutral-500">Style: {found.entity.styleTags.join(', ')}</div>
          )}
          <LockToggle scene={scene} entityId={found.entity.id} />
        </>
      )}

      {found.type === 'wall' && (
        <>
          {header('Wall', `${mmToDisplay(found.entity.thickness, 'metric')} thick · ${mmToDisplay(found.entity.height, 'metric')} high`)}
          <MaterialSelect
            scene={scene}
            label="Side A material"
            value={found.entity.materialIds.sideA}
            onChange={(materialId) =>
              applyPatch(
                makePatch('Wall side A', [
                  { type: 'assign_material_to_surface', surface: { kind: 'wallSide', wallId: found.entity.id, side: 'sideA' }, materialId },
                ]),
              )
            }
          />
          <MaterialSelect
            scene={scene}
            label="Side B material"
            value={found.entity.materialIds.sideB}
            onChange={(materialId) =>
              applyPatch(
                makePatch('Wall side B', [
                  { type: 'assign_material_to_surface', surface: { kind: 'wallSide', wallId: found.entity.id, side: 'sideB' }, materialId },
                ]),
              )
            }
          />
          <ColorRow
            label="Paint side A"
            onPick={(color) =>
              applyPatch(
                makePatch('Paint wall', [
                  { type: 'set_surface_color', surface: { kind: 'wallSide', wallId: found.entity.id, side: 'sideA' }, color },
                ]),
              )
            }
          />
          <ColorRow
            label="Paint side B"
            onPick={(color) =>
              applyPatch(
                makePatch('Paint wall', [
                  { type: 'set_surface_color', surface: { kind: 'wallSide', wallId: found.entity.id, side: 'sideB' }, color },
                ]),
              )
            }
          />
          <LockToggle scene={scene} entityId={found.entity.id} />
        </>
      )}

      {found.type === 'furniture' && (
        <>
          {header(found.entity.name, `${found.entity.category} · ${mmToDisplay(found.entity.dimensions.w, 'metric')} × ${mmToDisplay(found.entity.dimensions.d, 'metric')}`)}
          {found.entity.materialIds.map((mid, i) => (
            <MaterialSelect
              key={i}
              scene={scene}
              label={i === 0 ? 'Primary material' : `Material ${i + 1}`}
              value={mid}
              onChange={(materialId) => {
                const object = { ...found.entity, materialIds: found.entity.materialIds.map((m, j) => (j === i ? materialId : m)) };
                const { id: _id, ...rest } = object;
                applyPatch(makePatch(`Rematerial ${found.entity.name}`, [{ type: 'replace_object', objectId: found.entity.id, object: rest }]));
              }}
            />
          ))}
          <button
            className="w-full rounded border border-red-900 bg-red-950 px-2 py-1.5 text-xs text-red-300 hover:border-red-700"
            onClick={() => applyPatch(makePatch(`Remove ${found.entity.name}`, [{ type: 'remove_object', objectId: found.entity.id }]))}
          >
            Remove from room
          </button>
          <LockToggle scene={scene} entityId={found.entity.id} />
        </>
      )}

      {found.type === 'stair' && (
        <>
          {header('Staircase', `${found.entity.kind} · rises ${mmToDisplay(found.entity.totalRise, 'metric')}`)}
          <MaterialSelect
            scene={scene}
            label="Step material"
            value={found.entity.materialId}
            onChange={() => {
              /* stair material swap ships with update_stair op in P2 */
            }}
          />
          <LockToggle scene={scene} entityId={found.entity.id} />
        </>
      )}

      {(found.type === 'opening' || found.type === 'light' || found.type === 'material') && (
        <div className="text-sm text-neutral-500">Editing for this entity type arrives in Phase 2.</div>
      )}
    </div>
  );
}
