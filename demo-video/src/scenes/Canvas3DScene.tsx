import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, FONT } from '../theme';
import { DollHouse3D } from '../components/DollHouse3D';
import { CaptureMedia, pickCapture } from '../captures';

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

  // Real screen-grab from the app's 3D canvas (penthouse build), if captured.
  const clip = pickCapture('walkthrough', 'walk', 'orbit', 'tour');

  return (
    <AbsoluteFill style={{ fontFamily: FONT }}>
      {clip ? (
        <AbsoluteFill style={{ background: '#000' }}>
          <CaptureMedia capture={clip} />
        </AbsoluteFill>
      ) : (
        <DollHouse3D azimuth={azimuth} tilt={tilt} zoom={zoom} quality="clean" />
      )}

      {/* soft edge falloff into the light chrome */}
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse at center, transparent 58%, rgba(238,240,244,0.8) 100%)' }} />

      {/* a single segmented control, not four floating pills */}
      <div style={{ position: 'absolute', top: 40, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
        <div style={{ display: 'flex', gap: 4, padding: 5, borderRadius: 12, background: 'rgba(255,255,255,0.85)', border: `1px solid ${C.panelBorder}`, boxShadow: '0 8px 22px -10px rgba(27,29,36,0.18)' }}>
          {MODES.map((m, i) => (
            <div
              key={m}
              style={{
                padding: '9px 22px',
                borderRadius: 9,
                fontSize: 23,
                fontWeight: 600,
                background: i === active ? C.accent : 'transparent',
                color: i === active ? '#ffffff' : C.inkDim,
              }}
            >
              {m}
            </div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};
