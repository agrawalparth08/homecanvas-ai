import { loadFont } from '@remotion/google-fonts/Inter';

const { fontFamily } = loadFont();

/** Sarvam-derived palette — matches the app (src/styles.css). */
export const C = {
  bg: '#13141b', // dark navy stage
  bgPanel: '#1b1d24',
  panelBorder: '#2a2d37',
  accent: '#4b46e5', // indigo
  accentSoft: 'rgba(75, 70, 229, 0.22)',
  text: '#f3f4f7',
  textDim: '#9aa0ac',
  textFaint: '#646b78',
  cyan: '#3ec7ff', // tracing walls
  gold: '#d8a25a', // selection
  magenta: '#d6479e', // structural pillars
  green: '#5bd6a0', // stairs / success
  paper: '#f6f4ee',
  planInk: '#5d6470',
};

export const FONT = `${fontFamily}, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
