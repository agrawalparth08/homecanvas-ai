import { describe, expect, it } from 'vitest';
import {
  stepWalk,
  easeTour,
  smoothstep,
  wrapAngle,
  shortestArc,
  type CamState,
} from './walk-camera';

const ZERO: CamState = { x: 0, y: 0, yaw: 0 };

describe('helpers', () => {
  it('smoothstep is flat at the ends and 0.5 at the middle', () => {
    expect(smoothstep(0)).toBe(0);
    expect(smoothstep(1)).toBe(1);
    expect(smoothstep(0.5)).toBeCloseTo(0.5);
    expect(smoothstep(-1)).toBe(0); // clamped
    expect(smoothstep(2)).toBe(1); // clamped
  });

  it('wrapAngle keeps angles in (-pi, pi]', () => {
    expect(wrapAngle(0)).toBe(0);
    expect(wrapAngle(Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(-Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(1.5 * Math.PI)).toBeCloseTo(-0.5 * Math.PI);
  });

  it('shortestArc picks the short way round', () => {
    // from 170deg to -170deg is +20deg the short way, not -340deg
    expect(shortestArc((170 * Math.PI) / 180, (-170 * Math.PI) / 180)).toBeCloseTo((20 * Math.PI) / 180);
  });
});

describe('stepWalk', () => {
  it('moves forward along +y at yaw 0', () => {
    const next = stepWalk(ZERO, { forward: 1, strafe: 0, turn: 0 }, 0.5, 2000);
    expect(next.x).toBeCloseTo(0);
    expect(next.y).toBeCloseTo(1000); // 2000 mm/s * 0.5 s
    expect(next.yaw).toBeCloseTo(0);
  });

  it('strafes right (-x) at yaw 0', () => {
    const next = stepWalk(ZERO, { forward: 0, strafe: 1, turn: 0 }, 1, 1000);
    expect(next.x).toBeCloseTo(1000);
    expect(next.y).toBeCloseTo(0);
  });

  it('moves forward along +x after a quarter turn', () => {
    const turned: CamState = { x: 0, y: 0, yaw: Math.PI / 2 };
    const next = stepWalk(turned, { forward: 1, strafe: 0, turn: 0 }, 1, 1000);
    expect(next.x).toBeCloseTo(1000);
    expect(next.y).toBeCloseTo(0);
  });

  it('applies turn as radians/sec and wraps the yaw', () => {
    const next = stepWalk({ x: 0, y: 0, yaw: Math.PI }, { forward: 0, strafe: 0, turn: 1 }, 0.5, 0);
    expect(next.yaw).toBeCloseTo(wrapAngle(Math.PI + 0.5));
  });

  it('does not mutate the input state', () => {
    const s: CamState = { x: 1, y: 2, yaw: 0.3 };
    stepWalk(s, { forward: 1, strafe: 1, turn: 1 }, 1, 500);
    expect(s).toEqual({ x: 1, y: 2, yaw: 0.3 });
  });
});

describe('easeTour', () => {
  const FROM: CamState = { x: 0, y: 0, yaw: 0 };
  const TO: CamState = { x: 1000, y: 2000, yaw: Math.PI / 2 };

  it('returns the endpoints at t=0 and t=1', () => {
    expect(easeTour(FROM, TO, 0)).toEqual(FROM);
    const end = easeTour(FROM, TO, 1);
    expect(end.x).toBeCloseTo(TO.x);
    expect(end.y).toBeCloseTo(TO.y);
    expect(end.yaw).toBeCloseTo(TO.yaw);
  });

  it('eases the midpoint with smoothstep (halfway in position)', () => {
    const mid = easeTour(FROM, TO, 0.5);
    expect(mid.x).toBeCloseTo(500);
    expect(mid.y).toBeCloseTo(1000);
  });

  it('clamps t outside [0,1]', () => {
    expect(easeTour(FROM, TO, -5)).toEqual(FROM);
    const over = easeTour(FROM, TO, 5);
    expect(over.x).toBeCloseTo(TO.x);
  });

  it('rotates the short way across the +/-pi seam', () => {
    const from: CamState = { x: 0, y: 0, yaw: (170 * Math.PI) / 180 };
    const to: CamState = { x: 0, y: 0, yaw: (-170 * Math.PI) / 180 };
    const mid = easeTour(from, to, 0.5);
    // halfway should be near +/-180, NOT near 0 (which the long way would give)
    expect(Math.abs(mid.yaw)).toBeGreaterThan((175 * Math.PI) / 180);
  });
});
