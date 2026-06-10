import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { fetchPrivateManifest } from '../api';

export function HomePage() {
  const { data: manifest } = useQuery({ queryKey: ['private-manifest'], queryFn: fetchPrivateManifest });

  return (
    <div className="min-h-screen bg-canvas-bg px-8 py-12 text-neutral-100">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold">
          HomeCanvas <span className="text-accent">AI</span>
        </h1>
        <p className="mt-1 text-sm text-neutral-400">
          Turn a 2D floor plan into an interactive 3D home you can redesign. Local-first: your files never leave this
          machine.
        </p>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Link
            to="/design/sample-home"
            className="rounded-xl border border-panel-border bg-panel p-5 transition hover:border-accent/50"
          >
            <h2 className="font-semibold">Sample Penthouse</h2>
            <p className="mt-1 text-sm text-neutral-400">
              Two levels, terrace, feature stair — explore selection, materials, style packs, undo and variants.
            </p>
            <span className="mt-3 inline-block text-xs text-accent">Open canvas →</span>
          </Link>

          <Link
            to="/design/my-home"
            className="rounded-xl border border-panel-border bg-panel p-5 transition hover:border-accent/50"
          >
            <h2 className="font-semibold">My Home</h2>
            {manifest && manifest.files.length > 0 ? (
              <p className="mt-1 text-sm text-neutral-400">
                {manifest.files.length} private file(s) detected
                {manifest.hasFloorPlan ? ' · floor plan ✓' : ''}
                {manifest.hasSitePhotos ? ' · site photos ✓' : ''}
                {manifest.hasCad ? ' · CAD ✓' : ''}
                {manifest.hasGeneratedScene || manifest.hasManualScene ? ' · scene ready ✓' : ' · no scene yet'}
              </p>
            ) : (
              <p className="mt-1 text-sm text-neutral-400">
                No private files yet. Run <code className="text-xs">npm run init:private</code> and drop your floor
                plan into <code className="text-xs">private-home-inputs/raw/</code>.
              </p>
            )}
            <span className="mt-3 inline-block text-xs text-accent">Open canvas →</span>
          </Link>
        </div>

        <div className="mt-8 rounded-lg border border-panel-border bg-panel/50 p-4 text-xs text-neutral-500">
          <p>
            Phase 1 build: interactive canvas, materials, 5 style packs, locks, undo/redo, variants. Coming next:
            upload &amp; tracing wizard (P2), local floor-plan extraction (P3), agent chat (P4), photoreal Photo Mode
            (P5).
          </p>
          <p className="mt-2">
            Tip: run <code>npm run fetch:assets</code> once to download CC0 textures/HDRIs (Poly Haven) for far more
            realistic materials. Without it everything still works with flat colors.
          </p>
        </div>
      </div>
    </div>
  );
}
