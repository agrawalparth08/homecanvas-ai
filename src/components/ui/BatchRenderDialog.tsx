import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from './Button';
import { Icon } from './Icon';
import { FOCUS_RING } from './primitives';
import { reportError } from '../../store/error-store';

interface BatchStatus {
  running: boolean;
  projectId: string | null;
  total: number;
  done: number;
  current: string | null;
  error: string | null;
  files: string[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  projectId: string;
}

/**
 * "Render every room overnight" — drives the sidecar's Blender Cycles batch
 * queue (one overview per floor + one eye-level shot per room) and shows live
 * progress + finished frames. Zero marginal cost per render is the pitch; this
 * is the button. Visual pattern mirrors ProfileDialog.
 */
export function BatchRenderDialog({ open, onClose, projectId }: Props) {
  const queryClient = useQueryClient();
  const [starting, setStarting] = useState(false);

  const { data: batch } = useQuery<BatchStatus>({
    queryKey: ['render-batch'],
    queryFn: () => fetch('/api/render/batch/status').then((r) => r.json() as Promise<BatchStatus>),
    refetchInterval: (query) => (query.state.data?.running ? 2500 : false),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const start = async () => {
    setStarting(true);
    try {
      const res = await fetch('/api/render/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, samples: 160 }),
      });
      if (!res.ok) {
        const reason = ((await res.json().catch(() => ({}))) as { error?: string }).error ?? `${res.status}`;
        reportError(`Batch render failed to start: ${reason}`, { kind: 'runtime' });
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ['render-batch'] });
    } finally {
      setStarting(false);
    }
  };

  const running = batch?.running ?? false;
  // Only show frames from a batch of THIS project — stale files from another
  // project's run would be misleading (and its file routes 404 after a new run).
  const mine = batch?.projectId === projectId;
  const files = mine ? (batch?.files ?? []) : [];
  const pct = batch && batch.total > 0 ? Math.round((batch.done / batch.total) * 100) : 0;

  return (
    <div
      className="fixed inset-0 z-[1100] flex items-center justify-center bg-ink/10 p-4 backdrop-blur-[2px] print:hidden"
      onPointerDown={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Batch renders"
        className="hc-card flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-line bg-panel p-6"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-[15px] font-semibold text-ink">Batch renders</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[7px] text-dim transition hover:bg-soft hover:text-ink ${FOCUS_RING}`}
          >
            <Icon name="close" className="text-[15px]" />
          </button>
        </div>
        <p className="mt-1 text-[12.5px] text-dim">
          Ray-traced Cycles stills of every room plus a floor overview — queue it and come back. Rendering keeps going if
          you close this window.
        </p>

        <div className="mt-4 flex items-center gap-3">
          <Button variant="primary" size="sm" icon="camera" onClick={() => void start()} disabled={running || starting}>
            {running ? 'Rendering…' : files.length > 0 ? 'Render again' : 'Start batch'}
          </Button>
          {running && batch && (
            <span className="text-[12.5px] font-semibold text-dim">
              {batch.done}/{batch.total}
              {batch.current ? ` · ${batch.current}` : ''}
            </span>
          )}
        </div>

        {running && (
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-track">
            <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
        )}

        {mine && batch?.error && (
          <p className="mt-3 rounded-[10px] border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] text-rose-700">
            Stopped: {batch.error}
          </p>
        )}

        {files.length > 0 && (
          <div className="mt-4 grid flex-1 grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3">
            {files.map((f) => (
              <a
                key={f}
                href={`/api/render/batch/file/${f}`}
                download={f}
                title={`Download ${f}`}
                className={`group overflow-hidden rounded-[10px] border border-line bg-soft transition hover:border-accent/50 ${FOCUS_RING}`}
              >
                <img src={`/api/render/batch/file/${f}`} alt={f} className="aspect-[8/5] w-full object-cover" loading="lazy" />
                <span className="block truncate px-2 py-1.5 text-[11.5px] font-semibold text-dim group-hover:text-ink">
                  {f.replace(/\.png$/, '')}
                </span>
              </a>
            ))}
          </div>
        )}

        {!running && files.length === 0 && !(mine && batch?.error) && (
          <p className="mt-4 rounded-[10px] bg-soft px-3 py-2.5 text-[12.5px] text-faint">
            No renders yet for this project. A typical room takes a minute or two on GPU — a whole home can run while you
            do something else.
          </p>
        )}
      </div>
    </div>
  );
}
