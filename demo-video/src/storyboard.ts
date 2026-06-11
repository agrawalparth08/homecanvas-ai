import narration from './narration.json';
import durations from './durations.json';

export const FPS = 30;

/** Frames of silence before the narration starts inside each scene. */
export const LEAD_IN_FRAMES = 14;
/** Frames of air after the narration ends. */
export const TAIL_FRAMES = 20;

export interface SceneSpec {
  id: keyof typeof narration;
  /** Fallback length (seconds) until real narration durations are generated. */
  minSeconds: number;
}

export const SCENES: SceneSpec[] = [
  { id: 'title', minSeconds: 6 },
  { id: 'problem', minSeconds: 8 },
  { id: 'trace', minSeconds: 11 },
  { id: 'canvas3d', minSeconds: 10 },
  { id: 'edit', minSeconds: 13 },
  { id: 'ai', minSeconds: 11 },
  { id: 'photo', minSeconds: 10 },
  { id: 'audience', minSeconds: 12 },
  { id: 'privacy', minSeconds: 8 },
  { id: 'outro', minSeconds: 7 },
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
