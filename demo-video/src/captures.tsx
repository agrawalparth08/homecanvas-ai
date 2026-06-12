import { OffthreadVideo, Img, staticFile } from 'remotion';
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

export const hasAnyCapture = Object.keys(CAPTURES).length > 0;

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
