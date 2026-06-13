/**
 * Deterministic, collision-aware auto-furnish (lane IX). Powers the
 * "Furnish this room" action: given a Room + options, drop a handful of
 * suggested pieces into the room's bbox on a simple shelf/grid layout, skipping
 * any piece that would collide or not fit. Pure: no DOM, no RNG, no wall-clock —
 * same inputs always yield the same FurnitureObject[].
 *
 * We greedily walk a cursor across the usable (margin-inset) bbox in reading
 * order, packing each piece axis-aligned (rotationY 0) and wrapping to a new
 * "shelf" row once the current row is full. Collision is delegated to
 * collision.ts (worldFootprint + collidesWithAny) so flush-but-clear packing and
 * the configured gap behave exactly as elsewhere.
 */
import type { Room, FurnitureObject } from '../scene/schemas';
import { rectFootprint, worldFootprint, collidesWithAny } from '../geometry/collision';
import type { Vec2 } from '../geometry/vec';
import { suggestFurniture, furnitureById, type AllFurnitureItem } from './all-furniture';

export interface AutoFurnishOptions {
  /** Min clearance between pieces, mm. */
  gap?: number;
  /** Keep pieces this far from the bbox edge, mm. */
  margin?: number;
  /** Cap on number of placed pieces. */
  max?: number;
  /** Prefix for deterministic ids (`<prefix>-<index>`). */
  idPrefix?: string;
}

const DEFAULTS = { gap: 150, margin: 200, max: 6, idPrefix: 'auto' } as const;

/** Generic fallback set when a room kind suggests nothing placeable. */
const GENERIC_FALLBACK: readonly string[] = ['sideTable', 'cornerPlant'];

/** Axis-aligned bbox of a polygon. Outer is guaranteed ≥3 pts by the schema. */
function bbox(poly: readonly Vec2[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/** Build a placed FurnitureObject from a catalog item at an axis-aligned centre. */
function place(item: AllFurnitureItem, id: string, roomId: string, cx: number, cy: number): FurnitureObject {
  // suggestFurniture only returns items resolved via furnitureById, which keep
  // the base CatalogItem shape: `model` is optional and exactOptionalProps means
  // we must spread assetRef conditionally rather than set it to undefined.
  const model = item.model;
  return {
    id,
    roomId,
    category: item.category,
    name: item.name,
    ...(model != null ? { assetRef: model } : {}),
    procedural: { kind: item.kind },
    transform: { x: cx, y: cy, elevation: 0, rotationY: 0 },
    dimensions: { w: item.w, d: item.d, h: item.h },
    footprint: rectFootprint(item.w, item.d),
    materialIds: [],
    source: { kind: 'agent', confidence: 1 },
  };
}

/**
 * Greedily furnish `room` with suggested pieces inside its boundary bbox.
 * Pieces are non-overlapping (respecting `gap`), kept within `margin` of the
 * bbox edge, axis-aligned, capped at `max`, and given deterministic ids. A piece
 * that cannot fit anywhere on the remaining shelves is skipped, not forced.
 */
export function autoFurnishRoom(room: Room, opts: AutoFurnishOptions = {}): FurnitureObject[] {
  const gap = opts.gap ?? DEFAULTS.gap;
  const margin = opts.margin ?? DEFAULTS.margin;
  const max = opts.max ?? DEFAULTS.max;
  const idPrefix = opts.idPrefix ?? DEFAULTS.idPrefix;

  if (max <= 0) return [];

  const suggested = suggestFurniture(room.kind);
  // suggestFurniture never returns empty for known kinds, but guard anyway so a
  // future kind with no mapping still gets a couple of generic pieces.
  const items: AllFurnitureItem[] =
    suggested.length > 0
      ? suggested
      : GENERIC_FALLBACK.map(furnitureById).filter(
          (it): it is AllFurnitureItem => it !== undefined,
        );
  if (items.length === 0) return [];

  const { minX, minY, maxX, maxY } = bbox(room.boundary.outer);
  // Usable interior after the wall margin. Non-positive => nothing fits.
  const usableW = maxX - minX - 2 * margin;
  const usableH = maxY - minY - 2 * margin;
  if (usableW <= 0 || usableH <= 0) return [];

  const x0 = minX + margin;
  const y0 = minY + margin;
  const x1 = maxX - margin;
  const y1 = maxY - margin;

  const placed: FurnitureObject[] = [];
  const obstacles: Vec2[][] = []; // world footprints of placed pieces (collision cache)

  // Shelf cursor: cursorX advances within a row, rowY is the row's top edge,
  // rowH tracks the tallest piece so the next row clears it (+gap).
  let cursorX = x0;
  let rowY = y0;
  let rowH = 0;

  for (const item of items) {
    if (placed.length >= max) break;
    if (item.w > usableW || item.d > usableH) continue; // can't fit even alone

    // Wrap to a new shelf if this piece overruns the current row's right edge.
    if (cursorX + item.w > x1 + 1e-6) {
      cursorX = x0;
      rowY = rowY + rowH + gap;
      rowH = 0;
    }
    // Out of vertical room for a fresh shelf: stop packing.
    if (rowY + item.d > y1 + 1e-6) break;

    const cx = cursorX + item.w / 2;
    const cy = rowY + item.d / 2;
    const foot = worldFootprint({ footprint: rectFootprint(item.w, item.d), transform: { x: cx, y: cy, rotationY: 0 } });

    // Belt-and-suspenders: the cursor layout keeps pieces apart, but if a wide
    // piece on a prior shelf juts into this slot, skip rather than overlap.
    if (collidesWithAny(foot, obstacles, gap)) {
      cursorX += item.w + gap;
      continue;
    }

    placed.push(place(item, `${idPrefix}-${placed.length}`, room.id, cx, cy));
    obstacles.push(foot);
    cursorX += item.w + gap;
    if (item.d > rowH) rowH = item.d;
  }

  return placed;
}
