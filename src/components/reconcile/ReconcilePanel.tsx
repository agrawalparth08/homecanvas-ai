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
  kept: 'text-neutral-500',
  remapped: 'text-emerald-600',
  added: 'text-accent',
  deleted: 'text-rose-600',
  split: 'text-amber-600',
  unresolved: 'text-amber-600',
};

function CountRow({ label, counts }: { label: string; counts: StatusCounts }) {
  const parts = STATUS_ORDER.filter((s) => counts[s] > 0);
  return (
    <div className="flex items-baseline gap-2 text-[13px]">
      <span className="w-12 shrink-0 font-medium text-neutral-300">{label}</span>
      {parts.length === 0 ? (
        <span className="text-neutral-500">none</span>
      ) : (
        <span className="flex flex-wrap gap-x-3 gap-y-0.5">
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
      <div className="w-full max-w-lg rounded-xl border border-panel-border bg-panel p-6 shadow-xl">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
            <Icon name="sparkles" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-neutral-100">Re-extraction detected</h2>
            <p className="mt-1 text-sm text-neutral-400">
              This freshly extracted plan has new entity ids. <b className="text-neutral-300">Merge</b> keeps your
              materials, furniture and locks on rooms that still match and only updates their geometry.{' '}
              <b className="text-neutral-300">Replace</b> starts from the new plan, dropping prior edits.
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-1.5 rounded-lg border border-panel-border bg-neutral-900/40 p-3">
          <CountRow label="Rooms" counts={sum.rooms} />
          <CountRow label="Walls" counts={sum.walls} />
        </div>

        {sum.orphanedFurnitureIds.length > 0 && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-700">
            <Icon name="warning" className="mt-0.5 shrink-0" />
            <span>
              {sum.orphanedFurnitureIds.length} furniture piece(s) are in rooms the merge would remove — they would be
              dropped. Lock them first if you want to keep them.
            </span>
          </div>
        )}

        {(added > 0 || unresolved > 0) && (
          <p className="mt-3 text-[12px] text-neutral-500">
            {added} new and {unresolved} ambiguous entit{added + unresolved === 1 ? 'y is' : 'ies are'} surfaced for
            manual review — the merge applies only the safe, unambiguous changes.
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
