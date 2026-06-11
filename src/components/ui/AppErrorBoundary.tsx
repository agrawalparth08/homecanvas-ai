import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportError } from '../../store/error-store';

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/**
 * Catches render/lifecycle crashes anywhere in the tree. Without this, a thrown
 * error during render blanks the whole app to a white screen with nothing shown.
 * Here we both surface it as a global toast AND render a visible recovery panel.
 */
export class AppErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    reportError(error.message || 'A component crashed while rendering', {
      kind: 'render',
      detail: [error.stack, info.componentStack].filter(Boolean).join('\n\n'),
    });
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-canvas-bg p-6 text-center text-neutral-200">
        <div className="max-w-lg rounded-xl border border-red-800 bg-red-950/70 p-6 shadow-2xl">
          <div className="text-3xl">⚠</div>
          <h1 className="mt-2 text-lg font-semibold text-red-200">Something broke on screen</h1>
          <p className="mt-2 break-words text-sm text-red-100/90">{error.message}</p>
          {error.stack && (
            <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-black/40 p-3 text-left text-[10px] leading-snug text-red-200/80">
              {error.stack}
            </pre>
          )}
          <div className="mt-4 flex justify-center gap-2">
            <button
              onClick={() => this.setState({ error: null })}
              className="rounded bg-neutral-800 px-3 py-2 text-sm text-neutral-100 hover:bg-neutral-700"
            >
              Try to recover
            </button>
            <button
              onClick={() => window.location.reload()}
              className="rounded bg-accent/25 px-3 py-2 text-sm text-accent hover:bg-accent/35"
            >
              Reload app
            </button>
          </div>
        </div>
      </div>
    );
  }
}
