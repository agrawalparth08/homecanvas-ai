/**
 * Pure first-person / tour camera math (Phase 6+). No three.js: positions are
 * plan-space mm (x = world.x, y = world.z) and `yaw` is the heading in radians,
 * measured so that yaw=0 faces +y (into the room, +world.z) and increases
 * turning toward +x. Callers (R3F) convert yaw → a three.js rotation.
 */

/** Planar camera pose: position (plan mm) and heading (radians). */
export interface CamState {
  x: number;
  y: number;
  yaw: number;
}

/** Per-frame intent: -1..1 along each axis (forward/back, strafe, turn). */
export interface WalkInput {
  forward: number;
  strafe: number;
  turn: number;
}

const TWO_PI = Math.PI * 2;

/** Smoothstep 3t²-2t³ on [0,1]; flat slope at both ends. */
export function smoothstep(t: number): number {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}

/** Wrap an angle to (-π, π]. */
export function wrapAngle(a: number): number {
  let r = ((a + Math.PI) % TWO_PI + TWO_PI) % TWO_PI - Math.PI;
  if (r === -Math.PI) r = Math.PI;
  return r;
}

/** Shortest signed angular delta from `a` to `b`, in (-π, π]. */
export function shortestArc(a: number, b: number): number {
  return wrapAngle(b - a);
}

/**
 * Advance a walk pose by one step: turn first, then translate `speed*dt` mm in
 * the heading's forward/right basis (planar WASD). `forward`/`strafe`/`turn` are
 * unitless intents (clamped sensibly by the caller); `turn` is applied as
 * radians/sec. Returns a NEW state (inputs untouched).
 */
export function stepWalk(
  state: CamState,
  input: WalkInput,
  dt: number,
  speed: number,
): CamState {
  const yaw = wrapAngle(state.yaw + input.turn * dt);
  const dist = speed * dt;
  // forward axis (yaw=0 → +y); right axis is forward rotated -90°.
  const fx = Math.sin(yaw);
  const fy = Math.cos(yaw);
  const rx = fy;
  const ry = -fx;
  return {
    x: state.x + (fx * input.forward + rx * input.strafe) * dist,
    y: state.y + (fy * input.forward + ry * input.strafe) * dist,
    yaw,
  };
}

/**
 * Interpolate a tour pose from `from` to `to` at parameter `t` with smoothstep
 * easing. Yaw follows the shortest arc (no spinning the long way round). t is
 * clamped to [0,1].
 */
export function easeTour(from: CamState, to: CamState, t: number): CamState {
  const e = smoothstep(t);
  return {
    x: from.x + (to.x - from.x) * e,
    y: from.y + (to.y - from.y) * e,
    yaw: wrapAngle(from.yaw + shortestArc(from.yaw, to.yaw) * e),
  };
}
