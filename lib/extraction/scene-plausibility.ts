/**
 * Scene scale-plausibility check (Phase: verify wizard), pure + deterministic.
 *
 * WHY: an imported scene has the right SHAPE but possibly the wrong SIZE — vector
 * PDFs land in raw PDF units, raster traces use a guessed mm/px. This check inspects
 * the EXTRACTED scene graph (mm) against residential sanity bounds and, when the home
 * is implausibly scaled, asks the wizard to offer a calibration step. No CV, no RNG,
 * no clock — every figure is a deterministic geometry/threshold computation.
 *
 * Operates over a single floor: level 0 if present, else the floor with the largest
 * wall-bbox footprint (the "main" floor). Width/depth come from that floor's wall
 * points; room areas from a shoelace over boundary.outer (via geometry/rooms).
 */
import { polygonArea } from '../geometry/rooms';
import type { Floor, HomeScene } from '../scene/schemas';

export interface ScaleIssue {
  code: string;
  message: string;
}

export interface ScaleCheck {
  plausible: boolean;
  /** true => the verify UI should offer the calibration step. */
  suggestCalibration: boolean;
  issues: ScaleIssue[];
  metrics: {
    footprintM2: number;
    medianRoomM2: number;
    minRoomM2: number;
    maxRoomM2: number;
    widthM: number;
    depthM: number;
  };
}

// Residential sanity bounds (metres / m^2). Outside these the scale is almost
// certainly wrong (raw PDF units or a bad mm/px guess) rather than an unusual home.
const FOOTPRINT_MIN_M2 = 8;
const FOOTPRINT_MAX_M2 = 2000;
const SPAN_MIN_M = 1.5;
const SPAN_MAX_M = 120;
const MEDIAN_ROOM_MIN_M2 = 1.5;
const MEDIAN_ROOM_MAX_M2 = 200;
const MAX_ROOM_FLOOR_M2 = 2; // a home with rooms but no room reaching 2 m^2 is mis-scaled

const MM_PER_M = 1000;
const MM2_PER_M2 = MM_PER_M * MM_PER_M;

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Wall-point bounding box of a floor in mm, or null when the floor has no wall points. */
function wallBBox(floor: Floor): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const w of floor.walls) {
    for (const p of w.path.pts) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}

/** mm^2 footprint of a floor's wall bbox (0 when no walls). */
function bboxAreaMm2(floor: Floor): number {
  const bb = wallBBox(floor);
  if (!bb) return 0;
  return Math.max(0, bb.maxX - bb.minX) * Math.max(0, bb.maxY - bb.minY);
}

/** The "main" floor to scale-check: ground (level 0) if present, else largest footprint. */
function pickFloor(scene: HomeScene): Floor {
  const ground = scene.floors.find((f) => f.level === 0);
  if (ground) return ground;
  // scene.floors has min length 1 by schema, so reduce always yields a floor.
  return scene.floors.reduce((best, f) => (bboxAreaMm2(f) > bboxAreaMm2(best) ? f : best));
}

/** Median of a non-empty sorted-internally list; 0 for an empty list. */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function checkSceneScale(scene: HomeScene): ScaleCheck {
  const floor = pickFloor(scene);

  const bb = wallBBox(floor);
  const widthM = bb ? Math.max(0, bb.maxX - bb.minX) / MM_PER_M : 0;
  const depthM = bb ? Math.max(0, bb.maxY - bb.minY) / MM_PER_M : 0;
  const footprintM2 = widthM * depthM;

  const roomAreasM2 = floor.rooms.map((r) => polygonArea(r.boundary.outer) / MM2_PER_M2);
  const medianRoomM2 = median(roomAreasM2);
  const minRoomM2 = roomAreasM2.length > 0 ? Math.min(...roomAreasM2) : 0;
  const maxRoomM2 = roomAreasM2.length > 0 ? Math.max(...roomAreasM2) : 0;

  const metrics = {
    footprintM2: round1(footprintM2),
    medianRoomM2: round1(medianRoomM2),
    minRoomM2: round1(minRoomM2),
    maxRoomM2: round1(maxRoomM2),
    widthM: round1(widthM),
    depthM: round1(depthM),
  };

  // Empty scene: nothing to scale, so don't offer calibration.
  if (floor.rooms.length === 0) {
    return {
      plausible: false,
      suggestCalibration: false,
      issues: [
        {
          code: 'empty',
          message: 'No rooms in the scene — nothing to scale-check.',
        },
      ],
      metrics,
    };
  }

  const issues: ScaleIssue[] = [];

  if (footprintM2 < FOOTPRINT_MIN_M2 || footprintM2 > FOOTPRINT_MAX_M2) {
    issues.push({
      code: 'footprint',
      message: `Home footprint ${metrics.footprintM2} m² is outside the plausible ${FOOTPRINT_MIN_M2}–${FOOTPRINT_MAX_M2} m² range.`,
    });
  }

  if (widthM < SPAN_MIN_M || widthM > SPAN_MAX_M || depthM < SPAN_MIN_M || depthM > SPAN_MAX_M) {
    issues.push({
      code: 'span',
      message: `Home spans ${metrics.widthM}×${metrics.depthM} m — outside the plausible ${SPAN_MIN_M}–${SPAN_MAX_M} m per side.`,
    });
  }

  if (medianRoomM2 < MEDIAN_ROOM_MIN_M2 || medianRoomM2 > MEDIAN_ROOM_MAX_M2) {
    issues.push({
      code: 'roomSize',
      message: `Median room ${metrics.medianRoomM2} m² is outside the plausible ${MEDIAN_ROOM_MIN_M2}–${MEDIAN_ROOM_MAX_M2} m² range.`,
    });
  }

  // Rooms exist but even the biggest is implausibly tiny => scale is collapsed.
  if (maxRoomM2 < MAX_ROOM_FLOOR_M2) {
    issues.push({
      code: 'tinyRooms',
      message: `Largest room is only ${metrics.maxRoomM2} m² — rooms are implausibly small.`,
    });
  }

  return {
    plausible: issues.length === 0,
    suggestCalibration: issues.length > 0,
    issues,
    metrics,
  };
}
