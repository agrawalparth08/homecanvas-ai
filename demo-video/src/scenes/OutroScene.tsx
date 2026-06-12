import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, FONT, SPRING } from '../theme';
import { MailIcon } from '../components/Icons';

const EMAIL = 'agrawalparth08@gmail.com';

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
            margin: '60px auto 0',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 22,
            padding: '26px 44px',
            borderRadius: 18,
            background: C.panel,
            border: `2px solid ${C.accent}`,
            boxShadow: '0 30px 80px rgba(75,70,229,0.22)',
            transform: `translateY(${(1 - cardIn) * 50}px)`,
            opacity: cardIn,
          }}
        >
          <div style={{ width: 72, height: 72, borderRadius: 16, background: C.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MailIcon size={44} color={C.accent} />
          </div>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: 24, color: C.inkDim, fontWeight: 500 }}>Want it for your home or your clients?</div>
            <div style={{ fontSize: 40, fontWeight: 700, color: C.ink, marginTop: 4 }}>{EMAIL}</div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
