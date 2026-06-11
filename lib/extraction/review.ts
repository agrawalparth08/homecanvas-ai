/**
 * Extraction review heuristics (Phase 6), pure + deterministic.
 *
 * reviewExtraction inspects an already-EXTRACTED scene graph (not pixels) for
 * tell-tale problems and returns ConfidenceIssues plus a coverage figure. Every
 * rule is a geometry/threshold check — no CV, no RNG — so it's fully testable
 * and never flags the clean sample home at warning/error severity.
 *
 * The plan's "coverage diff vs raster" is reframed here as coverage vs the floor
 * bounding-box extent (same missing-room signal, no raster needed); a raster-
 * overlap version is a deferred non-deterministic enhancement.
 */
import { WALL_THICKNESS_MAX_MM, WALL_THICKNESS_MIN_MM } from '../geometry/constants';
import { pointInPolygon, polygonArea } from '../geometry/rooms';
import type { ConfidenceIssue, ExtractionReview, HomeScene } from '../scene/schemas';

const MIN_WALL_LEN_MM = 150;
const LOW_CONFIDENCE = 0.5;
const COVERAGE_FLOOR = 0.4;

const sevRank = (s: ConfidenceIssue['severity']) => (s === 'error' ? 0 : s === 'warning' ? 1 : 2);

export interface ReviewOptions {
  coverageFloor?: number;
}

export function reviewExtraction(scene: HomeScene, opts: ReviewOptions = {}): ExtractionReview {
  const issues: ConfidenceIssue[] = [];
  const coverageFloor = opts.coverageFloor ?? COVERAGE_FLOOR;

  let totalRoomArea = 0;
  let totalFloorArea = 0;

  for (const floor of scene.floors) {
    // floor extent from wall points
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
      // suspicious thickness
      if (w.thickness < WALL_THICKNESS_MIN_MM || w.thickness > WALL_THICKNESS_MAX_MM) {
        issues.push({
          id: `rev-thickness-${w.id}`,
          entityId: w.id,
          severity: 'warning',
          kind: 'suspicious-dimension',
          message: `Wall thickness ${Math.round(w.thickness)}mm is outside the plausible ${WALL_THICKNESS_MIN_MM}–${WALL_THICKNESS_MAX_MM}mm range.`,
          suggestedFix: 'Set the wall to a standard thickness (e.g. 115mm partition, 230mm external).',
        });
      }
      // degenerate / too-short wall
      const a = w.path.pts[0]!;
      const b = w.path.pts[w.path.pts.length - 1]!;
      if (Math.hypot(b.x - a.x, b.y - a.y) < MIN_WALL_LEN_MM) {
        issues.push({
          id: `rev-shortwall-${w.id}`,
          entityId: w.id,
          severity: 'warning',
          kind: 'suspicious-dimension',
          message: 'Wall is shorter than 150mm — likely an extraction artifact.',
          suggestedFix: 'Merge with a neighbour or delete this sliver wall.',
        });
      }
    }
    const floorArea = Number.isFinite(minX) ? Math.max(0, maxX - minX) * Math.max(0, maxY - minY) : 0;
    totalFloorArea += floorArea;
    for (const room of floor.rooms) totalRoomArea += polygonArea(room.boundary.outer);

    // impossible furniture placement: object centre outside its room
    const roomById = new Map(floor.rooms.map((r) => [r.id, r]));
    for (const obj of floor.objects) {
      const room = roomById.get(obj.roomId);
      if (!room) continue; // dangling roomId is caught by validateScene, not here
      if (!pointInPolygon({ x: obj.transform.x, y: obj.transform.y }, room.boundary.outer)) {
        issues.push({
          id: `rev-placement-${obj.id}`,
          entityId: obj.id,
          severity: 'warning',
          kind: 'impossible-placement',
          message: `${obj.name} sits outside its room "${room.name}".`,
          suggestedFix: 'Move the piece back inside the room boundary.',
        });
      }
    }
  }

  // low-confidence cluster (info)
  const lowConf: string[] = [];
  for (const floor of scene.floors) {
    for (const w of floor.walls) if (w.source.confidence < LOW_CONFIDENCE) lowConf.push(w.id);
    for (const r of floor.rooms) if (r.source.confidence < LOW_CONFIDENCE) lowConf.push(r.id);
  }
  if (lowConf.length > 0) {
    issues.push({
      id: 'rev-lowconfidence',
      severity: 'info',
      kind: 'low-confidence',
      message: `${lowConf.length} entit${lowConf.length === 1 ? 'y' : 'ies'} below the review confidence threshold.`,
      suggestedFix: 'Verify these in the tracing wizard.',
    });
  }

  const coverage = totalFloorArea > 0 ? Math.min(1, totalRoomArea / totalFloorArea) : 0;
  if (coverage < coverageFloor) {
    issues.push({
      id: 'rev-coverage',
      severity: 'info',
      kind: 'coverage-gap',
      message: `Rooms cover only ${Math.round(coverage * 100)}% of the floor extent — some rooms may be missing.`,
      suggestedFix: 'Trace any unlabelled spaces in the wizard.',
    });
  }

  issues.sort((a, b) => sevRank(a.severity) - sevRank(b.severity) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const errors = issues.filter((i) => i.severity === 'error').length;
  const warnings = issues.filter((i) => i.severity === 'warning').length;
  return {
    issues,
    coverage,
    summary: `${errors} error(s), ${warnings} warning(s) · ${Math.round(coverage * 100)}% room coverage`,
  };
}
