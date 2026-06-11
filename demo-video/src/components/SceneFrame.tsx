import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { C } from '../theme';

const FADE = 12;

/**
 * Per-scene wrapper: dark stage with a faint grid, fading in/out so butt-joined
 * scenes read as smooth cuts.
 */
export const SceneFrame: React.FC<{ frames: number; children: React.ReactNode }> = ({ frames, children }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, FADE, frames - FADE, frames], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill style={{ backgroundColor: C.bg }}>
      <AbsoluteFill
        style={{
          opacity: 0.5,
          backgroundImage: `linear-gradient(${C.panelBorder}22 1px, transparent 1px), linear-gradient(90deg, ${C.panelBorder}22 1px, transparent 1px)`,
          backgroundSize: '64px 64px',
        }}
      />
      <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>
    </AbsoluteFill>
  );
};
