import { useState } from 'react';
import { useErrors, type AppError } from '../../store/error-store';
import { Icon } from './Icon';

const KIND_LABEL: Record<AppError['kind'], string> = {
  rejected: 'Change rejected',
  runtime: 'Error',
  render: 'Render crashed',
  network: 'Network error',
  info: 'Notice',
};

/** info is calm indigo; everything else is a quiet rose. */
const tone = (kind: AppError['kind']) =>
  kind === 'info'
    ? { bar: 'bg-accent', chip: 'bg-accent/10 text-accent' }
    : { bar: 'bg-rose-500', chip: 'bg-rose-50 text-rose-600' };

function ErrorCard({ error, onDismiss }: { error: AppError; onDismiss: () => void }) {
  const [open, setOpen] = useState(false);
  const t = tone(error.kind);
  return (
    <div
      role="alert"
      className="pointer-events-auto relative w-[360px] overflow-hidden rounded-xl border border-panel-border bg-panel pl-4 pr-2 py-3 shadow-lg"
    >
      <span className={`absolute inset-y-0 left-0 w-1 ${t.bar}`} />
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[16px] ${t.chip}`}>
          <Icon name={error.kind === 'info' ? 'sparkles' : 'warning'} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-neutral-100">{KIND_LABEL[error.kind]}</div>
          <div className="mt-0.5 break-words text-[12.5px] leading-snug text-neutral-400">{error.message}</div>
          {error.detail && (
            <button onClick={() => setOpen((v) => !v)} className="mt-1.5 text-[11px] font-medium text-accent hover:underline">
              {open ? 'Hide details' : 'Show details'}
            </button>
          )}
          {open && error.detail && (
            <pre className="mt-1.5 max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-neutral-900 p-2 text-[10.5px] leading-snug text-neutral-400">
              {error.detail}
            </pre>
          )}
        </div>
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[15px] text-neutral-500 hover:bg-neutral-800 hover:text-neutral-100"
        >
          <Icon name="close" />
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
    <div className="pointer-events-none fixed right-4 top-4 z-[1200] flex max-h-screen flex-col items-end gap-2.5 overflow-hidden">
      {errors.length > 1 && (
        <button
          onClick={clear}
          className="pointer-events-auto rounded-md border border-panel-border bg-panel px-2.5 py-1 text-[11px] font-medium text-neutral-400 shadow-sm hover:text-neutral-100"
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
