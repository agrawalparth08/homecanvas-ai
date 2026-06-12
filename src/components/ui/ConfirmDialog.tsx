import { useEffect } from 'react';
import { Button } from './Button';
import { Icon } from './Icon';

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
 * Modal confirmation for destructive actions (e.g. deleting a structural pillar).
 * Esc or a backdrop click cancels. Cancel is focused by default — a stray
 * Enter/Space cancels rather than confirming, so confirming a delete always
 * takes a deliberate click.
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
      className="fixed inset-0 z-[1100] flex items-center justify-center bg-neutral-50/40 p-4 backdrop-blur-[2px]"
      onPointerDown={onCancel}
      role="presentation"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-md rounded-xl border border-panel-border bg-panel p-6 shadow-2xl"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex gap-4">
          <span
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[22px] ${
              danger ? 'bg-rose-50 text-rose-600' : 'bg-accent/10 text-accent'
            }`}
          >
            <Icon name="warning" strokeWidth={1.8} />
          </span>
          <div className="min-w-0 pt-0.5">
            <h2 className="text-[15px] font-semibold text-neutral-100">{title}</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-neutral-400">{message}</p>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2.5">
          <Button autoFocus variant="secondary" size="sm" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={onConfirm}
            {...(danger ? { icon: 'trash' as const } : {})}
            className={danger ? 'bg-rose-600 shadow-rose-600/25 hover:bg-rose-700 active:bg-rose-800' : ''}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
