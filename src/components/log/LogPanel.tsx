import { useEffect, useMemo, useRef, useState } from 'react';
import { useLog, type LogEntry, type LogSource } from '../../store/log-store';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';

type Filter = 'all' | 'user' | 'app' | 'errors';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'user', label: 'You' },
  { key: 'app', label: 'App' },
  { key: 'errors', label: 'Issues' },
];

function clockOf(at: number): string {
  const d = new Date(at);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function matches(e: LogEntry, f: Filter): boolean {
  if (f === 'all') return true;
  if (f === 'errors') return e.level === 'error' || e.level === 'warn';
  return e.source === f;
}

function badgeOf(source: LogSource): { label: string; cls: string } {
  return source === 'user'
    ? { label: 'You', cls: 'bg-accent/10 text-accent' }
    : { label: 'App', cls: 'bg-neutral-800 text-neutral-500' };
}

function dotOf(level: LogEntry['level']): string {
  return level === 'error' ? 'bg-rose-500' : level === 'warn' ? 'bg-amber-500' : 'bg-emerald-500';
}

function LogRow({ entry }: { entry: LogEntry }) {
  const [open, setOpen] = useState(false);
  const badge = badgeOf(entry.source);
  return (
    <div className="border-b border-panel-border/60 px-3 py-1.5 text-[12px]">
      <div className="flex items-start gap-2">
        <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dotOf(entry.level)}`} />
        <span className="shrink-0 pt-0.5 font-mono text-[10px] tabular-nums text-neutral-500">{clockOf(entry.at)}</span>
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${badge.cls}`}>{badge.label}</span>
        <span className={`min-w-0 flex-1 break-words ${entry.level === 'error' ? 'text-rose-600' : 'text-neutral-200'}`}>{entry.message}</span>
        {entry.detail && (
          <button
            onClick={() => setOpen((o) => !o)}
            className="shrink-0 text-neutral-500 hover:text-neutral-300"
            title={open ? 'Hide details' : 'Show details'}
          >
            <Icon name={open ? 'chevronUp' : 'chevronDown'} />
          </button>
        )}
      </div>
      {open && entry.detail && (
        <pre className="ml-6 mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-neutral-900 p-2 text-[10px] leading-snug text-neutral-400">
          {entry.detail}
        </pre>
      )}
    </div>
  );
}

/** The Design page's "Log" tab — a structured, filterable feed of user actions and app events. */
export function LogPanel() {
  const entries = useLog((s) => s.entries);
  const clear = useLog((s) => s.clear);
  const [filter, setFilter] = useState<Filter>('all');
  const scrollRef = useRef<HTMLDivElement>(null);
  const shown = useMemo(() => entries.filter((e) => matches(e, filter)), [entries, filter]);

  useEffect(() => {
    // Depend on the (stable, useMemo'd) filtered array, not just its length — so the
    // scroll still fires once the log hits its cap and a new entry drops an old one.
    scrollRef.current?.scrollTo({ top: 1e9 });
  }, [shown]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1.5 border-b border-panel-border px-2.5 py-2">
        <div className="flex overflow-hidden rounded-md border border-panel-border text-[11px]">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-2 py-1 font-medium ${filter === f.key ? 'bg-accent text-white' : 'text-neutral-500 hover:text-neutral-300'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-[11px] tabular-nums text-neutral-500">{shown.length}</span>
        <Button variant="ghost" size="sm" icon="trash" onClick={clear} disabled={entries.length === 0}>
          Clear
        </Button>
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        {shown.length === 0 ? (
          <div className="p-4 text-center text-[12px] text-neutral-500">
            {entries.length === 0
              ? 'No activity yet. Your edits, assistant chats, and any errors show up here.'
              : 'Nothing in this filter.'}
          </div>
        ) : (
          shown.map((e) => <LogRow key={e.id} entry={e} />)
        )}
      </div>
    </div>
  );
}

/** A tiny red error-count badge for the "Log" tab. Subscribes to the log store on
 *  its own so it can update without re-rendering the (heavy) Design page. */
export function LogTabBadge() {
  const errors = useLog((s) => s.entries.reduce((n, e) => n + (e.level === 'error' ? 1 : 0), 0));
  if (errors === 0) return null;
  return (
    <span className="ml-1 inline-flex min-w-[15px] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold leading-none text-white">
      {errors > 99 ? '99+' : errors}
    </span>
  );
}
