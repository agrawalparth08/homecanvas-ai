import { useRef, useState } from 'react';
import { clampSliderPos } from '@lib/ui/compare';
import type { HomeScene } from '@lib/scene/schemas';
import { ScenePreview3D } from './ScenePreview3D';
import { useEditor } from '../../store/editor-store';

/**
 * Spatial before/after wipe (Phase 7). Two fixed-camera renders of the same
 * floor — baseline underneath, current on top clipped at the slider — so a
 * draggable handle reveals the design change in place. Both use lockCamera so
 * their identical-geometry framings stay in sync (no per-canvas orbit drift).
 */
export function BeforeAfterCompare({
  baseline,
  current,
  floorId,
}: {
  baseline: HomeScene;
  current: HomeScene;
  floorId: string;
}) {
  const pos = useEditor((s) => s.sliderPos);
  const setSliderPos = useEditor((s) => s.setSliderPos);
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const onMove = (clientX: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (rect) setSliderPos(clampSliderPos(clientX, rect));
  };

  return (
    <div
      ref={ref}
      className="absolute inset-0 select-none overflow-hidden"
      onPointerMove={(e) => dragging && onMove(e.clientX)}
      onPointerUp={() => setDragging(false)}
      onPointerLeave={() => setDragging(false)}
    >
      <div className="absolute inset-0">
        <ScenePreview3D scene={baseline} floorId={floorId} lockCamera />
      </div>
      <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${pos * 100}%)` }}>
        <ScenePreview3D scene={current} floorId={floorId} lockCamera />
      </div>

      <span className="pointer-events-none absolute left-3 top-3 rounded bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white">
        Before
      </span>
      <span className="pointer-events-none absolute right-3 top-3 rounded bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white">
        After
      </span>

      <div
        className="absolute bottom-0 top-0 z-10 w-px cursor-ew-resize bg-white/80"
        style={{ left: `${pos * 100}%` }}
        onPointerDown={(e) => {
          e.preventDefault();
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          setDragging(true);
        }}
        onPointerMove={(e) => dragging && onMove(e.clientX)}
        onPointerUp={() => setDragging(false)}
      >
        <div className="absolute left-1/2 top-1/2 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-xs text-neutral-700 shadow-md">
          ⇆
        </div>
      </div>
    </div>
  );
}
