import { useEditor } from '../../store/editor-store';
import { Icon } from '../ui/Icon';

/**
 * Pro-CAD overlay chrome on the dark 3D stage: a selection chip (top-left), a
 * view cube (top-right), and a mono scene readout (bottom-left). Pure overlay —
 * pointer-events:none so it never intercepts orbit/pan/select on the canvas.
 */
export function StageChrome() {
  const scene = useEditor((s) => s.scene);
  const selection = useEditor((s) => s.selection);
  const activeFloorId = useEditor((s) => s.activeFloorId);
  if (!scene) return null;
  const floor = scene.floors.find((f) => f.id === activeFloorId);

  let selLabel: string | null = null;
  if (selection) {
    if (selection.type === 'room') {
      selLabel = floor?.rooms.find((r) => r.id === selection.id)?.name ?? 'Room';
    } else {
      selLabel = selection.type.charAt(0).toUpperCase() + selection.type.slice(1);
    }
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {selLabel && (
        <span className="absolute left-4 top-4 rounded-lg bg-accent/90 px-3 py-1.5 text-[12px] font-semibold text-white shadow-[0_6px_16px_-6px_rgba(0,0,0,0.6)]">
          Selected · {selLabel}
        </span>
      )}
      <div className="absolute right-4 top-4 flex h-[54px] w-[54px] items-center justify-center rounded-[10px] border border-white/15 bg-white/[0.08]">
        <Icon name="cube" className="text-[28px] text-white/70" strokeWidth={1.4} />
      </div>
      {floor && (
        <span className="absolute bottom-3.5 left-4 font-mono text-[11px] text-white/40">
          {floor.rooms.length} rooms · {floor.walls.length} walls
        </span>
      )}
    </div>
  );
}
