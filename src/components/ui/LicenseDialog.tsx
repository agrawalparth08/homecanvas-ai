import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from './Button';
import { Icon } from './Icon';
import { FOCUS_RING } from './primitives';

export interface LicenseStatus {
  state: 'trial' | 'licensed' | 'expired';
  trialDaysLeft: number;
  email?: string;
  plan?: string;
  clockSuspect: boolean;
}

export const BUY_URL = 'https://tryhomecanvas.com/#pricing';

export function useLicense() {
  return useQuery<LicenseStatus>({
    queryKey: ['license-status'],
    queryFn: () => fetch('/api/license/status').then((r) => r.json() as Promise<LicenseStatus>),
    staleTime: 60_000,
  });
}

/**
 * License / trial dialog — offline activation with an HCPRO key. Editing and
 * data export never lock; an ended trial only gates pro outputs (client
 * viewer, batch renders), and this dialog is where that unlocks.
 */
export function LicenseDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: status } = useLicense();
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setKey('');
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const activate = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/license/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: key.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? 'Activation failed.');
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ['license-status'] });
    } finally {
      setBusy(false);
    }
  };

  const deactivate = async () => {
    setBusy(true);
    try {
      await fetch('/api/license/deactivate', { method: 'POST' });
      void queryClient.invalidateQueries({ queryKey: ['license-status'] });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[1100] flex items-center justify-center bg-ink/10 p-4 backdrop-blur-[2px] print:hidden"
      onPointerDown={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="HomeCanvas Pro license"
        className="hc-card w-full max-w-sm rounded-2xl border border-line bg-panel p-6"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-[15px] font-semibold text-ink">HomeCanvas Pro</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[7px] text-dim transition hover:bg-soft hover:text-ink ${FOCUS_RING}`}
          >
            <Icon name="close" className="text-[15px]" />
          </button>
        </div>

        {status?.state === 'licensed' ? (
          <>
            <p className="mt-2 rounded-[10px] bg-[#e9f7ef] px-3 py-2.5 text-[12.5px] text-[#1e7a4d]">
              Licensed to <strong>{status.email}</strong> — thank you for supporting an indie tool.
            </p>
            <div className="mt-4 flex justify-end">
              <Button variant="secondary" size="sm" onClick={() => void deactivate()} disabled={busy}>
                Remove key from this machine
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-1 text-[12.5px] text-dim">
              {status?.state === 'expired'
                ? 'Your 14-day trial has ended. Designing and exporting your own data stay free forever; client viewer exports and batch renders need a Pro key.'
                : `Trial: ${status?.trialDaysLeft ?? '…'} day${status?.trialDaysLeft === 1 ? '' : 's'} left. Everything is unlocked while you evaluate.`}
            </p>
            {status?.clockSuspect && (
              <p className="mt-2 rounded-[8px] bg-[#fbf0e3] px-2.5 py-1.5 text-[12px] text-[#9a5a1e]">
                Your system clock moved backwards — the trial countdown is paused until it catches up.
              </p>
            )}
            <a
              href={BUY_URL}
              target="_blank"
              rel="noreferrer"
              className={`mt-4 flex items-center justify-center gap-2 rounded-[10px] bg-accent px-4 py-2.5 text-[14px] font-semibold text-white hc-glow transition hover:bg-[#403bd6] ${FOCUS_RING}`}
            >
              <Icon name="sparkles" className="text-[15px]" /> Buy HomeCanvas Pro
            </a>
            <label className="mt-4 block text-[12.5px] font-semibold text-dim">
              Already have a key?
              <textarea
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="HCPRO.…"
                rows={3}
                spellCheck={false}
                className={`mt-1.5 w-full resize-none rounded-[10px] border border-line bg-field px-3 py-2 font-mono text-[12px] text-ink outline-none placeholder:text-faint focus:border-accent/50 ${FOCUS_RING}`}
              />
            </label>
            {error && <p className="mt-2 rounded-[8px] border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[12px] text-rose-700">{error}</p>}
            <div className="mt-3 flex justify-end">
              <Button variant="primary" size="sm" onClick={() => void activate()} disabled={busy || !key.trim()}>
                {busy ? 'Checking…' : 'Activate'}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
