import React from 'react';

/**
 * Thin-line iconography in the Sarvam style: 2.2px rounded strokes on a 24px
 * grid, single color (pass via `color`). No fills except tiny accents.
 */
const Base: React.FC<{ size: number; color: string; children: React.ReactNode }> = ({ size, color, children }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={1.9}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {children}
  </svg>
);

export const HouseIcon: React.FC<{ size?: number; color?: string }> = ({ size = 40, color = 'currentColor' }) => (
  <Base size={size} color={color}>
    <path d="M3.5 10.5 12 3.5l8.5 7" />
    <path d="M5.5 9.5V20h13V9.5" />
    <path d="M10 20v-5.5h4V20" />
  </Base>
);

export const CompassIcon: React.FC<{ size?: number; color?: string }> = ({ size = 40, color = 'currentColor' }) => (
  <Base size={size} color={color}>
    <circle cx={12} cy={5} r={1.8} />
    <path d="M10.8 6.4 5 20M13.2 6.4 19 20" />
    <path d="M7.2 14.6c3-2 6.6-2 9.6 0" />
  </Base>
);

export const SofaIcon: React.FC<{ size?: number; color?: string }> = ({ size = 40, color = 'currentColor' }) => (
  <Base size={size} color={color}>
    <path d="M5 11V8.5A2.5 2.5 0 0 1 7.5 6h9A2.5 2.5 0 0 1 19 8.5V11" />
    <path d="M3.5 13.5a2 2 0 0 1 2-2c1.1 0 2 .9 2 2V14h9v-.5a2 2 0 1 1 4 0V17a1.5 1.5 0 0 1-1.5 1.5h-14A1.5 1.5 0 0 1 3.5 17Z" />
    <path d="M6 18.5V20M18 18.5V20" />
  </Base>
);

export const BuildingsIcon: React.FC<{ size?: number; color?: string }> = ({ size = 40, color = 'currentColor' }) => (
  <Base size={size} color={color}>
    <path d="M3.5 20h17" />
    <path d="M5.5 20V6.5L11 4v16" />
    <path d="M13.5 20V9.5l5 2V20" />
    <path d="M7.5 8.5h1M7.5 11.5h1M7.5 14.5h1M16 14h1M16 17h1" />
  </Base>
);

export const LaptopHomeIcon: React.FC<{ size?: number; color?: string; accent?: string }> = ({
  size = 40,
  color = 'currentColor',
  accent,
}) => (
  <Base size={size} color={color}>
    <rect x={4.5} y={4.5} width={15} height={10} rx={1.4} />
    <path d="M2.5 19.5h19l-2-3.5h-15Z" />
    <g stroke={accent ?? color}>
      <path d="M9.5 9.6 12 7.5l2.5 2.1" />
      <path d="M10.3 9.2v3h3.4v-3" />
    </g>
  </Base>
);

export const CloudOffIcon: React.FC<{ size?: number; color?: string; slash?: string }> = ({
  size = 40,
  color = 'currentColor',
  slash,
}) => (
  <Base size={size} color={color}>
    <path d="M7 17.5a4 4 0 0 1-.6-7.96 5.2 5.2 0 0 1 10.1-1.2A4.2 4.2 0 0 1 17.5 17.5Z" />
    <path d="M4 20.5 20.5 4" stroke={slash ?? color} strokeWidth={2.3} />
  </Base>
);

export const MailIcon: React.FC<{ size?: number; color?: string }> = ({ size = 40, color = 'currentColor' }) => (
  <Base size={size} color={color}>
    <rect x={3.5} y={5.5} width={17} height={13} rx={2} />
    <path d="m4.5 7.5 7.5 6 7.5-6" />
  </Base>
);

export const WarnIcon: React.FC<{ size?: number; color?: string }> = ({ size = 40, color = 'currentColor' }) => (
  <Base size={size} color={color}>
    <path d="M12 4 2.8 19.5h18.4Z" />
    <path d="M12 10v4.5" />
    <circle cx={12} cy={17} r={0.4} fill={color} />
  </Base>
);

export const CheckIcon: React.FC<{ size?: number; color?: string }> = ({ size = 40, color = 'currentColor' }) => (
  <Base size={size} color={color}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Base>
);
