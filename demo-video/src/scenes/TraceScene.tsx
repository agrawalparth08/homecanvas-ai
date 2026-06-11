import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { C, FONT } from '../theme';
import { DOORS, PILLAR, PLAN_H, PLAN_W, ROOMS, WALLS, WINDOWS, iso } from '../plan';

const segLen = (w: { x1: number; y1: number; x2: number; y2: number }) => Math.hypot(w.x2 - w.x1, w.y2 - w.y1);

/** Left: snap-assisted tracing over the faint plan. Right: live 3D rising. */
export const TraceScene: React.FC = () => {
  const frame = useCurrentFrame();

  // walls draw sequentially: segment i is active in [14 + i*9, 14 + i*9 + 16]
  const wallT = (i: number) =>
    interpolate(frame, [14 + i * 9, 30 + i * 9], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const roomsT = interpolate(frame, [128, 168], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const extrasT = interpolate(frame, [150, 185], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // iso walls rise with a slight per-wall stagger once tracing is underway
  const isoH = (i: number) =>
    60 * interpolate(frame, [95 + i * 4, 150 + i * 4], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // iso projection fitted into the right panel
  const pts = WALLS.flatMap((w) => [iso(w.x1, w.y1, 0), iso(w.x2, w.y2, 0), iso(w.x1, w.y1, 70), iso(w.x2, w.y2, 70)]);
  const minX = Math.min(...pts.map((p) => p.x));
  const maxX = Math.max(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y));
  const maxY = Math.max(...pts.map((p) => p.y));
  const isoScale = Math.min(640 / (maxX - minX), 520 / (maxY - minY));
  const P = (x: number, y: number, z: number) => {
    const p = iso(x, y, z);
    return { x: (p.x - minX) * isoScale + 40, y: (p.y - minY) * isoScale + 40 };
  };
  const sortedWalls = [...WALLS.entries()].sort(
    (a, b) => a[1].x1 + a[1].y1 + a[1].x2 + a[1].y2 - (b[1].x1 + b[1].y1 + b[1].x2 + b[1].y2),
  );

  const chip: React.CSSProperties = {
    position: 'absolute',
    top: 18,
    left: 22,
    padding: '8px 16px',
    borderRadius: 10,
    background: 'rgba(19,20,27,0.8)',
    border: `1px solid ${C.panelBorder}`,
    color: C.textDim,
    fontSize: 22,
    fontWeight: 600,
    fontFamily: FONT,
  };

  return (
    <AbsoluteFill style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 36, padding: 70, fontFamily: FONT }}>
      {/* 2D tracing panel */}
      <div style={{ position: 'relative', background: C.bgPanel, border: `1px solid ${C.panelBorder}`, borderRadius: 18, padding: 26 }}>
        <svg width={900} height={630} viewBox={`0 0 ${PLAN_W} ${PLAN_H}`}>
          {/* faint underlay (the uploaded plan) */}
          <g opacity={0.22} stroke="#aab2c0" strokeWidth={6} strokeLinecap="square">
            {WALLS.map((w, i) => (
              <line key={i} x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2} />
            ))}
          </g>
          {/* room fills + labels */}
          {ROOMS.map((r, i) => {
            const t = interpolate(roomsT, [i / ROOMS.length, Math.min(1, i / ROOMS.length + 0.45)], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            });
            return (
              <g key={r.label} opacity={t}>
                <rect x={r.x0} y={r.y0} width={r.x1 - r.x0} height={r.y1 - r.y0} fill={r.fill} stroke="rgba(120,170,255,0.5)" strokeWidth={1.5} />
                <text x={(r.x0 + r.x1) / 2} y={(r.y0 + r.y1) / 2} textAnchor="middle" fontSize={24} fontWeight={600} fill={C.text} opacity={0.85}>
                  {r.label}
                </text>
              </g>
            );
          })}
          {/* traced walls drawing in */}
          {WALLS.map((w, i) => {
            const len = segLen(w);
            const t = wallT(i);
            if (t === 0) return null;
            return (
              <line
                key={i}
                x1={w.x1}
                y1={w.y1}
                x2={w.x2}
                y2={w.y2}
                stroke={C.cyan}
                strokeWidth={4}
                strokeLinecap="round"
                strokeDasharray={len}
                strokeDashoffset={len * (1 - t)}
                opacity={0.95}
              />
            );
          })}
          {/* snap dot riding the currently-drawing wall */}
          {(() => {
            const active = WALLS.findIndex((_, i) => wallT(i) > 0 && wallT(i) < 1);
            if (active < 0) return null;
            const w = WALLS[active]!;
            const t = wallT(active);
            return <circle cx={w.x1 + (w.x2 - w.x1) * t} cy={w.y1 + (w.y2 - w.y1) * t} r={11} fill={C.gold} stroke="#1a1a1a" strokeWidth={2.5} />;
          })()}
          {/* doors / windows / pillar pop in near the end */}
          <g opacity={extrasT}>
            {DOORS.map((d, i) => (
              <g key={i} stroke="#ffd27a" strokeWidth={2.5} fill="none">
                <path d={`M ${d.hx} ${d.hy} A ${d.leaf} ${d.leaf} 0 0 1 ${d.hx + d.leaf} ${d.hy + d.leaf}`} />
                <line x1={d.hx} y1={d.hy} x2={d.hx} y2={d.hy + d.leaf} />
              </g>
            ))}
            {WINDOWS.map((w, i) => {
              const horizontal = w.y1 === w.y2;
              const off = horizontal ? { x: 0, y: 5 } : { x: 5, y: 0 };
              return (
                <g key={i} stroke="#5bc0ff" strokeWidth={3}>
                  <line x1={w.x1 - off.x} y1={w.y1 - off.y} x2={w.x2 - off.x} y2={w.y2 - off.y} />
                  <line x1={w.x1 + off.x} y1={w.y1 + off.y} x2={w.x2 + off.x} y2={w.y2 + off.y} />
                </g>
              );
            })}
            <g stroke={C.magenta} strokeWidth={2.5} fill="rgba(214,71,158,0.18)">
              <rect x={PILLAR.x - PILLAR.size / 2} y={PILLAR.y - PILLAR.size / 2} width={PILLAR.size} height={PILLAR.size} />
              <line x1={PILLAR.x - PILLAR.size / 2} y1={PILLAR.y - PILLAR.size / 2} x2={PILLAR.x + PILLAR.size / 2} y2={PILLAR.y + PILLAR.size / 2} />
              <line x1={PILLAR.x - PILLAR.size / 2} y1={PILLAR.y + PILLAR.size / 2} x2={PILLAR.x + PILLAR.size / 2} y2={PILLAR.y - PILLAR.size / 2} />
            </g>
          </g>
        </svg>
        <div style={chip}>Trace plan · walls → rooms → openings</div>
      </div>

      {/* live 3D panel */}
      <div style={{ position: 'relative', background: C.bgPanel, border: `1px solid ${C.panelBorder}`, borderRadius: 18, padding: 26 }}>
        <svg width={700} height={630} viewBox="0 0 720 600">
          {/* floors */}
          {ROOMS.map((r) => {
            const c = [P(r.x0, r.y0, 0), P(r.x1, r.y0, 0), P(r.x1, r.y1, 0), P(r.x0, r.y1, 0)];
            return (
              <polygon
                key={r.label}
                points={c.map((p) => `${p.x},${p.y}`).join(' ')}
                fill={r.fill.replace(/0\.\d+\)/, '0.35)')}
                stroke="rgba(120,170,255,0.25)"
                strokeWidth={1}
              />
            );
          })}
          {/* rising wall ribbons (painter order) */}
          {sortedWalls.map(([i, w]) => {
            const h = isoH(i);
            if (h <= 0) return null;
            const a0 = P(w.x1, w.y1, 0);
            const b0 = P(w.x2, w.y2, 0);
            const aH = P(w.x1, w.y1, h);
            const bH = P(w.x2, w.y2, h);
            const horizontal = Math.abs(w.y1 - w.y2) < 1;
            return (
              <g key={i}>
                <polygon
                  points={`${a0.x},${a0.y} ${b0.x},${b0.y} ${bH.x},${bH.y} ${aH.x},${aH.y}`}
                  fill={horizontal ? '#3a3f52' : '#2c3042'}
                  stroke="#555c75"
                  strokeWidth={1}
                />
                <line x1={aH.x} y1={aH.y} x2={bH.x} y2={bH.y} stroke="#8d93ab" strokeWidth={2} />
              </g>
            );
          })}
        </svg>
        <div style={{ ...chip, color: C.green }}>● Live 3D · updates on each edit</div>
      </div>
    </AbsoluteFill>
  );
};
