import type { CSSProperties } from 'react';
import { loadFont } from '@remotion/google-fonts/Inter';

const { fontFamily } = loadFont();

/**
 * Sarvam-inspired LIGHT theme — matches the app's chrome (src/styles.css):
 * cool light background, white panels, near-black navy ink, indigo accent,
 * soft warm gradient washes. Classy, lots of air, thin-line iconography.
 */
export const C = {
  bg: '#eef0f4', // cool light chrome
  bgWash: '#f7f6f2', // warm cream alternate
  panel: '#ffffff',
  panelBorder: '#e4e6ec',
  ink: '#1b1d24', // primary text (near-black navy)
  inkDim: '#646b78',
  inkFaint: '#9aa0ac',
  accent: '#4b46e5', // indigo
  accentSoft: 'rgba(75, 70, 229, 0.10)',
  gold: '#c08a3e', // muted brass (selection, doors)
  magenta: '#c2438f', // structural pillars
  green: '#2f9e6b', // success / stairs
  sky: '#3f8fd2', // windows
  rose: '#c2453f', // destructive
  paper: '#fffdf8',
  planInk: '#5d6470',
  /** Soft hero washes (mirrors the app's .hc-hero gradient pops). */
  washIndigo: 'rgba(75, 70, 229, 0.07)',
  washPeach: 'rgba(244, 178, 118, 0.10)',
};

export const FONT = `${fontFamily}, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;

/** Standard white card — tighter radius + a shadow that hugs the card (negative spread). */
export const CARD: CSSProperties = {
  background: C.panel,
  border: `1px solid ${C.panelBorder}`,
  borderRadius: 14,
  boxShadow: '0 16px 36px -12px rgba(27, 29, 36, 0.12)',
};

/** Two radii only — keep the whole piece consistent. */
export const R = { control: 10, card: 14 } as const;

/** Tiered entrance motion so reveals feel intentional, not all-identical. */
export const SPRING = {
  hero: { damping: 18, stiffness: 150 } as const,
  card: { damping: 16, stiffness: 110 } as const,
  soft: { damping: 20, stiffness: 90 } as const,
};
