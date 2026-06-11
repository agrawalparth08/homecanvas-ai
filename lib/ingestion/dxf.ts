/**
 * DXF ingestion adapter (Phase 3).
 *
 * Parses a DXF (the ASCII interchange format DWG converts to via ODA/LibreDWG)
 * into axis-aligned wall segments + text labels + drawing units, feeding the
 * shared extraction pipeline (heal-walls → detectRooms). Only the permissive
 * `dxf` npm parser is used; the DWG→DXF conversion is an external, exec-only
 * step handled elsewhere.
 */
import { Helper } from 'dxf';
import type { WallLine } from '../extraction/rooms-from-walls';

export interface DxfLabel { text: string; x: number; y: number; }
export interface DxfPlan {
  walls: WallLine[];
  labels: DxfLabel[];
  /** mm per drawing unit (from $INSUNITS); 1 when unknown. */
  unitsToMm: number;
  bounds: { x0: number; y0: number; x1: number; y1: number };
}

// $INSUNITS code → mm per unit (0 unitless, 1 in, 2 ft, 4 mm, 5 cm, 6 m)
const INSUNITS_MM: Record<number, number> = { 0: 1, 1: 25.4, 2: 304.8, 4: 1, 5: 10, 6: 1000 };

interface Pt { x: number; y: number; }
interface Ent {
  type: string;
  start?: Pt; end?: Pt;
  x?: number; y?: number;
  string?: string; text?: string;
  vertices?: Pt[]; closed?: boolean;
}

export function parseDxf(dxfText: string, opts: { axisTol?: number; minLen?: number } = {}): DxfPlan {
  const tol = opts.axisTol ?? 1;
  const minLen = opts.minLen ?? 1;
  const helper = new Helper(dxfText);
  const entities = (helper.denormalised ?? helper.parsed.entities ?? []) as Ent[];
  const insUnits = helper.parsed.header?.insUnits ?? 0;
  const unitsToMm = INSUNITS_MM[insUnits] ?? 1;

  const walls: WallLine[] = [];
  const labels: DxfLabel[] = [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const bound = (x: number, y: number) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
  const seg = (ax: number, ay: number, bx: number, by: number) => {
    bound(ax, ay); bound(bx, by);
    const dx = Math.abs(bx - ax), dy = Math.abs(by - ay);
    if (dx <= tol && dy > minLen) walls.push({ orient: 'v', coord: (ax + bx) / 2, lo: Math.min(ay, by), hi: Math.max(ay, by) });
    else if (dy <= tol && dx > minLen) walls.push({ orient: 'h', coord: (ay + by) / 2, lo: Math.min(ax, bx), hi: Math.max(ax, bx) });
  };

  for (const e of entities) {
    if (e.type === 'LINE' && e.start && e.end) {
      seg(e.start.x, e.start.y, e.end.x, e.end.y);
    } else if ((e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') && e.vertices) {
      const vs = e.vertices;
      for (let i = 0; i + 1 < vs.length; i++) seg(vs[i]!.x, vs[i]!.y, vs[i + 1]!.x, vs[i + 1]!.y);
      if (e.closed && vs.length > 2) seg(vs[vs.length - 1]!.x, vs[vs.length - 1]!.y, vs[0]!.x, vs[0]!.y);
    } else if (e.type === 'TEXT' || e.type === 'MTEXT') {
      const t = (e.string ?? e.text ?? '').trim();
      if (t) {
        const x = e.x ?? e.start?.x ?? 0, y = e.y ?? e.start?.y ?? 0;
        labels.push({ text: t, x, y });
        bound(x, y);
      }
    }
  }
  if (!Number.isFinite(x0)) { x0 = 0; y0 = 0; x1 = 0; y1 = 0; }
  return { walls, labels, unitsToMm, bounds: { x0, y0, x1, y1 } };
}
