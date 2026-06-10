import { useMemo } from 'react';
import { computeTourStops } from '@lib/tour';
import { useEditor } from '../../store/editor-store';

/** Overlay shown during the guided POV tour. */
export function TourPanel() {
  const scene = useEditor((s) => s.scene);
  const activeFloorId = useEditor((s) => s.activeFloorId);
  const tourIndex = useEditor((s) => s.tourIndex);
  const playing = useEditor((s) => s.tourPlaying);
  const next = useEditor((s) => s.tourNext);
  const prev = useEditor((s) => s.tourPrev);
  const togglePlay = useEditor((s) => s.toggleTourPlay);
  const exit = useEditor((s) => s.exitTour);

  const stops = useMemo(
    () => (scene && activeFloorId ? computeTourStops(scene, activeFloorId) : []),
    [scene, activeFloorId],
  );
  if (stops.length === 0) return null;
  const i = Math.min(tourIndex, stops.length - 1);
  const stop = stops[i]!;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex justify-center">
      <div className="pointer-events-auto w-[min(640px,92vw)] rounded-2xl border border-panel-border bg-neutral-900/92 px-5 py-4 shadow-2xl backdrop-blur">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wide text-accent">
            Stop {i + 1} / {stops.length}
          </div>
          <button onClick={exit} className="text-xs text-neutral-400 hover:text-neutral-200">
            Exit tour ✕
          </button>
        </div>
        <div className="mt-1 text-lg font-semibold text-neutral-50">{stop.name}</div>
        <div className="text-sm text-neutral-400">{stop.caption}</div>

        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={prev}
            disabled={i === 0}
            className="rounded-lg bg-neutral-800 px-3 py-1.5 text-sm text-neutral-200 enabled:hover:bg-neutral-700 disabled:opacity-40"
          >
            ‹ Back
          </button>
          <button
            onClick={togglePlay}
            className="rounded-lg bg-accent/25 px-3 py-1.5 text-sm text-accent hover:bg-accent/35"
          >
            {playing ? '⏸ Pause' : '▶ Play tour'}
          </button>
          <button
            onClick={next}
            disabled={i >= stops.length - 1}
            className="rounded-lg bg-neutral-800 px-3 py-1.5 text-sm text-neutral-200 enabled:hover:bg-neutral-700 disabled:opacity-40"
          >
            Next ›
          </button>

          <div className="ml-auto flex flex-wrap justify-end gap-1">
            {stops.map((s, idx) => (
              <button
                key={s.roomId}
                onClick={() => useEditor.getState().setTourIndex(idx)}
                title={s.name}
                className={`h-2.5 w-2.5 rounded-full ${idx === i ? 'bg-accent' : 'bg-neutral-600 hover:bg-neutral-400'}`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
