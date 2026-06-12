import narration from './narration.json';
import durations from './durations.json';

export const FPS = 30;

/** Frames of silence before the narration starts inside each scene. */
export const LEAD_IN_FRAMES = 12;
/** Frames of air after the narration ends. */
export const TAIL_FRAMES = 14;

export interface SceneSpec {
  id: keyof typeof narration;
  /** Fallback length (seconds) until real narration durations are generated. */
  minSeconds: number;
}

// Tight <60s cut: dropped the standalone "problem" + "privacy" scenes (privacy
// folds into the outro line). 8 scenes.
export const SCENES: SceneSpec[] = [
  { id: 'title', minSeconds: 5 },
  { id: 'trace', minSeconds: 8 },
  { id: 'canvas3d', minSeconds: 8 },
  { id: 'edit', minSeconds: 9 },
  { id: 'ai', minSeconds: 7 },
  { id: 'photo', minSeconds: 8 },
  { id: 'audience', minSeconds: 9 },
  { id: 'outro', minSeconds: 6 },
];

export const NARRATION: Record<string, string> = narration;

const DURATIONS: Record<string, number> = durations as Record<string, number>;

/** Scene length: narration audio + lead-in + tail (or the storyboard minimum). */
export function sceneFrames(spec: SceneSpec): number {
  const audio = DURATIONS[spec.id];
  if (typeof audio === 'number' && audio > 0) {
    return Math.ceil(audio * FPS) + LEAD_IN_FRAMES + TAIL_FRAMES;
  }
  return Math.ceil(spec.minSeconds * FPS);
}

export function totalFrames(): number {
  return SCENES.reduce((sum, s) => sum + sceneFrames(s), 0);
}
