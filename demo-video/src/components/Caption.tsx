import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { C, FONT } from '../theme';

/** Subtitle strip pinned to the bottom of every narrated scene. */
export const Caption: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [8, 22], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 44,
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
        opacity,
      }}
    >
      <div
        style={{
          maxWidth: 1280,
          padding: '14px 28px',
          borderRadius: 14,
          background: 'rgba(19,20,27,0.82)',
          border: `1px solid ${C.panelBorder}`,
          color: C.text,
          fontFamily: FONT,
          fontSize: 30,
          fontWeight: 500,
          lineHeight: 1.35,
          textAlign: 'center',
        }}
      >
        {text}
      </div>
    </div>
  );
};
