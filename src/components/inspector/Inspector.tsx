import { useRef, useState } from 'react';
import { designPackName, designRoomPatch } from '@lib/agent/autodesign';
import { CATALOG, placeFurnitureInRoom, uniqueFurnitureId, type CatalogKey } from '@lib/furniture/catalog';
import { autoFurnishRoom } from '@lib/furniture/auto-furnish';
import { polygonArea } from '@lib/geometry/rooms';
import { makePatch, type PatchOp } from '@lib/scene/patching';
import type { FurnitureObject, HomeScene, Material, Room } from '@lib/scene/schemas';
import { findEntity, findWall, lockedEntityIds } from '@lib/scene/selectors';
import { mmToDisplay } from '@lib/geometry/scale';
import { wallSideFacingRoom } from '@lib/styles/apply';
import {
  isStructuralColumn,
  STRUCTURAL_DELETE_CONFIRM,
  STRUCTURAL_DELETE_MESSAGE,
  STRUCTURAL_DELETE_TITLE,
} from '@lib/furniture/structural';
import { privateFileUrl } from '../../api';
import { useEditor } from '../../store/editor-store';
import { reportError } from '../../store/error-store';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Icon } from '../ui/Icon';
import { RoomNameEditor } from './RoomNameEditor';
import { StairControls } from './StairControls';

/** Room-only extras: wall material/colour, an furniture picker, and one-click auto-design. */
function RoomExtras({ scene, room }: { scene: HomeScene; room: Room }) {
  const applyPatch = useEditor((s) => s.applyPatch);
  const [furnKey, setFurnKey] = useState<CatalogKey>('sofa');
  const locked = lockedEntityIds(scene).has(room.id);

  const setRoomWalls = (mk: (wallId: string, side: 'sideA' | 'sideB') => PatchOp) => {
    const ops: PatchOp[] = [];
    for (const wid of room.wallIds) {
      const fw = findWall(scene, wid);
      if (fw) ops.push(mk(wid, wallSideFacingRoom(fw.wall, room)));
    }
    if (ops.length) applyPatch(makePatch(`Walls of ${room.name}`, ops));
  };

  const firstWall = room.wallIds.map((w) => findWall(scene, w)).find(Boolean);
  const wallValue = firstWall
    ? firstWall.wall.materialIds[wallSideFacingRoom(firstWall.wall, room)]
    : (scene.materials[0]?.id ?? '');

  const addFurniture = () => {
    const floor = scene.floors.find((f) => f.rooms.some((r) => r.id === room.id));
    if (!floor) return;
    const existing = floor.objects.filter((o) => o.roomId === room.id);
    const obj = placeFurnitureInRoom({
      id: uniqueFurnitureId(new Set(floor.objects.map((o) => o.id)), room.id),
      roomId: room.id,
      key: furnKey,
      roomOuter: room.boundary.outer,
      existing,
    });
    if (obj) applyPatch(makePatch(`Add ${CATALOG[furnKey].name}`, [{ type: 'place_furniture', object: obj }]));
  };

  const autoDesign = () => {
    const patch = designRoomPatch(scene, room);
    if (patch) applyPatch(patch);
  };

  // One-click "fill this room": collision-packed suggested pieces from the full
  // catalog (all-furniture), each given a fresh id so re-furnishing stacks more.
  // Note: packs against the pieces it places, not pre-existing ones — drop into
  // empty rooms for the cleanest result (drag/remove handle any overlap).
  const furnishRoom = () => {
    const floor = scene.floors.find((f) => f.rooms.some((r) => r.id === room.id));
    if (!floor) return;
    const used = new Set(floor.objects.map((o) => o.id));
    const pieces = autoFurnishRoom(room).map((p) => {
      const id = uniqueFurnitureId(used, room.id);
      used.add(id);
      return { ...p, id };
    });
    if (pieces.length === 0) return;
    applyPatch(makePatch(`Furnish ${room.name}`, pieces.map((object) => ({ type: 'place_furniture', object }))));
  };

  return (
    <>
      <MaterialSelect
        scene={scene}
        label="Wall material (whole room)"
        value={wallValue}
        onChange={(materialId) =>
          setRoomWalls((wallId, side) => ({ type: 'assign_material_to_surface', surface: { kind: 'wallSide', wallId, side }, materialId }))
        }
      />
      <ColorRow
        label="Quick wall color"
        onPick={(color) => setRoomWalls((wallId, side) => ({ type: 'set_surface_color', surface: { kind: 'wallSide', wallId, side }, color }))}
      />
      <label className="block text-xs text-neutral-400">
        Add furniture
        <div className="mt-1 flex gap-1.5">
          <select
            value={furnKey}
            onChange={(e) => setFurnKey(e.target.value as CatalogKey)}
            className="min-w-0 flex-1 rounded border border-panel-border bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100"
          >
            {Object.entries(CATALOG).map(([k, v]) => (
              <option key={k} value={k}>
                {v.name}
              </option>
            ))}
          </select>
          <button onClick={addFurniture} className="rounded-lg border border-panel-border bg-panel px-3 text-xs font-medium text-neutral-200 transition-colors hover:border-neutral-700 hover:text-neutral-100">
            Add
          </button>
        </div>
      </label>
      <button
        onClick={furnishRoom}
        disabled={locked}
        title={locked ? 'Unlock the room first' : 'Drop a set of suggested pieces into this room'}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-panel-border bg-panel px-2 py-2.5 text-xs font-semibold text-neutral-200 transition-colors enabled:hover:border-neutral-700 enabled:hover:text-neutral-100 disabled:opacity-45"
      >
        <Icon name="plus" className="text-[15px]" /> Furnish this room
      </button>
      <button
        onClick={autoDesign}
        disabled={locked}
        title={locked ? 'Unlock the room first' : `Apply ${designPackName(room)} + place furniture`}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-2 py-2.5 text-xs font-semibold text-white shadow-sm shadow-accent/25 transition-colors enabled:hover:bg-[#403bd6] disabled:opacity-45"
      >
        <Icon name="sparkles" className="text-[15px]" /> Auto-design this room
      </button>
    </>
  );
}

/**
 * Reference images attached in the chat, persisted on the scene. Shows the
 * thumbnail, kind, extracted palette and a remove button. When a room is
 * selected, room-scoped references are shown alongside the global ones.
 */
function ReferencesSection({ scene, selectedRoomId }: { scene: HomeScene; selectedRoomId: string | undefined }) {
  const applyPatch = useEditor((s) => s.applyPatch);
  const refs = scene.referenceImages ?? [];
  if (refs.length === 0) return null;
  const shown = selectedRoomId ? refs.filter((r) => !r.roomId || r.roomId === selectedRoomId) : refs;
  if (shown.length === 0) return null;
  return (
    <div className="border-t border-panel-border pt-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">References</h3>
      <div className="grid grid-cols-2 gap-2">
        {shown.map((r) => (
          <div key={r.id} className="rounded-lg border border-panel-border bg-panel p-1.5">
            <img src={privateFileUrl(r.filePath)} alt={r.kind} className="h-16 w-full rounded-md object-cover" />
            <div className="mt-1 flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wide text-neutral-500">{r.kind}</span>
              <button
                onClick={() => applyPatch(makePatch('Remove reference', [{ type: 'remove_reference_image', imageId: r.id }]))}
                className="flex h-5 w-5 items-center justify-center rounded text-[13px] text-neutral-500 hover:bg-neutral-800 hover:text-rose-600"
                title="Remove reference"
              >
                <Icon name="close" />
              </button>
            </div>
            {r.extractedPalette && r.extractedPalette.length > 0 && (
              <div className="mt-1 flex gap-0.5">
                {r.extractedPalette.slice(0, 6).map((c, k) => (
                  <span key={k} className="h-3 flex-1 rounded-sm" style={{ background: c }} title={c} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

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
        className="mt-1 w-full rounded-lg border border-panel-border bg-panel px-2.5 py-2 text-sm text-neutral-100 focus:border-accent focus:outline-none"
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
      className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors ${
        locked
          ? 'border-amber-300 bg-amber-50 text-amber-700'
          : 'border-panel-border bg-panel text-neutral-300 hover:border-neutral-700 hover:text-neutral-100'
      }`}
    >
      <Icon name={locked ? 'lock' : 'unlock'} className="text-[15px]" />
      <span className="font-medium">{locked ? 'Locked' : 'Unlocked'}</span>
      <span className={locked ? 'text-amber-600' : 'text-neutral-500'}>
        {locked ? '· suggestions skip this' : '· click to lock'}
      </span>
    </button>
  );
}

/** "Remove from room" button. Structural pillars get a confirm step first. */
function RemoveFurnitureButton({ object }: { object: FurnitureObject }) {
  const scene = useEditor((s) => s.scene);
  const applyPatch = useEditor((s) => s.applyPatch);
  const [confirming, setConfirming] = useState(false);
  const removingRef = useRef(false); // guard a same-tick double-fire of the confirm
  const structural = isStructuralColumn(object);
  const onClick = () => {
    if (!structural) {
      doRemove();
      return;
    }
    // A locked pillar/room would have its remove_object rejected by the lock
    // gate after the user confirms — surface that up front instead.
    const locked = scene ? lockedEntityIds(scene) : new Set<string>();
    if (locked.has(object.id) || locked.has(object.roomId)) {
      reportError('This pillar (or its room) is locked — unlock it first to delete the pillar.', { kind: 'rejected' });
      return;
    }
    setConfirming(true);
  };
  const doRemove = () => {
    if (removingRef.current) return;
    removingRef.current = true;
    applyPatch(makePatch(`Remove ${object.name}`, [{ type: 'remove_object', objectId: object.id }]));
    setConfirming(false);
  };
  return (
    <>
      <button
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2 py-2 text-xs font-medium text-rose-600 transition-colors hover:border-rose-300 hover:bg-rose-100"
        onClick={onClick}
      >
        <Icon name="trash" className="text-[14px]" />
        {structural ? 'Remove pillar…' : 'Remove from room'}
      </button>
      <ConfirmDialog
        open={confirming}
        title={STRUCTURAL_DELETE_TITLE}
        message={STRUCTURAL_DELETE_MESSAGE}
        confirmLabel={STRUCTURAL_DELETE_CONFIRM}
        onConfirm={doRemove}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}

export function Inspector() {
  const scene = useEditor((s) => s.scene);
  const selection = useEditor((s) => s.selection);
  const applyPatch = useEditor((s) => s.applyPatch);

  if (!scene) return null;
  if (!selection) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <div className="text-sm text-neutral-500">Click a room floor, wall, stair or furniture piece to inspect it.</div>
        <ReferencesSection scene={scene} selectedRoomId={undefined} />
      </div>
    );
  }
  const found = findEntity(scene, selection.id);
  if (!found) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <div className="text-sm text-neutral-500">Selection no longer exists.</div>
        <ReferencesSection scene={scene} selectedRoomId={undefined} />
      </div>
    );
  }

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
          <RoomNameEditor room={found.entity} onPatch={(p) => applyPatch(p)} />
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
          <RoomExtras scene={scene} room={found.entity} />
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
          <RemoveFurnitureButton object={found.entity} />
          <LockToggle scene={scene} entityId={found.entity.id} />
        </>
      )}

      {found.type === 'stair' && (
        <>
          {header('Staircase', `${found.entity.kind} · rises ${mmToDisplay(found.entity.totalRise, 'metric')}`)}
          <StairControls stair={found.entity} materials={scene.materials} onPatch={(p) => applyPatch(p)} />
          <LockToggle scene={scene} entityId={found.entity.id} />
        </>
      )}

      {(found.type === 'opening' || found.type === 'light' || found.type === 'material') && (
        <div className="text-sm text-neutral-500">Editing for this entity type arrives in Phase 2.</div>
      )}

      <ReferencesSection scene={scene} selectedRoomId={found.type === 'room' ? found.entity.id : undefined} />
    </div>
  );
}
