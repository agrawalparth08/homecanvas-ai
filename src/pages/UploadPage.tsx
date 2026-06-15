import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { autoTracePrivate, buildSceneFromPlan, fetchPrivateManifest, privateFileUrl, uploadPrivateFile } from '../api';
import { loadRasterImage } from '../lib/pdf';
import { planFromImage, planFromPdf } from '../lib/import-plan';
import { useEditor } from '../store/editor-store';

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

const ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.dxf';

export function UploadPage() {
  const { data: manifest, refetch } = useQuery({ queryKey: ['private-manifest'], queryFn: fetchPrivateManifest });
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [autoMsg, setAutoMsg] = useState<Record<string, string>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const setPendingImport = useEditor((s) => s.setPendingImport);

  async function runAuto(id: string, filePath: string) {
    setAutoMsg((m) => ({ ...m, [id]: 'Auto-tracing…' }));
    const r = await autoTracePrivate(filePath);
    setAutoMsg((m) => ({ ...m, [id]: r.ok ? `auto-traced ${r.count} rooms — open the wizard to refine` : (r.reason ?? 'failed') }));
  }

  // No-CAD import: extract a PrimitivePlan in the browser (vector-PDF or raster
  // image), build a validated scene via the spine endpoint, then hand it to the
  // verify wizard for review/calibration (never clobbers my-home on disk).
  async function runImport(id: string, filePath: string, mime: string) {
    setAutoMsg((m) => ({ ...m, [id]: 'Extracting…' }));
    try {
      const url = privateFileUrl(filePath);
      let plan;
      if (mime === 'application/pdf') {
        plan = await planFromPdf(url);
      } else {
        const img = await loadRasterImage(url);
        // No calibration yet: assume a ~12m-wide plan; the wizard flags + fixes it.
        const mmPerPx = 12000 / Math.max(1, img.widthPx);
        plan = await planFromImage(img.dataUrl, mmPerPx);
      }
      const r = await buildSceneFromPlan(plan);
      if (!r.ok || !r.scene) {
        setAutoMsg((m) => ({ ...m, [id]: r.reason ?? 'could not build a scene' }));
        return;
      }
      setPendingImport({ scene: r.scene, source: { filePath, mime } });
      navigate('/verify');
    } catch (e) {
      setAutoMsg((m) => ({ ...m, [id]: (e as Error).message }));
    }
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setErr(null);
    for (const file of Array.from(files)) {
      setBusy(`Saving ${file.name}…`);
      try {
        const dataUrl = await readAsDataUrl(file);
        const saved = await uploadPrivateFile(file.name, dataUrl);
        if (!saved) throw new Error('save failed');
      } catch (e) {
        setErr(`Could not save ${file.name}: ${(e as Error).message}`);
      }
    }
    setBusy(null);
    await refetch();
  }

  const planFiles = (manifest?.files ?? []).filter(
    (f) => f.mimeType === 'application/pdf' || f.mimeType.startsWith('image/') || f.fileName.toLowerCase().endsWith('.dxf'),
  );

  return (
    <div className="flex h-screen flex-col bg-canvas-bg text-neutral-100">
      <header className="flex items-center gap-3 border-b border-panel-border bg-panel px-4 py-2">
        <Link to="/" className="text-sm font-semibold text-accent">HomeCanvas AI</Link>
        <span className="text-xs text-neutral-500">Upload plans</span>
        <span className="ml-auto text-[11px] text-neutral-600">local-first · files are copied into your machine only, never uploaded anywhere</span>
      </header>

      <div className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto p-6">
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); void handleFiles(e.dataTransfer.files); }}
          onClick={() => inputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-12 text-center transition ${
            drag ? 'border-accent bg-accent/10' : 'border-panel-border bg-panel hover:border-accent/50'
          }`}
        >
          <div className="text-lg font-semibold text-neutral-100">Drop a floor plan here</div>
          <div className="mt-1 text-sm text-neutral-400">PDF, image, or DXF — or click to choose</div>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => void handleFiles(e.target.files)}
          />
        </div>

        {busy && <div className="mt-3 rounded bg-accent/15 px-3 py-2 text-xs text-accent">{busy}</div>}
        {err && <div className="mt-3 rounded border border-red-900 bg-red-950/80 px-3 py-2 text-xs text-red-200">{err}</div>}

        <h2 className="mb-2 mt-6 text-sm font-semibold text-neutral-200">
          Plans on this machine{planFiles.length > 0 ? ` (${planFiles.length})` : ''}
        </h2>
        {planFiles.length === 0 ? (
          <p className="text-sm text-neutral-500">None yet. Drop a plan above, or place files directly in <code className="text-xs">private-home-inputs/raw/</code>.</p>
        ) : (
          <ul className="divide-y divide-panel-border overflow-hidden rounded-lg border border-panel-border bg-panel">
            {planFiles.map((f) => (
              <li key={f.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-neutral-200">{f.fileName}</div>
                  <div className="text-xs text-neutral-500">
                    {f.role} · {(f.bytes / 1024).toFixed(0)} KB
                    {autoMsg[f.id] && <span className="ml-2 text-accent">· {autoMsg[f.id]}</span>}
                  </div>
                </div>
                {f.fileName.toLowerCase().endsWith('.dxf') && (
                  <button
                    onClick={() => void runAuto(f.id, f.filePath)}
                    className="rounded bg-neutral-800 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-700"
                  >
                    Auto-trace
                  </button>
                )}
                {(f.mimeType === 'application/pdf' || f.mimeType.startsWith('image/')) && (
                  <button
                    onClick={() => void runImport(f.id, f.filePath, f.mimeType)}
                    className="rounded bg-accent/15 px-3 py-1.5 text-xs text-accent hover:bg-accent/25"
                    title="Extract walls and review in the verify wizard"
                  >
                    Build 3D
                  </button>
                )}
                <Link to="/verify" className="rounded bg-accent/20 px-3 py-1.5 text-xs text-accent hover:bg-accent/30">Trace →</Link>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6 flex gap-2 text-sm">
          <Link to="/verify" className="rounded bg-accent/15 px-3 py-2 text-accent hover:bg-accent/25">Open tracing wizard</Link>
          <Link to="/design/my-home" className="rounded bg-neutral-800 px-3 py-2 text-neutral-300 hover:bg-neutral-700">Go to 3D view</Link>
        </div>
      </div>
    </div>
  );
}
