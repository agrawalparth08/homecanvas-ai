import { useEffect, useRef, useState } from 'react';
import { designPackName, designRoomPatch } from '@lib/agent/autodesign';
import { checkBridgeEnabled, runBridge } from '../../agent/claude-bridge-provider';
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
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Icon } from '../ui/Icon';
import { FOCUS_RING, Mono, SectionLabel } from '../ui/primitives';
import { RoomNameEditor } from './RoomNameEditor';
import { StairControls } from './StairControls';

/** Room-only extras: wall material/colour, an furniture picker, and one-click auto-design. */
function RoomExtras({ scene, room }: { scene: HomeScene; room: Room }) {
  const applyPatch = useEditor((s) => s.applyPatch);
  const [furnKey, setFurnKey] = useState<CatalogKey>('sofa');
  // When the Claude bridge is live, "Furnish" asks Claude for a contextual set
  // instead of the deterministic packer (which stays the offline fallback).
  const [bridgeOn, setBridgeOn] = useState(false);
  const [furnishing, setFurnishing] = useState(false);
  useEffect(() => {
    void checkBridgeEnabled().then(setBridgeOn);
  }, []);
  const locked = lockedEntityIds(scene).has(room.id);

  const addMaterial = (m: Omit<Material, 'id'>): string | null => {
    const id = `mat-custom-${Date.now().toString(36)}`;
    return applyPatch(makePatch(`Add material ${m.name}`, [{ type: 'add_material', material: { ...m, id } }])) ? id : null;
  };

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

  // Offline fallback: collision-packed suggested pieces from the full catalog,
  // each given a fresh id so re-furnishing stacks more.
  const staticFurnish = () => {
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

  // Dynamic: ask the local Claude (via the bridge) for a contextual furniture set;
  // its validated place_furniture proposals are applied. Falls back to the static
  // packer if the bridge is off, errors, or returns nothing.
  const furnishRoom = async () => {
    if (!bridgeOn) {
      staticFurnish();
      return;
    }
    setFurnishing(true);
    try {
      const r = await runBridge(
        `Furnish the "${room.name}" (a ${room.kind}) with a realistic, collision-aware furniture set suited to its size and purpose. Propose only place_furniture ops with sensible positions inside the room.`,
        { scene, selectedEntityId: room.id },
      );
      if (r.status === 'ready' && r.proposals.length > 0) {
        const applied = r.proposals.reduce((n, p) => n + (applyPatch(p.patch) ? 1 : 0), 0);
        if (applied === 0) staticFurnish(); // all rejected -> fall back
      } else {
        if (r.status === 'error') reportError(`Furnish via Claude failed (${r.reason}) — used the built-in set.`, { kind: 'runtime' });
        staticFurnish(); // disabled / pending / empty -> fallback
      }
    } finally {
      setFurnishing(false);
    }
  };

  return (
    <>
      <MaterialSelect
        onAddMaterial={addMaterial}
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
      <label className="block text-xs text-faint">
        Add furniture
        <div className="mt-1 flex gap-1.5">
          <select
            value={furnKey}
            onChange={(e) => setFurnKey(e.target.value as CatalogKey)}
            className={`min-w-0 flex-1 rounded-[9px] border border-line bg-field px-2 py-1.5 text-sm text-ink ${FOCUS_RING}`}
          >
            {Object.entries(CATALOG).map(([k, v]) => (
              <option key={k} value={k}>
                {v.name}
              </option>
            ))}
          </select>
          <Button variant="secondary" size="sm" onClick={addFurniture}>
            Add
          </Button>
        </div>
      </label>
      {/* title lives on a wrapper: Button's disabled:pointer-events-none would
          otherwise swallow the tooltip exactly when it explains WHY it's dead. */}
      <span title={locked ? 'Unlock the room first' : bridgeOn ? 'Ask your local Claude to furnish this room' : 'Drop a set of suggested pieces into this room'} className="block w-full">
        <Button
          variant="secondary"
          onClick={() => void furnishRoom()}
          disabled={locked || furnishing}
          className="w-full"
        >
          <Icon name="plus" className="text-[15px]" /> {furnishing ? 'Asking Claude…' : bridgeOn ? 'Furnish (Claude)' : 'Furnish this room'}
        </Button>
      </span>
      <span title={locked ? 'Unlock the room first' : `Apply ${designPackName(room)} + place furniture`} className="block w-full">
        <Button
          variant="primary"
          onClick={autoDesign}
          disabled={locked}
          className="w-full hc-glow"
        >
          <Icon name="sparkles" className="text-[15px]" /> Auto-design this room
        </Button>
      </span>
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
    <div className="border-t border-line pt-3">
      <SectionLabel>References</SectionLabel>
      <div className="mt-2.5 grid grid-cols-2 gap-2">
        {shown.map((r) => (
          <div key={r.id} className="rounded-[13px] border border-line bg-panel p-1.5">
            <img src={privateFileUrl(r.filePath)} alt={r.kind} className="h-16 w-full rounded-md object-cover" />
            <div className="mt-1 flex items-center justify-between">
              <SectionLabel>{r.kind}</SectionLabel>
              <button
                onClick={() => applyPatch(makePatch('Remove reference', [{ type: 'remove_reference_image', imageId: r.id }]))}
                className={`flex h-5 w-5 items-center justify-center rounded text-[13px] text-faint hover:bg-soft hover:text-rose-600 ${FOCUS_RING}`}
                title="Remove reference"
              >
                <Icon name="close" />
              </button>
            </div>
            {r.extractedPalette && r.extractedPalette.length > 0 && (
              <div className="mt-1 flex gap-0.5">
                {r.extractedPalette.slice(0, 6).map((c, k) => (
                  <span key={k} className="h-3 flex-1 rounded" style={{ background: c }} title={c} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Darken a #rrggbb hex toward black by `amt` (0..1) for a subtle swatch gradient. */
function darken(hex: string, amt: number): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1]!, 16);
  const r = Math.max(0, Math.round(((n >> 16) & 255) * (1 - amt)));
  const g = Math.max(0, Math.round(((n >> 8) & 255) * (1 - amt)));
  const b = Math.max(0, Math.round((n & 255) * (1 - amt)));
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/**
 * The signature material swatch grid — a row of material chips (gradient from each
 * material's base colour); the active one gets the accent ring. Same props as the
 * old select, so every call site is unchanged.
 */
/** A custom swatch saved to the cross-project personal library (localStorage). */
interface LibrarySwatch {
  name: string;
  category: Material['category'];
  baseColor: string;
  roughness: number;
}

const LIBRARY_KEY = 'hc-material-library';
function readLibrary(): LibrarySwatch[] {
  try {
    return JSON.parse(localStorage.getItem(LIBRARY_KEY) ?? '[]') as LibrarySwatch[];
  } catch {
    return [];
  }
}
function writeLibrary(items: LibrarySwatch[]) {
  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(items.slice(0, 40)));
  } catch {
    /* private mode — library just doesn't persist */
  }
}

const CUSTOM_CATEGORIES: Material['category'][] = ['paint', 'wood', 'marble', 'ceramicTile', 'stone', 'fabric', 'metal', 'other'];

/**
 * Add-material dialog: name + brand code, category, colour, roughness — with a
 * personal library (Asian Paints codes and the like) that persists across
 * projects. Applies a real add_material patch, so the swatch is undoable and
 * travels with the scene.
 */
function AddMaterialDialog({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (m: Omit<Material, 'id'>) => void;
}) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<Material['category']>('paint');
  const [color, setColor] = useState('#c8b89a');
  const [roughness, setRoughness] = useState(0.85);
  const [saveToLibrary, setSaveToLibrary] = useState(true);
  const [library, setLibrary] = useState<LibrarySwatch[]>(() => readLibrary());
  if (!open) return null;

  const create = (m: LibrarySwatch) => {
    if (saveToLibrary && !library.some((l) => l.name === m.name && l.baseColor === m.baseColor)) {
      const next = [m, ...library];
      setLibrary(next);
      writeLibrary(next);
    }
    onCreate({
      name: m.name,
      category: m.category,
      baseColor: m.baseColor,
      pbr: { roughness: m.roughness, metallic: 0, repeatScale: 600 },
      styleTags: ['custom'],
      sourceReference: 'custom:user',
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl border border-line bg-panel p-5 hc-card" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-[15px] font-bold">Add a material</h3>
        <p className="mt-1 text-[12px] text-faint">Name it like you spec it — brand + code works well.</p>
        <label className="mt-4 block text-xs text-dim">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Asian Paints 8547 Ivory Coast"
            className="mt-1 w-full rounded-[9px] border border-line bg-field px-2.5 py-2 text-sm text-ink outline-none focus:border-accent/60"
          />
        </label>
        <div className="mt-3 flex gap-2.5">
          <label className="flex-1 text-xs text-dim">
            Category
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as Material['category'])}
              className="mt-1 w-full rounded-[9px] border border-line bg-field px-2 py-2 text-sm text-ink"
            >
              {CUSTOM_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-dim">
            Colour
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="mt-1 block h-9 w-16 cursor-pointer rounded-[9px] border border-line bg-transparent"
            />
          </label>
        </div>
        <div className="mt-3">
          <div className="flex justify-between text-xs text-dim">
            <span>Finish (matte → gloss)</span>
            <Mono className="text-ink">{(1 - roughness).toFixed(2)}</Mono>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={1 - roughness}
            onChange={(e) => setRoughness(1 - Number(e.target.value))}
            className="mt-1 w-full accent-[#4b46e5]"
          />
        </div>
        <label className="mt-3 flex items-center gap-2 text-xs text-dim">
          <input type="checkbox" checked={saveToLibrary} onChange={(e) => setSaveToLibrary(e.target.checked)} />
          Save to my library (available in every project)
        </label>
        {library.length > 0 && (
          <div className="mt-4">
            <SectionLabel>My library</SectionLabel>
            <div className="mt-2 grid grid-cols-8 gap-1.5">
              {library.map((l, i) => (
                <button
                  key={`${l.name}-${i}`}
                  type="button"
                  title={`${l.name} — add to this project`}
                  onClick={() => create(l)}
                  className="aspect-square rounded-[7px] ring-1 ring-black/5 transition hover:scale-[1.08]"
                  style={{ background: `linear-gradient(135deg, ${l.baseColor}, ${darken(l.baseColor, 0.22)})` }}
                />
              ))}
            </div>
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!name.trim()}
            onClick={() => create({ name: name.trim(), category, baseColor: color, roughness })}
          >
            Add material
          </Button>
        </div>
      </div>
    </div>
  );
}

function MaterialSelect({
  scene,
  value,
  onChange,
  label,
  onAddMaterial,
}: {
  scene: HomeScene;
  value: string;
  onChange: (materialId: string) => void;
  label: string;
  /** When provided, the grid gets a "+" swatch that opens the add-material dialog. */
  onAddMaterial?: (m: Omit<Material, 'id'>) => string | null;
}) {
  const [adding, setAdding] = useState(false);
  const sorted = [...scene.materials].sort((a, b) => a.name.localeCompare(b.name));
  const selected = sorted.find((m) => m.id === value);
  return (
    <div>
      <SectionLabel>{label}</SectionLabel>
      <div className="mt-2.5 grid grid-cols-5 gap-2">
        {sorted.map((m: Material) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onChange(m.id)}
            title={m.name}
            className={`aspect-square rounded-[9px] transition ${
              m.id === value
                ? 'shadow-[0_0_0_2px_var(--color-accent),0_0_0_4px_#fff]'
                : 'ring-1 ring-black/5 hover:scale-[1.06]'
            }`}
            style={{ background: `linear-gradient(135deg, ${m.baseColor}, ${darken(m.baseColor, 0.22)})` }}
          />
        ))}
        {onAddMaterial && (
          <button
            type="button"
            title="Add a custom material"
            onClick={() => setAdding(true)}
            className={`flex aspect-square items-center justify-center rounded-[9px] border border-dashed border-[#cdd2dc] bg-soft-2 text-[16px] text-faint transition hover:border-accent/50 hover:text-accent ${FOCUS_RING}`}
          >
            +
          </button>
        )}
      </div>
      {selected && <Mono className="mt-2 block text-[11.5px] text-dim">{selected.name}</Mono>}
      {onAddMaterial && (
        <AddMaterialDialog
          open={adding}
          onClose={() => setAdding(false)}
          onCreate={(m) => {
            const id = onAddMaterial(m);
            if (id) onChange(id);
          }}
        />
      )}
    </div>
  );
}

function ColorRow({ label, onPick }: { label: string; onPick: (color: string) => void }) {
  return (
    <label className="flex items-center justify-between text-xs text-dim">
      {label}
      <input
        type="color"
        className="h-7 w-12 cursor-pointer rounded border border-line bg-transparent"
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
      className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors ${FOCUS_RING} ${
        locked
          ? 'border-[#e9c89e] bg-[#fbf0e3] text-[#9a5a1e]'
          : 'border-line bg-panel text-dim hover:bg-soft hover:text-ink'
      }`}
    >
      <Icon name={locked ? 'lock' : 'unlock'} className="text-[15px]" />
      <span className="font-medium">{locked ? 'Locked' : 'Unlocked'}</span>
      <span className={locked ? 'text-warn' : 'text-faint'}>
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

  const addMaterial = (m: Omit<Material, 'id'>): string | null => {
    const id = `mat-custom-${Date.now().toString(36)}`;
    return applyPatch(makePatch(`Add material ${m.name}`, [{ type: 'add_material', material: { ...m, id } }])) ? id : null;
  };

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
      <SectionLabel>Selection</SectionLabel>
      <div className="mt-2 text-[15px] font-bold text-ink">{title}</div>
      <Mono className="text-[11px] text-faint">{subtitle}</Mono>
    </div>
  );

  return (
    <div className="flex flex-col gap-4 p-4">
      {found.type === 'room' && (
        <>
          {header(found.entity.name, `${found.entity.kind} · ${(polygonArea(found.entity.boundary.outer) / 1e6).toFixed(1)} m²${found.entity.openToSky ? ' · open to sky' : ''}`)}
          <RoomNameEditor room={found.entity} onPatch={(p) => applyPatch(p)} />
          <MaterialSelect
        onAddMaterial={addMaterial}
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
        onAddMaterial={addMaterial}
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
        onAddMaterial={addMaterial}
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
        onAddMaterial={addMaterial}
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
        onAddMaterial={addMaterial}
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
