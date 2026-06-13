/**
 * Raster wall mask → PrimitivePlan adapter (Path B spine bridge).
 *
 * Closes the no-CAD loop: once CV preprocessing (threshold/deskew, owned by the
 * image worker) yields a binary wall mask + an mm/px scale, this turns it into a
 * validated `raster-cv` PrimitivePlan via wallsFromMask, so the image path joins
 * the exact same `buildSceneFromPrimitives` spine the CAD path uses — no bespoke
 * scene assembly. wallsFromMask already returns millimetres, so `unitsToMm` is 1.
 */
import { type WallLine } from './rooms-from-walls';
import { wallsFromMask, type RasterWallOptions } from './raster-walls';
import { parsePrimitivePlan, type PrimitivePlan, type PrimWall } from './primitive-plan';

/** Axis-aligned WallLine (mm) → a free wall segment a→b. */
function lineToWall(l: WallLine): Pick<PrimWall, 'a' | 'b'> {
  return l.orient === 'v'
    ? { a: { x: l.coord, y: l.lo }, b: { x: l.coord, y: l.hi } }
    : { a: { x: l.lo, y: l.coord }, b: { x: l.hi, y: l.coord } };
}

/**
 * Build a validated `raster-cv` PrimitivePlan straight from a binary wall mask.
 * mask[y][x] === true marks a wall pixel; `opts.mmPerPx` sets the scale.
 */
export function primitivePlanFromMask(mask: boolean[][], opts: RasterWallOptions): PrimitivePlan {
  const walls = wallsFromMask(mask, opts).map(lineToWall);
  return parsePrimitivePlan({ source: 'raster-cv', unitsToMm: 1, walls });
}
