import { useMemo } from 'react';
import { computeTourStops } from '@lib/tour';
import { useEditor } from '../../store/editor-store';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';

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
      <div className="pointer-events-auto w-[min(640px,92vw)] rounded-xl border border-panel-border bg-panel/95 px-5 py-4 shadow-xl backdrop-blur">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-accent">
            Stop {i + 1} / {stops.length}
          </div>
          <button onClick={exit} className="inline-flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-100">
            Exit tour <Icon name="close" />
          </button>
        </div>
        <div className="mt-1.5 text-lg font-semibold text-neutral-100">{stop.name}</div>
        <div className="text-sm text-neutral-400">{stop.caption}</div>

        <div className="mt-4 flex items-center gap-2">
          <Button variant="secondary" size="sm" icon="chevronLeft" onClick={prev} disabled={i === 0}>
            Back
          </Button>
          <Button variant="primary" size="sm" icon={playing ? 'columns' : 'play'} onClick={togglePlay}>
            {playing ? 'Pause' : 'Play tour'}
          </Button>
          <Button variant="secondary" size="sm" iconRight="chevronRight" onClick={next} disabled={i >= stops.length - 1}>
            Next
          </Button>

          <div className="ml-auto flex flex-wrap justify-end gap-1.5">
            {stops.map((s, idx) => (
              <button
                key={s.roomId}
                onClick={() => useEditor.getState().setTourIndex(idx)}
                title={s.name}
                className={`h-2 rounded-full transition-all ${idx === i ? 'w-5 bg-accent' : 'w-2 bg-neutral-700 hover:bg-neutral-600'}`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
