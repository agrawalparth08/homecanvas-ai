import React from 'react';
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, FONT } from '../theme';

const MAX_SAMPLES = 400;

/** Photo Mode: image converges from noisy/blurred to clean as samples climb. */
export const PhotoScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const convergeEnd = durationInFrames * 0.75;
  const blur = interpolate(frame, [0, convergeEnd], [7, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const grain = interpolate(frame, [0, convergeEnd], [0.55, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  // sample counter eases out like a real progressive tracer
  const t = Math.min(1, frame / convergeEnd);
  const samples = Math.round(MAX_SAMPLES * (1 - Math.pow(1 - t, 2.2)));
  const converged = samples >= MAX_SAMPLES;
  const savePulse = converged ? 1 + Math.sin(frame / 5) * 0.04 : 1;

  return (
    <AbsoluteFill style={{ fontFamily: FONT }}>
      <AbsoluteFill style={{ overflow: 'hidden' }}>
        <Img
          src={staticFile('terrace-level.png')}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            filter: `blur(${blur}px) saturate(${1 + grain * 0.2})`,
            // crop the app's left panel out, keep terrace centered
            transform: 'scale(1.45) translate(-90px, 30px)',
          }}
        />
        {/* edge fades: guarantee no app chrome peeks in from the screenshot */}
        <AbsoluteFill
          style={{
            background:
              'linear-gradient(90deg, rgba(10,11,16,0.95) 0%, transparent 7%, transparent 93%, rgba(10,11,16,0.95) 100%)',
          }}
        />
        {/* path-tracer grain */}
        <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, opacity: grain, mixBlendMode: 'overlay' }}>
          <filter id="grain">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={(frame % 7) + 1} stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width="100%" height="100%" filter="url(#grain)" />
        </svg>
        <AbsoluteFill style={{ background: 'radial-gradient(ellipse at center, transparent 55%, rgba(10,11,16,0.5) 100%)' }} />
      </AbsoluteFill>

      {/* HUD: samples chip (matches the real app) */}
      <div style={{ position: 'absolute', top: 30, left: 34, padding: '12px 22px', borderRadius: 12, background: 'rgba(0,0,0,0.65)', color: '#fff', fontSize: 25, fontWeight: 600 }}>
        {converged ? `Photoreal · ${MAX_SAMPLES}/${MAX_SAMPLES} samples · converged ✓` : `Photoreal · ${samples}/${MAX_SAMPLES} samples…`}
      </div>
      <div style={{ position: 'absolute', top: 30, right: 34, display: 'flex', gap: 14 }}>
        <div
          style={{
            padding: '12px 24px',
            borderRadius: 12,
            background: converged ? C.accent : 'rgba(0,0,0,0.5)',
            color: converged ? '#fff' : 'rgba(255,255,255,0.55)',
            fontSize: 25,
            fontWeight: 700,
            transform: `scale(${savePulse})`,
          }}
        >
          Save photo
        </div>
        <div style={{ padding: '12px 24px', borderRadius: 12, background: 'rgba(0,0,0,0.65)', color: '#fff', fontSize: 25, fontWeight: 600 }}>
          Exit Photo Mode
        </div>
      </div>
    </AbsoluteFill>
  );
};
