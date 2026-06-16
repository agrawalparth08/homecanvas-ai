import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { SceneCanvas } from '../components/canvas/SceneCanvas';
import { BeforeAfterCompare } from '../components/canvas/BeforeAfterCompare';
import { PhotoMode } from '../components/canvas/PhotoMode';
import { Inspector } from '../components/inspector/Inspector';
import { BottomBar } from '../components/panels/BottomBar';
import { LeftPanel } from '../components/panels/LeftPanel';
import { TourPanel } from '../components/panels/TourPanel';
import { ChatPanel } from '../components/chat/ChatPanel';
import { LogPanel, LogTabBadge } from '../components/log/LogPanel';
import { Icon } from '../components/ui/Icon';
import { useEditor } from '../store/editor-store';
import type { ProjectId } from '../api';

function GuidedEmptyState() {
  const startFromSample = useEditor((s) => s.startFromSample);
  return (
    <div className="flex h-full items-center justify-center">
      <div className="hc-hero max-w-md rounded-xl border border-panel-border p-6">
        <h2 className="text-lg font-semibold text-neutral-100">No “My Home” scene yet</h2>
        <p className="mt-2 text-sm text-neutral-400">
          The app looked for{' '}
          <code className="text-xs">private-home-inputs/processed/scene-json/my-home.scene.json</code> and didn't find
          one. Three ways to get going:
        </p>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-neutral-300">
          <li>
            Drop your floor plan into <code className="text-xs">private-home-inputs/raw/</code> — the upload &amp;
            tracing wizard (Phase 2) will turn it into your home.
          </li>
          <li>Start from the sample home and reshape it room by room.</li>
          <li>
            Run <code className="text-xs">npm run init:private</code> if the folder doesn't exist yet.
          </li>
        </ol>
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => void startFromSample()}
            className="rounded bg-accent/20 px-3 py-2 text-sm text-accent hover:bg-accent/30"
          >
            Start from sample home
          </button>
          <Link to="/upload" className="rounded bg-neutral-800 px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-700">
            Upload flow (Phase 2)
          </Link>
        </div>
      </div>
    </div>
  );
}

export function DesignPage() {
  const params = useParams();
  const projectId = (params['projectId'] === 'my-home' ? 'my-home' : 'sample-home') as ProjectId;
  const loadProject = useEditor((s) => s.loadProject);
  const loading = useEditor((s) => s.loading);
  const guidedEmpty = useEditor((s) => s.guidedEmpty);
  const scene = useEditor((s) => s.scene);
  const showBefore = useEditor((s) => s.showBefore);
  const viewMode = useEditor((s) => s.viewMode);
  const compareMode = useEditor((s) => s.compareMode);
  const baseline = useEditor((s) => s.baseline);
  const activeFloorId = useEditor((s) => s.activeFloorId);
  const photoMode = useEditor((s) => s.photoMode);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const [rightTab, setRightTab] = useState<'inspector' | 'assistant' | 'log'>('inspector');

  useEffect(() => {
    void loadProject(projectId);
  }, [projectId, loadProject]);

  // Cmd/Ctrl+Z to undo, ⇧+that or Cmd/Ctrl+Y to redo — the BottomBar button alone
  // wasn't enough; the keyboard shortcut people reach for first did nothing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
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

  return (
    <div className="flex h-screen flex-col bg-canvas-bg text-neutral-100">
      <header className="flex items-center gap-3 border-b border-panel-border bg-panel px-4 py-2">
        <Link to="/" className="text-sm font-semibold text-accent">
          HomeCanvas AI
        </Link>
        <span className="text-xs text-neutral-500">{scene?.name ?? projectId}</span>
        <Link to="/verify" className="inline-flex items-center gap-1.5 rounded-md bg-accent/12 px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent/20">
          <Icon name="pencil" /> Trace plan
        </Link>
        <Link to="/variants" className="inline-flex items-center gap-1.5 rounded-md bg-accent/12 px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent/20">
          <Icon name="columns" /> Boards
        </Link>
        {showBefore && <span className="rounded bg-accent/20 px-2 py-0.5 text-xs text-accent">BEFORE</span>}
        <span className="ml-auto text-[11px] text-neutral-600">
          local-first · nothing leaves this machine · visualizations are approximations, not construction drawings
        </span>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {loading ? (
          <div className="flex flex-1 items-center justify-center text-neutral-500">Loading scene…</div>
        ) : guidedEmpty ? (
          <div className="flex-1">
            <GuidedEmptyState />
          </div>
        ) : (
          <>
            <LeftPanel />
            <main className="relative min-w-0 flex-1">
              {compareMode === 'slider' && viewMode !== 'tour' && baseline && scene && activeFloorId ? (
                <BeforeAfterCompare baseline={baseline} current={scene} floorId={activeFloorId} />
              ) : (
                <SceneCanvas />
              )}
              {viewMode === 'tour' && <TourPanel />}
              {photoMode && <PhotoMode />}
            </main>
            {viewMode !== 'tour' && (
              <aside className="flex w-80 flex-col border-l border-panel-border bg-panel">
                <div className="flex shrink-0 border-b border-panel-border text-xs font-medium">
                  {(['inspector', 'assistant', 'log'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setRightTab(t)}
                      className={`flex flex-1 items-center justify-center px-3 py-2 capitalize ${rightTab === t ? 'border-b-2 border-accent text-accent' : 'text-neutral-500 hover:text-neutral-300'}`}
                    >
                      {t === 'assistant' ? 'Assistant' : t === 'log' ? 'Log' : 'Inspector'}
                      {t === 'log' && <LogTabBadge />}
                    </button>
                  ))}
                </div>
                {rightTab === 'inspector' ? (
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    <Inspector />
                  </div>
                ) : rightTab === 'assistant' ? (
                  <div className="min-h-0 flex-1">
                    <ChatPanel />
                  </div>
                ) : (
                  <div className="min-h-0 flex-1">
                    <LogPanel />
                  </div>
                )}
              </aside>
            )}
          </>
        )}
      </div>

      {/* Photo Mode is a dedicated fullscreen path-traced view with its own camera
          presets — the raster view-mode/tour controls don't apply, so hide them. */}
      {!loading && !guidedEmpty && !photoMode && <BottomBar />}
    </div>
  );
}
