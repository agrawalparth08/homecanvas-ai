import { AbsoluteFill, interpolate, OffthreadVideo, Img, staticFile } from 'remotion';
import React from 'react';
import capturesJson from './captures.json';

export interface Capture {
  src: string;
  kind: 'video' | 'image';
}

/** slot -> capture, populated by scripts/scan-captures.mjs (empty by default). */
export const CAPTURES: Record<string, Capture> = capturesJson as Record<string, Capture>;

/** First present capture among the given slots, or null. */
export function pickCapture(...slots: string[]): Capture | null {
  for (const s of slots) {
    const c = CAPTURES[s.toLowerCase()];
    if (c) return c;
  }
  return null;
}

/**
 * ALL captures whose slot starts with one of the prefixes, in slot order — so
 * `photoreal.png`, `photoreal2.png`, `photoreal-top.png` all feed the photo
 * gallery. Lets you drop several real renders and show them all.
 */
export function pickAll(...prefixes: string[]): Capture[] {
  const ps = prefixes.map((p) => p.toLowerCase());
  return Object.keys(CAPTURES)
    .filter((k) => ps.some((p) => k.startsWith(p)))
    .sort()
    .map((k) => CAPTURES[k]!);
}

export const hasAnyCapture = Object.keys(CAPTURES).length > 0;

/** Slow Ken-Burns transform for a still (videos move on their own → identity). */
function kb(frame: number, dur: number, kind: Capture['kind']): React.CSSProperties {
  if (kind === 'video') return {};
  const s = interpolate(frame, [0, dur], [1.05, 1.2], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const x = interpolate(frame, [0, dur], [-2, 2], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return { transform: `scale(${s}) translateX(${x}%)` };
}

/**
 * Cross-fading Ken-Burns gallery over a list of captures, filling the scene.
 * One capture → a single moving shot; several → equal cross-faded segments.
 */
export const CaptureGallery: React.FC<{ captures: Capture[]; frame: number; duration: number }> = ({
  captures,
  frame,
  duration,
}) => {
  if (captures.length === 0) return null;
  if (captures.length === 1) {
    return <CaptureMedia capture={captures[0]!} style={kb(frame, duration, captures[0]!.kind)} />;
  }
  const seg = duration / captures.length;
  return (
    <>
      {captures.map((c, i) => {
        const start = i * seg;
        const op = interpolate(
          frame,
          [start - 12, start + 8, start + seg - 8, start + seg + 12],
          [0, 1, 1, 0],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
        );
        if (op <= 0) return null;
        return (
          <AbsoluteFill key={i} style={{ opacity: op }}>
            <CaptureMedia capture={c} style={kb(frame - start, seg, c.kind)} />
          </AbsoluteFill>
        );
      })}
    </>
  );
};

/**
 * Render a captured clip or still, cover-fitting the frame. Stills get a slow
 * Ken-Burns push via the passed transform. Clips loop/freeze to fill the scene.
 */
export const CaptureMedia: React.FC<{ capture: Capture; style?: React.CSSProperties; muted?: boolean }> = ({
  capture,
  style,
  muted = true,
}) => {
  const common: React.CSSProperties = { width: '100%', height: '100%', objectFit: 'cover', ...style };
  if (capture.kind === 'video') {
    return <OffthreadVideo src={staticFile(capture.src)} muted={muted} style={common} />;
  }
  return <Img src={staticFile(capture.src)} style={common} />;
};
