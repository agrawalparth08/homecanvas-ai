import { useMemo, useRef, useState } from 'react';
import { add, angleOf, lerp, rotate, sub, type Vec2 } from '@lib/geometry/vec';
import { buildStair } from '@lib/geometry/stairs';
import { parseFeetInches } from '@lib/geometry/scale';
import { isStructuralColumn } from '@lib/furniture/structural';
import type { ScenePatch } from '@lib/scene/patching';
import { makePatch } from '@lib/scene/patching';
import type { Floor, FurnitureObject, RoomKind, Stair } from '@lib/scene/schemas';
import {
  defaultCalibration,
  imageToPlan,
  mmPerPxFromCalibrationLine,
  planToImage,
  type Calibration,
} from '@lib/tracing/coords';
import { makeOpening, makeRoomRect, makeWall, nearestWall } from '@lib/tracing/builders';
import { snapPoint } from '@lib/tracing/snapping';

export type PlanTool = 'select' | 'calibrate' | 'wall' | 'room' | 'door' | 'window' | 'pan';

interface Props {
  floor: Floor;
  underlayUrl: string | null;
  /** Calibration if set; otherwise a synthesized one is used (no underlay tracing). */
  calibration: Calibration | null;
  tool: PlanTool;
  gridMm?: number;
  onPatch: (patch: ScenePatch) => void;
  onCalibrate: (cal: Calibration) => void;
  onSelect: (id: string) => void;
  selectionId?: string | null;
}

const ROOM_KIND_BY_KEYWORD: [string, RoomKind][] = [
  ['master', 'masterBedroom'], ['bed', 'bedroom'], ['kids', 'kidsRoom'], ['kitchen', 'kitchen'],
  ['dining', 'dining'], ['living', 'living'], ['lounge', 'living'], ['drawing', 'living'],
  ['bath', 'bathroom'], ['toilet', 'bathroom'], ['wash', 'washArea'], ['terrace', 'terrace'],
  ['balcony', 'balcony'], ['foyer', 'foyer'], ['entrance', 'foyer'], ['passage', 'passage'],
  ['office', 'study'], ['study', 'study'], ['store', 'store'], ['pooja', 'pooja'],
];
function inferKind(name: string): RoomKind {
  const l = name.toLowerCase();
  for (const [kw, kind] of ROOM_KIND_BY_KEYWORD) if (l.includes(kw)) return kind;
  return 'other';
}

// ---- drag-to-edit (fine-tuning existing geometry over the plan) -------------
type DragState =
  | { kind: 'wallEnd'; id: string; end: 0 | 1; pts: [Vec2, Vec2]; cur: Vec2 }
  | { kind: 'wallBody'; id: string; pts: [Vec2, Vec2]; grab: Vec2; cur: Vec2 }
  | { kind: 'roomCorner'; id: string; fixed: Vec2; holes: Vec2[][]; cur: Vec2 }
  | { kind: 'roomBody'; id: string; outer: Vec2[]; holes: Vec2[][]; grab: Vec2; cur: Vec2 }
  | { kind: 'opening'; id: string; wallId: string; u: number }
  | { kind: 'openingEnd'; id: string; wallId: string; fixedU: number; moveU: number }
  | { kind: 'stairBody'; id: string; pos: Vec2; grab: Vec2; cur: Vec2 }
  | { kind: 'stairRotate'; id: string; pos: Vec2; cur: Vec2 };

/** Parameter (0..1) of the closest point on segment a-b to p. */
const projectU = (p: Vec2, a: Vec2, b: Vec2): number => {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy || 1;
  return Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
};

const rectOuter = (a: Vec2, b: Vec2): Vec2[] => {
  const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
  return [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
};
const wallDragPts = (d: Extract<DragState, { kind: 'wallEnd' | 'wallBody' }>): [Vec2, Vec2] => {
  if (d.kind === 'wallEnd') { const p: [Vec2, Vec2] = [d.pts[0], d.pts[1]]; p[d.end] = d.cur; return p; }
  const dx = d.cur.x - d.grab.x, dy = d.cur.y - d.grab.y;
  return [{ x: d.pts[0].x + dx, y: d.pts[0].y + dy }, { x: d.pts[1].x + dx, y: d.pts[1].y + dy }];
};
const roomDragOuter = (d: Extract<DragState, { kind: 'roomCorner' | 'roomBody' }>): Vec2[] => {
  if (d.kind === 'roomCorner') return rectOuter(d.fixed, d.cur);
  const dx = d.cur.x - d.grab.x, dy = d.cur.y - d.grab.y;
  return d.outer.map((p) => ({ x: p.x + dx, y: p.y + dy }));
};

/** A placed object's footprint in world (plan-mm) space: local footprint rotated by rotationY then translated. */
const objWorldPts = (o: FurnitureObject): Vec2[] => {
  const { x, y, rotationY } = o.transform;
  const cos = Math.cos(rotationY), sin = Math.sin(rotationY);
  return o.footprint.map((p) => ({ x: x + p.x * cos - p.y * sin, y: y + p.x * sin + p.y * cos }));
};

const TWO_PI = Math.PI * 2;
/** Wrap an angle to [0, 2π) — same convention StairControls uses, so a stair rotated by drag and by the buttons store equal values. */
const normAngle = (r: number) => ((r % TWO_PI) + TWO_PI) % TWO_PI;

/** Stair with any in-progress drag (move/rotate) applied — for a live 2D preview.
 *  Uses drag.pos (position captured at drag start) so the preview matches what
 *  onPointerUp commits, even if the scene changes mid-drag (undo/redo). */
const effStair = (s: Stair, drag: DragState | null): Stair => {
  if (drag?.kind === 'stairBody' && drag.id === s.id) {
    return { ...s, position: { x: drag.pos.x + (drag.cur.x - drag.grab.x), y: drag.pos.y + (drag.cur.y - drag.grab.y) } };
  }
  if (drag?.kind === 'stairRotate' && drag.id === s.id) {
    return { ...s, rotation: normAngle(angleOf(sub(drag.cur, drag.pos))) };
  }
  return s;
};

export function Plan2DEditor({
  floor,
  underlayUrl,
  calibration,
  tool,
  gridMm = 50,
  onPatch,
  onCalibrate,
  onSelect,
  selectionId,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const widthPx = floor.underlay?.widthPx ?? 1000;
  const heightPx = floor.underlay?.heightPx ?? 1000;

  // Working calibration: real one, or a synthesized mapping so geometry still shows.
  const cal = calibration ?? defaultCalibration(10, heightPx);
  const calRef = useRef(cal);
  calRef.current = cal;

  const [view, setView] = useState(() => ({ k: 0.6, ox: 40, oy: 40 }));
  const [draftStart, setDraftStart] = useState<Vec2 | null>(null); // wall chain, image px
  const [calA, setCalA] = useState<Vec2 | null>(null); // calibration first point (image px)
  const [rectStart, setRectStart] = useState<Vec2 | null>(null);
  const [cursor, setCursor] = useState<Vec2 | null>(null); // image px
  const [drag, setDrag] = useState<DragState | null>(null);
  const panRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const anchorsMm = useMemo(
    () => floor.walls.flatMap((w) => [w.path.pts[0]!, w.path.pts[w.path.pts.length - 1]!]),
    [floor.walls],
  );

  function clientToImage(clientX: number, clientY: number): Vec2 {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: (clientX - rect.left - view.ox) / view.k, y: (clientY - rect.top - view.oy) / view.k };
  }

  /** image px -> snapped image px (snaps in mm space when calibrated). */
  function snapImage(px: Vec2): Vec2 {
    if (!calibration) return px;
    const mm = imageToPlan(px, calRef.current);
    const tolMm = (12 / view.k) * calRef.current.mmPerPx;
    const snappedMm = snapPoint(mm, anchorsMm, gridMm, tolMm);
    return planToImage(snappedMm, calRef.current);
  }

  const toMm = (px: Vec2) => imageToPlan(px, calRef.current);

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    const rect = svgRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    setView((v) => {
      const k = Math.min(8, Math.max(0.05, v.k * factor));
      return { k, ox: mx - (mx - v.ox) * (k / v.k), oy: my - (my - v.oy) * (k / v.k) };
    });
  }

  function onPointerDown(e: React.PointerEvent) {
    try {
      (e.target as Element).setPointerCapture?.(e.pointerId);
    } catch {
      /* no active pointer (e.g. synthetic event) — safe to ignore */
    }
    const img = clientToImage(e.clientX, e.clientY);

    if (tool === 'pan' || e.button === 1) {
      panRef.current = { x: e.clientX, y: e.clientY, ox: view.ox, oy: view.oy };
      return;
    }
    if (tool === 'select') {
      panRef.current = { x: e.clientX, y: e.clientY, ox: view.ox, oy: view.oy };
      return;
    }
    if (tool === 'calibrate') {
      if (!calA) setCalA(img);
      else {
        const mm = window.prompt('Real length of this line? (e.g. 3500 for mm, or 12\'6" for feet-inches)');
        if (mm) {
          const knownMm = parseFeetInches(mm) ?? Number(mm);
          if (knownMm && knownMm > 0) {
            const mmPerPx = mmPerPxFromCalibrationLine(calA, img, knownMm);
            onCalibrate(defaultCalibration(mmPerPx, heightPx));
          }
        }
        setCalA(null);
      }
      return;
    }
    if (tool === 'wall') {
      const snapped = snapImage(img);
      if (draftStart) {
        const a = toMm(draftStart);
        const b = toMm(snapped);
        if (Math.hypot(b.x - a.x, b.y - a.y) > 100) {
          onPatch(makePatch('Trace wall', [{ type: 'add_wall', floorId: floor.id, wall: makeWall(floor.id, a, b) }]));
        }
        setDraftStart(snapped);
      } else {
        setDraftStart(snapped);
      }
      return;
    }
    if (tool === 'room') {
      setRectStart(snapImage(img));
      return;
    }
    if (tool === 'door' || tool === 'window') {
      const mm = toMm(img);
      const tolMm = (20 / view.k) * calRef.current.mmPerPx;
      const hit = nearestWall(mm, floor.walls, tolMm);
      if (hit) {
        onPatch(
          makePatch(`Add ${tool}`, [
            { type: 'add_opening', floorId: floor.id, opening: makeOpening(hit.wall.id, tool, hit.u, tool === 'window' ? { width: 1200 } : {}) },
          ]),
        );
      }
      return;
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    setCursor(clientToImage(e.clientX, e.clientY));
    if (drag) {
      if (drag.kind === 'opening' || drag.kind === 'openingEnd') {
        const w = floor.walls.find((x) => x.id === drag.wallId);
        if (w) {
          const a = w.path.pts[0]!, b = w.path.pts[w.path.pts.length - 1]!;
          const u = projectU(toMm(clientToImage(e.clientX, e.clientY)), a, b);
          setDrag(drag.kind === 'opening' ? { ...drag, u } : { ...drag, moveU: u });
        }
        return;
      }
      const raw = clientToImage(e.clientX, e.clientY);
      // body moves + free rotation track the raw cursor; corner/end edits snap.
      const free =
        drag.kind === 'wallBody' || drag.kind === 'roomBody' || drag.kind === 'stairBody' || drag.kind === 'stairRotate';
      const cur = free ? toMm(raw) : toMm(snapImage(raw));
      setDrag({ ...drag, cur } as DragState);
      return;
    }
    if (panRef.current && (tool === 'pan' || tool === 'select' || e.buttons === 4)) {
      const p = panRef.current;
      setView((v) => ({ ...v, ox: p.ox + (e.clientX - p.x), oy: p.oy + (e.clientY - p.y) }));
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    if (drag) {
      if (drag.kind === 'opening') {
        onPatch(makePatch('Move opening', [{ type: 'update_opening', openingId: drag.id, patch: { u: drag.u } }]));
        setDrag(null);
        panRef.current = null;
        return;
      }
      if (drag.kind === 'openingEnd') {
        const w = floor.walls.find((x) => x.id === drag.wallId);
        if (w) {
          const a = w.path.pts[0]!, b = w.path.pts[w.path.pts.length - 1]!;
          const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
          const width = Math.min(Math.max(400, L - 220), Math.max(300, Math.abs(drag.moveU - drag.fixedU) * L));
          const u = (drag.moveU + drag.fixedU) / 2;
          onPatch(makePatch('Resize opening', [{ type: 'update_opening', openingId: drag.id, patch: { u, width } }]));
        }
        setDrag(null);
        panRef.current = null;
        return;
      }
      if (drag.kind === 'stairBody') {
        const dx = drag.cur.x - drag.grab.x, dy = drag.cur.y - drag.grab.y;
        if (Math.hypot(dx, dy) > 30) {
          onPatch(makePatch('Move stair', [{ type: 'update_stair', stairId: drag.id, patch: { position: { x: drag.pos.x + dx, y: drag.pos.y + dy } } }]));
        }
        setDrag(null);
        panRef.current = null;
        return;
      }
      if (drag.kind === 'stairRotate') {
        onPatch(makePatch('Rotate stair', [{ type: 'update_stair', stairId: drag.id, patch: { rotation: normAngle(angleOf(sub(drag.cur, drag.pos))) } }]));
        setDrag(null);
        panRef.current = null;
        return;
      }
      // a body grab that didn't actually move is just a select click — no commit
      const movedEnough = drag.kind === 'wallBody' || drag.kind === 'roomBody'
        ? Math.hypot(drag.cur.x - drag.grab.x, drag.cur.y - drag.grab.y) > 30
        : true;
      if (movedEnough) {
        if (drag.kind === 'wallEnd' || drag.kind === 'wallBody') {
          const pts = wallDragPts(drag);
          if (Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) > 100) {
            onPatch(makePatch('Edit wall', [{ type: 'update_wall', wallId: drag.id, patch: { path: { pts, bulges: [0] } } }]));
          }
        } else {
          const outer = roomDragOuter(drag);
          onPatch(makePatch('Edit room', [{ type: 'update_room_boundary', roomId: drag.id, boundary: { outer, holes: drag.holes } }]));
        }
      }
      setDrag(null);
      panRef.current = null;
      return;
    }
    if (tool === 'room' && rectStart) {
      const end = snapImage(clientToImage(e.clientX, e.clientY));
      const a = toMm(rectStart);
      const b = toMm(end);
      if (Math.abs(b.x - a.x) > 400 && Math.abs(b.y - a.y) > 400) {
        const name = window.prompt('Room name? (e.g. "Living Room")') ?? 'Room';
        const kind = inferKind(name);
        const room = makeRoomRect(floor.id, name, kind, a, b, { openToSky: kind === 'terrace' || kind === 'balcony' });
        onPatch(makePatch(`Add room ${name}`, [{ type: 'add_room', floorId: floor.id, room }]));
      }
      setRectStart(null);
    }
    panRef.current = null;
  }

  function finishChain() {
    setDraftStart(null);
  }

  // ---- rendering (image-px space inside the transform group) ----
  const P = (mm: Vec2) => planToImage(mm, cal);
  const selWall = floor.walls.find((w) => w.id === selectionId) ?? null;
  const selRoom = floor.rooms.find((r) => r.id === selectionId) ?? null;

  return (
    <svg
      ref={svgRef}
      className="h-full w-full touch-none select-none bg-neutral-900"
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onContextMenu={(e) => {
        e.preventDefault();
        finishChain();
      }}
      style={{ cursor: tool === 'pan' ? 'grab' : tool === 'select' ? 'default' : 'crosshair' }}
    >
      <g transform={`translate(${view.ox} ${view.oy}) scale(${view.k})`}>
        {underlayUrl && (
          <image
            href={underlayUrl}
            x={0}
            y={0}
            width={widthPx}
            height={heightPx}
            opacity={floor.underlay?.opacity ?? 0.6}
            preserveAspectRatio="none"
          />
        )}

        {/* rooms */}
        {floor.rooms.map((room) => {
          const pts = room.boundary.outer.map((p) => P(p));
          return (
            <polygon
              key={room.id}
              points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
              fill={selectionId === room.id ? 'rgba(216,162,90,0.28)' : 'rgba(120,170,255,0.12)'}
              stroke={selectionId === room.id ? '#d8a25a' : 'rgba(120,170,255,0.5)'}
              strokeWidth={1.5 / view.k}
              onPointerDown={(e) => {
                if (tool !== 'select') return;
                e.stopPropagation();
                onSelect(room.id); // select + arm a body drag in one gesture
                const grab = toMm(clientToImage(e.clientX, e.clientY));
                setDrag({ kind: 'roomBody', id: room.id, outer: room.boundary.outer, holes: room.boundary.holes, grab, cur: grab });
              }}
            />
          );
        })}

        {/* walls — wide transparent hit-line under a thin visible centerline */}
        {floor.walls.map((wall) => {
          const a = P(wall.path.pts[0]!);
          const b = P(wall.path.pts[wall.path.pts.length - 1]!);
          return (
            <g key={wall.id}>
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="transparent"
                strokeWidth={16 / view.k}
                strokeLinecap="round"
                style={{ cursor: tool === 'select' ? 'move' : undefined }}
                onPointerDown={(e) => {
                  if (tool !== 'select') return;
                  e.stopPropagation();
                  onSelect(wall.id); // select + arm a body drag in one gesture
                  const grab = toMm(clientToImage(e.clientX, e.clientY));
                  const p0 = wall.path.pts[0]!;
                  const p1 = wall.path.pts[wall.path.pts.length - 1]!;
                  setDrag({ kind: 'wallBody', id: wall.id, pts: [p0, p1], grab, cur: grab });
                }}
              />
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={selectionId === wall.id ? '#d8a25a' : '#3ec7ff'}
                strokeWidth={selectionId === wall.id ? 3.5 / view.k : 2 / view.k}
                strokeLinecap="round"
                opacity={0.9}
                pointerEvents="none"
              />
            </g>
          );
        })}

        {/* openings (doors/windows) — select to move along the wall; drag the
            end-dots to resize (width). */}
        {floor.openings.map((o) => {
          const found = floor.walls.find((w) => w.id === o.wallId);
          if (!found) return null;
          const a = found.path.pts[0]!, b = found.path.pts[found.path.pts.length - 1]!;
          const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
          const c01 = (v: number) => Math.max(0, Math.min(1, v));
          const moving = drag?.kind === 'opening' && drag.id === o.id;
          const resizing = drag?.kind === 'openingEnd' && drag.id === o.id;
          const u = moving ? drag.u : o.u;
          const halfU = o.width / 2 / L;
          const uS = resizing ? c01(Math.min(drag.fixedU, drag.moveU)) : c01(u - halfU);
          const uE = resizing ? c01(Math.max(drag.fixedU, drag.moveU)) : c01(u + halfU);
          const center = P(lerp(a, b, (uS + uE) / 2));
          const sel = selectionId === o.id;
          const col = o.kind === 'window' ? '#5bc0ff' : '#ffd27a';
          return (
            <g key={o.id}>
              {sel && (() => {
                const ps = P(lerp(a, b, uS)), pe = P(lerp(a, b, uE));
                return <line x1={ps.x} y1={ps.y} x2={pe.x} y2={pe.y} stroke={col} strokeWidth={5 / view.k} strokeLinecap="round" opacity={0.85} />;
              })()}
              <circle
                cx={center.x}
                cy={center.y}
                r={12 / view.k}
                fill="transparent"
                style={{ cursor: tool === 'select' ? 'move' : undefined }}
                onPointerDown={(e) => {
                  if (tool !== 'select') return;
                  e.stopPropagation();
                  onSelect(o.id);
                  setDrag({ kind: 'opening', id: o.id, wallId: o.wallId, u: o.u });
                }}
              />
              <circle
                cx={center.x}
                cy={center.y}
                r={(sel ? 5 : 4) / view.k}
                fill={col}
                stroke={sel ? '#d8a25a' : '#222'}
                strokeWidth={(sel ? 1.5 : 0.75) / view.k}
                opacity={0.9}
                pointerEvents="none"
              />
              {sel && ([[uS, uE], [uE, uS]] as const).map(([thisU, otherU], i) => {
                const hp = P(lerp(a, b, thisU));
                return (
                  <circle
                    key={i}
                    cx={hp.x}
                    cy={hp.y}
                    r={7 / view.k}
                    fill="#ffffff"
                    stroke={col}
                    strokeWidth={2 / view.k}
                    style={{ cursor: tool === 'select' ? 'col-resize' : undefined }}
                    onPointerDown={(e) => {
                      if (tool !== 'select') return;
                      e.stopPropagation();
                      onSelect(o.id);
                      setDrag({ kind: 'openingEnd', id: o.id, wallId: o.wallId, fixedU: otherU, moveU: thisU });
                    }}
                  />
                );
              })}
            </g>
          );
        })}

        {/* structural pillars (magenta columns) — drawn as an X-in-box matching
            the CAD convention, selectable so they can be deleted (with a warning). */}
        {floor.objects.filter(isStructuralColumn).map((o) => {
          const wpts = objWorldPts(o).map(P);
          if (wpts.length < 3) return null;
          const xs = wpts.map((p) => p.x), ys = wpts.map((p) => p.y);
          const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
          const sel = selectionId === o.id;
          const col = sel ? '#d8a25a' : '#d6479e';
          return (
            <g
              key={o.id}
              style={{ cursor: tool === 'select' ? 'pointer' : undefined }}
              onPointerDown={(e) => {
                if (tool !== 'select') return;
                e.stopPropagation();
                onSelect(o.id);
              }}
            >
              <polygon
                points={wpts.map((p) => `${p.x},${p.y}`).join(' ')}
                fill={sel ? 'rgba(216,162,90,0.25)' : 'rgba(214,71,158,0.18)'}
                stroke={col}
                strokeWidth={(sel ? 2.5 : 1.5) / view.k}
              />
              <line x1={x0} y1={y0} x2={x1} y2={y1} stroke={col} strokeWidth={1.25 / view.k} />
              <line x1={x0} y1={y1} x2={x1} y2={y0} stroke={col} strokeWidth={1.25 / view.k} />
            </g>
          );
        })}

        {/* stairs — top-down step footprints + ascent arrow are NON-interactive
            (so walls/rooms under the stair stay clickable). Select + move via the
            centre move-dot; rotate via the arrow-tip handle (when selected). */}
        {floor.stairs.map((stair) => {
          const eff = effStair(stair, drag);
          const solid = buildStair(eff);
          const sel = selectionId === stair.id;
          const col = sel ? '#d8a25a' : '#5bd6a0';
          const runLen = Math.max(900, solid.stepCount * eff.treadRun * 0.6);
          const tip = add(eff.position, rotate({ x: runLen, y: 0 }, eff.rotation));
          const rotHandle = add(eff.position, rotate({ x: runLen + 500, y: 0 }, eff.rotation));
          const barb = 240;
          const corners = solid.prisms.flatMap((pr) => pr.corners);
          const centroid = corners.length
            ? { x: corners.reduce((s, p) => s + p.x, 0) / corners.length, y: corners.reduce((s, p) => s + p.y, 0) / corners.length }
            : eff.position;
          const pPos = P(eff.position), pTip = P(tip), pRot = P(rotHandle), pMid = P(centroid);
          const pB1 = P(add(tip, rotate({ x: -barb, y: barb }, eff.rotation)));
          const pB2 = P(add(tip, rotate({ x: -barb, y: -barb }, eff.rotation)));
          return (
            <g key={stair.id}>
              <g style={{ pointerEvents: 'none' }}>
                {solid.prisms.map((pr, i) => (
                  <polygon
                    key={i}
                    points={pr.corners.map(P).map((p) => `${p.x},${p.y}`).join(' ')}
                    fill={sel ? 'rgba(216,162,90,0.22)' : 'rgba(91,214,160,0.16)'}
                    stroke={col}
                    strokeWidth={1 / view.k}
                  />
                ))}
                <line x1={pPos.x} y1={pPos.y} x2={pTip.x} y2={pTip.y} stroke={col} strokeWidth={2 / view.k} opacity={0.9} />
                <polyline points={`${pB1.x},${pB1.y} ${pTip.x},${pTip.y} ${pB2.x},${pB2.y}`} fill="none" stroke={col} strokeWidth={2 / view.k} opacity={0.9} />
              </g>
              {/* centre move-dot: select + drag to reposition */}
              <circle
                cx={pMid.x}
                cy={pMid.y}
                r={(sel ? 10 : 8) / view.k}
                fill={sel ? '#d8a25a' : '#5bd6a0'}
                stroke="#1a1a1a"
                strokeWidth={1.5 / view.k}
                style={{ cursor: tool === 'select' ? 'move' : undefined }}
                onPointerDown={(e) => {
                  if (tool !== 'select') return;
                  e.stopPropagation();
                  onSelect(stair.id);
                  const grab = toMm(clientToImage(e.clientX, e.clientY));
                  setDrag({ kind: 'stairBody', id: stair.id, pos: stair.position, grab, cur: grab });
                }}
              />
              {sel && (
                <>
                  <line x1={pTip.x} y1={pTip.y} x2={pRot.x} y2={pRot.y} stroke={col} strokeWidth={1.5 / view.k} strokeDasharray={`${4 / view.k} ${3 / view.k}`} pointerEvents="none" />
                  <circle
                    cx={pRot.x}
                    cy={pRot.y}
                    r={8 / view.k}
                    fill="#d8a25a"
                    stroke="#1a1a1a"
                    strokeWidth={1.5 / view.k}
                    style={{ cursor: tool === 'select' ? 'grab' : undefined }}
                    onPointerDown={(e) => {
                      if (tool !== 'select') return;
                      e.stopPropagation();
                      onSelect(stair.id);
                      setDrag({ kind: 'stairRotate', id: stair.id, pos: stair.position, cur: toMm(clientToImage(e.clientX, e.clientY)) });
                    }}
                  />
                </>
              )}
            </g>
          );
        })}

        {/* edit handles + live preview (select tool) */}
        {tool === 'select' && selWall && (() => {
          const sel = selWall;
          const pts =
            drag && (drag.kind === 'wallEnd' || drag.kind === 'wallBody') && drag.id === sel.id
              ? wallDragPts(drag)
              : ([sel.path.pts[0]!, sel.path.pts[sel.path.pts.length - 1]!] as [Vec2, Vec2]);
          return pts.map((m, i) => {
            const p = P(m);
            return (
              <circle
                key={`wh-${i}`}
                cx={p.x}
                cy={p.y}
                r={9 / view.k}
                fill="#d8a25a"
                stroke="#1a1a1a"
                strokeWidth={1.5 / view.k}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  const a = sel.path.pts[0]!;
                  const b = sel.path.pts[sel.path.pts.length - 1]!;
                  const end: 0 | 1 = i === 0 ? 0 : 1;
                  setDrag({ kind: 'wallEnd', id: sel.id, end, pts: [a, b], cur: end === 0 ? a : b });
                }}
              />
            );
          });
        })()}
        {tool === 'select' && selRoom && (() => {
          const sel = selRoom;
          const outer =
            drag && (drag.kind === 'roomCorner' || drag.kind === 'roomBody') && drag.id === sel.id
              ? roomDragOuter(drag)
              : sel.boundary.outer;
          return outer.map((m, i) => {
            const p = P(m);
            return (
              <circle
                key={`rh-${i}`}
                cx={p.x}
                cy={p.y}
                r={9 / view.k}
                fill="#d8a25a"
                stroke="#1a1a1a"
                strokeWidth={1.5 / view.k}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  const o = sel.boundary.outer;
                  setDrag({ kind: 'roomCorner', id: sel.id, fixed: o[(i + 2) % o.length]!, holes: sel.boundary.holes, cur: o[i]! });
                }}
              />
            );
          });
        })()}
        {drag && (drag.kind === 'wallEnd' || drag.kind === 'wallBody') && (() => {
          const pts = wallDragPts(drag);
          const a = P(pts[0]), b = P(pts[1]);
          return <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#d8a25a" strokeWidth={4 / view.k} strokeLinecap="round" opacity={0.9} />;
        })()}
        {drag && (drag.kind === 'roomCorner' || drag.kind === 'roomBody') && (
          <polygon
            points={roomDragOuter(drag).map(P).map((p) => `${p.x},${p.y}`).join(' ')}
            fill="rgba(216,162,90,0.25)"
            stroke="#d8a25a"
            strokeWidth={2 / view.k}
          />
        )}

        {/* drafts */}
        {tool === 'calibrate' && calA && cursor && (
          <line x1={calA.x} y1={calA.y} x2={cursor.x} y2={cursor.y} stroke="#ff5a5a" strokeWidth={2 / view.k} strokeDasharray={`${6 / view.k} ${4 / view.k}`} />
        )}
        {tool === 'wall' && draftStart && cursor && (
          <line x1={draftStart.x} y1={draftStart.y} x2={snapImage(cursor).x} y2={snapImage(cursor).y} stroke="#d8a25a" strokeWidth={3 / view.k} strokeLinecap="round" opacity={0.8} />
        )}
        {tool === 'room' && rectStart && cursor && (
          <rect
            x={Math.min(rectStart.x, cursor.x)}
            y={Math.min(rectStart.y, cursor.y)}
            width={Math.abs(cursor.x - rectStart.x)}
            height={Math.abs(cursor.y - rectStart.y)}
            fill="rgba(216,162,90,0.2)"
            stroke="#d8a25a"
            strokeWidth={1.5 / view.k}
          />
        )}
      </g>
    </svg>
  );
}
