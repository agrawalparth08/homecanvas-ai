import type { Vec2 } from '../geometry/vec';

/**
 * Underlay px <-> plan mm mapping for the 2D tracer.
 *
 * Image pixels have y growing DOWNWARD from the top-left; plan mm have y
 * growing UPWARD (north). By convention the calibration origin is the image's
 * bottom-left, so image (0, H) -> plan (0, 0). rotationDeg is reserved for
 * skewed scans (v1 assumes 0 / axis-aligned).
 */
export interface Calibration {
  mmPerPx: number;
  originPx: Vec2;
  rotationDeg: number;
}

export function defaultCalibration(mmPerPx: number, imageHeightPx: number): Calibration {
  return { mmPerPx, originPx: { x: 0, y: imageHeightPx }, rotationDeg: 0 };
}

export function imageToPlan(px: Vec2, cal: Calibration): Vec2 {
  // rotationDeg ignored in v1 (axis-aligned).
  return {
    x: (px.x - cal.originPx.x) * cal.mmPerPx,
    y: (cal.originPx.y - px.y) * cal.mmPerPx,
  };
}

export function planToImage(mm: Vec2, cal: Calibration): Vec2 {
  return {
    x: mm.x / cal.mmPerPx + cal.originPx.x,
    y: cal.originPx.y - mm.y / cal.mmPerPx,
  };
}

/** mm-per-pixel from two image-space points and the real distance between them. */
export function mmPerPxFromCalibrationLine(a: Vec2, b: Vec2, knownMm: number): number {
  const px = Math.hypot(b.x - a.x, b.y - a.y);
  if (px < 1) throw new Error('calibration line is too short');
  if (knownMm <= 0) throw new Error('known length must be positive');
  return knownMm / px;
}
