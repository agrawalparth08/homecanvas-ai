import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createProjectApi,
  duplicateProjectApi,
  fetchAssetFetchStatus,
  fetchProjects,
  fetchStorageStats,
  fetchTrashedProjects,
  renameProjectApi,
  restoreProject,
  startAssetFetch,
  trashProject,
  type ProjectMeta,
  type TrashedProject,
} from '../api';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Icon, type IconName } from '../components/ui/Icon';
import { ProfileDialog } from '../components/ui/ProfileDialog';
import { Chip, FOCUS_RING, Mono, SectionLabel, Segmented } from '../components/ui/primitives';
import { reportError } from '../store/error-store';

type View = 'all' | 'recent' | 'templates' | 'trash';
type Filter = 'all' | 'homes' | 'apartments' | 'samples';
type Kind = 'home' | 'apartment' | 'sample';

interface Project {
  id: string;
  to: string;
  name: string;
  kind: Kind;
  hasScene: boolean;
  stats: string;
  edited: string;
  gradient: string;
  glyph: number;
  badge?: string;
}

/** Card background gradients, cycled by list index so the grid reads as varied. */
const GRADIENTS = [
  'linear-gradient(160deg,#eef0f6,#e2e5ee)',
  'linear-gradient(160deg,#efe7da,#e6dcc8)',
  'linear-gradient(160deg,#e3ecf0,#d3e2e8)',
  'linear-gradient(160deg,#eee7f2,#e2d8ec)',
];

function isBuiltInProject(id: string): boolean {
  return id === 'sample-home' || id === 'my-home';
}

function formatCreated(iso: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Server ProjectMeta -> card view model. Stats line is mono (kind + created date). */
function toProject(meta: ProjectMeta, index: number): Project {
  const created = formatCreated(meta.createdAt);
  return {
    id: meta.id,
    to: `/design/${meta.id}`,
    name: meta.name,
    kind: meta.kind,
    hasScene: meta.hasScene,
    stats: created ? `${meta.kind} · ${created}` : meta.kind,
    edited: meta.hasScene ? 'Ready to open' : 'No scene yet — trace a plan',
    gradient: GRADIENTS[index % GRADIENTS.length]!,
    glyph: index,
    ...(meta.kind === 'sample' ? { badge: 'SAMPLE' } : {}),
  };
}

/** Human-readable byte count for the storage meter (mono, e.g. "1.2 GB"). */
function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return '0 KB';
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / 1024 ** 2;
  if (mb >= 1) return `${Math.round(mb)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Track recently-opened projects locally (no backend) so the Recent view is real. */
function recordOpen(id: string) {
  try {
    const raw = JSON.parse(localStorage.getItem('hc-recent') ?? '[]') as { id: string; at: number }[];
    const next = [{ id, at: Date.now() }, ...raw.filter((r) => r.id !== id)].slice(0, 12);
    localStorage.setItem('hc-recent', JSON.stringify(next));
  } catch {
    /* private mode / quota — Recent just falls back to default order */
  }
}
function readRecentIds(): string[] {
  try {
    return (JSON.parse(localStorage.getItem('hc-recent') ?? '[]') as { id: string }[]).map((r) => r.id);
  } catch {
    return [];
  }
}

/** Dismissible "Get started" checklist state — the two steps that can't be
 *  auto-detected (restyle, share) are hand-marked done on click; the other two
 *  derive from live project data so they can't go stale. */
interface OnboardingState {
  dismissed: boolean;
  steps: { restyle: boolean; share: boolean };
}
function readOnboarding(): OnboardingState {
  try {
    const raw = JSON.parse(localStorage.getItem('hc-onboarding') ?? 'null') as Partial<OnboardingState> | null;
    return {
      dismissed: !!raw?.dismissed,
      steps: { restyle: !!raw?.steps?.restyle, share: !!raw?.steps?.share },
    };
  } catch {
    return { dismissed: false, steps: { restyle: false, share: false } };
  }
}
function writeOnboarding(state: OnboardingState) {
  try {
    localStorage.setItem('hc-onboarding', JSON.stringify(state));
  } catch {
    /* private mode / quota — checklist just won't persist across reloads */
  }
}

/** A little floor-plan glyph for project thumbnails (indigo perimeter + grey interior). */
function PlanGlyph({ variant }: { variant: number }) {
  const plans = [
    <svg key="0" width="172" height="100" viewBox="0 0 240 140" aria-hidden>
      <rect x="20" y="18" width="200" height="104" rx="5" fill="#fff" stroke="#4b46e5" strokeWidth="3" />
      <line x1="120" y1="18" x2="120" y2="70" stroke="#4b46e5" strokeWidth="3" />
      <line x1="20" y1="74" x2="120" y2="74" stroke="#cdd2dc" strokeWidth="3" />
      <line x1="160" y1="74" x2="220" y2="74" stroke="#cdd2dc" strokeWidth="3" />
      <line x1="160" y1="74" x2="160" y2="122" stroke="#cdd2dc" strokeWidth="3" />
    </svg>,
    <svg key="1" width="172" height="100" viewBox="0 0 240 140" aria-hidden>
      <rect x="28" y="20" width="184" height="100" rx="5" fill="#fff" stroke="#4b46e5" strokeWidth="3" />
      <line x1="110" y1="20" x2="110" y2="120" stroke="#cdd2dc" strokeWidth="3" />
      <line x1="110" y1="72" x2="212" y2="72" stroke="#cdd2dc" strokeWidth="3" />
    </svg>,
  ];
  return plans[variant % plans.length];
}

function ProjectCard({
  p,
  onOpen,
  onTrashRequest,
  onRename,
  onDuplicate,
  duplicating,
}: {
  p: Project;
  onOpen: (id: string) => void;
  /** Omit to hide the hover trash button (e.g. the read-only Templates copy). */
  onTrashRequest?: (p: Project) => void;
  /** Omit to hide the hover rename button. Always hidden for built-ins regardless. */
  onRename?: (p: Project) => void;
  /** Omit to hide the hover duplicate button. */
  onDuplicate?: (p: Project) => void;
  duplicating?: boolean;
}) {
  const builtIn = isBuiltInProject(p.id);
  return (
    <Link
      to={p.to}
      onClick={() => onOpen(p.id)}
      className="hc-card-glow group relative overflow-hidden rounded-[14px] border border-line bg-panel hc-card"
    >
      <div className="relative flex h-[138px] items-center justify-center" style={{ background: p.gradient }}>
        <PlanGlyph variant={p.glyph} />
        {p.badge && (
          <span className="absolute left-2.5 top-2.5 rounded-[7px] bg-panel px-2 py-1 text-[11px] font-bold text-accent shadow-[0_2px_6px_-2px_rgba(20,22,40,0.25)]">
            {p.badge}
          </span>
        )}
        <div className="absolute right-2.5 top-2.5 flex gap-1.5 opacity-0 transition group-hover:opacity-100">
          {onDuplicate && p.hasScene && (
            <button
              type="button"
              title="Duplicate"
              aria-label={`Duplicate ${p.name}`}
              disabled={duplicating}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDuplicate(p);
              }}
              className={`flex h-7 w-7 items-center justify-center rounded-[7px] bg-panel text-dim shadow-[0_2px_6px_-2px_rgba(20,22,40,0.25)] transition hover:text-accent disabled:opacity-45 ${FOCUS_RING}`}
            >
              <Icon name="layers" className="text-[13px]" />
            </button>
          )}
          {onRename && !builtIn && (
            <button
              type="button"
              title="Rename"
              aria-label={`Rename ${p.name}`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onRename(p);
              }}
              className={`flex h-7 w-7 items-center justify-center rounded-[7px] bg-panel text-dim shadow-[0_2px_6px_-2px_rgba(20,22,40,0.25)] transition hover:text-accent ${FOCUS_RING}`}
            >
              <Icon name="pencil" className="text-[13px]" />
            </button>
          )}
          {onTrashRequest && (
            <button
              type="button"
              title="Move to trash"
              aria-label={`Move ${p.name} to trash`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onTrashRequest(p);
              }}
              className={`flex h-7 w-7 items-center justify-center rounded-[7px] bg-panel text-dim shadow-[0_2px_6px_-2px_rgba(20,22,40,0.25)] transition hover:text-rose-600 ${FOCUS_RING}`}
            >
              <Icon name="trash" className="text-[13px]" />
            </button>
          )}
        </div>
      </div>
      <div className="px-[15px] pb-4 pt-3.5">
        <span className="block text-[15.5px] font-bold">{p.name}</span>
        <Mono className="mt-1.5 block text-[11.5px] text-faint">{p.stats}</Mono>
        <span className="mt-2 block text-[12px] text-faint">{p.edited}</span>
      </div>
    </Link>
  );
}

function UploadTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[236px] flex-col items-center justify-center gap-3 rounded-[14px] border-[1.5px] border-dashed border-[#c7ccd6] bg-[#fafbfc] text-dim transition hover:border-accent/50 hover:bg-wash/40"
    >
      <span className="flex h-[46px] w-[46px] items-center justify-center rounded-xl bg-wash text-accent">
        <Icon name="plus" className="text-[22px]" strokeWidth={2.2} />
      </span>
      <span className="text-[14.5px] font-semibold text-ink">Upload &amp; trace a plan</span>
      <span className="text-[12.5px] text-faint">PDF, PNG or JPG</span>
    </button>
  );
}

function EmptyState({ icon, title, body }: { icon: IconName; title: string; body: ReactNode }) {
  return (
    <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 rounded-[14px] border border-dashed border-line bg-panel/50 p-10 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-soft text-faint">
        <Icon name={icon} className="text-[24px]" />
      </span>
      <span className="text-[15px] font-bold text-ink">{title}</span>
      <span className="max-w-sm text-[13px] text-dim">{body}</span>
    </div>
  );
}

function TrashedRow({ entry, onRestored }: { entry: TrashedProject; onRestored: () => void }) {
  const [restoring, setRestoring] = useState(false);
  const onRestore = async () => {
    setRestoring(true);
    const ok = await restoreProject(entry.projectId, entry.trashedAt);
    setRestoring(false);
    if (ok) {
      onRestored();
    } else {
      reportError(`Couldn't restore ${entry.name} — a live scene may already exist.`, { kind: 'rejected' });
    }
  };
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-panel px-4 py-3.5">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[9px] bg-soft text-faint">
          <Icon name="trash" className="text-[16px]" />
        </span>
        <div>
          <span className="block text-[13.5px] font-semibold text-ink">{entry.name}</span>
          <Mono className="text-[11.5px] text-faint">Trashed {new Date(entry.trashedAt).toLocaleString()}</Mono>
        </div>
      </div>
      <button
        type="button"
        disabled={restoring}
        onClick={onRestore}
        className={`rounded-[9px] border border-wash-line px-3.5 py-2 text-[13px] font-semibold text-accent transition hover:bg-wash disabled:opacity-45 ${FOCUS_RING}`}
      >
        {restoring ? 'Restoring…' : 'Restore'}
      </button>
    </div>
  );
}

/** Small "New project" dialog — name + kind — following ConfirmDialog's visual pattern. */
function CreateProjectDialog({
  open,
  creating,
  onCreate,
  onCancel,
}: {
  open: boolean;
  creating: boolean;
  onCreate: (name: string, kind: 'home' | 'apartment') => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'home' | 'apartment'>('home');

  useEffect(() => {
    if (open) {
      setName('');
      setKind('home');
    }
  }, [open]);

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

  const trimmed = name.trim();
  const canSubmit = trimmed.length > 0 && !creating;
  const submit = () => {
    if (canSubmit) onCreate(trimmed, kind);
  };

  return (
    <div
      className="fixed inset-0 z-[1100] flex items-center justify-center bg-ink/10 p-4 backdrop-blur-[2px]"
      onPointerDown={onCancel}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="New project"
        className="hc-card w-full max-w-sm rounded-2xl border border-line bg-panel p-6"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <h2 className="text-[15px] font-semibold text-ink">New project</h2>
        <label className="mt-4 block text-[12.5px] font-semibold text-dim">
          Name
          <input
            autoFocus
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
            placeholder="e.g. Lake House"
            className={`mt-1.5 w-full rounded-[10px] border border-line bg-field px-3 py-2 text-[14px] text-ink outline-none placeholder:text-faint focus:border-accent/50 ${FOCUS_RING}`}
          />
        </label>
        <div className="mt-4">
          <span className="block text-[12.5px] font-semibold text-dim">Type</span>
          <Segmented<'home' | 'apartment'>
            className="mt-1.5"
            value={kind}
            onChange={setKind}
            active="white"
            options={[
              { value: 'home', label: 'Home' },
              { value: 'apartment', label: 'Apartment' },
            ]}
          />
        </div>
        <div className="mt-6 flex justify-end gap-2.5">
          <Button variant="secondary" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" disabled={!canSubmit} onClick={submit}>
            {creating ? 'Creating…' : 'Create project'}
          </Button>
        </div>
      </div>
    </div>
  );
}

interface OnboardingStepDef {
  key: string;
  label: string;
  done: boolean;
  /** Route to deep-link to. Omit for a step that opens a dialog instead. */
  to?: string;
  hint?: string;
  onClick?: () => void;
}

/** "Get started" checklist card — bg-wash/border-wash-line, accent sparkles icon,
 *  a mono N/M progress readout, and a dismiss control. Each row is a deep link
 *  (or a button for the one step that opens a dialog) with an ok-tint check when done. */
function OnboardingChecklist({ steps, onDismiss }: { steps: OnboardingStepDef[]; onDismiss: () => void }) {
  const done = steps.filter((s) => s.done).length;
  return (
    <div className="mb-5 flex items-start gap-3 rounded-xl border border-wash-line bg-wash p-4">
      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] bg-accent text-white">
        <Icon name="sparkles" className="text-[16px]" strokeWidth={1.9} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[14px] font-bold text-ink">Get started</span>
          <div className="flex flex-shrink-0 items-center gap-2.5">
            <Mono className="text-[11.5px] font-semibold text-accent">
              {done}/{steps.length}
            </Mono>
            <button
              type="button"
              aria-label="Dismiss checklist"
              onClick={onDismiss}
              className={`flex h-6 w-6 items-center justify-center rounded-[6px] text-faint transition hover:bg-panel hover:text-dim ${FOCUS_RING}`}
            >
              <Icon name="close" className="text-[13px]" />
            </button>
          </div>
        </div>
        <div className="mt-2.5 flex flex-col gap-1">
          {steps.map((s) => {
            const rowClass = `flex items-center gap-2.5 rounded-[8px] px-2 py-1.5 text-left text-[13px] transition hover:bg-panel/60 ${FOCUS_RING}`;
            const inner = (
              <>
                <span
                  className={`flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-full ${
                    s.done ? 'bg-[#e9f6ef] text-ok' : 'border border-line bg-panel text-transparent'
                  }`}
                >
                  <Icon name="check" className="text-[10px]" strokeWidth={2.6} />
                </span>
                <span className={s.done ? 'text-dim' : 'font-semibold text-ink'}>{s.label}</span>
                {!s.done && s.hint && <span className="hidden text-[12px] text-faint sm:inline">— {s.hint}</span>}
              </>
            );
            return s.to ? (
              <Link key={s.key} to={s.to} onClick={s.onClick} className={rowClass}>
                {inner}
              </Link>
            ) : (
              <button key={s.key} type="button" onClick={s.onClick} className={rowClass}>
                {inner}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function HomePage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: projects = [], isLoading: projectsLoading } = useQuery({ queryKey: ['projects'], queryFn: fetchProjects });
  const { data: storage } = useQuery({ queryKey: ['storage'], queryFn: fetchStorageStats });
  const { data: trashedProjects = [] } = useQuery({ queryKey: ['trashed-projects'], queryFn: fetchTrashedProjects });
  const { data: fetchStatus } = useQuery({
    queryKey: ['assets-fetch-status'],
    queryFn: fetchAssetFetchStatus,
    // Keep polling every 2s only while the download is actually in flight.
    refetchInterval: (q) => (q.state.data?.running ? 2000 : false),
  });
  const [view, setView] = useState<View>('all');
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<string[]>(() => readRecentIds());
  const [confirmTrash, setConfirmTrash] = useState<Project | null>(null);
  const [trashing, setTrashing] = useState(false);
  const [fetchStarting, setFetchStarting] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [onboarding, setOnboarding] = useState<OnboardingState>(() => readOnboarding());

  // On completion, refresh what the download actually changed.
  useEffect(() => {
    if (!fetchStatus?.done) return;
    void queryClient.invalidateQueries({ queryKey: ['storage'] });
    void queryClient.invalidateQueries({ queryKey: ['asset-manifest'] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchStatus?.done]);

  const projectViews: Project[] = useMemo(() => projects.map((m, i) => toProject(m, i)), [projects]);
  const sampleProject = projectViews.find((p) => p.kind === 'sample');

  const markOnboardingStep = (key: 'restyle' | 'share') => {
    setOnboarding((cur) => {
      if (cur.steps[key]) return cur;
      const next: OnboardingState = { ...cur, steps: { ...cur.steps, [key]: true } };
      writeOnboarding(next);
      return next;
    });
  };
  const dismissOnboarding = () => {
    setOnboarding((cur) => {
      const next: OnboardingState = { ...cur, dismissed: true };
      writeOnboarding(next);
      return next;
    });
  };
  const onboardingSteps: OnboardingStepDef[] = [
    {
      key: 'create',
      label: 'Create your first client project',
      done: projectViews.some((p) => !isBuiltInProject(p.id)),
      onClick: () => setCreateOpen(true),
    },
    {
      key: 'trace',
      label: 'Trace a floor plan',
      done: projectViews.some((p) => p.kind !== 'sample' && p.hasScene),
      to: '/upload',
    },
    {
      key: 'restyle',
      label: 'Restyle a room',
      done: onboarding.steps.restyle,
      to: '/design/sample-home',
      onClick: () => markOnboardingStep('restyle'),
    },
    {
      key: 'share',
      label: 'Send a client viewer',
      done: onboarding.steps.share,
      to: '/design/sample-home',
      hint: 'Use Share in the canvas toolbar once you’re in',
      onClick: () => markOnboardingStep('share'),
    },
  ];
  const onboardingComplete = onboardingSteps.every((s) => s.done);

  const onOpen = (id: string) => {
    recordOpen(id);
    setRecent(readRecentIds());
  };

  const invalidateAfterProjectChange = (projectId?: string) => {
    void queryClient.invalidateQueries({ queryKey: ['projects'] });
    void queryClient.invalidateQueries({ queryKey: ['storage'] });
    if (projectId === 'my-home') void queryClient.invalidateQueries({ queryKey: ['private-manifest'] });
  };

  const invalidateAfterTrashChange = (projectId: string) => {
    void queryClient.invalidateQueries({ queryKey: ['trashed-projects'] });
    invalidateAfterProjectChange(projectId);
  };

  const onConfirmTrash = async () => {
    if (!confirmTrash) return;
    // Close the dialog BEFORE the await — a double-click on Confirm must not
    // fire a second POST (the first move already emptied the live scene → 404).
    const trashedId = confirmTrash.id;
    const trashedName = confirmTrash.name;
    setConfirmTrash(null);
    setTrashing(true);
    const ok = await trashProject(trashedId);
    setTrashing(false);
    if (ok) {
      invalidateAfterTrashChange(trashedId);
    } else {
      reportError(`Couldn't move ${trashedName} to trash.`, { kind: 'rejected' });
    }
  };

  const onCreateProject = async (name: string, kind: 'home' | 'apartment') => {
    setCreating(true);
    const project = await createProjectApi(name, kind);
    setCreating(false);
    if (project) {
      setCreateOpen(false);
      invalidateAfterProjectChange();
      navigate(`/design/${project.id}`);
    } else {
      reportError('Could not create the project — is the local server running?', { kind: 'rejected' });
    }
  };

  const onRename = async (p: Project) => {
    const name = window.prompt('Rename project', p.name);
    const trimmed = name?.trim();
    if (!trimmed || trimmed === p.name) return;
    const ok = await renameProjectApi(p.id, trimmed);
    if (ok) {
      invalidateAfterProjectChange();
    } else {
      reportError(`Couldn't rename ${p.name}.`, { kind: 'rejected' });
    }
  };

  const onDuplicate = async (p: Project) => {
    setDuplicatingId(p.id);
    const project = await duplicateProjectApi(p.id);
    setDuplicatingId(null);
    if (project) {
      invalidateAfterProjectChange();
    } else {
      reportError(`Couldn't duplicate ${p.name} — it may not have a scene yet.`, { kind: 'rejected' });
    }
  };

  const onFetchAssets = async () => {
    setFetchStarting(true);
    const ok = await startAssetFetch();
    setFetchStarting(false);
    if (ok) {
      void queryClient.invalidateQueries({ queryKey: ['assets-fetch-status'] });
    } else {
      reportError('Asset download is already running or failed to start.', { kind: 'rejected' });
    }
  };

  // top-filter + search apply to the project grids (All / Recent)
  const q = query.trim().toLowerCase();
  const matches = (p: Project) =>
    (filter === 'all' ||
      (filter === 'homes' && p.kind === 'home') ||
      (filter === 'apartments' && p.kind === 'apartment') ||
      (filter === 'samples' && p.kind === 'sample')) &&
    (!q || `${p.name} ${p.stats} ${p.kind}`.toLowerCase().includes(q));

  const NAV: { key: View; label: string; icon: IconName }[] = [
    { key: 'all', label: 'All projects', icon: 'grid' },
    { key: 'recent', label: 'Recent', icon: 'clock' },
    { key: 'templates', label: 'Templates', icon: 'layers' },
    { key: 'trash', label: 'Trash', icon: 'trash' },
  ];

  const filtered = projectViews.filter(matches);
  const recentList = recent
    .map((id) => projectViews.find((p) => p.id === id))
    .filter((p): p is Project => !!p)
    .filter(matches);

  const showToolbar = view === 'all' || view === 'recent';
  const titles: Record<View, { h: string; sub: string }> = {
    all: {
      h: 'Projects',
      sub: `${projectViews.length} project${projectViews.length === 1 ? '' : 's'} · local-first · nothing leaves this machine`,
    },
    recent: { h: 'Recent', sub: recentList.length ? 'Projects you’ve opened, most recent first' : 'Open a project — it’ll show up here' },
    templates: { h: 'Templates', sub: 'Start a new home from a ready-made plan' },
    trash: { h: 'Trash', sub: 'Deleted projects land here' },
  };

  return (
    <div className="flex h-screen flex-col bg-app text-ink">
      {/* top bar */}
      <header className="flex h-[60px] flex-shrink-0 items-center gap-4 border-b border-line bg-panel px-5 sm:px-[22px]">
        <span className="inline-flex flex-shrink-0 items-center gap-2.5 whitespace-nowrap text-[17px] font-bold tracking-[-0.3px]">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-white">
            <Icon name="home" className="text-[17px]" strokeWidth={2} />
          </span>
          <span>
            HomeCanvas <span className="text-accent">AI</span>
          </span>
        </span>
        <div className="hidden h-[38px] max-w-[420px] flex-1 items-center gap-2.5 rounded-[10px] border border-line bg-soft px-3.5 focus-within:border-accent/50 md:flex">
          <Icon name="search" className="text-[16px] text-faint" strokeWidth={2} />
          <input
            type="search"
            aria-label="Search projects"
            placeholder="Search projects, rooms, materials…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-faint"
          />
        </div>
        <span className="flex-1" />
        <div className="hidden lg:block">
          <Chip tone="accent" dot>
            Local-first · nothing leaves this machine
          </Chip>
        </div>
        <button
          type="button"
          onClick={() => setProfileOpen(true)}
          aria-label="Designer profile"
          title="Designer profile"
          className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] border border-line bg-panel text-dim transition hover:bg-soft hover:text-ink ${FOCUS_RING}`}
        >
          <Icon name="user" className="text-[16px]" strokeWidth={1.8} />
        </button>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-2 rounded-[10px] bg-accent px-4 py-2.5 text-[14px] font-semibold text-white hc-glow transition hover:bg-[#403bd6]"
        >
          <Icon name="plus" className="text-[16px]" strokeWidth={2.2} />
          <span className="hidden sm:inline">New project</span>
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* library sidebar — real navigation */}
        <aside className="hidden w-[236px] flex-col gap-1 border-r border-line bg-sidebar p-3.5 lg:flex">
          <SectionLabel className="px-2.5 pb-2">Library</SectionLabel>
          {NAV.map((it) => {
            const active = view === it.key;
            return (
              <button
                key={it.key}
                onClick={() => setView(it.key)}
                className={`flex items-center gap-2.5 rounded-[9px] px-3 py-2.5 text-left text-[14.5px] outline-none transition focus-visible:ring-2 focus-visible:ring-accent/40 ${
                  active ? 'bg-wash font-semibold text-accent' : 'font-medium text-dim hover:bg-soft hover:text-ink'
                }`}
              >
                <Icon name={it.icon} className="text-[17px]" strokeWidth={1.9} />
                {it.label}
              </button>
            );
          })}
          <span className="flex-1" />
          <div className="flex flex-col gap-2.5 rounded-xl border border-line bg-panel p-3.5">
            <span className="flex justify-between text-[12px] font-semibold text-dim">
              <span>Local storage</span>
              <Mono className="text-faint">{storage ? formatBytes(storage.totalBytes) : '—'}</Mono>
            </span>
            {/* Stacked breakdown (assets / scenes+backups / app data) — shares of the
                total, so the bar always reads honestly rather than as "% full". */}
            <span className="flex h-1.5 gap-px overflow-hidden rounded bg-track">
              {storage && storage.totalBytes > 0 && (
                <>
                  <span className="block h-full bg-accent" style={{ width: `${(storage.assetsBytes / storage.totalBytes) * 100}%` }} title={`Assets ${formatBytes(storage.assetsBytes)}`} />
                  <span className="block h-full bg-[#6f6af0]" style={{ width: `${((storage.scenesBytes + storage.backupsBytes) / storage.totalBytes) * 100}%` }} title={`Scenes & backups ${formatBytes(storage.scenesBytes + storage.backupsBytes)}`} />
                  <span className="block h-full bg-[#c7c4f6]" style={{ width: `${(storage.appDataBytes / storage.totalBytes) * 100}%` }} title={`App data ${formatBytes(storage.appDataBytes)}`} />
                </>
              )}
            </span>
            <span className="text-[11.5px] text-faint">
              {storage
                ? `Assets ${formatBytes(storage.assetsBytes)} · scenes & backups ${formatBytes(storage.scenesBytes + storage.backupsBytes)}`
                : 'Textures, HDRIs & scenes on this machine'}
            </span>
          </div>
        </aside>

        {/* main */}
        <main className="min-w-0 flex-1 overflow-y-auto px-6 py-7 sm:px-8">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-[27px] font-extrabold tracking-[-0.6px]">{titles[view].h}</h1>
              <span className="text-[14px] text-faint">{titles[view].sub}</span>
            </div>
            {showToolbar && (
              <Segmented<Filter>
                value={filter}
                onChange={setFilter}
                active="white"
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'homes', label: 'Homes' },
                  { value: 'apartments', label: 'Apartments' },
                  { value: 'samples', label: 'Samples' },
                ]}
              />
            )}
          </div>

          {/* GET STARTED — dismissible onboarding checklist, All view only, while incomplete */}
          {view === 'all' && !onboarding.dismissed && !onboardingComplete && (
            <OnboardingChecklist steps={onboardingSteps} onDismiss={dismissOnboarding} />
          )}

          {/* ALL */}
          {view === 'all' && (
            <div className="grid grid-cols-1 gap-[18px] sm:grid-cols-2 xl:grid-cols-4">
              <UploadTile onClick={() => setCreateOpen(true)} />
              {filtered.map((p) => (
                <ProjectCard
                  key={p.id}
                  p={p}
                  onOpen={onOpen}
                  onTrashRequest={setConfirmTrash}
                  onRename={onRename}
                  onDuplicate={onDuplicate}
                  duplicating={duplicatingId === p.id}
                />
              ))}
              {filtered.length === 0 && (
                <div className="col-span-full">
                  <EmptyState
                    icon={projectsLoading ? 'clock' : 'search'}
                    title={projectsLoading ? 'Loading projects…' : 'No matches'}
                    body={
                      projectsLoading
                        ? 'Fetching your projects from the local server.'
                        : 'No projects match that filter or search. Clear it to see everything.'
                    }
                  />
                </div>
              )}
            </div>
          )}

          {/* RECENT */}
          {view === 'recent' &&
            (recentList.length ? (
              <div className="grid grid-cols-1 gap-[18px] sm:grid-cols-2 xl:grid-cols-4">
                {recentList.map((p) => (
                  <ProjectCard
                    key={p.id}
                    p={p}
                    onOpen={onOpen}
                    onTrashRequest={setConfirmTrash}
                    onRename={onRename}
                    onDuplicate={onDuplicate}
                    duplicating={duplicatingId === p.id}
                  />
                ))}
              </div>
            ) : (
              <EmptyState icon="clock" title="Nothing recent yet" body="Open a project and it’ll appear here, most-recently-opened first." />
            ))}

          {/* TEMPLATES */}
          {view === 'templates' && (
            <div className="grid grid-cols-1 gap-[18px] sm:grid-cols-2 xl:grid-cols-4">
              {sampleProject && (
                <ProjectCard
                  p={{ ...sampleProject, edited: 'Open a copy to explore', badge: 'TEMPLATE' }}
                  onOpen={onOpen}
                />
              )}
              <UploadTile onClick={() => setCreateOpen(true)} />
            </div>
          )}

          {/* TRASH */}
          {view === 'trash' &&
            (trashedProjects.length ? (
              <div className="flex max-w-[560px] flex-col gap-2.5">
                {trashedProjects.map((t) => (
                  <TrashedRow key={`${t.projectId}-${t.trashedAt}`} entry={t} onRestored={() => invalidateAfterTrashChange(t.projectId)} />
                ))}
              </div>
            ) : (
              <EmptyState
                icon="trash"
                title="Trash is empty"
                body="Deleted projects move here. Nothing’s been deleted — your homes are safe on this machine."
              />
            ))}

          {/* fetch-assets tip (general — All view only) */}
          {view === 'all' && (
            <div className="mt-6 flex max-w-[920px] items-center gap-3.5 rounded-xl border border-line bg-panel p-4">
              <span
                className={`flex h-[38px] w-[38px] flex-shrink-0 items-center justify-center rounded-[10px] ${
                  fetchStatus?.error ? 'border border-[#e9c89e] bg-[#fbf0e3] text-[#9a5a1e]' : fetchStatus?.done ? 'bg-[#e9f6ef] text-ok' : 'bg-wash text-accent'
                }`}
              >
                <Icon name={fetchStatus?.error ? 'warning' : fetchStatus?.done ? 'check' : 'sun'} className="text-[20px]" strokeWidth={1.9} />
              </span>
              <div className="min-w-0 flex-1">
                {fetchStatus?.done ? (
                  <span className="block text-[13.5px] font-semibold text-ok">Assets ready</span>
                ) : (
                  <span className="block text-[13.5px] font-semibold">
                    Download CC0 textures &amp; HDRIs for far more realistic materials
                  </span>
                )}
                {fetchStatus?.error ? (
                  <span className="block truncate text-[12.5px] text-[#9a5a1e]">{fetchStatus.error}</span>
                ) : fetchStatus?.running ? (
                  <Mono className="block truncate text-[12px] text-faint">
                    {fetchStatus.lastLines[fetchStatus.lastLines.length - 1] ?? 'Starting…'}
                  </Mono>
                ) : (
                  <span className="text-[12.5px] text-faint">
                    {fetchStatus?.available === false
                      ? 'In the installed app, run npm run fetch:assets from a source checkout.'
                      : 'Without it, everything still works with flat colours.'}
                  </span>
                )}
              </div>
              {fetchStatus?.available !== false && (
              <button
                type="button"
                disabled={fetchStarting || fetchStatus?.running}
                onClick={onFetchAssets}
                className={`flex-shrink-0 rounded-[9px] border border-wash-line px-3.5 py-2 text-[13px] font-semibold text-accent transition hover:bg-wash disabled:opacity-45 ${FOCUS_RING}`}
              >
                {fetchStatus?.running ? 'Downloading…' : fetchStatus?.done ? 'Re-download' : 'Download'}
              </button>
              )}
            </div>
          )}
        </main>
      </div>

      <ConfirmDialog
        open={!!confirmTrash}
        title={`Move "${confirmTrash?.name ?? ''}" to trash?`}
        message={
          confirmTrash?.id === 'my-home'
            ? 'Moves my-home.scene.json and my-home.manual.scene.json out of private-home-inputs into a local backups/trash folder. Nothing is deleted — restore it any time from the Trash view.'
            : 'Moves the scene file to a local trash folder on this machine. Nothing is deleted — restore it any time from the Trash view.'
        }
        confirmLabel={trashing ? 'Moving…' : 'Move to trash'}
        onConfirm={onConfirmTrash}
        onCancel={() => setConfirmTrash(null)}
      />

      <CreateProjectDialog open={createOpen} creating={creating} onCreate={(n, k) => void onCreateProject(n, k)} onCancel={() => setCreateOpen(false)} />
      <ProfileDialog open={profileOpen} onClose={() => setProfileOpen(false)} />
    </div>
  );
}
