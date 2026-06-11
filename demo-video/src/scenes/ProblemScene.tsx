import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, FONT } from '../theme';
import { DOORS, PILLAR, PLAN_H, PLAN_W, ROOMS, WALLS, WINDOWS } from '../plan';

/** The "flat PDF" — a paper sheet with the plan in dry CAD line work. */
export const ProblemScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const slide = spring({ frame, fps, config: { damping: 16, stiffness: 80 } });
  const drift = Math.sin(frame / 55) * 0.4;
  const dimOpacity = interpolate(frame, [40, 70], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', fontFamily: FONT }}>
      <div
        style={{
          transform: `translateY(${(1 - slide) * 320}px) rotate(${-3.2 + drift}deg)`,
          background: C.paper,
          borderRadius: 6,
          padding: '54px 64px 40px',
          boxShadow: '0 40px 90px rgba(0,0,0,0.6)',
        }}
      >
        <svg width={860} height={602} viewBox={`0 0 ${PLAN_W} ${PLAN_H}`}>
          {/* walls */}
          {WALLS.map((w, i) => (
            <line key={i} x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2} stroke={C.planInk} strokeWidth={7} strokeLinecap="square" />
          ))}
          {/* windows: double thin lines */}
          {WINDOWS.map((w, i) => {
            const horizontal = w.y1 === w.y2;
            const off = horizontal ? { x: 0, y: 5 } : { x: 5, y: 0 };
            return (
              <g key={i} stroke={C.planInk} strokeWidth={2}>
                <line x1={w.x1 - off.x} y1={w.y1 - off.y} x2={w.x2 - off.x} y2={w.y2 - off.y} />
                <line x1={w.x1 + off.x} y1={w.y1 + off.y} x2={w.x2 + off.x} y2={w.y2 + off.y} />
              </g>
            );
          })}
          {/* door swings */}
          {DOORS.map((d, i) => (
            <g key={i} stroke={C.planInk} strokeWidth={2} fill="none" opacity={0.8}>
              <path d={`M ${d.hx} ${d.hy} A ${d.leaf} ${d.leaf} 0 0 1 ${d.hx + d.leaf} ${d.hy + d.leaf}`} />
              <line x1={d.hx} y1={d.hy} x2={d.hx} y2={d.hy + d.leaf} />
            </g>
          ))}
          {/* pillar */}
          <g stroke={C.planInk} strokeWidth={2.5} fill="none">
            <rect x={PILLAR.x - PILLAR.size / 2} y={PILLAR.y - PILLAR.size / 2} width={PILLAR.size} height={PILLAR.size} />
            <line x1={PILLAR.x - PILLAR.size / 2} y1={PILLAR.y - PILLAR.size / 2} x2={PILLAR.x + PILLAR.size / 2} y2={PILLAR.y + PILLAR.size / 2} />
            <line x1={PILLAR.x - PILLAR.size / 2} y1={PILLAR.y + PILLAR.size / 2} x2={PILLAR.x + PILLAR.size / 2} y2={PILLAR.y - PILLAR.size / 2} />
          </g>
          {/* room labels + dims, the "lines and numbers" */}
          {ROOMS.map((r) => (
            <text
              key={r.label}
              x={(r.x0 + r.x1) / 2}
              y={(r.y0 + r.y1) / 2}
              textAnchor="middle"
              fontFamily={FONT}
              fontSize={22}
              fontWeight={600}
              fill={C.planInk}
            >
              {r.label}
            </text>
          ))}
          <g opacity={dimOpacity} fill={C.planInk} fontFamily={FONT} fontSize={17}>
            <text x={170} y={28} textAnchor="middle">{`8'-6"`}</text>
            <text x={530} y={28} textAnchor="middle">{`15'-0"`}</text>
            <text x={26} y={185} textAnchor="middle" transform="rotate(-90 26 185)">{`9'-6"`}</text>
            <text x={26} y={428} textAnchor="middle" transform="rotate(-90 26 428)">{`6'-3"`}</text>
          </g>
        </svg>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            color: C.planInk,
            fontSize: 21,
            fontWeight: 600,
            letterSpacing: 1,
            marginTop: 10,
          }}
        >
          <span>GROUND FLOOR PLAN</span>
          <span>SCALE 1:100 · SHEET 2 OF 7</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};
