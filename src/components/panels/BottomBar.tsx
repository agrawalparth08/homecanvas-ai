import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchVariants } from '../../api';
import { Button } from '../ui/Button';
import { Icon, type IconName } from '../ui/Icon';
import { FOCUS_RING } from '../ui/primitives';
import { useEditor, type ViewMode } from '../../store/editor-store';
import { reportError } from '../../store/error-store';

const VIEW_MODES: { id: ViewMode; label: string; icon: IconName }[] = [
  { id: 'orbit', label: 'Orbit', icon: 'orbit' },
  { id: 'top', label: 'Top', icon: 'columns' },
  { id: 'walk', label: 'Walk', icon: 'walk' },
];

/** One button inside a segmented control: active = solid accent, else quiet. */
function Seg({ active, onClick, children, title }: { active: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`inline-flex h-[30px] items-center gap-1.5 rounded-[7px] px-3 text-[12.5px] font-semibold transition ${FOCUS_RING} ${
        active ? 'bg-accent text-white' : 'text-dim hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}

const SEG_GROUP = 'flex flex-shrink-0 gap-0.5 rounded-[9px] bg-track p-[3px]';

export function BottomBar() {
  const projectId = useEditor((s) => s.projectId);
  const scene = useEditor((s) => s.scene);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const undoCount = useEditor((s) => s.undoStack.length);
  const redoCount = useEditor((s) => s.redoStack.length);
  const viewMode = useEditor((s) => s.viewMode);
  const setViewMode = useEditor((s) => s.setViewMode);
  const startTour = useEditor((s) => s.startTour);
  const activeFloorId = useEditor((s) => s.activeFloorId);
  const setActiveFloor = useEditor((s) => s.setActiveFloor);
  const showBefore = useEditor((s) => s.showBefore);
  const setShowBefore = useEditor((s) => s.setShowBefore);
  const compareMode = useEditor((s) => s.compareMode);
  const setCompareMode = useEditor((s) => s.setCompareMode);
  const setPhotoMode = useEditor((s) => s.setPhotoMode);
  const saveVariant = useEditor((s) => s.saveVariant);
  const loadVariant = useEditor((s) => s.loadVariant);
  const activeVariantId = useEditor((s) => s.activeVariantId);
  const capturePhoto = useEditor((s) => s.capturePhoto);
  const [shooting, setShooting] = useState(false);

  const onSavePhoto = async () => {
    if (!capturePhoto) return;
    setShooting(true);
    try {
      await capturePhoto();
    } finally {
      setShooting(false);
    }
  };
  // Capture is meant for the settled orbit/top views, not a moving camera.
  const canShoot = !!capturePhoto && viewMode !== 'tour' && viewMode !== 'walk';

  const queryClient = useQueryClient();
  const { data: variants = [] } = useQuery({
    queryKey: ['variants', projectId],
    queryFn: () => fetchVariants(projectId),
  });
  const [saving, setSaving] = useState(false);

  // Optional "quality ceiling": a headless Blender Cycles render of the scene.
  // Only offered when the sidecar finds a Blender binary.
  const { data: blenderAvailable = false } = useQuery({
    queryKey: ['blender-available'],
    queryFn: () => fetch('/api/render/blender/available').then((r) => r.json()).then((d: { available: boolean }) => d.available).catch(() => false),
    staleTime: Infinity,
  });
  const [rendering, setRendering] = useState(false);

  const renderBlender = async () => {
    if (!scene) return;
    setRendering(true);
    try {
      const res = await fetch('/api/render/blender', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scene, samples: 160, res: '1600x1000', gpu: true }),
      });
      if (!res.ok) {
        const reason = (await res.json().catch(() => ({})) as { error?: string }).error ?? `${res.status}`;
        reportError(`Blender render failed: ${reason}`, { kind: 'runtime' });
        return;
      }
      const url = URL.createObjectURL(await res.blob());
      window.open(url, '_blank');
      const a = document.createElement('a');
      a.href = url;
      a.download = `homecanvas-cycles-${Date.now()}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (e) {
      reportError(`Blender render failed: ${(e as Error).message}`, { kind: 'runtime' });
    } finally {
      setRendering(false);
    }
  };

  const onSave = async () => {
    const name = window.prompt('Variant name (e.g. "Japandi Option")');
    if (!name) return;
    setSaving(true);
    await saveVariant(name);
    setSaving(false);
    void queryClient.invalidateQueries({ queryKey: ['variants', projectId] });
  };

  return (
    <div className="flex h-[62px] flex-shrink-0 items-center gap-2.5 overflow-x-auto border-t border-line bg-panel px-4">
      <div className="flex flex-shrink-0 gap-1">
        <Button variant="ghost" size="sm" icon="undo" disabled={undoCount === 0} onClick={undo} title="Undo (⌘Z)">
          Undo
        </Button>
        <Button variant="ghost" size="sm" icon="redo" disabled={redoCount === 0} onClick={redo} title="Redo (⇧⌘Z)">
          Redo
        </Button>
      </div>

      {scene && scene.floors.length > 1 && (
        <div className={SEG_GROUP}>
          {scene.floors.map((floor) => (
            <Seg key={floor.id} active={activeFloorId === floor.id} onClick={() => setActiveFloor(floor.id)}>
              {floor.name}
            </Seg>
          ))}
        </div>
      )}

      <div className={SEG_GROUP}>
        {VIEW_MODES.map((mode) => (
          <Seg key={mode.id} active={viewMode === mode.id} onClick={() => setViewMode(mode.id)}>
            <Icon name={mode.icon} /> {mode.label}
          </Seg>
        ))}
        <Seg active={viewMode === 'tour'} onClick={startTour} title="Guided walkthrough through each room">
          <Icon name="play" /> Tour
        </Seg>
      </div>
      {viewMode === 'walk' && (
        <span className="hidden flex-shrink-0 rounded-lg bg-wash px-2.5 py-1.5 text-xs font-semibold text-accent lg:inline">
          Drag to look · WASD to move
        </span>
      )}

      <div className="ml-auto flex flex-shrink-0 items-center gap-1.5">
        <Button variant="secondary" size="sm" icon="camera" onClick={() => void onSavePhoto()} disabled={!canShoot || shooting} title="Export a PNG of the current view">
          {shooting ? 'Saving…' : 'Photo'}
        </Button>
        <Button variant="primary" size="sm" icon="sun" onClick={() => setPhotoMode(true)} title="Photoreal path-traced render (GPU)">
          Photoreal
        </Button>
        {blenderAvailable && (
          <Button
            variant="secondary"
            size="sm"
            icon="camera"
            onClick={() => void renderBlender()}
            disabled={rendering || !scene}
            title="Max-quality ray-traced still via your local Blender Cycles (slower; opens when done)"
          >
            {rendering ? 'Rendering…' : 'Cycles'}
          </Button>
        )}

        <span className="mx-0.5 h-[26px] w-px bg-line" />

        <Button
          variant="secondary"
          size="sm"
          icon="compare"
          onClick={() => setShowBefore(!showBefore)}
          title="Compare with the scene as loaded"
          className={showBefore ? 'border-accent bg-accent text-white hover:bg-[#403bd6]' : ''}
        >
          {showBefore ? 'Before' : 'Before/After'}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          icon="columns"
          onClick={() => setCompareMode(compareMode === 'slider' ? 'off' : 'slider')}
          title="Drag a slider to wipe between the baseline and your edits"
          className={compareMode === 'slider' ? 'border-accent bg-accent text-white hover:bg-[#403bd6]' : ''}
        >
          Slider
        </Button>

        <span className="mx-0.5 h-[26px] w-px bg-line" />

        <select
          className="h-8 rounded-[9px] border border-line bg-panel px-2.5 text-xs font-semibold text-dim focus:border-accent focus:outline-none"
          value={activeVariantId ?? ''}
          onChange={(e) => e.target.value && void loadVariant(e.target.value)}
        >
          <option value="">Variants…</option>
          {variants.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
        <Button variant="secondary" size="sm" icon="save" onClick={() => void onSave()} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
        <Button
          variant="dark"
          size="sm"
          icon="upload"
          title="Download this scene as JSON (re-importable)"
          onClick={() => {
            const a = document.createElement('a');
            a.href = `/api/scenes/${projectId}/export`;
            a.download = '';
            a.click();
          }}
        >
          Export
        </Button>
      </div>
    </div>
  );
}
