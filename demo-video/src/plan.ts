/**
 * A small fictional apartment plan shared by the Problem / Trace scenes.
 * Coordinates live in an 800×560 viewBox. Wall segments already exclude door
 * gaps so the tracing animation can draw them one by one.
 */
export interface Seg {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export const WALLS: Seg[] = [
  // outer shell
  { x1: 40, y1: 40, x2: 760, y2: 40 },
  { x1: 760, y1: 40, x2: 760, y2: 520 },
  { x1: 760, y1: 520, x2: 40, y2: 520 },
  { x1: 40, y1: 520, x2: 40, y2: 40 },
  // bedroom | living divider (door gap 150–210)
  { x1: 300, y1: 40, x2: 300, y2: 150 },
  { x1: 300, y1: 210, x2: 300, y2: 330 },
  // horizontal divider (door gap 360–420)
  { x1: 40, y1: 330, x2: 360, y2: 330 },
  { x1: 420, y1: 330, x2: 760, y2: 330 },
  // kitchen | dining divider (door gap 400–460)
  { x1: 300, y1: 330, x2: 300, y2: 400 },
  { x1: 300, y1: 460, x2: 300, y2: 520 },
  // dining | bath divider (door gap 390–450)
  { x1: 520, y1: 330, x2: 520, y2: 390 },
  { x1: 520, y1: 450, x2: 520, y2: 520 },
];

export interface RoomRect {
  label: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Floor tint used in the trace + edit scenes. */
  fill: string;
}

export const ROOMS: RoomRect[] = [
  { label: 'BEDROOM', x0: 40, y0: 40, x1: 300, y1: 330, fill: 'rgba(120,170,255,0.16)' },
  { label: 'LIVING', x0: 300, y0: 40, x1: 760, y1: 330, fill: 'rgba(91,214,160,0.13)' },
  { label: 'KITCHEN', x0: 40, y0: 330, x1: 300, y1: 520, fill: 'rgba(216,162,90,0.15)' },
  { label: 'DINING', x0: 300, y0: 330, x1: 520, y1: 520, fill: 'rgba(120,170,255,0.12)' },
  { label: 'BATH', x0: 520, y0: 330, x1: 760, y1: 520, fill: 'rgba(214,71,158,0.10)' },
];

/** Door leaf + swing arc, anchored at the hinge. */
export const DOORS = [
  { hx: 300, hy: 150, leaf: 60, dir: 'right-down' as const },
  { hx: 360, hy: 330, leaf: 60, dir: 'down-right' as const },
  { hx: 520, hy: 390, leaf: 60, dir: 'right-down' as const },
  { hx: 300, hy: 400, leaf: 60, dir: 'left-down' as const },
];

/** Window glyphs drawn over outer walls (double line). */
export const WINDOWS: Seg[] = [
  { x1: 420, y1: 40, x2: 560, y2: 40 },
  { x1: 40, y1: 100, x2: 40, y2: 220 },
];

/** Structural pillar (magenta X-in-box, CAD convention). */
export const PILLAR = { x: 600, y: 240, size: 26 };

export const PLAN_W = 800;
export const PLAN_H = 560;

/** Isometric projection used by the "live 3D" panel in the trace scene. */
export function iso(x: number, y: number, z: number): { x: number; y: number } {
  return { x: (x - y) * 0.866, y: (x + y) * 0.5 - z };
}
