import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, FONT } from '../theme';

const LINES = ['No accounts', 'No uploads', 'No paid APIs'];

/** Local-first: a laptop with the home inside, a crossed-out cloud, three claims. */
export const PrivacyScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const draw = interpolate(frame, [6, 56], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const cloudIn = spring({ frame: frame - 46, fps, config: { damping: 14 } });
  const slash = interpolate(frame, [66, 86], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 120, fontFamily: FONT }}>
      {/* laptop with house inside */}
      <svg width={560} height={460} viewBox="0 0 560 460">
        <g stroke={C.text} strokeWidth={7} fill="none" strokeLinecap="round" strokeLinejoin="round"
          strokeDasharray={1400} strokeDashoffset={1400 * (1 - draw)}>
          <rect x={90} y={60} width={380} height={250} rx={14} />
          <path d="M 50 370 L 90 310 L 470 310 L 510 370 Z" />
          <line x1={50} y1={370} x2={510} y2={370} />
        </g>
        {/* house inside the screen */}
        <g stroke={C.accent} strokeWidth={7} fill="rgba(75,70,229,0.12)" strokeLinejoin="round"
          strokeDasharray={700} strokeDashoffset={700 * (1 - draw)}>
          <path d="M 200 200 L 280 130 L 360 200 L 360 270 L 200 270 Z" />
          <rect x={262} y={218} width={36} height={52} fill="rgba(75,70,229,0.3)" />
        </g>
      </svg>

      <div>
        {/* crossed-out cloud */}
        <svg width={300} height={190} viewBox="0 0 300 190" style={{ opacity: Math.min(1, cloudIn), transform: `scale(${0.85 + cloudIn * 0.15})` }}>
          <path
            d="M 75 140 a 38 38 0 1 1 8 -75 a 52 52 0 1 1 100 -12 a 42 42 0 1 1 22 87 Z"
            fill="rgba(255,255,255,0.05)"
            stroke={C.textFaint}
            strokeWidth={6}
          />
          <line x1={30} y1={170} x2={270} y2={16} stroke="#e25563" strokeWidth={11} strokeLinecap="round"
            strokeDasharray={300} strokeDashoffset={300 * (1 - slash)} />
        </svg>

        <div style={{ marginTop: 30, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {LINES.map((l, i) => {
            const t = spring({ frame: frame - 90 - i * 22, fps, config: { damping: 15 } });
            return (
              <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 16, opacity: Math.min(1, t), transform: `translateX(${(1 - t) * 40}px)` }}>
                <span style={{ color: C.green, fontSize: 34, fontWeight: 800 }}>✓</span>
                <span style={{ color: C.text, fontSize: 40, fontWeight: 700 }}>{l}</span>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
