import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { C } from '../theme';

const FADE = 12;

/**
 * Per-scene wrapper: light Sarvam chrome with soft warm gradient washes (the
 * app's .hc-hero look) and a whisper-faint grid, fading in/out between scenes.
 */
export const SceneFrame: React.FC<{ frames: number; children: React.ReactNode }> = ({ frames, children }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, FADE, frames - FADE, frames], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill style={{ backgroundColor: C.bg }}>
      {/* soft gradient pops */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(900px 600px at 18% 8%, ${C.washIndigo} 0%, transparent 70%),
                       radial-gradient(800px 560px at 86% 90%, ${C.washPeach} 0%, transparent 70%),
                       radial-gradient(700px 500px at 80% 12%, rgba(63,143,210,0.05) 0%, transparent 70%)`,
        }}
      />
      {/* faint grid */}
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(${C.ink}08 1px, transparent 1px), linear-gradient(90deg, ${C.ink}08 1px, transparent 1px)`,
          backgroundSize: '72px 72px',
        }}
      />
      <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>
    </AbsoluteFill>
  );
};
