import { create } from 'zustand';

/**
 * App-wide error surface. ANY failure — a rejected commit, an uncaught render
 * crash, a window error, a rejected promise, a hand-reported problem — lands
 * here and is shown as a prominent on-screen toast (see ErrorOverlay), so a
 * silent failure can't hide. Deliberately independent of the editor store so it
 * works on every page (home, upload, tracing) and even when no scene is loaded.
 */
export type AppErrorKind = 'rejected' | 'runtime' | 'render' | 'network' | 'info';

export interface AppError {
  id: string;
  kind: AppErrorKind;
  message: string;
  /** Optional extra context (stack, op id, the rejected reason) shown when expanded. */
  detail?: string;
  /** Monotonic counter used both as a key and to de-duplicate a burst of the same message. */
  seq: number;
}

interface ErrorState {
  errors: AppError[];
  report: (e: { kind?: AppErrorKind; message: string; detail?: string }) => void;
  dismiss: (id: string) => void;
  clear: () => void;
}

let seq = 0;
const MAX_VISIBLE = 6; // keep the stack bounded; oldest fall off

export const useErrors = create<ErrorState>((set) => ({
  errors: [],
  report: ({ kind = 'runtime', message, detail }) =>
    set((s) => {
      const msg = (message || 'Something went wrong').slice(0, 600);
      // Collapse an immediate repeat of the same message instead of stacking 20
      // identical toasts (e.g. a render loop throwing every frame).
      const last = s.errors[s.errors.length - 1];
      if (last && last.message === msg && last.kind === kind) return s;
      seq += 1;
      const next: AppError = { id: `err-${seq}`, kind, message: msg, seq };
      if (detail) next.detail = detail.slice(0, 4000);
      return { errors: [...s.errors, next].slice(-MAX_VISIBLE) };
    }),
  dismiss: (id) => set((s) => ({ errors: s.errors.filter((e) => e.id !== id) })),
  clear: () => set({ errors: [] }),
}));

/**
 * Module-level reporter usable from non-React code (the editor store, async
 * handlers, catch blocks). Mirrors useErrors().report.
 */
export function reportError(message: string, opts?: { kind?: AppErrorKind; detail?: string }): void {
  useErrors.getState().report({ message, ...(opts ?? {}) });
}

let installed = false;
/**
 * Wire browser-level failures into the on-screen surface. Idempotent. Call once
 * at startup. Without this, an uncaught error or rejected promise only shows in
 * the console — invisible to someone just using the app.
 */
export function installGlobalErrorHandlers(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  window.addEventListener('error', (e: ErrorEvent) => {
    // Asset/script load errors arrive as ErrorEvent with no .error; still surface them.
    const message = e.message || (e.error as Error | undefined)?.message || 'Uncaught error';
    const where = e.filename ? `${e.filename}:${e.lineno}:${e.colno}` : undefined;
    const stack = (e.error as Error | undefined)?.stack;
    const detail = [where, stack].filter(Boolean).join('\n');
    reportError(message, { kind: 'runtime', ...(detail ? { detail } : {}) });
  });

  window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    const reason = e.reason as unknown;
    const message =
      reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : 'Unhandled promise rejection';
    const detail = reason instanceof Error ? reason.stack : undefined;
    reportError(message, { kind: 'runtime', ...(detail ? { detail } : {}) });
  });
}
