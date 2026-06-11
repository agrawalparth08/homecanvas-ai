import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, FONT } from '../theme';

export const TitleScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const pop = spring({ frame: frame - 6, fps, config: { damping: 14, stiffness: 120 } });
  const subOpacity = interpolate(frame, [40, 64], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const lineW = interpolate(frame, [50, 86], [0, 460], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const glow = interpolate(frame, [0, 60], [0.4, 0.9], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', fontFamily: FONT }}>
      <div
        style={{
          position: 'absolute',
          width: 1500,
          height: 1500,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${C.accentSoft} 0%, transparent 60%)`,
          opacity: glow,
        }}
      />
      <div style={{ transform: `scale(${0.85 + pop * 0.15})`, opacity: pop, textAlign: 'center' }}>
        <div style={{ fontSize: 128, fontWeight: 800, color: C.ink, letterSpacing: -3 }}>
          HomeCanvas <span style={{ color: C.accent }}>AI</span>
        </div>
        <div style={{ height: 4, width: lineW, background: C.accent, borderRadius: 2, margin: '26px auto 30px' }} />
        <div style={{ fontSize: 42, fontWeight: 500, color: C.inkDim, opacity: subOpacity }}>
          2D floor plan&nbsp;&nbsp;→&nbsp;&nbsp;living, editable 3D home
        </div>
        <div style={{ fontSize: 28, fontWeight: 500, color: C.inkFaint, opacity: subOpacity, marginTop: 18 }}>
          local-first · no paid APIs
        </div>
      </div>
    </AbsoluteFill>
  );
};
