import { useEffect } from 'react';

interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red/danger styling for the confirm button (default true). */
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Small modal confirmation. Used for destructive actions that need an explicit
 * yes/no (e.g. deleting a structural pillar). Esc or a backdrop click cancels.
 * The CANCEL button is focused by default (deliberate for a destructive action):
 * a stray Enter/Space cancels rather than confirming, so confirming a delete
 * always takes a real click.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = true,
  onConfirm,
  onCancel,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/55 p-4"
      onPointerDown={onCancel}
      role="presentation"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-sm rounded-xl border border-panel-border bg-panel p-5 shadow-2xl"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 text-xl leading-none text-amber-400">⚠</span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-neutral-100">{title}</h2>
            <p className="mt-1.5 text-xs leading-relaxed text-neutral-300">{message}</p>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            autoFocus
            onClick={onCancel}
            className="rounded bg-neutral-800 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-700"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`rounded px-3 py-1.5 text-xs font-medium ${
              danger
                ? 'bg-red-900/80 text-red-100 hover:bg-red-800'
                : 'bg-accent/25 text-accent hover:bg-accent/35'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
