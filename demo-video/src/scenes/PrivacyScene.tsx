import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, FONT } from '../theme';
import { CheckIcon, CloudOffIcon } from '../components/Icons';

const LINES = ['No accounts', 'No uploads', 'No paid APIs'];

/** Local-first: a laptop with the home inside, a crossed-out cloud, three claims. */
export const PrivacyScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const draw = interpolate(frame, [6, 56], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const cloudIn = spring({ frame: frame - 46, fps, config: { damping: 14 } });

  return (
    <AbsoluteFill style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 130, fontFamily: FONT }}>
      {/* laptop with house inside — thin-line iconography, stroke-drawn */}
      <svg width={560} height={460} viewBox="0 0 560 460">
        <g stroke={C.ink} strokeWidth={6.5} fill="none" strokeLinecap="round" strokeLinejoin="round"
          strokeDasharray={1400} strokeDashoffset={1400 * (1 - draw)}>
          <rect x={90} y={60} width={380} height={250} rx={14} />
          <path d="M 50 370 L 90 310 L 470 310 L 510 370 Z" />
          <line x1={50} y1={370} x2={510} y2={370} />
        </g>
        <g stroke={C.accent} strokeWidth={6.5} fill={C.accentSoft} strokeLinejoin="round" strokeLinecap="round"
          strokeDasharray={700} strokeDashoffset={700 * (1 - draw)}>
          <path d="M 200 200 L 280 130 L 360 200 L 360 270 L 200 270 Z" />
          <rect x={262} y={218} width={36} height={52} fill="rgba(75,70,229,0.25)" />
        </g>
      </svg>

      <div>
        {/* crossed-out cloud */}
        <div style={{ opacity: Math.min(1, cloudIn), transform: `scale(${0.85 + Math.min(1, cloudIn) * 0.15})`, transformOrigin: 'left center' }}>
          <CloudOffIcon size={170} color={C.inkFaint} slash={C.rose} />
        </div>

        <div style={{ marginTop: 36, display: 'flex', flexDirection: 'column', gap: 22 }}>
          {LINES.map((l, i) => {
            const t = spring({ frame: frame - 90 - i * 22, fps, config: { damping: 15 } });
            return (
              <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 18, opacity: Math.min(1, t), transform: `translateX(${(1 - t) * 40}px)` }}>
                <CheckIcon size={40} color={C.green} />
                <span style={{ color: C.ink, fontSize: 40, fontWeight: 700 }}>{l}</span>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
