import { useEffect } from 'react';
import { Link, useParams } from 'react-router';
import { SceneCanvas } from '../components/canvas/SceneCanvas';
import { Inspector } from '../components/inspector/Inspector';
import { BottomBar } from '../components/panels/BottomBar';
import { LeftPanel } from '../components/panels/LeftPanel';
import { TourPanel } from '../components/panels/TourPanel';
import { useEditor } from '../store/editor-store';
import type { ProjectId } from '../api';

function GuidedEmptyState() {
  const startFromSample = useEditor((s) => s.startFromSample);
  return (
    <div className="flex h-full items-center justify-center">
      <div className="max-w-md rounded-xl border border-panel-border bg-panel p-6">
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
            onClick={startFromSample}
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

function ErrorToast() {
  const errors = useEditor((s) => s.lastErrors);
  const clear = useEditor((s) => s.clearErrors);
  if (errors.length === 0) return null;
  return (
    <button
      onClick={clear}
      className="absolute bottom-16 left-1/2 z-20 -translate-x-1/2 rounded-lg border border-red-900 bg-red-950/95 px-4 py-2 text-left text-xs text-red-200 shadow-xl"
    >
      <span className="font-semibold">Change rejected:</span>{' '}
      {errors[0]!.message}
      {errors.length > 1 ? ` (+${errors.length - 1} more)` : ''} — click to dismiss
    </button>
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

  useEffect(() => {
    void loadProject(projectId);
  }, [projectId, loadProject]);

  return (
    <div className="flex h-screen flex-col bg-canvas-bg text-neutral-100">
      <header className="flex items-center gap-3 border-b border-panel-border bg-panel px-4 py-2">
        <Link to="/" className="text-sm font-semibold text-accent">
          HomeCanvas AI
        </Link>
        <span className="text-xs text-neutral-500">{scene?.name ?? projectId}</span>
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
              <SceneCanvas />
              {viewMode === 'tour' && <TourPanel />}
              <ErrorToast />
            </main>
            {viewMode !== 'tour' && (
              <aside className="w-72 overflow-y-auto border-l border-panel-border bg-panel">
                <Inspector />
              </aside>
            )}
          </>
        )}
      </div>

      {!loading && !guidedEmpty && <BottomBar />}
    </div>
  );
}
