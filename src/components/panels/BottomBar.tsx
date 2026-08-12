import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { makePatch } from '@lib/scene/patching';
import { fetchVariants } from '../../api';
import { BatchRenderDialog } from '../ui/BatchRenderDialog';
import { Button } from '../ui/Button';
import { Icon, type IconName } from '../ui/Icon';
import { FOCUS_RING } from '../ui/primitives';
import { useEditor, type ViewMode } from '../../store/editor-store';
import { reportError } from '../../store/error-store';
import { useProfile } from '../../store/profile-store';
import { useT } from '../../i18n';

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
  const t = useT();
  const projectId = useEditor((s) => s.projectId);
  const scene = useEditor((s) => s.scene);
  const undo = useEditor((s) => s.undo);
  const applyPatch = useEditor((s) => s.applyPatch);
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
  const studioName = useProfile((s) => s.studioName);

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
  const [batchOpen, setBatchOpen] = useState(false);

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
          {t('Undo')}
        </Button>
        <Button variant="ghost" size="sm" icon="redo" disabled={redoCount === 0} onClick={redo} title="Redo (⇧⌘Z)">
          {t('Redo')}
        </Button>
      </div>

      {scene && (
        <div className={SEG_GROUP}>
          {scene.floors.map((floor) => (
            <Seg key={floor.id} active={activeFloorId === floor.id} onClick={() => setActiveFloor(floor.id)}>
              {floor.name}
            </Seg>
          ))}
          <Seg
            active={false}
            onClick={() => {
              // Tower/multi-unit workflow: clone the active floor N times, one
              // undoable step per copy. Levels stack above the current top.
              const src = scene.floors.find((f) => f.id === activeFloorId) ?? scene.floors[0];
              if (!src) return;
              const raw = window.prompt(`Duplicate "${src.name}" — how many copies?`, '1');
              if (!raw) return;
              const count = Math.min(50, Math.max(1, Math.floor(Number(raw))));
              if (!Number.isFinite(count) || count < 1) return;
              let level = Math.max(...scene.floors.map((f) => f.level));
              for (let i = 0; i < count; i += 1) {
                level += 1;
                const newFloorId = `floor-${Date.now().toString(36)}${i.toString(36)}`;
                applyPatch(
                  makePatch(`Duplicate floor ${src.name}`, [
                    { type: 'duplicate_floor', floorId: src.id, newFloorId, name: `Level ${level}`, level },
                  ]),
                );
              }
            }}
            title="Duplicate the current floor (towers: enter how many copies)"
          >
            <Icon name="plus" />
          </Seg>
        </div>
      )}

      <div className={SEG_GROUP}>
        {VIEW_MODES.map((mode) => (
          <Seg key={mode.id} active={viewMode === mode.id} onClick={() => setViewMode(mode.id)}>
            <Icon name={mode.icon} /> {t(mode.label)}
          </Seg>
        ))}
        <Seg active={viewMode === 'tour'} onClick={startTour} title="Guided walkthrough through each room">
          <Icon name="play" /> {t('Tour')}
        </Seg>
      </div>
      {viewMode === 'walk' && (
        <span className="hidden flex-shrink-0 rounded-lg bg-wash px-2.5 py-1.5 text-xs font-semibold text-accent lg:inline">
          Drag to look · WASD to move
        </span>
      )}

      <div className="ml-auto flex flex-shrink-0 items-center gap-1.5">
        <Button variant="secondary" size="sm" icon="camera" onClick={() => void onSavePhoto()} disabled={!canShoot || shooting} title="Export a PNG of the current view">
          {shooting ? t('Saving…') : t('Photo')}
        </Button>
        <Button variant="primary" size="sm" icon="sun" onClick={() => setPhotoMode(true)} title="Photoreal path-traced render (GPU)">
          {t('Photoreal')}
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
            {rendering ? t('Rendering…') : 'Cycles'}
          </Button>
        )}
        {blenderAvailable && (
          <Button
            variant="secondary"
            size="sm"
            icon="sparkles"
            onClick={() => setBatchOpen(true)}
            disabled={!scene}
            title="Queue a Cycles render of every room + floor overviews — runs in the background"
          >
            {t('Render all')}
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
          {showBefore ? t('Before') : t('Before/After')}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          icon="columns"
          onClick={() => setCompareMode(compareMode === 'slider' ? 'off' : 'slider')}
          title="Drag a slider to wipe between the baseline and your edits"
          className={compareMode === 'slider' ? 'border-accent bg-accent text-white hover:bg-[#403bd6]' : ''}
        >
          {t('Slider')}
        </Button>

        <span className="mx-0.5 h-[26px] w-px bg-line" />

        <select
          className="h-8 rounded-[9px] border border-line bg-panel px-2.5 text-xs font-semibold text-dim focus:border-accent focus:outline-none"
          value={activeVariantId ?? ''}
          onChange={(e) => e.target.value && void loadVariant(e.target.value)}
        >
          <option value="">{t('Variants…')}</option>
          {variants.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
        <Button variant="secondary" size="sm" icon="save" onClick={() => void onSave()} disabled={saving}>
          {saving ? t('Saving…') : t('Save')}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          icon="share"
          title="Download a self-contained interactive 3D viewer (single HTML file) to send to your client"
          onClick={() => {
            const brand = studioName.trim();
            const a = document.createElement('a');
            a.href = `/api/scenes/${projectId}/viewer${brand ? `?brand=${encodeURIComponent(brand)}` : ''}`;
            a.download = '';
            a.click();
          }}
        >
          {t('Share')}
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
          {t('Export')}
        </Button>
      </div>
      <BatchRenderDialog open={batchOpen} onClose={() => setBatchOpen(false)} projectId={projectId} />
    </div>
  );
}
