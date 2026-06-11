import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { commit } from '@lib/scene/commit';
import { makePatch, type ScenePatch } from '@lib/scene/patching';
import { SCHEMA_VERSION, type DesignVariant, type HomeScene, type Opening } from '@lib/scene/schemas';
import { findEntity, lockedEntityIds } from '@lib/scene/selectors';
import {
  isStructuralColumn,
  STRUCTURAL_DELETE_CONFIRM,
  STRUCTURAL_DELETE_MESSAGE,
  STRUCTURAL_DELETE_TITLE,
} from '@lib/furniture/structural';
import type { Calibration } from '@lib/tracing/coords';
import {
  STEP_HELP,
  STEP_TITLES,
  WIZARD_STEPS,
  canAdvance,
  initWizard,
  nextStep,
  prevStep,
  type WizardState,
} from '@lib/tracing/wizard';
import { Plan2DEditor, type PlanTool } from '../components/plan/Plan2DEditor';
import { ScenePreview3D } from '../components/canvas/ScenePreview3D';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { StairControls } from '../components/inspector/StairControls';
import { RoomNameEditor } from '../components/inspector/RoomNameEditor';
import { Icon } from '../components/ui/Icon';
import { fetchPrivateManifest, fetchScene, fetchVariant, fetchVariants, privateFileUrl, saveManualScene, saveRasterizedPage, saveVariantRemote } from '../api';
import { loadRasterImage, rasterizePdf } from '../lib/pdf';
import { useEditor } from '../store/editor-store';
import { reportError } from '../store/error-store';

const UNDO_LIMIT = 60; // tracing-local history depth

const TOOLS_TRACE: { id: PlanTool; label: string }[] = [
  { id: 'wall', label: 'Wall' },
  { id: 'select', label: 'Select' },
  { id: 'pan', label: 'Pan' },
];
const TOOLS_ROOMS: { id: PlanTool; label: string }[] = [
  { id: 'wall', label: 'Wall' },
  { id: 'room', label: 'Room' },
  { id: 'door', label: 'Door' },
  { id: 'window', label: 'Window' },
  { id: 'select', label: 'Select' },
  { id: 'pan', label: 'Pan' },
];

/** Width (and head/sill) editor for a selected door/window. Commits on blur/Enter. */
function OpeningEditor({ opening, apply }: { opening: Opening; apply: (p: ScenePatch) => void }) {
  const [w, setW] = useState(String(Math.round(opening.width)));
  useEffect(() => setW(String(Math.round(opening.width))), [opening.id, opening.width]);
  const commitWidth = () => {
    const n = Number(w);
    if (n > 0 && n !== Math.round(opening.width)) {
      apply(makePatch('Opening width', [{ type: 'update_opening', openingId: opening.id, patch: { width: n } }]));
    }
  };
  return (
    <div>
      <div className="mb-1 text-xs uppercase tracking-wide text-neutral-500">{opening.kind === 'door' ? 'Door' : 'Window'}</div>
      <label className="block text-xs text-neutral-400">
        Width (mm)
        <input
          type="number"
          min={300}
          step={50}
          value={w}
          onChange={(e) => setW(e.target.value)}
          onBlur={commitWidth}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          className="mt-1 w-full rounded border border-panel-border bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100"
        />
      </label>
    </div>
  );
}

export function VerifyPage() {
  const navigate = useNavigate();
  const loadSceneObject = useEditor((s) => s.loadSceneObject);
  const setViewMode = useEditor((s) => s.setViewMode);

  const { data: manifest } = useQuery({ queryKey: ['private-manifest'], queryFn: fetchPrivateManifest });
  const { data: versions, refetch: refetchVersions } = useQuery({ queryKey: ['my-home-versions'], queryFn: () => fetchVariants('my-home') });
  const [scene, setScene] = useState<HomeScene | null>(null);
  const [floorId, setFloorId] = useState<string>('floor-lower');
  const [wizard, setWizard] = useState<WizardState>(initWizard());
  const [tool, setTool] = useState<PlanTool>('wall');
  const [underlayUrls, setUnderlayUrls] = useState<Record<string, string>>({});
  const [selection, setSelection] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null); // structural pillar awaiting confirm
  const [show3D, setShow3D] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // Tracing-local undo/redo (separate from the main canvas history): every edit
  // snapshots the prior scene so a delete/move can be stepped back.
  const [undoStack, setUndoStack] = useState<HomeScene[]>([]);
  const [redoStack, setRedoStack] = useState<HomeScene[]>([]);

  // Live 3D preview is a dollhouse: keep ceilings off (they hide the interior).
  useEffect(() => {
    setViewMode('orbit');
  }, [setViewMode]);

  // Start from the current my-home trace so you correct it against the real plan.
  useEffect(() => {
    void fetchScene('my-home').then((s) => {
      if (!s) return;
      setScene(s);
      const f0 = s.floors[0];
      setFloorId(f0?.id ?? 'floor-lower');
      // Already traced (underlay + calibration baked in)? Jump straight to
      // editing instead of the file picker, so this is a fine-tuning pass.
      if (f0?.underlay && f0.calibration && f0.walls.length > 0) {
        setWizard((w) => ({ ...w, step: 'rooms', hasUnderlay: true, calibrated: true, wallCount: f0.walls.length, roomCount: f0.rooms.length }));
      }
    });
  }, []);

  const floor = scene?.floors.find((f) => f.id === floorId) ?? null;
  const calibration: Calibration | null = floor?.calibration ?? null;
  const selOpening = selection ? (floor?.openings.find((o) => o.id === selection) ?? null) : null;
  const selStair = selection ? (floor?.stairs.find((s) => s.id === selection) ?? null) : null;
  const selRoom = selection ? (floor?.rooms.find((r) => r.id === selection) ?? null) : null;
  const underlayUrl = underlayUrls[floorId] ?? (floor?.underlay ? privateFileUrl(floor.underlay.filePath) : null);

  const wstate: WizardState = useMemo(
    () => ({
      ...wizard,
      hasUnderlay: !!floor?.underlay,
      calibrated: !!floor?.calibration,
      wallCount: floor?.walls.length ?? 0,
      roomCount: floor?.rooms.length ?? 0,
    }),
    [wizard, floor],
  );

  function apply(patch: ScenePatch, track = true) {
    if (!scene) return;
    const res = commit(scene, patch);
    if (res.ok) {
      if (track) {
        setUndoStack((s) => [...s, scene].slice(-UNDO_LIMIT));
        setRedoStack([]);
      }
      setScene(res.scene);
      setErr(null);
    } else {
      const msg = res.errors[0]?.message ?? 'change rejected';
      setErr(msg);
      // Surface it prominently too: a silently-rejected edit is the usual reason
      // an action (and therefore undo) "does nothing" — now you see why.
      reportError(`Edit rejected: ${msg}`, { kind: 'rejected' });
    }
  }

  const undo = useCallback(() => {
    if (undoStack.length === 0 || !scene) return;
    const prev = undoStack[undoStack.length - 1]!;
    setRedoStack((r) => [...r, scene].slice(-UNDO_LIMIT));
    setUndoStack((s) => s.slice(0, -1));
    setScene(prev);
    setSelection(null);
    setErr(null);
  }, [undoStack, scene]);

  const redo = useCallback(() => {
    if (redoStack.length === 0 || !scene) return;
    const next = redoStack[redoStack.length - 1]!;
    setUndoStack((u) => [...u, scene].slice(-UNDO_LIMIT));
    setRedoStack((r) => r.slice(0, -1));
    setScene(next);
    setSelection(null);
    setErr(null);
  }, [redoStack, scene]);

  // ⌘/Ctrl+Z to undo, ⇧⌘Z or ⌘Y to redo while tracing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((k === 'z' && e.shiftKey) || k === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  // Delete / Backspace removes the selected wall/room/opening (unless typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (pendingDeleteId || !selection) return; // ignore while a confirm dialog is open
      e.preventDefault();
      deleteSelection();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, scene, pendingDeleteId]);

  // Close the pillar-delete dialog if its target stops being the selection or
  // leaves the scene (selection change, undo/redo, version load) — otherwise a
  // confirm would act on a stale entity.
  useEffect(() => {
    if (pendingDeleteId && (pendingDeleteId !== selection || !scene || !findEntity(scene, pendingDeleteId))) {
      setPendingDeleteId(null);
    }
  }, [pendingDeleteId, selection, scene]);

  const planFiles = (manifest?.files ?? []).filter(
    (f) => f.mimeType === 'application/pdf' || f.mimeType.startsWith('image/'),
  );

  async function pickFile(filePath: string, mime: string) {
    if (!scene) return;
    setBusy('Rasterizing plan…');
    try {
      const url = privateFileUrl(filePath);
      const raster = mime === 'application/pdf' ? await rasterizePdf(url, 1, 2) : await loadRasterImage(url);
      const name = `${floorId}-${filePath.split(/[\\/]/).pop()}`.replace(/\.[^.]+$/, '');
      const savedPath = (await saveRasterizedPage(name, raster.dataUrl)) ?? filePath;
      setUnderlayUrls((u) => ({ ...u, [floorId]: raster.dataUrl }));
      apply(
        makePatch('Set plan underlay', [
          { type: 'set_floor_underlay', floorId, underlay: { filePath: savedPath, opacity: 0.55, widthPx: raster.widthPx, heightPx: raster.heightPx, page: raster.page } },
        ]),
      );
      setWizard((w) => nextStep({ ...w, hasUnderlay: true, calibrated: !!floor?.calibration, wallCount: 0, roomCount: 0 }));
    } catch (e) {
      const msg = `Could not load plan: ${(e as Error).message}`;
      const stack = (e as Error).stack;
      setErr(msg);
      reportError(msg, { kind: 'runtime', ...(stack ? { detail: stack } : {}) });
    } finally {
      setBusy(null);
    }
  }

  function onCalibrate(cal: Calibration) {
    apply(makePatch('Set scale', [{ type: 'set_floor_calibration', floorId, calibration: cal }]));
  }

  function setOpacity(o: number) {
    // not undo-tracked: a slider drag fires many ticks
    if (floor?.underlay) apply(makePatch('Underlay opacity', [{ type: 'set_underlay_opacity', floorId, opacity: o }]), false);
  }

  /** Build + apply the remove patch for any deletable entity id. */
  function removeEntity(id: string) {
    if (!scene) return;
    const found = findEntity(scene, id);
    if (!found) return;
    const op =
      found.type === 'wall'
        ? { type: 'remove_wall' as const, wallId: id }
        : found.type === 'room'
          ? { type: 'remove_room' as const, roomId: id }
          : found.type === 'opening'
            ? { type: 'remove_opening' as const, openingId: id }
            : found.type === 'furniture'
              ? { type: 'remove_object' as const, objectId: id }
              : found.type === 'stair'
                ? { type: 'remove_stair' as const, stairId: id }
                : null;
    if (op) {
      apply(makePatch('Delete', [op]));
      if (selection === id) setSelection(null);
    }
  }

  function deleteSelection() {
    if (!scene || !selection) return;
    setErr(null); // don't leave a stale rejection banner over a fresh attempt
    const found = findEntity(scene, selection);
    if (!found) return;
    if (found.type === 'furniture' && isStructuralColumn(found.entity)) {
      // Removing a pillar mutates its room's furnitureIds; if that room (or the
      // pillar) is locked the commit would be rejected after the user confirms —
      // so catch it up front with a clear, actionable message instead.
      const locked = lockedEntityIds(scene);
      if (locked.has(found.entity.id) || locked.has(found.entity.roomId)) {
        reportError('This pillar (or its room) is locked — unlock it first to delete the pillar.', { kind: 'rejected' });
        return;
      }
      // Structural pillar: confirm before deleting.
      setPendingDeleteId(selection);
      return;
    }
    removeEntity(selection);
  }

  function confirmPendingDelete() {
    const id = pendingDeleteId;
    setPendingDeleteId(null); // close the dialog first
    if (id) removeEntity(id);
  }

  async function finish() {
    if (!scene) return;
    setBusy('Saving…');
    const ok = await saveManualScene(scene);
    if (!ok) reportError("Couldn't save your trace before opening 3D — is the local server running?", { kind: 'network' });
    loadSceneObject('my-home', scene);
    setBusy(null);
    navigate('/design/my-home');
  }

  /** Persist the working scene so a reload keeps your edits (no version named). */
  async function quickSave() {
    if (!scene) return;
    setBusy('Saving…');
    const ok = await saveManualScene(scene);
    setBusy(ok ? 'Saved ✓' : null);
    if (ok) setTimeout(() => setBusy(null), 1200);
    else {
      setErr('Could not save');
      reportError("Couldn't save your trace to disk — is the local server running?", { kind: 'network' });
    }
  }

  /** Save the current scene as a named version file you can reload later. */
  async function saveVersion() {
    if (!scene) return;
    const name = window.prompt('Name this version (e.g. "lower walls aligned")');
    if (!name) return;
    setBusy('Saving version…');
    const variant: DesignVariant = {
      meta: {
        schemaVersion: SCHEMA_VERSION,
        id: `variant-${Date.now().toString(36)}`,
        projectId: 'my-home',
        name,
        styleTags: [...new Set(scene.floors.flatMap((f) => f.rooms.flatMap((r) => r.styleTags)))],
        createdAt: new Date().toISOString(),
      },
      scene,
    };
    const ok = await saveVariantRemote('my-home', variant);
    await saveManualScene(scene); // also keep it as the working scene
    await refetchVersions();
    setBusy(ok ? 'Version saved ✓' : null);
    if (ok) setTimeout(() => setBusy(null), 1400);
    else {
      setErr('Could not save version');
      reportError("Couldn't save this version — is the local server running?", { kind: 'network' });
    }
  }

  async function loadVersion(variantId: string) {
    const v = await fetchVariant('my-home', variantId);
    if (!v) return;
    setScene(v.scene);
    setFloorId(v.scene.floors[0]?.id ?? 'floor-lower');
    setSelection(null);
    setUndoStack([]); // loaded version is a fresh baseline
    setRedoStack([]);
    setBusy('Version loaded ✓');
    setTimeout(() => setBusy(null), 1200);
  }

  // step-aware tool defaults
  useEffect(() => {
    if (wstate.step === 'scale') setTool('calibrate');
    else if (wstate.step === 'trace') setTool('wall');
    else if (wstate.step === 'rooms') setTool('select'); // fine-tuning: select+drag by default
  }, [wstate.step]);

  if (!scene || !floor) {
    return (
      <div className="flex h-screen items-center justify-center bg-canvas-bg text-neutral-400">
        Loading your home…{' '}
        <Link to="/" className="ml-2 text-accent">
          home
        </Link>
      </div>
    );
  }

  const stepIdx = WIZARD_STEPS.indexOf(wstate.step);
  const showEditor = wstate.step === 'scale' || wstate.step === 'trace' || wstate.step === 'rooms' || wstate.step === 'review';
  const tools = wstate.step === 'rooms' ? TOOLS_ROOMS : TOOLS_TRACE;

  return (
    <div className="flex h-screen flex-col bg-canvas-bg text-neutral-100">
      <header className="flex items-center gap-3 border-b border-panel-border bg-panel px-4 py-2">
        <Link to="/" className="text-sm font-semibold text-accent">HomeCanvas AI</Link>
        <span className="text-xs text-neutral-500">Trace your plan</span>
        <div className="ml-4 flex items-center gap-1.5">
          {scene.floors.map((f) => (
            <button
              key={f.id}
              onClick={() => setFloorId(f.id)}
              className={`rounded px-2 py-1 text-xs ${floorId === f.id ? 'bg-accent/25 text-accent' : 'bg-neutral-800 text-neutral-300'}`}
            >
              {f.name}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2 text-xs text-neutral-500">
          {WIZARD_STEPS.slice(0, 5).map((s, i) => (
            <span key={s} className={i === stepIdx ? 'font-semibold text-accent' : ''}>
              {i + 1}. {STEP_TITLES[s]}
            </span>
          ))}
        </div>
      </header>

      <div className="flex items-center gap-3 border-b border-panel-border bg-panel/60 px-4 py-2">
        <div className="text-sm">
          <span className="font-semibold text-neutral-100">{STEP_TITLES[wstate.step]}.</span>{' '}
          <span className="text-neutral-400">{STEP_HELP[wstate.step]}</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setWizard((w) => prevStep({ ...wstate, ...w }))}
            disabled={stepIdx === 0}
            className="rounded bg-neutral-800 px-3 py-1.5 text-xs text-neutral-200 enabled:hover:bg-neutral-700 disabled:opacity-40"
          >
            ‹ Back
          </button>
          {wstate.step === 'review' ? (
            <button onClick={() => void finish()} className="rounded bg-accent/30 px-3 py-1.5 text-xs text-accent hover:bg-accent/40">
              Save &amp; open in 3D →
            </button>
          ) : (
            <button
              onClick={() => setWizard((w) => nextStep({ ...wstate, ...w }))}
              disabled={!canAdvance(wstate)}
              className="rounded bg-accent/25 px-3 py-1.5 text-xs text-accent enabled:hover:bg-accent/35 disabled:opacity-40"
            >
              Next ›
            </button>
          )}
        </div>
      </div>

      {err && <div className="bg-red-950/80 px-4 py-1 text-xs text-red-200">{err}</div>}
      {busy && <div className="bg-accent/15 px-4 py-1 text-xs text-accent">{busy}</div>}

      <ConfirmDialog
        open={!!pendingDeleteId}
        title={STRUCTURAL_DELETE_TITLE}
        message={STRUCTURAL_DELETE_MESSAGE}
        confirmLabel={STRUCTURAL_DELETE_CONFIRM}
        onConfirm={confirmPendingDelete}
        onCancel={() => setPendingDeleteId(null)}
      />

      <div className="flex min-h-0 flex-1">
        {wstate.step === 'pickFile' ? (
          <div className="flex-1 overflow-y-auto p-6">
            <h2 className="mb-3 text-sm font-semibold">Pick the plan page for {floor.name}</h2>
            {planFiles.length === 0 ? (
              <p className="text-sm text-neutral-400">
                No plan files found. Drop a PDF or image into{' '}
                <code className="text-xs">private-home-inputs/raw/</code> and reload.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {planFiles.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => void pickFile(f.filePath, f.mimeType)}
                    className="rounded-lg border border-panel-border bg-panel p-3 text-left hover:border-accent/50"
                  >
                    <div className="text-sm text-neutral-200">{f.fileName}</div>
                    <div className="mt-1 text-xs text-neutral-500">
                      {f.role} · {(f.bytes / 1024).toFixed(0)} KB · {f.mimeType.includes('pdf') ? 'PDF' : 'image'}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : showEditor ? (
          <>
            <div className="flex w-44 flex-col gap-3 border-r border-panel-border bg-panel p-3">
              {wstate.step !== 'scale' && wstate.step !== 'review' && (
                <div>
                  <div className="mb-1 text-xs uppercase tracking-wide text-neutral-500">Tool</div>
                  <div className="flex flex-col gap-1">
                    {tools.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setTool(t.id)}
                        className={`rounded px-2 py-1.5 text-left text-xs ${tool === t.id ? 'bg-accent/25 text-accent' : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'}`}
                      >
                        {t.label}
                      </button>
                    ))}
                    {selection && (
                      <button onClick={deleteSelection} className="mt-1 rounded bg-red-950 px-2 py-1.5 text-left text-xs text-red-300 hover:bg-red-900">
                        Delete selected
                      </button>
                    )}
                  </div>
                  <div className="mt-2 flex gap-1.5">
                    <button
                      onClick={undo}
                      disabled={undoStack.length === 0}
                      title="Undo (⌘Z)"
                      className="inline-flex flex-1 items-center justify-center gap-1 rounded bg-neutral-800 px-2 py-1.5 text-xs text-neutral-200 enabled:hover:bg-neutral-700 disabled:opacity-40"
                    >
                      <Icon name="undo" /> Undo
                    </button>
                    <button
                      onClick={redo}
                      disabled={redoStack.length === 0}
                      title="Redo (⇧⌘Z)"
                      className="inline-flex flex-1 items-center justify-center gap-1 rounded bg-neutral-800 px-2 py-1.5 text-xs text-neutral-200 enabled:hover:bg-neutral-700 disabled:opacity-40"
                    >
                      <Icon name="redo" /> Redo
                    </button>
                  </div>
                  <p className="mt-1 text-[10px] text-neutral-500">Del/⌫ deletes the selected item.</p>
                  {selRoom && <div className="mt-3"><RoomNameEditor room={selRoom} onPatch={apply} /></div>}
                  {selOpening && <div className="mt-3"><OpeningEditor opening={selOpening} apply={apply} /></div>}
                  {selStair && (
                    <div className="mt-3">
                      <div className="mb-1 text-xs uppercase tracking-wide text-neutral-500">Staircase</div>
                      <StairControls stair={selStair} materials={scene.materials} onPatch={apply} />
                    </div>
                  )}
                </div>
              )}
              {wstate.step === 'scale' && (
                <div className="text-xs text-neutral-400">
                  Click two points along a known dimension, then type its length. The plan rescales to real-world mm.
                  {calibration && <div className="mt-2 text-emerald-400">✓ scale set ({calibration.mmPerPx.toFixed(1)} mm/px)</div>}
                </div>
              )}
              {floor.underlay && (
                <label className="block text-xs text-neutral-400">
                  Plan opacity
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    defaultValue={floor.underlay.opacity}
                    onChange={(e) => setOpacity(Number(e.target.value))}
                    className="mt-1 w-full"
                  />
                </label>
              )}
              {tool === 'select' && (
                <p className="text-[11px] leading-snug text-neutral-500">
                  Drag a wall to move it (end-dots move one end), a room’s corner-dots to resize, or a door/window dot along its wall. Click any element, then “Delete selected” to remove it.
                </p>
              )}
              <button
                onClick={() => setShow3D((v) => !v)}
                className="rounded bg-neutral-800 px-2 py-1.5 text-left text-xs text-neutral-300 hover:bg-neutral-700"
              >
                <span className="inline-flex items-center gap-1.5"><Icon name="columns" /> {show3D ? 'Hide live 3D' : 'Show live 3D'}</span>
              </button>

              <div className="mt-3 border-t border-panel-border pt-2">
                <div className="mb-1 text-xs uppercase tracking-wide text-neutral-500">Versions</div>
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => void quickSave()}
                    className="rounded bg-neutral-800 px-2 py-1.5 text-left text-xs text-neutral-100 hover:bg-neutral-700"
                  >
                    <span className="inline-flex items-center gap-1.5"><Icon name="save" /> Save (keep my edits)</span>
                  </button>
                  <button
                    onClick={() => void saveVersion()}
                    className="rounded bg-accent/20 px-2 py-1.5 text-left text-xs text-accent hover:bg-accent/30"
                  >
                    <span className="inline-flex items-center gap-1.5"><Icon name="plus" /> Save as version…</span>
                  </button>
                  {versions && versions.length > 0 && (
                    <select
                      defaultValue=""
                      onChange={(e) => {
                        if (e.target.value) void loadVersion(e.target.value);
                        e.currentTarget.selectedIndex = 0;
                      }}
                      className="rounded border border-panel-border bg-neutral-800 px-2 py-1.5 text-xs text-neutral-200"
                    >
                      <option value="" disabled>
                        Load a version… ({versions.length})
                      </option>
                      {versions.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              <div className="mt-auto text-xs text-neutral-500">
                {floor.walls.length} walls · {floor.rooms.length} rooms · {floor.openings.length} openings
              </div>
            </div>
            <div className="relative min-w-0 flex-1 border-r border-panel-border">
              <Plan2DEditor
                floor={floor}
                underlayUrl={underlayUrl}
                calibration={calibration}
                tool={tool}
                onPatch={apply}
                onCalibrate={onCalibrate}
                onSelect={setSelection}
                selectionId={selection}
              />
            </div>
            {show3D && (
              <div className="relative min-w-0 flex-1">
                <ScenePreview3D scene={scene} floorId={floorId} onPick={setSelection} selectedId={selection} />
                <div className="pointer-events-none absolute left-2 top-2 rounded bg-black/55 px-2 py-1 text-[11px] text-neutral-200">
                  Live 3D · {floor.name} · updates on each edit
                </div>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
