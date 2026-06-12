import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { fetchPrivateManifest } from '../api';
import { Icon } from '../components/ui/Icon';

export function HomePage() {
  const { data: manifest } = useQuery({ queryKey: ['private-manifest'], queryFn: fetchPrivateManifest });

  return (
    <div className="min-h-screen bg-canvas-bg px-8 py-12 text-neutral-100">
      <div className="mx-auto max-w-3xl">
        <div className="hc-hero overflow-hidden rounded-2xl border border-panel-border p-7 shadow-sm">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-2.5 py-1 text-[11px] font-medium text-accent">
            <Icon name="sparkles" /> local-first · nothing leaves this machine
          </span>
          <h1 className="mt-3 text-3xl font-bold tracking-tight">
            HomeCanvas <span className="text-accent">AI</span>
          </h1>
          <p className="mt-2 max-w-xl text-sm text-neutral-400">
            Turn a 2D floor plan into an interactive, near-photoreal 3D home you can redesign — materials, colours,
            furniture, style packs, all on your own machine.
          </p>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Link
            to="/design/sample-home"
            className="hc-card-glow group rounded-xl border border-panel-border bg-panel p-5 transition hover:border-accent/40"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 text-base text-accent">
              <Icon name="cube" />
            </span>
            <h2 className="mt-3 font-semibold">Sample Penthouse</h2>
            <p className="mt-1 text-sm text-neutral-400">
              Two levels, terrace, feature stair — explore selection, materials, style packs, undo and variants.
            </p>
            <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-accent">
              Open canvas <Icon name="arrowRight" className="transition group-hover:translate-x-0.5" />
            </span>
          </Link>

          <Link
            to="/design/my-home"
            className="hc-card-glow group rounded-xl border border-panel-border bg-panel p-5 transition hover:border-accent/40"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 text-base text-accent">
              <Icon name="home" />
            </span>
            <h2 className="mt-3 font-semibold">My Home</h2>
            {manifest && manifest.files.length > 0 ? (
              <div className="mt-2">
                <p className="text-sm text-neutral-400">{manifest.files.length} private file(s) detected</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {[
                    ['floor plan', manifest.hasFloorPlan],
                    ['site photos', manifest.hasSitePhotos],
                    ['CAD', manifest.hasCad],
                    ['scene ready', manifest.hasGeneratedScene || manifest.hasManualScene],
                  ].map(([label, ok]) => (
                    <span
                      key={label as string}
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium ${
                        ok ? 'bg-emerald-50 text-emerald-700' : 'bg-neutral-800 text-neutral-500'
                      }`}
                    >
                      {ok && <Icon name="check" />}
                      {label as string}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <p className="mt-1 text-sm text-neutral-400">
                No private files yet. Run <code className="text-xs">npm run init:private</code> and drop your floor
                plan into <code className="text-xs">private-home-inputs/raw/</code>.
              </p>
            )}
            <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-accent">
              Open canvas <Icon name="arrowRight" className="transition group-hover:translate-x-0.5" />
            </span>
          </Link>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            to="/upload"
            className="inline-flex items-center gap-1.5 rounded-lg border border-panel-border bg-panel px-3 py-2 text-xs text-neutral-300 hover:border-accent/40 hover:text-neutral-100"
          >
            <Icon name="upload" /> Upload &amp; trace a plan
          </Link>
          <Link
            to="/verify"
            className="inline-flex items-center gap-1.5 rounded-lg border border-panel-border bg-panel px-3 py-2 text-xs text-neutral-300 hover:border-accent/40 hover:text-neutral-100"
          >
            <Icon name="pencil" /> Tracing wizard
          </Link>
        </div>

        <div className="mt-8 rounded-lg border border-panel-border bg-panel/60 p-4 text-xs text-neutral-500">
          <p>
            Phases shipped: interactive canvas, materials, 5 style packs, locks, undo/redo, variants (P1), upload &amp;
            tracing wizard (P2), local floor-plan extraction (P3), agent chat &amp; variants (P4). Coming next: furniture
            library + photoreal Photo Mode (P5).
          </p>
          <p className="mt-2">
            Tip: run <code>npm run fetch:assets</code> once to download CC0 textures/HDRIs (Poly Haven) for far more
            realistic materials. Without it everything still works with flat colours.
          </p>
        </div>
      </div>
    </div>
  );
}
