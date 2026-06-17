import { buildStylePackApplication } from '@lib/styles/apply';
import { STYLE_PACKS } from '@lib/styles/style-packs';
import { useEditor } from '../../store/editor-store';
import { Icon } from '../ui/Icon';
import { FOCUS_RING, SectionLabel, TierBadge } from '../ui/primitives';

function RoomsSection() {
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
        <SectionLabel>Rooms</SectionLabel>
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
  const scene = useEditor((s) => s.scene);
  const selection = useEditor((s) => s.selection);
  const applyPatch = useEditor((s) => s.applyPatch);
  if (!scene) return null;

  const selectedRoom =
    selection?.type === 'room' ? scene.floors.flatMap((f) => f.rooms).find((r) => r.id === selection.id) : undefined;

  const apply = (packId: string, wholeHome: boolean) => {
    const pack = STYLE_PACKS.find((p) => p.id === packId)!;
    const target = wholeHome ? ('wholeHome' as const) : { roomIds: [selectedRoom!.id] };
    const application = buildStylePackApplication(scene, pack, target, 'skip');
    if (application.patch) applyPatch(application.patch);
  };

  return (
    <div>
      <div className="px-2 pb-2 pt-1">
        <SectionLabel>Style packs</SectionLabel>
      </div>
      <div className="flex flex-col gap-2.5 px-1 pb-4">
        {STYLE_PACKS.map((pack) => (
          <div key={pack.id} className="rounded-[11px] border border-line bg-panel p-3 transition hover:border-wash-line">
            <div className="flex items-center justify-between">
              <span className="text-[13.5px] font-bold">{pack.name}</span>
              <TierBadge tier={pack.budgetTier} />
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
                Room
              </button>
              <button
                onClick={() => apply(pack.id, true)}
                className={`flex-1 rounded-[7px] bg-accent py-1.5 text-[12px] font-semibold text-white transition ${FOCUS_RING} hover:bg-[#403bd6]`}
              >
                Whole home
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
