import type { ReactNode } from 'react';

export type IconName =
  | 'pencil' | 'columns' | 'save' | 'plus' | 'play' | 'sparkles' | 'close' | 'upload' | 'undo' | 'redo'
  | 'home' | 'arrowRight' | 'cube' | 'image' | 'layers' | 'compare'
  | 'lock' | 'unlock' | 'warning' | 'check' | 'trash' | 'mail' | 'camera'
  | 'chevronUp' | 'chevronDown' | 'chevronLeft' | 'chevronRight'
  | 'rotateCcw' | 'rotateCw' | 'walk' | 'orbit' | 'stairs'
  | 'search' | 'grid' | 'clock' | 'wand' | 'sun' | 'aperture' | 'denoise' | 'share' | 'user';

const SHAPES: Record<IconName, ReactNode> = {
  pencil: <path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3Zm10.5-13.5 3 3" />,
  columns: <><rect x="3" y="4" width="18" height="16" rx="1.5" /><path d="M12 4v16" /></>,
  save: <><path d="M5 4h11l3 3v13H5z" /><path d="M8 4v5h7V4M8 20v-6h8v6" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  play: <path d="M8 5.5v13l11-6.5z" />,
  sparkles: <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6zM19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8z" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  upload: <><path d="M12 16V4m0 0L8 8m4-4 4 4" /><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></>,
  undo: <path d="M9 7 4 12l5 5M4 12h11a5 5 0 0 1 0 10h-1" />,
  redo: <path d="m15 7 5 5-5 5M20 12H9a5 5 0 0 0 0 10h1" />,
  home: <><path d="M3.5 10.5 12 3.5l8.5 7" /><path d="M5.5 9.5V20h13V9.5" /><path d="M10 20v-5.5h4V20" /></>,
  arrowRight: <path d="M5 12h13m-5-5 5 5-5 5" />,
  cube: <><path d="M12 3 21 8v8l-9 5-9-5V8z" /><path d="M3 8l9 5 9-5M12 13v8" /></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9.5" r="1.5" /><path d="m4 18 5-5 4 4 3-3 4 4" /></>,
  layers: <path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5m-18 4 9 5 9-5" />,
  compare: <><rect x="3" y="5" width="18" height="14" rx="1.5" /><path d="M12 5v14" /><path d="M7 10l-2 2 2 2M17 10l2 2-2 2" /></>,
  lock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  unlock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 7.5-2" /></>,
  warning: <><path d="M12 4 2.8 19.5h18.4Z" /><path d="M12 10v4.2" /><circle cx="12" cy="16.8" r="0.6" fill="currentColor" stroke="none" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  trash: <path d="M4 7h16M9 7V5h6v2m-8 0 1 13h8l1-13M10 11v6M14 11v6" />,
  mail: <><rect x="3.5" y="5.5" width="17" height="13" rx="2" /><path d="m4.5 7.5 7.5 6 7.5-6" /></>,
  camera: <><path d="M3 8a2 2 0 0 1 2-2h2l1.5-2h7L19 6h0a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /><circle cx="12" cy="12.5" r="3.2" /></>,
  chevronUp: <path d="m6 14 6-6 6 6" />,
  chevronDown: <path d="m6 10 6 6 6-6" />,
  chevronLeft: <path d="m14 6-6 6 6 6" />,
  chevronRight: <path d="m10 6 6 6-6 6" />,
  rotateCcw: <path d="M4 9a8 8 0 1 1-1 5M4 9V4M4 9h5" />,
  rotateCw: <path d="M20 9a8 8 0 1 0 1 5M20 9V4M20 9h-5" />,
  walk: <><circle cx="13" cy="4.5" r="1.6" /><path d="M13 7v5l3 3M13 9l-3 1.5-1 4.5M13 12l1 8M11 14l-2 6" /></>,
  orbit: <><circle cx="12" cy="12" r="3" /><ellipse cx="12" cy="12" rx="10" ry="4.2" transform="rotate(28 12 12)" /></>,
  stairs: <path d="M4 20v-3h4v-3h4v-3h4V8h4" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></>,
  grid: <><rect x="3.5" y="4.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="4.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  wand: <path d="m4 4 7 16 2.5-6.5L20 11Z" />,
  sun: <><path d="M12 3v3M12 18v3M5 12H2M22 12h-3M6 6 4 4M20 20l-2-2M6 18l-2 2M20 4l-2 2" /><circle cx="12" cy="12" r="3.5" /></>,
  aperture: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /></>,
  denoise: <path d="M3 12h4l3 7 4-14 3 7h4" />,
  share: <><circle cx="6" cy="12" r="2.5" /><circle cx="17" cy="6" r="2.5" /><circle cx="17" cy="18" r="2.5" /><path d="M8.2 10.8 14.8 7.2M8.2 13.2l6.6 3.6" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 20a8 8 0 0 1 16 0" /></>,
};

export function Icon({ name, className = '', strokeWidth = 1.7 }: { name: IconName; className?: string; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {SHAPES[name]}
    </svg>
  );
}
