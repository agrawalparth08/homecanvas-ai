import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportError } from '../../store/error-store';
import { Button } from './Button';
import { Icon } from './Icon';

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
      <div className="flex h-screen flex-col items-center justify-center bg-canvas-bg p-6 text-center">
        <div className="max-w-lg rounded-xl border border-panel-border bg-panel p-7 shadow-xl">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-2xl text-rose-600">
            <Icon name="warning" />
          </span>
          <h1 className="mt-3 text-base font-semibold text-neutral-100">Something broke on screen</h1>
          <p className="mt-1.5 break-words text-sm text-neutral-400">{error.message}</p>
          {error.stack && (
            <pre className="mt-4 max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-neutral-900 p-3 text-left text-[10px] leading-snug text-neutral-400">
              {error.stack}
            </pre>
          )}
          <div className="mt-5 flex justify-center gap-2">
            <Button variant="secondary" size="md" onClick={() => this.setState({ error: null })}>
              Try to recover
            </Button>
            <Button variant="primary" size="md" icon="redo" onClick={() => window.location.reload()}>
              Reload app
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
