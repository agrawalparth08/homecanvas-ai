/**
 * Layer-aware DXF ingestion (Path A).
 *
 * Where `dxf.ts` is a deliberately minimal, axis-only parser (LINE/LWPOLYLINE →
 * horizontal/vertical walls, layers ignored, angled segments dropped), this
 * adapter reads the DXF *layer* of every entity and routes it by intent:
 *
 *   WALL layers   → general PrimWall {a,b} segments at ANY angle (arc bulges
 *                   on LWPOLYLINE are tessellated into short chords)
 *   COLUMN layers → PrimColumn (bbox of a CIRCLE / ARC / small closed polyline)
 *   DOOR / WINDOW → PrimOpening (a LINE or INSERT marker; width = length/default)
 *   TEXT / MTEXT  → PrimLabel
 *
 * Output is the shared {@link PrimitivePlan} (source:'cad'), so it flows through
 * the same `buildSceneFromPrimitives` spine as every other front door. Units come
 * from the DXF header `$INSUNITS` (reusing the INSUNITS_MM table idea from dxf.ts).
 */
import { Helper } from 'dxf';
import { parsePrimitivePlan, type PrimitivePlan } from '../extraction/primitive-plan';

/** Coarse intent bucket inferred from a CAD layer name. */
export type LayerClass =
  | 'wall'
  | 'door'
  | 'window'
  | 'column'
  | 'stair'
  | 'dimension'
  | 'furniture'
  | 'text'
  | 'other';

/**
 * Ordered layer-name patterns → class. First match wins, so more specific /
 * higher-priority buckets (walls, openings, structure) precede the catch-alls.
 * Tolerant of AIA (A-WALL), ISO, and a few FR/ES synonyms (MUR, PORTE, ESC).
 */
export const DEFAULT_LAYER_MAP: ReadonlyArray<readonly [RegExp, LayerClass]> = [
  [/DOOR|PORTE|PUERTA|A-DOOR/i, 'door'],
  [/WIN(?:DOW)?|GLAZ|VITR|VENT|A-GLAZ/i, 'window'],
  [/COL(?:UMN)?|PILLAR|PILIER|A-COLS/i, 'column'],
  [/STAIR|ESCAL|\bESC\b|A-FLOR-STRS/i, 'stair'],
  [/WALL|MUR\b|MURO|A-WALL/i, 'wall'],
  [/DIM(?:ENSION)?|A-ANNO|ANNO|COTE/i, 'dimension'],
  [/FURN|MOBIL|A-FURN/i, 'furniture'],
  [/TEXT|TXT|LABEL|NOTE/i, 'text'],
];

/** Classify a DXF layer name into a coarse intent bucket (tolerant regexes). */
export function classifyLayer(name: string | undefined | null): LayerClass {
  const n = (name ?? '').trim();
  if (!n) return 'other';
  for (const [re, cls] of DEFAULT_LAYER_MAP) if (re.test(n)) return cls;
  return 'other';
}

// $INSUNITS code → mm per unit (0 unitless, 1 in, 2 ft, 4 mm, 5 cm, 6 m). Same as dxf.ts.
const INSUNITS_MM: Record<number, number> = { 0: 1, 1: 25.4, 2: 304.8, 4: 1, 5: 10, 6: 1000 };

/** Default opening width (source units) when a marker carries no measurable length. */
const DEFAULT_OPENING_W = 900;
/** Max bbox span (source units) for a closed polyline to still count as a column, not a room. */
const COLUMN_MAX_SPAN = 1200;

export interface ParseDxfLayeredOptions {
  /** Max chord length (source units) when tessellating polyline arc bulges. */
  arcChord?: number;
  /** Override units→mm (else derived from $INSUNITS). */
  unitsToMm?: number;
}

interface Pt { x: number; y: number; bulge?: number }
interface Ent {
  type: string;
  layer?: string;
  start?: Pt; end?: Pt;
  x?: number; y?: number; r?: number;
  startAngle?: number; endAngle?: number;
  string?: string; text?: string;
  vertices?: Pt[]; closed?: boolean;
}

/** A wall segment a→b, in source units, carrying its source layer. */
type WallSeg = { a: { x: number; y: number }; b: { x: number; y: number }; layer: string };

/**
 * Parse a DXF into a layer-aware {@link PrimitivePlan} (source:'cad').
 * Walls are emitted at any angle; column/opening/label entities are routed by layer.
 */
export function parseDxfLayered(dxfText: string, opts: ParseDxfLayeredOptions = {}): PrimitivePlan {
  const chord = opts.arcChord ?? 200;
  const helper = new Helper(dxfText);
  // `helper.denormalised` expands INSERT/block references but THROWS on real
  // files with a malformed block (e.g. a block whose entities array is missing,
  // common in DWG→DXF conversions). Fall back to the raw parsed entities so the
  // parse degrades gracefully (INSERTs stay un-expanded; layer-routed
  // LINE/POLYLINE/TEXT still parse) instead of crashing the whole import.
  let entities: Ent[];
  try {
    entities = (helper.denormalised ?? helper.parsed.entities ?? []) as Ent[];
  } catch {
    entities = (helper.parsed.entities ?? []) as Ent[];
  }
  const insUnits = helper.parsed.header?.insUnits ?? 0;
  const unitsToMm = opts.unitsToMm ?? INSUNITS_MM[insUnits] ?? 1;

  const walls: WallSeg[] = [];
  const openings: PrimitivePlan['openings'] = [];
  const columns: PrimitivePlan['columns'] = [];
  const labels: PrimitivePlan['labels'] = [];

  for (const e of entities) {
    const cls = classifyLayer(e.layer);

    if (cls === 'wall') {
      collectWallSegments(e, chord).forEach((s) => walls.push({ ...s, layer: e.layer ?? '' }));
    } else if (cls === 'column') {
      const col = columnFromEntity(e);
      if (col) columns.push(col);
    } else if (cls === 'door' || cls === 'window') {
      const op = openingFromEntity(e, cls);
      if (op) openings.push(op);
    } else if (e.type === 'TEXT' || e.type === 'MTEXT') {
      const t = (e.string ?? e.text ?? '').trim();
      if (t) labels.push({ text: t, x: e.x ?? e.start?.x ?? 0, y: e.y ?? e.start?.y ?? 0 });
    }
  }

  return parsePrimitivePlan({ source: 'cad', unitsToMm, walls, openings, columns, labels });
}

/** Wall segments from a LINE or (arc-tessellated) LWPOLYLINE/POLYLINE; [] otherwise. */
function collectWallSegments(e: Ent, chord: number): Array<{ a: { x: number; y: number }; b: { x: number; y: number } }> {
  const out: Array<{ a: { x: number; y: number }; b: { x: number; y: number } }> = [];
  const push = (a: Pt, b: Pt) => {
    if (Math.hypot(b.x - a.x, b.y - a.y) > 1e-6) out.push({ a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y } });
  };
  if (e.type === 'LINE' && e.start && e.end) {
    push(e.start, e.end);
  } else if ((e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') && e.vertices && e.vertices.length > 1) {
    const vs = e.vertices;
    const span = (i: number, j: number) => {
      const a = vs[i]!, b = vs[j]!;
      if (a.bulge) tessellateBulge(a, b, a.bulge, chord).forEach(([p, q]) => push(p, q));
      else push(a, b);
    };
    for (let i = 0; i + 1 < vs.length; i++) span(i, i + 1);
    if (e.closed && vs.length > 2) span(vs.length - 1, 0);
  }
  return out;
}

/**
 * Split an arc (DXF "bulge" = tan(included/4)) between two vertices into short
 * straight chords no longer than `maxChord`. Returns successive [start,end] pairs.
 */
function tessellateBulge(a: Pt, b: Pt, bulge: number, maxChord: number): Array<[Pt, Pt]> {
  const theta = 4 * Math.atan(bulge); // signed included angle
  const dx = b.x - a.x, dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-6 || Math.abs(theta) < 1e-6) return [[a, b]];
  const radius = dist / 2 / Math.sin(Math.abs(theta) / 2);
  const arcLen = Math.abs(theta) * radius;
  const segs = Math.max(1, Math.ceil(arcLen / Math.max(1e-6, maxChord)));
  // chord midpoint + perpendicular offset to the arc centre
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const sagitta = (radius - radius * Math.cos(Math.abs(theta) / 2)) * Math.sign(bulge);
  const ux = -dy / dist, uy = dx / dist; // unit normal (left of a→b)
  const cx = mx - ux * (radius * Math.cos(Math.abs(theta) / 2)) * Math.sign(bulge);
  const cy = my - uy * (radius * Math.cos(Math.abs(theta) / 2)) * Math.sign(bulge);
  void sagitta;
  const a0 = Math.atan2(a.y - cy, a.x - cx);
  const pts: Pt[] = [];
  for (let k = 0; k <= segs; k++) {
    const ang = a0 + (theta * k) / segs;
    pts.push({ x: cx + radius * Math.cos(ang), y: cy + radius * Math.sin(ang) });
  }
  const pairs: Array<[Pt, Pt]> = [];
  for (let k = 0; k + 1 < pts.length; k++) pairs.push([pts[k]!, pts[k + 1]!]);
  return pairs;
}

/** Column (bbox center+size) from a CIRCLE/ARC or a small closed polyline; null otherwise. */
function columnFromEntity(e: Ent): { center: { x: number; y: number }; width: number; depth: number } | null {
  if (e.type === 'CIRCLE' || e.type === 'ARC') {
    if (e.x === undefined || e.y === undefined || !e.r) return null;
    return { center: { x: e.x, y: e.y }, width: e.r * 2, depth: e.r * 2 };
  }
  if ((e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') && e.vertices && e.vertices.length >= 3) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const v of e.vertices) { x0 = Math.min(x0, v.x); y0 = Math.min(y0, v.y); x1 = Math.max(x1, v.x); y1 = Math.max(y1, v.y); }
    const w = x1 - x0, d = y1 - y0;
    if (w <= 0 || d <= 0 || w > COLUMN_MAX_SPAN || d > COLUMN_MAX_SPAN) return null;
    return { center: { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }, width: w, depth: d };
  }
  return null;
}

/** Opening (door/window) from a LINE (width = length) or an INSERT marker; null otherwise. */
function openingFromEntity(
  e: Ent,
  cls: 'door' | 'window',
): { kind: 'door' | 'window'; center: { x: number; y: number }; width: number } | null {
  if (e.type === 'LINE' && e.start && e.end) {
    const len = Math.hypot(e.end.x - e.start.x, e.end.y - e.start.y);
    return {
      kind: cls,
      center: { x: (e.start.x + e.end.x) / 2, y: (e.start.y + e.end.y) / 2 },
      width: len > 1e-6 ? len : DEFAULT_OPENING_W,
    };
  }
  if (e.type === 'INSERT' && e.x !== undefined && e.y !== undefined) {
    return { kind: cls, center: { x: e.x, y: e.y }, width: DEFAULT_OPENING_W };
  }
  return null;
}
