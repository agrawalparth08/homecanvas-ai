import { useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { buildStylePackApplication } from '@lib/styles/apply';
import { STYLE_PACKS } from '@lib/styles/style-packs';
import type { StylePack } from '@lib/scene/schemas';
import { useEditor } from '../../store/editor-store';
import { reportError } from '../../store/error-store';
import { Icon } from '../ui/Icon';
import { FOCUS_RING, SectionLabel, TierBadge } from '../ui/primitives';
import { useT } from '../../i18n';

function RoomsSection() {
  const t = useT();
  const scene = useEditor((s) => s.scene);
  const activeFloorId = useEditor((s) => s.activeFloorId);
  const selection = useEditor((s) => s.selection);
  const select = useEditor((s) => s.select);
  if (!scene) return null;
  const floor = scene.floors.find((f) => f.id === activeFloorId);
  if (!floor) return null;

  return (
    <div>
      <div className="px-2 pb-2 pt-1">
        <SectionLabel>{t('Rooms')}</SectionLabel>
      </div>
      <div className="flex flex-col gap-0.5 px-1">
        {floor.rooms.map((room) => {
          const active = selection?.id === room.id;
          return (
            <button
              key={room.id}
              onClick={() => select({ type: 'room', id: room.id })}
              className={`flex items-center justify-between rounded-[8px] px-3 py-2 text-left text-[14px] ${FOCUS_RING} ${
                active ? 'bg-wash font-semibold text-accent' : 'font-medium text-ink hover:bg-soft'
              }`}
            >
              <span className="truncate">{room.name}</span>
              {room.openToSky && <Icon name="sun" className="ml-1 flex-shrink-0 text-[13px] text-faint" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StylePacksSection() {
  const t = useT();
  const scene = useEditor((s) => s.scene);
  const selection = useEditor((s) => s.selection);
  const applyPatch = useEditor((s) => s.applyPatch);
  const queryClient = useQueryClient();
  const importRef = useRef<HTMLInputElement>(null);

  // Custom packs come from the sidecar (.hcpack imports); built-ins ship in
  // the bundle. Same shape, one list, customs first so imports are findable.
  const { data: customPacks = [] } = useQuery<StylePack[]>({
    queryKey: ['style-packs'],
    queryFn: () =>
      fetch('/api/style-packs')
        .then((r) => r.json() as Promise<{ packs: StylePack[] }>)
        .then((d) => d.packs)
        .catch(() => []),
  });

  if (!scene) return null;
  const allPacks: (StylePack & { custom?: boolean })[] = [
    ...customPacks.map((p) => ({ ...p, custom: true })),
    ...STYLE_PACKS,
  ];

  const selectedRoom =
    selection?.type === 'room' ? scene.floors.flatMap((f) => f.rooms).find((r) => r.id === selection.id) : undefined;

  const apply = (packId: string, wholeHome: boolean) => {
    const pack = allPacks.find((p) => p.id === packId)!;
    const target = wholeHome ? ('wholeHome' as const) : { roomIds: [selectedRoom!.id] };
    const application = buildStylePackApplication(scene, pack, target, 'skip');
    if (application.patch) applyPatch(application.patch);
  };

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      let envelope: unknown;
      try {
        envelope = JSON.parse(await file.text());
      } catch {
        reportError(`${file.name} isn't valid JSON — expected a .hcpack file.`, { kind: 'rejected' });
        return;
      }
      const res = await fetch('/api/style-packs/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(envelope),
      });
      if (!res.ok) {
        const reason = ((await res.json().catch(() => ({}))) as { error?: string }).error ?? `${res.status}`;
        reportError(`Couldn't import ${file.name}: ${reason}`, { kind: 'rejected' });
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ['style-packs'] });
    } finally {
      if (importRef.current) importRef.current.value = '';
    }
  };

  const onDelete = async (pack: StylePack) => {
    if (!window.confirm(`Delete the style pack "${pack.name}"? This can't be undone.`)) return;
    const res = await fetch(`/api/style-packs/${pack.id}`, { method: 'DELETE' });
    if (res.ok) void queryClient.invalidateQueries({ queryKey: ['style-packs'] });
  };

  return (
    <div>
      <div className="flex items-center justify-between px-2 pb-2 pt-1">
        <SectionLabel>{t('Style packs')}</SectionLabel>
        <input
          ref={importRef}
          type="file"
          accept=".hcpack,application/json"
          className="hidden"
          onChange={(e) => void onImport(e.target.files?.[0])}
        />
        <button
          type="button"
          onClick={() => importRef.current?.click()}
          title="Import a style pack (.hcpack)"
          className={`flex h-6 items-center gap-1 rounded-[7px] px-2 text-[11.5px] font-semibold text-dim transition hover:bg-soft hover:text-ink ${FOCUS_RING}`}
        >
          <Icon name="plus" className="text-[12px]" /> {t('Import')}
        </button>
      </div>
      <div className="flex flex-col gap-2.5 px-1 pb-4">
        {allPacks.map((pack) => (
          <div key={pack.id} className="group/pack rounded-[11px] border border-line bg-panel p-3 transition hover:border-wash-line">
            <div className="flex items-center justify-between gap-1">
              <span className="truncate text-[13.5px] font-bold">{pack.name}</span>
              <span className="flex flex-shrink-0 items-center gap-1">
                <button
                  type="button"
                  title={`Download ${pack.name} as .hcpack`}
                  aria-label={`Download ${pack.name} as a style pack file`}
                  onClick={() => {
                    const a = document.createElement('a');
                    a.href = `/api/style-packs/${pack.id}/export`;
                    a.download = '';
                    a.click();
                  }}
                  className={`hidden h-5 w-5 items-center justify-center rounded text-[12px] text-faint transition hover:bg-soft hover:text-accent group-hover/pack:flex ${FOCUS_RING}`}
                >
                  <Icon name="upload" className="text-[11px]" />
                </button>
                {pack.custom && (
                  <button
                    type="button"
                    title="Delete this pack"
                    aria-label={`Delete ${pack.name}`}
                    onClick={() => void onDelete(pack)}
                    className={`hidden h-5 w-5 items-center justify-center rounded text-[12px] text-faint transition hover:bg-soft hover:text-rose-600 group-hover/pack:flex ${FOCUS_RING}`}
                  >
                    <Icon name="close" className="text-[11px]" />
                  </button>
                )}
                <TierBadge tier={pack.budgetTier} />
              </span>
            </div>
            <span
              className="my-2.5 block h-2 w-full rounded-[5px]"
              title={pack.palette.slice(0, 5).join(' · ')}
              style={{ background: `linear-gradient(90deg, ${pack.palette.slice(0, 5).join(', ')})` }}
            />
            <div className="flex gap-1.5">
              <button
                disabled={!selectedRoom}
                onClick={() => apply(pack.id, false)}
                className={`flex-1 rounded-[7px] bg-soft py-1.5 text-[12px] font-semibold text-dim transition ${FOCUS_RING} enabled:hover:bg-track disabled:opacity-40`}
                title={selectedRoom ? `Apply to ${selectedRoom.name}` : 'Select a room first'}
              >
                {t('Room')}
              </button>
              <button
                onClick={() => apply(pack.id, true)}
                className={`flex-1 rounded-[7px] bg-accent py-1.5 text-[12px] font-semibold text-white transition ${FOCUS_RING} hover:bg-[#403bd6]`}
              >
                {t('Whole home')}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LeftPanel() {
  return (
    <div className="flex h-full w-[252px] flex-shrink-0 flex-col gap-1 overflow-y-auto border-r border-line bg-sidebar py-4">
      <RoomsSection />
      <StylePacksSection />
    </div>
  );
}
