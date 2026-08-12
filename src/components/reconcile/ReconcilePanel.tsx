import { useMemo } from 'react';
import type { HomeScene, RemapStatus } from '@lib/scene/schemas';
import { reconcileSummary, type StatusCounts } from '@lib/scene/reconcile-summary';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';

/**
 * Re-extraction diff/merge dialog. When a freshly extracted plan is finished over
 * an existing home, this shows what reconcile() matched and lets the user MERGE
 * (keep their materials/furniture/locks on rooms that still match, via applyRemap)
 * or REPLACE outright. Pure presentation — the parent owns the scenes + actions.
 */
const STATUS_ORDER: RemapStatus[] = ['remapped', 'added', 'deleted', 'split', 'unresolved', 'kept'];
const STATUS_LABEL: Record<RemapStatus, string> = {
  kept: 'unchanged',
  remapped: 'matched (edits kept)',
  added: 'new',
  deleted: 'removed',
  split: 'split',
  unresolved: 'needs review',
};
const STATUS_TONE: Record<RemapStatus, string> = {
  kept: 'text-faint',
  remapped: 'text-ok',
  added: 'text-accent',
  deleted: 'text-rose-600',
  split: 'text-warn',
  unresolved: 'text-warn',
};

function CountRow({ label, counts }: { label: string; counts: StatusCounts }) {
  const parts = STATUS_ORDER.filter((s) => counts[s] > 0);
  return (
    <div className="flex items-baseline gap-2 text-[13px]">
      <span className="w-12 shrink-0 font-medium text-dim">{label}</span>
      {parts.length === 0 ? (
        <span className="text-faint">none</span>
      ) : (
        <span className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono">
          {parts.map((s) => (
            <span key={s} className={STATUS_TONE[s]}>
              {counts[s]} {STATUS_LABEL[s]}
            </span>
          ))}
        </span>
      )}
    </div>
  );
}

export function ReconcilePanel({
  existing,
  fresh,
  onMerge,
  onReplace,
  onCancel,
}: {
  existing: HomeScene;
  fresh: HomeScene;
  onMerge: () => void;
  onReplace: () => void;
  onCancel: () => void;
}) {
  const sum = useMemo(() => reconcileSummary(existing, fresh), [existing, fresh]);
  const added = sum.application.added.length;
  const unresolved = sum.application.unresolved.length;

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/40 p-4">
      <div className="hc-window w-full max-w-lg rounded-2xl bg-panel p-6 shadow-xl">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
            <Icon name="sparkles" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-ink">Re-extraction detected</h2>
            <p className="mt-1 text-sm text-dim">
              This freshly extracted plan has new entity ids. <b className="text-ink">Merge</b> keeps your
              materials, furniture and locks on rooms that still match and only updates their geometry.{' '}
              <b className="text-ink">Replace</b> starts from the new plan, dropping prior edits.
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-1.5 rounded-lg border border-line bg-soft p-3">
          <CountRow label="Rooms" counts={sum.rooms} />
          <CountRow label="Walls" counts={sum.walls} />
        </div>

        {sum.orphanedFurnitureIds.length > 0 && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-[#e9c89e] bg-[#fbf0e3] px-3 py-2 text-[13px] text-[#9a5a1e]">
            <Icon name="warning" className="mt-0.5 shrink-0" />
            <span>
              <span className="font-mono">{sum.orphanedFurnitureIds.length}</span> furniture piece(s) are in rooms the
              merge would remove — they would be dropped. Lock them first if you want to keep them.
            </span>
          </div>
        )}

        {(added > 0 || unresolved > 0) && (
          <p className="mt-3 text-[12px] text-faint">
            <span className="font-mono">{added}</span> new and <span className="font-mono">{unresolved}</span> ambiguous
            entit{added + unresolved === 1 ? 'y is' : 'ies are'} surfaced for manual review — the merge applies only
            the safe, unambiguous changes.
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" size="md" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="secondary" size="md" onClick={onReplace}>
            Replace entirely
          </Button>
          <Button variant="primary" size="md" icon="check" onClick={onMerge} disabled={sum.patchOpCount === 0}>
            Merge (keep my edits)
          </Button>
        </div>
      </div>
    </div>
  );
}
