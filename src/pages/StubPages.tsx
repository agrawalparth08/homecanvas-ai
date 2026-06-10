import { Link } from 'react-router';

function Stub({ title, phase, children }: { title: string; phase: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas-bg text-neutral-100">
      <div className="max-w-md rounded-xl border border-panel-border bg-panel p-6">
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

export function VerifyPage() {
  return (
    <Stub title="Verification wizard" phase="Arrives in Phase 2–3">
      Confirm scale, room labels, walls and openings before 3D generation — with confidence badges on everything the
      extractor wasn't sure about.
    </Stub>
  );
}

export function VariantsPage() {
  return (
    <Stub title="Variant comparison" phase="Arrives in Phase 7">
      Side-by-side comparison and design boards. Saving and switching variants already works from the design canvas's
      bottom bar.
    </Stub>
  );
}
