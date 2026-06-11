import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, FONT } from '../theme';
import { DollHouse3D } from '../components/DollHouse3D';

const MAX_SAMPLES = 400;
const COLS = 10;
const ROWS = 6;
const TILES = COLS * ROWS;

/** Static film-grain texture used on unresolved tiles. */
const NOISE_URI =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter><rect width="120" height="120" filter="url(%23n)" opacity="0.55"/></svg>`,
  );

/**
 * Photo Mode: the dollhouse at a cinematic angle, resolving TILE BY TILE the
 * way a real progressive path tracer renders — unresolved tiles stay noisy and
 * blurred, resolved ones snap to the clean warm render.
 */
export const PhotoScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const convergeEnd = durationInFrames * 0.72;
  const azimuth = -20 + frame * 0.045;
  const zoom = interpolate(frame, [0, durationInFrames], [1.42, 1.56]);

  // deterministic pseudo-random tile resolve order
  const tileDelay = (i: number) => ((i * 37 + 11) % TILES) / TILES;
  const resolvedCount = Array.from({ length: TILES }).filter(
    (_, i) => frame > tileDelay(i) * convergeEnd + 8,
  ).length;
  const samples = Math.min(MAX_SAMPLES, Math.round((resolvedCount / TILES) * MAX_SAMPLES));
  const converged = samples >= MAX_SAMPLES;
  const savePulse = converged ? 1 + Math.sin(frame / 5) * 0.04 : 1;

  return (
    <AbsoluteFill style={{ fontFamily: FONT }}>
      <DollHouse3D azimuth={azimuth} tilt={57} zoom={zoom} quality="clean" />

      {/* unresolved tiles: noisy + blurred until the "tracer" reaches them */}
      <AbsoluteFill style={{ display: 'grid', gridTemplateColumns: `repeat(${COLS}, 1fr)`, gridTemplateRows: `repeat(${ROWS}, 1fr)` }}>
        {Array.from({ length: TILES }).map((_, i) => {
          const start = tileDelay(i) * convergeEnd;
          const opacity = interpolate(frame, [start, start + 16], [1, 0], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          });
          if (opacity === 0) return <div key={i} />;
          return (
            <div
              key={i}
              style={{
                opacity,
                backgroundImage: `url("${NOISE_URI}")`,
                backgroundColor: 'rgba(238,240,244,0.35)',
                backdropFilter: 'blur(7px) saturate(0.65) brightness(1.02)',
              }}
            />
          );
        })}
      </AbsoluteFill>

      <AbsoluteFill style={{ background: 'radial-gradient(ellipse at center, transparent 58%, rgba(238,240,244,0.75) 100%)' }} />

      {/* HUD — mirrors the real app's Photo Mode */}
      <div style={{ position: 'absolute', top: 30, left: 34, padding: '12px 22px', borderRadius: 12, background: 'rgba(255,255,255,0.92)', border: `1px solid ${C.panelBorder}`, color: C.ink, fontSize: 25, fontWeight: 600, boxShadow: '0 10px 28px rgba(27,29,36,0.10)' }}>
        {converged ? `Photoreal · ${MAX_SAMPLES}/${MAX_SAMPLES} samples · converged ✓` : `Photoreal · ${samples}/${MAX_SAMPLES} samples…`}
      </div>
      <div style={{ position: 'absolute', top: 30, right: 34, display: 'flex', gap: 14 }}>
        <div
          style={{
            padding: '12px 24px',
            borderRadius: 12,
            background: converged ? C.accent : 'rgba(255,255,255,0.75)',
            border: `1px solid ${converged ? C.accent : C.panelBorder}`,
            color: converged ? '#fff' : C.inkFaint,
            fontSize: 25,
            fontWeight: 700,
            transform: `scale(${savePulse})`,
            boxShadow: converged ? '0 12px 32px rgba(75,70,229,0.35)' : 'none',
          }}
        >
          Save photo
        </div>
        <div style={{ padding: '12px 24px', borderRadius: 12, background: 'rgba(255,255,255,0.92)', border: `1px solid ${C.panelBorder}`, color: C.ink, fontSize: 25, fontWeight: 600 }}>
          Exit Photo Mode
        </div>
      </div>
    </AbsoluteFill>
  );
};
