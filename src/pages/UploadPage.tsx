import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { autoTracePrivate, buildSceneFromPlan, fetchPrivateManifest, privateFileUrl, uploadPrivateFile, type SceneIssue } from '../api';
import type { HomeScene } from '@lib/scene/schemas';
import { loadRasterImage } from '../lib/pdf';
import { planFromImage, planFromPdf } from '../lib/import-plan';
import { useEditor } from '../store/editor-store';
import { Icon } from '../components/ui/Icon';
import { Mono } from '../components/ui/primitives';

/** Bucket auto-extraction geometry errors into a short human summary. */
function summarizeIssues(issues: SceneIssue[]): string {
  const buckets: Record<string, number> = {};
  for (const i of issues) {
    const k = /degenerate/.test(i.message)
      ? 'degenerate walls'
      : /room boundary|missing wall|room\.floorId|missing furniture/.test(i.message)
        ? 'bad rooms'
        : /opening/.test(i.message)
          ? 'opening issues'
          : /references missing|mismatch|duplicate/.test(i.message)
            ? 'broken refs'
            : 'other';
    buckets[k] = (buckets[k] ?? 0) + 1;
  }
  return Object.entries(buckets)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${n} ${k}`)
    .join(' · ');
}

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
  // Imperfect auto-extractions stashed so "Fix in wizard" can open them for correction.
  const [imported, setImported] = useState<Record<string, { scene: HomeScene; filePath: string; mime: string }>>({});
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
      const issues = r.issues ?? [];
      if (issues.length > 0) {
        // Don't dead-end: keep the imperfect scene + tell the user WHAT's wrong so
        // they can open it in the wizard and fix the flagged walls/rooms.
        const scene = r.scene;
        setImported((m) => ({ ...m, [id]: { scene, filePath, mime } }));
        setAutoMsg((m) => ({
          ...m,
          [id]: `imported with ${issues.length} geometry issue${issues.length > 1 ? 's' : ''} (${summarizeIssues(issues)}) — fix in the wizard`,
        }));
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
    <div className="flex h-screen flex-col bg-app text-ink">
      <header className="flex h-[54px] flex-shrink-0 items-center gap-3.5 border-b border-line bg-panel px-[18px]">
        <Link to="/" className="inline-flex items-center gap-2 text-[16px] font-bold tracking-[-0.3px] text-accent">
          <span className="flex h-6 w-6 items-center justify-center rounded-[7px] bg-accent text-white">
            <Icon name="home" className="text-[14px]" strokeWidth={2} />
          </span>
          <span className="hidden sm:inline">HomeCanvas AI</span>
        </Link>
        <span className="text-[14px] text-dim">Upload plans</span>
        <span className="ml-auto hidden text-[12px] text-faint md:inline">
          local-first · files are copied onto your machine only, never uploaded anywhere
        </span>
      </header>

      <div className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto p-6">
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); void handleFiles(e.dataTransfer.files); }}
          onClick={() => inputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-12 text-center transition ${
            drag ? 'border-accent bg-wash' : 'border-[#c7ccd6] bg-panel hover:border-accent/50 hover:bg-wash/40'
          }`}
        >
          <span className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl bg-wash text-accent">
            <Icon name="upload" className="text-[24px]" strokeWidth={2} />
          </span>
          <div className="text-lg font-bold text-ink">Drop a floor plan here</div>
          <Mono className="text-[12.5px] text-faint">PDF · PNG · JPG · DXF — or click to choose</Mono>
          <input ref={inputRef} type="file" accept={ACCEPT} multiple className="hidden" onChange={(e) => void handleFiles(e.target.files)} />
        </div>

        {busy && <div className="mt-3 rounded-lg bg-wash px-3 py-2 text-xs font-semibold text-accent">{busy}</div>}
        {err && <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{err}</div>}

        <h2 className="mb-2 mt-7 text-[13px] font-bold uppercase tracking-[1.2px] text-faint">
          Plans on this machine{planFiles.length > 0 ? ` · ${planFiles.length}` : ''}
        </h2>
        {planFiles.length === 0 ? (
          <p className="text-sm text-faint">
            None yet. Drop a plan above, or place files directly in{' '}
            <code className="rounded bg-soft px-1 font-mono text-xs">private-home-inputs/raw/</code>.
          </p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-panel hc-card">
            {planFiles.map((f) => (
              <li key={f.id} className="flex items-center gap-3 px-4 py-3">
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[9px] bg-soft text-dim">
                  <Icon name="image" className="text-[18px]" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-ink">{f.fileName}</div>
                  <Mono className="text-xs text-faint">
                    {f.role} · {(f.bytes / 1024).toFixed(0)} KB
                    {autoMsg[f.id] && <span className="ml-2 text-accent">· {autoMsg[f.id]}</span>}
                  </Mono>
                </div>
                {f.fileName.toLowerCase().endsWith('.dxf') && (
                  <button
                    onClick={() => void runAuto(f.id, f.filePath)}
                    className="rounded-[9px] border border-line bg-panel px-3 py-1.5 text-xs font-semibold text-dim transition hover:bg-soft"
                  >
                    Auto-trace
                  </button>
                )}
                {(f.mimeType === 'application/pdf' || f.mimeType.startsWith('image/')) &&
                  (imported[f.id] ? (
                    <button
                      onClick={() => {
                        const im = imported[f.id]!;
                        setPendingImport({ scene: im.scene, source: { filePath: im.filePath, mime: im.mime } });
                        navigate('/verify');
                      }}
                      className="rounded-[9px] bg-[#fbf0e3] px-3 py-1.5 text-xs font-semibold text-[#9a5a1e] transition hover:bg-[#f4e2cc]"
                      title="Open the auto-extracted scene in the tracing wizard to fix the flagged walls/rooms"
                    >
                      Fix in wizard →
                    </button>
                  ) : (
                    <button
                      onClick={() => void runImport(f.id, f.filePath, f.mimeType)}
                      className="rounded-[9px] bg-accent px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#403bd6]"
                      title="Extract walls and review in the verify wizard"
                    >
                      Build 3D
                    </button>
                  ))}
                <Link
                  to="/verify"
                  className="rounded-[9px] bg-wash px-3 py-1.5 text-xs font-semibold text-accent transition hover:bg-[#e3e1fb]"
                >
                  Trace →
                </Link>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6 flex flex-wrap gap-2.5 text-sm">
          <Link
            to="/verify"
            className="rounded-[10px] bg-accent px-4 py-2.5 text-sm font-semibold text-white hc-glow transition hover:bg-[#403bd6]"
          >
            Open tracing wizard
          </Link>
          <Link
            to="/design/my-home"
            className="rounded-[10px] border border-line bg-panel px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-soft"
          >
            Go to 3D view
          </Link>
        </div>
      </div>
    </div>
  );
}
