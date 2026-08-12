import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { polygonArea } from '@lib/geometry/rooms';
import { buildRoomBoards } from '@lib/boards/room-boards';
import { quantitiesToCsv } from '@lib/boq/csv';
import { diffScenes } from '@lib/scene/diff';
import type { RoomBoard, VariantMeta } from '@lib/scene/schemas';
import { useEditor } from '../store/editor-store';
import { useProfile } from '../store/profile-store';
import { Button } from '../components/ui/Button';
import { Icon } from '../components/ui/Icon';
import { ProfileDialog } from '../components/ui/ProfileDialog';
import { Chip, FOCUS_RING, Mono, SectionLabel } from '../components/ui/primitives';

function Stub({ title, phase, children }: { title: string; phase: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-app text-ink">
      <div className="hc-card max-w-md rounded-xl border border-line p-6">
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="mt-1 text-xs uppercase tracking-wide text-accent">{phase}</p>
        <div className="mt-3 text-sm text-dim">{children}</div>
        <Link to="/" className="mt-4 inline-block text-xs text-accent">
          ← Back home
        </Link>
      </div>
    </div>
  );
}

export function UploadPage() {
  return (
    <Stub title="Upload & overlay" phase="Arrives in Phase 2">
      Upload floor plan images/PDFs and site photos, calibrate scale with a known length, and trace walls and rooms
      over the plan. For now, place files in <code className="font-mono text-xs">private-home-inputs/raw/</code>.
    </Stub>
  );
}

/** Small mono stat used in the Changes panel — count + label, coloured by tone. */
function DiffStat({ label, value, tone = 'neutral' }: { label: string; value: number; tone?: 'ok' | 'warn' | 'neutral' }) {
  if (value === 0) return null;
  const toneClass = tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : 'text-ink';
  return (
    <div className="flex items-baseline gap-1.5 rounded-lg bg-soft px-2.5 py-1.5 text-[12.5px]">
      <Mono className={`text-[13px] font-semibold ${toneClass}`}>{value}</Mono>
      <span className="text-dim">{label}</span>
    </div>
  );
}

/** "diningTable" -> "Dining Table" (and "tvUnit" -> "TV Unit") for the printed
 *  furniture schedule. */
function formatCategory(category: string): string {
  if (category === 'tvUnit') return 'TV Unit';
  const spaced = category.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Collapse a room's furniture list into schedule rows (name + category -> count). */
function scheduleRows(furniture: RoomBoard['furniture']): { name: string; category: string; count: number }[] {
  const byKey = new Map<string, { name: string; category: string; count: number }>();
  for (const f of furniture) {
    const key = `${f.name}__${f.category}`;
    const existing = byKey.get(key);
    if (existing) existing.count += 1;
    else byKey.set(key, { name: f.name, category: formatCategory(f.category), count: 1 });
  }
  return [...byKey.values()];
}

/** print: A4 page size, backgrounds forced white (the app's h-screen/overflow
 *  scroll regions are print:hidden entirely, so pagination flows normally
 *  through the print-only block below), and swatches told to actually print
 *  their fill colour (browsers skip background-color by default). */
const PRINT_STYLE = `
@media print {
  @page { size: A4; margin: 14mm; }
  html, body { background: #fff !important; height: auto !important; }
  .hc-print-swatch { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`;

export function VariantsPage() {
  const scene = useEditor((s) => s.scene);
  const baseline = useEditor((s) => s.baseline);
  const projectId = useEditor((s) => s.projectId);
  const loadProject = useEditor((s) => s.loadProject);
  const loadVariant = useEditor((s) => s.loadVariant);
  const activeVariantId = useEditor((s) => s.activeVariantId);

  // Rehydrate on a direct visit / refresh (store resets to scene:null) so the
  // boards aren't a dead stub. Defaults to the store's current/last projectId.
  // Track completion so a load that yields no scene shows recovery links, not a
  // permanent "Loading…" dead end.
  const [loadSettled, setLoadSettled] = useState(false);
  useEffect(() => {
    if (scene) return;
    let cancelled = false;
    void loadProject(projectId).finally(() => {
      if (!cancelled) setLoadSettled(true);
    });
    return () => {
      cancelled = true;
    };
  }, [scene, projectId, loadProject]);

  const variantsQuery = useQuery({
    queryKey: ['variants', projectId],
    // Strict fetch (unlike api.ts's []-on-error wrapper) so a server failure is
    // distinguishable from a genuinely empty list — an error must not render as
    // reassuring "No saved variants yet" copy.
    queryFn: async () => {
      const res = await fetch(`/api/variants/${projectId}`);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return ((await res.json()) as { variants: VariantMeta[] }).variants;
    },
  });

  const [profileOpen, setProfileOpen] = useState(false);
  const studioName = useProfile((s) => s.studioName);
  const contact = useProfile((s) => s.contact);
  const logoDataUrl = useProfile((s) => s.logoDataUrl);

  // print-hide: app chrome that has no place in the exported PDF.
  const header = (
    <header className="flex h-[54px] flex-shrink-0 items-center gap-3.5 border-b border-line bg-panel px-[18px] print:hidden">
      <Link
        to={`/design/${projectId}`}
        className="inline-flex flex-shrink-0 items-center gap-2 text-[16px] font-bold tracking-[-0.3px] text-accent"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-[7px] bg-accent text-white">
          <Icon name="home" className="text-[14px]" strokeWidth={2} />
        </span>
        <span className="hidden sm:inline">HomeCanvas AI</span>
      </Link>
      <span className="hidden h-[22px] w-px flex-shrink-0 bg-line sm:block" />
      <h1 className="text-[14px] font-semibold text-ink">Boards</h1>
      {scene && <span className="truncate text-[13px] text-dim">{scene.name}</span>}
      <span className="ml-auto flex flex-shrink-0 items-center gap-2">
        <Button variant="ghost" size="sm" icon="user" onClick={() => setProfileOpen(true)}>
          Brand
        </Button>
        {scene && (
          <Button
            variant="secondary"
            size="sm"
            icon="columns"
            title="Download a bill-of-quantities CSV (areas from the scene, rates left for you)"
            onClick={() => {
              const csv = quantitiesToCsv(scene);
              const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
              const a = document.createElement('a');
              a.href = url;
              a.download = `${(scene.name || 'home').replace(/[^a-zA-Z0-9-_ ]/g, '').trim().replace(/\s+/g, '-').toLowerCase()}-boq.csv`;
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 5000);
            }}
          >
            Export BOQ
          </Button>
        )}
        {scene && (
          <Button variant="dark" size="sm" icon="save" onClick={() => window.print()} title="Export the boards as a branded PDF">
            Export PDF
          </Button>
        )}
        <Link
          to={`/design/${projectId}`}
          className={`inline-flex flex-shrink-0 items-center gap-1.5 rounded-[9px] border border-line bg-panel px-3 py-[7px] text-[13px] font-semibold text-dim transition hover:bg-soft ${FOCUS_RING}`}
        >
          <Icon name="chevronLeft" className="text-[14px]" strokeWidth={2} /> <span className="hidden md:inline">Back to canvas</span>
        </Link>
      </span>
    </header>
  );

  if (!scene) {
    return (
      <div className="flex h-screen flex-col bg-app text-ink">
        {header}
        <div className="flex flex-1 items-center justify-center p-6">
          {loadSettled ? (
            <div className="max-w-md rounded-2xl border border-line bg-panel p-6 text-center hc-card">
              <p className="text-[15px] font-bold">No scene to show boards for</p>
              <p className="mt-2 text-sm text-dim">
                <Mono>{projectId}</Mono> has no scene yet (or the local engine isn’t running). Open a project first —
                boards are built from its rooms.
              </p>
              <div className="mt-5 flex justify-center gap-2.5">
                <Link to="/design/sample-home" className="rounded-[10px] bg-accent px-4 py-2.5 text-sm font-semibold text-white hc-glow transition hover:bg-[#403bd6]">
                  Open sample home
                </Link>
                <Link to="/" className="rounded-[10px] border border-line bg-panel px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-soft">
                  Back home
                </Link>
              </div>
            </div>
          ) : (
            <p className="text-sm text-dim">
              Loading <Mono>{projectId}</Mono>
            </p>
          )}
        </div>
        <ProfileDialog open={profileOpen} onClose={() => setProfileOpen(false)} />
      </div>
    );
  }

  const boards = buildRoomBoards(scene);
  const roomAreaM2 = new Map(
    scene.floors.flatMap((f) => f.rooms).map((r) => [r.id, polygonArea(r.boundary.outer) / 1e6]),
  );
  const diff = baseline ? diffScenes(baseline, scene) : null;
  const hasChanges = diff !== null && diff.summary !== 'No differences.';
  const variants = variantsQuery.data ?? [];

  return (
    <div className="flex h-screen flex-col bg-app text-ink print:h-auto">
      <style>{PRINT_STYLE}</style>
      {header}
      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-8 print:hidden">
        <div className="mx-auto max-w-6xl space-y-10">
          <section>
            <SectionLabel>Variants</SectionLabel>
            <div className="mt-3 flex gap-3 overflow-x-auto pb-1">
              {variantsQuery.isLoading ? (
                <p className="text-sm text-dim">Loading variants…</p>
              ) : variantsQuery.isError ? (
                <p className="rounded-lg border border-[#e9c89e] bg-[#fbf0e3] px-3 py-2 text-sm text-[#9a5a1e]">
                  Couldn’t load variants — is the local engine running?
                </p>
              ) : variants.length === 0 ? (
                <p className="text-sm text-faint">No saved variants yet — save one from the canvas to compare designs here.</p>
              ) : (
                variants.map((v) => {
                  const active = v.id === activeVariantId;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => void loadVariant(v.id)}
                      className={`hc-card flex w-[190px] flex-shrink-0 flex-col items-start gap-1.5 rounded-[13px] border p-3.5 text-left transition ${FOCUS_RING} ${
                        active ? 'border-accent bg-wash ring-1 ring-accent' : 'border-line bg-panel hover:bg-soft'
                      }`}
                    >
                      <span className="truncate text-[13px] font-semibold text-ink">{v.name}</span>
                      <Mono className="text-[11px] text-faint">{new Date(v.createdAt).toLocaleDateString()}</Mono>
                      {active && <Chip tone="accent">Active</Chip>}
                    </button>
                  );
                })
              )}
            </div>
          </section>

          <section>
            <SectionLabel>Room boards</SectionLabel>
            <p className="mt-1 text-[13px] text-dim">
              <Mono>{boards.length}</Mono> room{boards.length === 1 ? '' : 's'}
            </p>
            {boards.length === 0 ? (
              <p className="mt-3 text-sm text-faint">No rooms in this scene yet.</p>
            ) : (
              <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {boards.map((b) => (
                  <div key={b.roomId} className="hc-card rounded-[13px] border border-line bg-panel p-4">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="truncate text-[14px] font-semibold text-ink">{b.name}</h3>
                      <Mono className="flex-shrink-0 text-[12px] text-faint">
                        {(roomAreaM2.get(b.roomId) ?? 0).toFixed(1)} m²
                      </Mono>
                    </div>

                    {b.palette.length > 0 ? (
                      <div className="mt-2.5 flex gap-1">
                        {b.palette.map((hex) => (
                          <span
                            key={hex}
                            title={hex}
                            className="h-4 w-4 rounded-[4px] ring-1 ring-black/10"
                            style={{ background: hex }}
                          />
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2.5 text-[12px] text-faint">No materials assigned yet.</p>
                    )}

                    <ul className="mt-3 space-y-1 text-[12px] text-dim">
                      {b.materials.map((m) => (
                        <li key={m.id} className="flex items-center gap-1.5">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-sm ring-1 ring-black/10"
                            style={{ background: m.baseColor }}
                          />
                          {m.name}
                        </li>
                      ))}
                    </ul>

                    <p className="mt-3 text-[12px] text-faint">
                      {b.furniture.length === 0
                        ? 'No furniture placed.'
                        : `${b.furniture.length} piece(s): ${b.furniture.map((f) => f.name).join(', ')}`}
                    </p>

                    {diff?.recoloredRooms.includes(b.roomId) && (
                      <Chip tone="accent" className="mt-3">
                        Recoloured vs baseline
                      </Chip>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <SectionLabel>Changes vs baseline</SectionLabel>
            {hasChanges && diff ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <DiffStat label="rooms added" value={diff.addedRoomIds.length} tone="ok" />
                <DiffStat label="rooms removed" value={diff.removedRoomIds.length} tone="warn" />
                <DiffStat label="rooms changed" value={diff.changedRooms.length} />
                <DiffStat label="recoloured" value={diff.recoloredRooms.length} />
                <DiffStat label="furniture added" value={diff.addedObjectIds.length} tone="ok" />
                <DiffStat label="furniture removed" value={diff.removedObjectIds.length} tone="warn" />
                <DiffStat label="furniture moved" value={diff.movedObjectIds.length} />
              </div>
            ) : (
              <p className="mt-2 text-sm text-faint">No changes yet.</p>
            )}
          </section>
        </div>
      </div>

      {/* print-only export: cover + per-room boards with a real furniture-schedule
          table, hidden on screen (Tailwind's `hidden`) and shown only for print. */}
      <div className="hidden print:block">
        <div className="mb-8 flex items-start justify-between gap-4 border-b-2 border-ink pb-4">
          <div className="flex items-center gap-3">
            {logoDataUrl && (
              <img src={logoDataUrl} alt="" className="hc-print-swatch h-12 w-12 flex-shrink-0 object-contain" />
            )}
            <div>
              <p className="text-[15px] font-bold text-ink">{studioName || 'HomeCanvas AI'}</p>
              {contact && <p className="text-[11px] text-dim">{contact}</p>}
            </div>
          </div>
          <Mono className="flex-shrink-0 text-[11px] text-dim">
            {new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
          </Mono>
        </div>
        <h1 className="text-[22px] font-extrabold text-ink">Design boards</h1>
        <p className="text-[13px] text-dim">{scene.name}</p>

        <div className="mt-6 flex flex-col gap-5">
          {boards.map((b) => (
            <div key={b.roomId} className="break-inside-avoid rounded-[10px] border border-line p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[14px] font-bold text-ink">{b.name}</h3>
                <Mono className="text-[12px] text-dim">{(roomAreaM2.get(b.roomId) ?? 0).toFixed(1)} m²</Mono>
              </div>

              {b.palette.length > 0 && (
                <div className="mt-2.5 flex gap-1.5">
                  {b.palette.map((hex) => (
                    <span
                      key={hex}
                      title={hex}
                      className="hc-print-swatch h-5 w-5 rounded-[4px] ring-1 ring-black/15"
                      style={{ background: hex }}
                    />
                  ))}
                </div>
              )}

              {b.furniture.length > 0 ? (
                <table className="mt-3 w-full border-collapse text-[11.5px]">
                  <thead>
                    <tr>
                      <th className="border border-line bg-soft px-2 py-1 text-left font-semibold text-dim">Piece</th>
                      <th className="border border-line bg-soft px-2 py-1 text-left font-semibold text-dim">Category</th>
                      <th className="border border-line bg-soft px-2 py-1 text-right font-semibold text-dim">Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scheduleRows(b.furniture).map((row) => (
                      <tr key={`${row.name}-${row.category}`}>
                        <td className="border border-line px-2 py-1 text-ink">{row.name}</td>
                        <td className="border border-line px-2 py-1 text-dim">{row.category}</td>
                        <td className="border border-line px-2 py-1 text-right font-mono text-ink">{row.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="mt-3 text-[11.5px] text-faint">No furniture placed.</p>
              )}
            </div>
          ))}
        </div>

        {hasChanges && diff && (
          <div className="mt-5 break-inside-avoid rounded-[10px] border border-line p-4">
            <h3 className="text-[13px] font-bold text-ink">Changes vs baseline</h3>
            <ul className="mt-2 space-y-1 text-[12px] text-ink">
              {diff.addedRoomIds.length > 0 && <li>{diff.addedRoomIds.length} room(s) added</li>}
              {diff.removedRoomIds.length > 0 && <li>{diff.removedRoomIds.length} room(s) removed</li>}
              {diff.changedRooms.length > 0 && <li>{diff.changedRooms.length} room(s) changed</li>}
              {diff.recoloredRooms.length > 0 && <li>{diff.recoloredRooms.length} room(s) recoloured</li>}
              {diff.addedObjectIds.length > 0 && <li>{diff.addedObjectIds.length} furniture piece(s) added</li>}
              {diff.removedObjectIds.length > 0 && <li>{diff.removedObjectIds.length} furniture piece(s) removed</li>}
              {diff.movedObjectIds.length > 0 && <li>{diff.movedObjectIds.length} furniture piece(s) moved</li>}
            </ul>
          </div>
        )}
      </div>

      <ProfileDialog open={profileOpen} onClose={() => setProfileOpen(false)} />
    </div>
  );
}
