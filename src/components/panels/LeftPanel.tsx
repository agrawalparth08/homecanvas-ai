import { buildStylePackApplication } from '@lib/styles/apply';
import { STYLE_PACKS } from '@lib/styles/style-packs';
import { useEditor } from '../../store/editor-store';

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
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Rooms</h3>
      <div className="flex flex-col gap-1">
        {floor.rooms.map((room) => (
          <button
            key={room.id}
            onClick={() => select({ type: 'room', id: room.id })}
            className={`rounded px-2 py-1.5 text-left text-sm ${
              selection?.id === room.id
                ? 'bg-accent/20 text-accent'
                : 'text-neutral-300 hover:bg-neutral-800'
            }`}
          >
            {room.name}
            <span className="ml-1 text-xs text-neutral-500">{room.openToSky ? '☀' : ''}</span>
          </button>
        ))}
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
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Style packs</h3>
      <div className="flex flex-col gap-2">
        {STYLE_PACKS.map((pack) => (
          <div key={pack.id} className="rounded-lg border border-panel-border bg-neutral-900/60 p-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-neutral-200">{pack.name}</span>
              <span className="text-[10px] uppercase text-neutral-500">{pack.budgetTier}</span>
            </div>
            <div className="mt-1.5 flex gap-1">
              {pack.palette.slice(0, 5).map((color) => (
                <span key={color} className="h-3 w-3 rounded-full border border-black/40" style={{ background: color }} />
              ))}
            </div>
            <div className="mt-2 flex gap-1.5">
              <button
                disabled={!selectedRoom}
                onClick={() => apply(pack.id, false)}
                className="flex-1 rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-200 enabled:hover:bg-neutral-700 disabled:opacity-40"
                title={selectedRoom ? `Apply to ${selectedRoom.name}` : 'Select a room first'}
              >
                Room
              </button>
              <button
                onClick={() => apply(pack.id, true)}
                className="flex-1 rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-700"
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
    <div className="flex h-full w-60 flex-col gap-5 overflow-y-auto border-r border-panel-border bg-panel p-3">
      <RoomsSection />
      <StylePacksSection />
    </div>
  );
}
