import { useEffect } from 'react';
import { Link } from 'react-router';
import { buildRoomBoards } from '@lib/boards/room-boards';
import { diffScenes } from '@lib/scene/diff';
import { useEditor } from '../store/editor-store';

function Stub({ title, phase, children }: { title: string; phase: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas-bg text-neutral-100">
      <div className="hc-hero max-w-md rounded-xl border border-panel-border p-6">
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="mt-1 text-xs uppercase tracking-wide text-accent">{phase}</p>
        <div className="mt-3 text-sm text-neutral-400">{children}</div>
        <Link to="/" className="mt-4 inline-block text-xs text-accent">
          ← Back home
        </Link>
      </div>
    </div>
  );
}

export function UploadPage() {
  return (
    <Stub title="Upload & overlay" phase="Arrives in Phase 2">
      Upload floor plan images/PDFs and site photos, calibrate scale with a known length, and trace walls and rooms
      over the plan. For now, place files in <code className="text-xs">private-home-inputs/raw/</code>.
    </Stub>
  );
}

export function VariantsPage() {
  const scene = useEditor((s) => s.scene);
  const baseline = useEditor((s) => s.baseline);
  const projectId = useEditor((s) => s.projectId);
  const loadProject = useEditor((s) => s.loadProject);

  // Rehydrate on a direct visit / refresh (store resets to scene:null) so the
  // boards aren't a dead stub. Defaults to the store's current/last projectId.
  useEffect(() => {
    if (!scene) void loadProject(projectId);
  }, [scene, projectId, loadProject]);

  if (!scene) {
    return (
      <Stub title="Design boards & variant comparison" phase="Phase 7">
        Open a home first — then this page shows a per-room design board (palette, materials, furniture) and a diff
        against the loaded baseline.
        <div className="mt-4 flex gap-2">
          <Link to="/design/my-home" className="rounded bg-accent/15 px-3 py-1.5 text-xs text-accent hover:bg-accent/25">
            Open My Home
          </Link>
          <Link
            to="/design/sample-home"
            className="rounded bg-neutral-800 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-700"
          >
            Open Sample
          </Link>
        </div>
      </Stub>
    );
  }

  const boards = buildRoomBoards(scene);
  const diff = baseline ? diffScenes(baseline, scene) : null;

  return (
    <div className="min-h-screen bg-canvas-bg px-8 py-10 text-neutral-100">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6">
          <Link to={`/design/${projectId}`} className="text-xs text-accent">
            ← Back to canvas
          </Link>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Design boards — {scene.name}</h1>
          <p className="mt-1 text-sm text-neutral-400">
            {boards.length} room(s){diff ? ` · ${diff.summary}` : ''}
          </p>
        </header>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {boards.map((b) => (
            <div key={b.roomId} className="hc-card-glow rounded-xl border border-panel-border bg-panel p-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">{b.name}</h2>
                <span className="text-[10px] uppercase tracking-wide text-neutral-500">{b.kind}</span>
              </div>
              {b.palette.length > 0 && (
                <div
                  className="mt-2 h-2.5 w-full rounded-full ring-1 ring-black/10"
                  style={{
                    background:
                      b.palette.length === 1 ? b.palette[0] : `linear-gradient(90deg, ${b.palette.join(', ')})`,
                  }}
                />
              )}
              <ul className="mt-3 space-y-1 text-xs text-neutral-400">
                {b.materials.map((m) => (
                  <li key={m.id} className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-sm ring-1 ring-black/10" style={{ background: m.baseColor }} />
                    {m.name}
                  </li>
                ))}
                {b.materials.length === 0 && <li className="text-neutral-500">No materials assigned yet.</li>}
              </ul>
              {b.furniture.length > 0 && (
                <p className="mt-2 text-[11px] text-neutral-500">
                  {b.furniture.length} piece(s): {b.furniture.map((f) => f.name).join(', ')}
                </p>
              )}
              {diff?.recoloredRooms.includes(b.roomId) && (
                <span className="mt-2 inline-block rounded bg-accent/15 px-1.5 py-0.5 text-[10px] text-accent">
                  recoloured vs baseline
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
