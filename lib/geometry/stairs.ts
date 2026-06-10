import type { Stair } from '../scene/schemas';
import { STAIR_RISE_TARGET_MM } from './constants';
import { add, rotate, type Vec2 } from './vec';
import type { GeoPrism } from './walls';

/**
 * Parametric stair generator: straight and L flights (U arrives with v2).
 * Solid risers (each step is a full-height box from the ground) — reads well
 * visually and keeps geometry trivially valid.
 */

export interface StairSolid {
  stairId: string;
  prisms: GeoPrism[];
  stepCount: number;
  rise: number;
}

export function stairStepCount(totalRise: number): number {
  return Math.max(2, Math.round(totalRise / STAIR_RISE_TARGET_MM));
}

export function buildStair(stair: Stair): StairSolid {
  const steps = stairStepCount(stair.totalRise);
  const rise = stair.totalRise / steps;
  const run = stair.treadRun;
  const w = stair.width;
  const prisms: GeoPrism[] = [];

  const place = (p: Vec2): Vec2 => add(stair.position, rotate(p, stair.rotation));
  const quad = (x0: number, y0: number, x1: number, y1: number): [Vec2, Vec2, Vec2, Vec2] => [
    place({ x: x0, y: y0 }),
    place({ x: x1, y: y0 }),
    place({ x: x1, y: y1 }),
    place({ x: x0, y: y1 }),
  ];

  const split = stair.kind === 'straight' ? steps : Math.min(stair.flightSplit ?? Math.ceil(steps / 2), steps - 1);
  const turnSign = stair.turn === 'right' ? -1 : 1;

  // First flight along local +x, centered on y=0.
  for (let i = 0; i < split; i++) {
    prisms.push({
      corners: quad(i * run, -w / 2, (i + 1) * run, w / 2),
      zMin: 0,
      zMax: (i + 1) * rise,
      sStart: i * run,
      sEnd: (i + 1) * run,
    });
  }

  if (stair.kind === 'L' && split < steps) {
    const lx = split * run; // landing starts here
    // Landing: w × w square at the top of the first flight.
    prisms.push({
      corners: quad(lx, -w / 2, lx + w, w / 2),
      zMin: 0,
      zMax: split * rise,
      sStart: lx,
      sEnd: lx + w,
    });
    // Second flight: perpendicular, ascending away from the landing.
    for (let i = split; i < steps; i++) {
      const k = i - split;
      const y0 = turnSign * (w / 2 + k * run);
      const y1 = turnSign * (w / 2 + (k + 1) * run);
      prisms.push({
        corners: quad(lx, Math.min(y0, y1), lx + w, Math.max(y0, y1)),
        zMin: 0,
        zMax: (i + 1) * rise,
        sStart: k * run,
        sEnd: (k + 1) * run,
      });
    }
  }

  return { stairId: stair.id, prisms, stepCount: steps, rise };
}
