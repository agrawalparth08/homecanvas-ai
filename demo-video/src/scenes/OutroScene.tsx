import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, FONT, SPRING } from '../theme';

const URL = 'tryhomecanvas.com';

export const OutroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const pop = spring({ frame: frame - 4, fps, config: SPRING.hero });
  const cardIn = spring({ frame: frame - 46, fps, config: SPRING.card });
  const glowPulse = 1 + Math.sin(frame / 9) * 0.05;
  const fadeOut = interpolate(frame, [durationInFrames - 18, durationInFrames - 2], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', fontFamily: FONT, opacity: fadeOut }}>
      <div
        style={{
          position: 'absolute',
          width: 1300,
          height: 1300,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${C.accentSoft} 0%, transparent 58%)`,
          transform: `scale(${glowPulse})`,
        }}
      />
      <div style={{ textAlign: 'center', transform: `scale(${0.9 + pop * 0.1})`, opacity: pop }}>
        <div style={{ fontSize: 100, fontWeight: 800, color: C.ink, letterSpacing: -2 }}>
          HomeCanvas <span style={{ color: C.accent }}>AI</span>
        </div>
        <div style={{ fontSize: 38, fontWeight: 500, color: C.inkDim, marginTop: 18 }}>
          Your home, reimagined — locally.
        </div>

        <div
          style={{
            margin: '56px auto 0',
            display: 'inline-flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 16,
            transform: `translateY(${(1 - cardIn) * 50}px)`,
            opacity: cardIn,
          }}
        >
          <div style={{ fontSize: 24, color: C.inkDim, fontWeight: 500, letterSpacing: 0.3, textTransform: 'uppercase' }}>
            Get early access
          </div>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 16,
              padding: '22px 40px',
              borderRadius: 16,
              background: C.accent,
              boxShadow: '0 24px 60px -16px rgba(75,70,229,0.6)',
            }}
          >
            <span style={{ fontSize: 44, fontWeight: 700, color: '#fff', letterSpacing: -0.5 }}>{URL}</span>
            <svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h13m-5-5 5 5-5 5" />
            </svg>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
