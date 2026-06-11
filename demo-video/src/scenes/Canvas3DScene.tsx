import React from 'react';
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, FONT } from '../theme';

const MODES = ['Orbit', 'Top', 'Walk', 'Tour'];

/** Ken Burns over a real (sample-home) canvas screenshot + view-mode chips. */
export const Canvas3DScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Zoom past the app's side panels (canvas spans ~0.19–0.81 of the 2400px
  // screenshot → needs scale ≥1.7 to fill 1920; translate applies pre-scale).
  const scale = interpolate(frame, [0, durationInFrames], [1.7, 1.8]);
  const panX = interpolate(frame, [0, durationInFrames], [8, -4]);
  const panY = interpolate(frame, [0, durationInFrames], [-10, -40]);

  // each chip highlights for a quarter of the scene
  const active = Math.min(MODES.length - 1, Math.floor((frame / durationInFrames) * MODES.length));

  return (
    <AbsoluteFill style={{ fontFamily: FONT }}>
      <AbsoluteFill style={{ overflow: 'hidden' }}>
        <Img
          src={staticFile('design-canvas.png')}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: `scale(${scale}) translate(${panX}px, ${panY}px)`,
          }}
        />
        {/* edge fades: guarantee no app chrome peeks in from the screenshot */}
        <AbsoluteFill
          style={{
            background:
              'linear-gradient(90deg, rgba(10,11,16,0.95) 0%, transparent 7%, transparent 93%, rgba(10,11,16,0.95) 100%)',
          }}
        />
        {/* vignette for depth + caption legibility */}
        <AbsoluteFill
          style={{ background: 'radial-gradient(ellipse at center, transparent 52%, rgba(10,11,16,0.55) 100%)' }}
        />
      </AbsoluteFill>

      <div style={{ position: 'absolute', top: 36, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 14 }}>
        {MODES.map((m, i) => (
          <div
            key={m}
            style={{
              padding: '12px 26px',
              borderRadius: 12,
              fontSize: 26,
              fontWeight: 600,
              fontFamily: FONT,
              transition: 'none',
              background: i === active ? C.accent : 'rgba(19,20,27,0.78)',
              color: i === active ? '#ffffff' : C.textDim,
              border: `1px solid ${i === active ? C.accent : C.panelBorder}`,
              transform: i === active ? 'scale(1.08)' : 'scale(1)',
            }}
          >
            {m}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};
