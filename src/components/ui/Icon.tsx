import type { ReactNode } from 'react';

export type IconName =
  | 'pencil' | 'columns' | 'save' | 'plus' | 'play' | 'sparkles' | 'close' | 'upload' | 'undo' | 'redo'
  | 'home' | 'arrowRight' | 'cube' | 'image' | 'layers' | 'compare';

const SHAPES: Record<IconName, ReactNode> = {
  pencil: <path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3Zm10.5-13.5 3 3" />,
  columns: <><rect x="3" y="4" width="18" height="16" rx="1.5" /><path d="M12 4v16" /></>,
  save: <><path d="M5 4h11l3 3v13H5z" /><path d="M8 4v5h7V4M8 20v-6h8v6" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  play: <path d="M7 5l11 7-11 7z" />,
  sparkles: <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6zM19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8z" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  upload: <><path d="M12 16V4m0 0L8 8m4-4 4 4" /><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></>,
  undo: <path d="M9 7 4 12l5 5M4 12h11a5 5 0 0 1 0 10h-1" />,
  redo: <path d="m15 7 5 5-5 5M20 12H9a5 5 0 0 0 0 10h1" />,
  home: <path d="M4 11 12 4l8 7M6 10v9h12v-9M10 19v-5h4v5" />,
  arrowRight: <path d="M5 12h13m-5-5 5 5-5 5" />,
  cube: <><path d="M12 3 21 8v8l-9 5-9-5V8z" /><path d="M3 8l9 5 9-5M12 13v8" /></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9.5" r="1.5" /><path d="m4 18 5-5 4 4 3-3 4 4" /></>,
  layers: <path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5m-18 4 9 5 9-5" />,
  compare: <><rect x="3" y="5" width="18" height="14" rx="1.5" /><path d="M12 5v14" /><path d="M7 10l-2 2 2 2M17 10l2 2-2 2" /></>,
};

export function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {SHAPES[name]}
    </svg>
  );
}
