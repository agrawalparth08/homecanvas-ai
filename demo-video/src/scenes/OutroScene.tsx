import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, FONT } from '../theme';

const CMD = 'npm install && npm run dev';

export const OutroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const pop = spring({ frame: frame - 4, fps, config: { damping: 14, stiffness: 110 } });
  const typed = CMD.slice(0, Math.floor(interpolate(frame, [40, 110], [0, CMD.length], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })));
  const urlIn = interpolate(frame, [110, 134], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const fadeOut = interpolate(frame, [durationInFrames - 18, durationInFrames - 2], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', fontFamily: FONT, opacity: fadeOut }}>
      <div
        style={{
          position: 'absolute',
          width: 1200,
          height: 1200,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${C.accent}2e 0%, transparent 60%)`,
        }}
      />
      <div style={{ textAlign: 'center', transform: `scale(${0.9 + pop * 0.1})`, opacity: pop }}>
        <div style={{ fontSize: 96, fontWeight: 800, color: C.text, letterSpacing: -2 }}>
          HomeCanvas <span style={{ color: C.accent }}>AI</span>
        </div>
        <div style={{ fontSize: 36, fontWeight: 500, color: C.textDim, marginTop: 16 }}>Your home, reimagined — locally.</div>

        <div
          style={{
            margin: '54px auto 0',
            width: 760,
            background: '#0c0d12',
            border: `1px solid ${C.panelBorder}`,
            borderRadius: 14,
            padding: '26px 34px',
            textAlign: 'left',
            fontFamily: 'SF Mono, Menlo, monospace',
            fontSize: 30,
            color: C.green,
          }}
        >
          <span style={{ color: C.textFaint }}>$ </span>
          {typed}
          <span style={{ opacity: frame % 16 < 8 ? 1 : 0 }}>▌</span>
        </div>

        <div style={{ marginTop: 28, fontSize: 27, color: C.textFaint, opacity: urlIn }}>
          github.com/agrawalparth08/homecanvas-ai
        </div>
      </div>
    </AbsoluteFill>
  );
};
