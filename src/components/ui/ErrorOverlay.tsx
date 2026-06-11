import { useState } from 'react';
import { useErrors, type AppError } from '../../store/error-store';

const KIND_LABEL: Record<AppError['kind'], string> = {
  rejected: 'Change rejected',
  runtime: 'Error',
  render: 'Render crashed',
  network: 'Network error',
  info: 'Notice',
};

function ErrorCard({ error, onDismiss }: { error: AppError; onDismiss: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      role="alert"
      className="pointer-events-auto w-80 rounded-lg border border-red-800 bg-red-950/95 p-3 text-xs text-red-100 shadow-2xl backdrop-blur"
    >
      <div className="flex items-start gap-2">
        <span className="mt-0.5 select-none text-sm leading-none">⚠</span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-red-200">{KIND_LABEL[error.kind]}</div>
          <div className="mt-0.5 break-words text-red-100/90">{error.message}</div>
          {error.detail && (
            <button onClick={() => setOpen((v) => !v)} className="mt-1 text-[11px] text-red-300/80 underline hover:text-red-200">
              {open ? 'Hide details' : 'Show details'}
            </button>
          )}
          {open && error.detail && (
            <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-black/40 p-2 text-[10px] leading-snug text-red-200/80">
              {error.detail}
            </pre>
          )}
        </div>
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="shrink-0 rounded px-1 text-red-300/70 hover:bg-red-900/60 hover:text-red-100"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

/**
 * Fixed, always-on-top stack of error toasts. Mounted once at the app root so
 * it covers every route. Reads the global error store; nothing is swallowed.
 */
export function ErrorOverlay() {
  const errors = useErrors((s) => s.errors);
  const dismiss = useErrors((s) => s.dismiss);
  const clear = useErrors((s) => s.clear);
  if (errors.length === 0) return null;
  return (
    <div className="pointer-events-none fixed right-3 top-3 z-[1200] flex max-h-screen flex-col items-end gap-2 overflow-hidden">
      {errors.length > 1 && (
        <button
          onClick={clear}
          className="pointer-events-auto rounded bg-red-900/80 px-2 py-0.5 text-[11px] text-red-100 hover:bg-red-800"
        >
          Dismiss all ({errors.length})
        </button>
      )}
      {errors.map((e) => (
        <ErrorCard key={e.id} error={e} onDismiss={() => dismiss(e.id)} />
      ))}
    </div>
  );
}
