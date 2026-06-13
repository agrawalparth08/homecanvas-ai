import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchVariants } from '../../api';
import { Button } from '../ui/Button';
import { Icon, type IconName } from '../ui/Icon';
import { useEditor, type ViewMode } from '../../store/editor-store';

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
      className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors ${
        active ? 'bg-accent text-white shadow-sm shadow-accent/25' : 'text-neutral-400 hover:bg-panel hover:text-neutral-100'
      }`}
    >
      {children}
    </button>
  );
}

const SEG_GROUP = 'flex gap-0.5 rounded-lg border border-panel-border bg-neutral-900 p-0.5';

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

  return (
    <div className="flex items-center gap-2.5 border-t border-panel-border bg-panel px-3 py-2">
      <div className="flex gap-1">
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
        <span className="rounded-md bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent">
          Drag to look · WASD to move
        </span>
      )}

      <div className="ml-auto flex items-center gap-1.5">
        <Button variant="secondary" size="sm" icon="camera" onClick={() => void onSavePhoto()} disabled={!canShoot || shooting} title="Export a PNG of the current view">
          {shooting ? 'Saving…' : 'Photo'}
        </Button>
        <Button variant="primary" size="sm" icon="sparkles" onClick={() => setPhotoMode(true)} title="Photoreal path-traced render (GPU)">
          Photoreal
        </Button>

        <span className="mx-0.5 h-5 w-px bg-panel-border" />

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

        <span className="mx-0.5 h-5 w-px bg-panel-border" />

        <select
          className="h-8 rounded-lg border border-panel-border bg-panel px-2.5 text-xs text-neutral-200 focus:border-accent focus:outline-none"
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
          variant="ghost"
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
