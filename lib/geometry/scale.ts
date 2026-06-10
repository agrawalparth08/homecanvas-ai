import { dist, type Vec2 } from './vec';

/**
 * Scale calibration helpers (the actual geometry rewrite is the
 * `recalibrate_floor` patch op — atomic, undoable, through the pipeline).
 */

/** mm-per-pixel from a user-drawn line over the underlay with a known real length. */
export function mmPerPxFromKnownLength(pxA: Vec2, pxB: Vec2, knownMm: number): number {
  const px = dist(pxA, pxB);
  if (px < 1) throw new Error('calibration line is degenerate');
  if (knownMm <= 0) throw new Error('known length must be positive');
  return knownMm / px;
}

export function mmToDisplay(mm: number, units: 'metric' | 'imperial'): string {
  if (units === 'metric') {
    return mm >= 1000 ? `${(mm / 1000).toFixed(2)} m` : `${Math.round(mm)} mm`;
  }
  const totalInches = mm / 25.4;
  const feet = Math.floor(totalInches / 12);
  const inches = Math.round(totalInches - feet * 12);
  return inches === 0 ? `${feet}'` : `${feet}'-${inches}"`;
}

/** Feet-inches parser for Indian plan annotations like 12'6", 12'-6", 10'0. */
export function parseFeetInches(text: string): number | null {
  const m = text.trim().match(/^(\d+)\s*'(?:\s*-?\s*(\d+(?:\.\d+)?)\s*(?:"|'')?)?$/);
  if (!m) return null;
  const feet = Number(m[1]);
  const inches = m[2] ? Number(m[2]) : 0;
  if (inches >= 12) return null;
  return (feet * 12 + inches) * 25.4;
}
