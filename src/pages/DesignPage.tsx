import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { SceneCanvas } from '../components/canvas/SceneCanvas';
import { StageChrome } from '../components/canvas/StageChrome';
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
    <div className="flex h-full items-center justify-center p-6">
      <div className="hc-hero max-w-md rounded-2xl border border-line p-6 hc-card">
        <h2 className="text-lg font-bold text-ink">No “My Home” scene yet</h2>
        <p className="mt-2 text-sm text-dim">
          The app looked for{' '}
          <code className="font-mono text-xs">private-home-inputs/processed/scene-json/my-home.scene.json</code> and
          didn't find one. Three ways to get going:
        </p>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-dim">
          <li>
            Drop your floor plan into <code className="font-mono text-xs">private-home-inputs/raw/</code> — the upload
            &amp; tracing wizard turns it into your home.
          </li>
          <li>Start from the sample home and reshape it room by room.</li>
          <li>
            Run <code className="font-mono text-xs">npm run init:private</code> if the folder doesn't exist yet.
          </li>
        </ol>
        <div className="mt-5 flex gap-2.5">
          <button
            onClick={() => void startFromSample()}
            className="rounded-[10px] bg-accent px-4 py-2.5 text-sm font-semibold text-white hc-glow transition hover:bg-[#403bd6]"
          >
            Start from sample home
          </button>
          <Link
            to="/upload"
            className="rounded-[10px] border border-line bg-panel px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-soft"
          >
            Upload a plan
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
    <div className="flex h-screen flex-col bg-app text-ink">
      <header className="flex h-[54px] flex-shrink-0 items-center gap-3.5 border-b border-line bg-panel px-[18px]">
        <Link to="/" className="inline-flex flex-shrink-0 items-center gap-2 text-[16px] font-bold tracking-[-0.3px] text-accent">
          <span className="flex h-6 w-6 items-center justify-center rounded-[7px] bg-accent text-white">
            <Icon name="home" className="text-[14px]" strokeWidth={2} />
          </span>
          <span className="hidden sm:inline">HomeCanvas AI</span>
        </Link>
        <span className="truncate text-[14px] text-dim">{scene?.name ?? projectId}</span>
        <span className="hidden h-[22px] w-px flex-shrink-0 bg-line sm:block" />
        <Link to="/verify" className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-[9px] bg-wash px-3 py-[7px] text-[13px] font-semibold text-accent transition hover:bg-[#e3e1fb]">
          <Icon name="wand" className="text-[14px]" strokeWidth={2} /> <span className="hidden md:inline">Trace plan</span>
        </Link>
        <Link to="/variants" className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-[9px] bg-soft px-3 py-[7px] text-[13px] font-semibold text-dim transition hover:bg-track">
          <Icon name="columns" className="text-[14px]" strokeWidth={2} /> <span className="hidden md:inline">Boards</span>
        </Link>
        {showBefore && <span className="flex-shrink-0 rounded bg-wash px-2 py-0.5 text-[11px] font-bold text-accent">BEFORE</span>}
        <span className="ml-auto hidden truncate text-[12px] text-faint lg:inline">
          local-first · nothing leaves this machine · visualizations are approximations
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
              {compareMode !== 'slider' && !photoMode && (viewMode === 'orbit' || viewMode === 'top') && <StageChrome />}
              {viewMode === 'tour' && <TourPanel />}
              {photoMode && <PhotoMode />}
            </main>
            {viewMode !== 'tour' && (
              <aside className="flex w-[340px] max-w-[42vw] flex-col border-l border-line bg-panel">
                <div className="flex shrink-0 border-b border-line px-2">
                  {(['inspector', 'assistant', 'log'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setRightTab(t)}
                      className={`-mb-px inline-flex items-center gap-1 px-3.5 pb-3 pt-3.5 text-[14px] font-semibold capitalize ${rightTab === t ? 'border-b-2 border-accent text-accent' : 'text-faint hover:text-dim'}`}
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
