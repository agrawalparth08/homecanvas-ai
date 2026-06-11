import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, FONT } from '../theme';
import { DollHouse3D } from '../components/DollHouse3D';

const MODES = ['Orbit', 'Top', 'Walk', 'Tour'];

/**
 * A live, continuously-moving 3D dollhouse. The camera path mirrors the four
 * view modes as their chips highlight: orbiting sweep → near top-down → low
 * "walk" angle zoomed in → pulled-back touring sweep.
 */
export const Canvas3DScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const q = durationInFrames / 4;
  const keys = [0, q, 2 * q, 3 * q, durationInFrames];
  const azimuth = interpolate(frame, keys, [-38, -8, 14, 30, 52]) + Math.sin(frame / 34) * 2;
  // tilt capped at ~66°: higher angles put the exterior walls between the
  // camera and the interior; "walk" reads through zoom instead.
  const tilt = interpolate(frame, keys, [58, 26, 66, 60, 58]);
  const zoom = interpolate(frame, keys, [1.05, 1.18, 1.75, 1.25, 1.32]);

  const active = Math.min(MODES.length - 1, Math.floor((frame / durationInFrames) * MODES.length));

  return (
    <AbsoluteFill style={{ fontFamily: FONT }}>
      <DollHouse3D azimuth={azimuth} tilt={tilt} zoom={zoom} quality="clean" />

      {/* soft edge falloff into the light chrome */}
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse at center, transparent 58%, rgba(238,240,244,0.8) 100%)' }} />

      <div style={{ position: 'absolute', top: 36, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 14 }}>
        {MODES.map((m, i) => (
          <div
            key={m}
            style={{
              padding: '12px 26px',
              borderRadius: 12,
              fontSize: 26,
              fontWeight: 600,
              background: i === active ? C.accent : 'rgba(255,255,255,0.92)',
              color: i === active ? '#ffffff' : C.inkDim,
              border: `1px solid ${i === active ? C.accent : C.panelBorder}`,
              boxShadow: i === active ? '0 12px 34px rgba(75,70,229,0.35)' : '0 8px 24px rgba(27,29,36,0.08)',
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
