import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchVariants } from '../../api';
import { Icon } from '../ui/Icon';
import { useEditor, type ViewMode } from '../../store/editor-store';

const VIEW_MODES: { id: ViewMode; label: string }[] = [
  { id: 'orbit', label: 'Orbit' },
  { id: 'top', label: 'Top-down' },
  { id: 'walk', label: 'Walk' },
];

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

  const onSave = async () => {
    const name = window.prompt('Variant name (e.g. "Japandi Option")');
    if (!name) return;
    setSaving(true);
    await saveVariant(name);
    setSaving(false);
    void queryClient.invalidateQueries({ queryKey: ['variants', projectId] });
  };

  const button = 'inline-flex items-center gap-1 rounded px-2.5 py-1.5 text-xs text-neutral-200 bg-neutral-800 enabled:hover:bg-neutral-700 disabled:opacity-40';

  return (
    <div className="flex items-center gap-3 border-t border-panel-border bg-panel px-3 py-2">
      <div className="flex gap-1.5">
        <button className={button} disabled={undoCount === 0} onClick={undo} title="Undo (validated replay)">
          <Icon name="undo" /> Undo
        </button>
        <button className={button} disabled={redoCount === 0} onClick={redo}>
          <Icon name="redo" /> Redo
        </button>
      </div>

      <div className="h-5 w-px bg-panel-border" />

      <div className="flex gap-1.5">
        {scene?.floors.map((floor) => (
          <button
            key={floor.id}
            className={`rounded px-2.5 py-1.5 text-xs ${
              activeFloorId === floor.id ? 'bg-accent/25 text-accent' : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
            }`}
            onClick={() => setActiveFloor(floor.id)}
          >
            {floor.name}
          </button>
        ))}
      </div>

      <div className="h-5 w-px bg-panel-border" />

      <div className="flex gap-1.5">
        {VIEW_MODES.map((mode) => (
          <button
            key={mode.id}
            className={`rounded px-2.5 py-1.5 text-xs ${
              viewMode === mode.id ? 'bg-accent/25 text-accent' : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
            }`}
            onClick={() => setViewMode(mode.id)}
          >
            {mode.label}
          </button>
        ))}
        {viewMode === 'walk' && (
          <button id="walk-start" className="rounded bg-accent/30 px-2.5 py-1.5 text-xs text-accent">
            Click to walk (Esc exits)
          </button>
        )}
        <button
          className={`inline-flex items-center gap-1 rounded px-2.5 py-1.5 text-xs ${viewMode === 'tour' ? 'bg-accent/25 text-accent' : 'bg-accent/15 text-accent hover:bg-accent/25'}`}
          onClick={startTour}
          title="Guided walkthrough from the entrance through each room"
        >
          <Icon name="play" /> Tour
        </button>
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <button
          className={button}
          onClick={() => void onSavePhoto()}
          disabled={!canShoot || shooting}
          title="Export a PNG of the current view"
        >
          <Icon name="image" /> {shooting ? 'Saving…' : 'Save photo'}
        </button>
        <button
          className="inline-flex items-center gap-1 rounded px-2.5 py-1.5 text-xs text-accent bg-accent/15 hover:bg-accent/25"
          onClick={() => setPhotoMode(true)}
          title="Photoreal path-traced render (GPU)"
        >
          <Icon name="sparkles" /> Photoreal
        </button>
        <button
          className={`inline-flex items-center gap-1 rounded px-2.5 py-1.5 text-xs ${showBefore ? 'bg-accent/25 text-accent' : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'}`}
          onClick={() => setShowBefore(!showBefore)}
          title="Compare with the scene as loaded"
        >
          <Icon name="compare" /> {showBefore ? 'Showing: Before' : 'Before/After'}
        </button>
        <button
          className={`inline-flex items-center gap-1 rounded px-2.5 py-1.5 text-xs ${compareMode === 'slider' ? 'bg-accent/25 text-accent' : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'}`}
          onClick={() => setCompareMode(compareMode === 'slider' ? 'off' : 'slider')}
          title="Drag a slider to wipe between the loaded baseline and your edits"
        >
          <Icon name="columns" /> Slider
        </button>
        <select
          className="rounded border border-panel-border bg-neutral-900 px-2 py-1.5 text-xs text-neutral-200"
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
        <button className={button} onClick={() => void onSave()} disabled={saving}>
          <Icon name="save" /> {saving ? 'Saving…' : 'Save variant'}
        </button>
        <button
          className={button}
          onClick={() => {
            const a = document.createElement('a');
            a.href = `/api/scenes/${projectId}/export`;
            a.download = '';
            a.click();
          }}
          title="Download this scene as JSON (re-importable)"
        >
          <Icon name="upload" /> Export
        </button>
      </div>
    </div>
  );
}
