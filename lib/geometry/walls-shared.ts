import type { Wall } from '../scene/schemas';
import { dist } from './vec';

/**
 * Shared between validation and the wall-network generator.
 * v1 treats walls as straight segments (first → last point); bulges are
 * stored in the schema but not yet rendered as arcs.
 */
export function wallCenterlineLength(wall: Wall): number {
  let length = 0;
  for (let i = 1; i < wall.path.pts.length; i++) {
    length += dist(wall.path.pts[i - 1]!, wall.path.pts[i]!);
  }
  return length;
}
