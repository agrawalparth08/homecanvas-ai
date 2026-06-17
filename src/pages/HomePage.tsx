import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { fetchPrivateManifest } from '../api';
import { Icon, type IconName } from '../components/ui/Icon';
import { Chip, Mono, SectionLabel, Segmented } from '../components/ui/primitives';

type View = 'all' | 'recent' | 'templates' | 'trash';
type Filter = 'all' | 'homes' | 'apartments' | 'samples';
type Kind = 'home' | 'apartment' | 'sample';

interface Project {
  id: string;
  to: string;
  name: string;
  kind: Kind;
  stats: string;
  edited: string;
  gradient: string;
  glyph: number;
  badge?: string;
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

function ProjectCard({ p, onOpen }: { p: Project; onOpen: (id: string) => void }) {
  return (
    <Link
      to={p.to}
      onClick={() => onOpen(p.id)}
      className="hc-card-glow group overflow-hidden rounded-[14px] border border-line bg-panel hc-card"
    >
      <div className="relative flex h-[138px] items-center justify-center" style={{ background: p.gradient }}>
        <PlanGlyph variant={p.glyph} />
        {p.badge && (
          <span className="absolute left-2.5 top-2.5 rounded-[7px] bg-panel px-2 py-1 text-[11px] font-bold text-accent shadow-[0_2px_6px_-2px_rgba(20,22,40,0.25)]">
            {p.badge}
          </span>
        )}
      </div>
      <div className="px-[15px] pb-4 pt-3.5">
        <span className="block text-[15.5px] font-bold">{p.name}</span>
        <Mono className="mt-1.5 block text-[11.5px] text-faint">{p.stats}</Mono>
        <span className="mt-2 block text-[12px] text-faint">{p.edited}</span>
      </div>
    </Link>
  );
}

function UploadTile() {
  return (
    <Link
      to="/upload"
      className="flex min-h-[236px] flex-col items-center justify-center gap-3 rounded-[14px] border-[1.5px] border-dashed border-[#c7ccd6] bg-[#fafbfc] text-dim transition hover:border-accent/50 hover:bg-wash/40"
    >
      <span className="flex h-[46px] w-[46px] items-center justify-center rounded-xl bg-wash text-accent">
        <Icon name="plus" className="text-[22px]" strokeWidth={2.2} />
      </span>
      <span className="text-[14.5px] font-semibold text-ink">Upload &amp; trace a plan</span>
      <span className="text-[12.5px] text-faint">PDF, PNG or JPG</span>
    </Link>
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

export function HomePage() {
  const { data: manifest } = useQuery({ queryKey: ['private-manifest'], queryFn: fetchPrivateManifest });
  const [view, setView] = useState<View>('all');
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<string[]>(() => readRecentIds());
  const hasMyHome = !!manifest && (manifest.hasGeneratedScene || manifest.hasManualScene);

  const projects: Project[] = useMemo(
    () => [
      {
        id: 'sample-home',
        to: '/design/sample-home',
        name: 'Sample Penthouse',
        kind: 'sample',
        stats: '2 floors · 7 rooms · 184 m²',
        edited: 'Edited just now',
        gradient: 'linear-gradient(160deg,#eef0f6,#e2e5ee)',
        glyph: 0,
        badge: 'SAMPLE',
      },
      {
        id: 'my-home',
        to: '/design/my-home',
        name: 'My Home',
        kind: 'home',
        stats: hasMyHome ? 'traced from your plans' : 'no plan yet — trace one',
        edited: hasMyHome ? 'Edited recently' : 'Not started',
        gradient: 'linear-gradient(160deg,#efe7da,#e6dcc8)',
        glyph: 1,
      },
    ],
    [hasMyHome],
  );

  const onOpen = (id: string) => {
    recordOpen(id);
    setRecent(readRecentIds());
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

  const filtered = projects.filter(matches);
  const recentList = recent
    .map((id) => projects.find((p) => p.id === id))
    .filter((p): p is Project => !!p)
    .filter(matches);

  const showToolbar = view === 'all' || view === 'recent';
  const titles: Record<View, { h: string; sub: string }> = {
    all: { h: 'Projects', sub: `${hasMyHome ? '2 homes' : '1 home'} · local-first · nothing leaves this machine` },
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
        <Link
          to="/upload"
          className="inline-flex items-center gap-2 rounded-[10px] bg-accent px-4 py-2.5 text-[14px] font-semibold text-white hc-glow transition hover:bg-[#403bd6]"
        >
          <Icon name="plus" className="text-[16px]" strokeWidth={2.2} />
          <span className="hidden sm:inline">New project</span>
        </Link>
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
              <Mono className="text-faint">2.4 / 16 GB</Mono>
            </span>
            <span className="block h-1.5 overflow-hidden rounded bg-track">
              <span className="block h-full w-[15%] rounded bg-accent" />
            </span>
            <span className="text-[11.5px] text-faint">Textures &amp; HDRIs cached locally</span>
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

          {/* ALL */}
          {view === 'all' && (
            <div className="grid grid-cols-1 gap-[18px] sm:grid-cols-2 xl:grid-cols-4">
              <UploadTile />
              {filtered.map((p) => (
                <ProjectCard key={p.id} p={p} onOpen={onOpen} />
              ))}
              {filtered.length === 0 && (
                <div className="col-span-full">
                  <EmptyState icon="search" title="No matches" body="No projects match that filter or search. Clear it to see everything." />
                </div>
              )}
            </div>
          )}

          {/* RECENT */}
          {view === 'recent' &&
            (recentList.length ? (
              <div className="grid grid-cols-1 gap-[18px] sm:grid-cols-2 xl:grid-cols-4">
                {recentList.map((p) => (
                  <ProjectCard key={p.id} p={p} onOpen={onOpen} />
                ))}
              </div>
            ) : (
              <EmptyState icon="clock" title="Nothing recent yet" body="Open a project and it’ll appear here, most-recently-opened first." />
            ))}

          {/* TEMPLATES */}
          {view === 'templates' && (
            <div className="grid grid-cols-1 gap-[18px] sm:grid-cols-2 xl:grid-cols-4">
              <ProjectCard
                p={{ ...projects[0]!, name: 'Sample Penthouse', edited: 'Open a copy to explore', badge: 'TEMPLATE' }}
                onOpen={onOpen}
              />
              <UploadTile />
            </div>
          )}

          {/* TRASH */}
          {view === 'trash' && (
            <EmptyState
              icon="trash"
              title="Trash is empty"
              body="Deleted projects move here. Nothing’s been deleted — your homes are safe on this machine."
            />
          )}

          {/* fetch-assets tip (general — All view only) */}
          {view === 'all' && (
            <div className="mt-6 flex max-w-[920px] items-center gap-3.5 rounded-xl border border-line bg-panel p-4">
              <span className="flex h-[38px] w-[38px] flex-shrink-0 items-center justify-center rounded-[10px] bg-wash text-accent">
                <Icon name="sun" className="text-[20px]" strokeWidth={1.9} />
              </span>
              <div className="flex-1">
                <span className="block text-[13.5px] font-semibold">
                  Run <code className="rounded bg-track px-1.5 font-mono text-[12px]">fetch:assets</code> to download CC0
                  textures &amp; HDRIs
                </span>
                <span className="text-[12.5px] text-faint">
                  Far more realistic materials — without it, everything still works with flat colours.
                </span>
              </div>
              <Link
                to="/upload"
                className="rounded-[9px] border border-wash-line px-3.5 py-2 text-[13px] font-semibold text-accent transition hover:bg-wash"
              >
                Set up
              </Link>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
