import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, FONT, SPRING } from '../theme';

export const TitleScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const pop = spring({ frame: frame - 6, fps, config: SPRING.hero });
  const subOpacity = interpolate(frame, [40, 64], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const lineW = interpolate(frame, [48, 84], [0, 132], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', fontFamily: FONT }}>
      {/* two small asymmetric washes, not one giant disc */}
      <div style={{ position: 'absolute', width: 760, height: 760, left: '24%', top: '14%', borderRadius: '50%', background: `radial-gradient(circle, rgba(75,70,229,0.10) 0%, transparent 64%)` }} />
      <div style={{ position: 'absolute', width: 620, height: 620, right: '20%', bottom: '16%', borderRadius: '50%', background: `radial-gradient(circle, rgba(244,178,118,0.12) 0%, transparent 66%)` }} />
      <div style={{ transform: `translateY(${(1 - pop) * 18}px)`, opacity: pop, textAlign: 'center' }}>
        <div style={{ fontSize: 124, fontWeight: 700, color: C.ink, letterSpacing: -1.5 }}>
          HomeCanvas <span style={{ color: C.accent, letterSpacing: 0 }}>AI</span>
        </div>
        <div style={{ height: 3, width: lineW, background: C.accent, borderRadius: 2, margin: '30px auto 28px' }} />
        <div style={{ fontSize: 40, fontWeight: 500, color: C.inkDim, opacity: subOpacity, letterSpacing: -0.2 }}>
          2D floor plan&nbsp;&nbsp;→&nbsp;&nbsp;living, editable 3D home
        </div>
        <div style={{ fontSize: 24, fontWeight: 500, color: C.inkFaint, opacity: subOpacity, marginTop: 20, letterSpacing: 0.3, textTransform: 'uppercase' }}>
          local-first&nbsp;·&nbsp;no paid APIs
        </div>
      </div>
    </AbsoluteFill>
  );
};
