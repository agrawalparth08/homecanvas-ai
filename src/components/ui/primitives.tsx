import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

/** The one keyboard-focus ring — mirrors Button.tsx so every control matches. */
export const FOCUS_RING =
  'outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-1 focus-visible:ring-offset-panel';

/**
 * Shared design-system primitives from the HomeCanvas handoff. Keep these the
 * single source for the recurring shapes — mono measurements, segmented controls,
 * sliders, toggles, tier badges, info chips — so every screen reads as one system.
 */

/** JetBrains Mono — every measurement, dimension, count, and technical readout. */
export function Mono({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`font-mono ${className}`}>{children}</span>;
}

/** Uppercase, letter-spaced faint section label (ROOMS / STYLE PACKS / QUALITY …). */
export function SectionLabel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span className={`text-[11px] font-bold uppercase tracking-[1.3px] text-faint ${className}`}>{children}</span>
  );
}

export interface SegOption<T extends string> {
  value: T;
  label?: ReactNode;
  icon?: IconName;
  title?: string;
}

/** Track-backed segmented control. active='accent' (default) | 'white'. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  active = 'accent',
  className = '',
}: {
  options: SegOption<T>[];
  value: T;
  onChange?: (v: T) => void;
  active?: 'accent' | 'white';
  className?: string;
}) {
  return (
    <div className={`inline-flex gap-0.5 rounded-[9px] bg-track p-[3px] ${className}`}>
      {options.map((o) => {
        const on = o.value === value;
        const activeCls =
          active === 'accent'
            ? 'bg-accent text-white'
            : 'bg-panel text-ink shadow-[0_2px_6px_-2px_rgba(20,22,40,0.2)]';
        return (
          <button
            key={o.value}
            type="button"
            title={o.title}
            onClick={() => onChange?.(o.value)}
            className={`inline-flex items-center justify-center gap-1.5 rounded-[7px] px-3 py-1.5 text-[12.5px] font-semibold transition ${FOCUS_RING} ${
              on ? activeCls : 'text-dim hover:text-ink'
            }`}
          >
            {o.icon && <Icon name={o.icon} className="text-[14px]" />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Labelled slider: mono value, accent fill, white knob with accent ring. Functional. */
export function Slider({
  label,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  display,
  onChange,
}: {
  label: ReactNode;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  display?: ReactNode;
  onChange?: (v: number) => void;
}) {
  const pct = max === min ? 0 : Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-[12.5px] text-dim">
        <span>{label}</span>
        <Mono className="text-ink">{display ?? value}</Mono>
      </div>
      <span className="relative block h-[5px] rounded-full bg-track">
        <span className="absolute left-0 top-0 h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
        <span
          className="pointer-events-none absolute top-1/2 h-[15px] w-[15px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_0_2px_var(--color-accent)]"
          style={{ left: `${pct}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange?.(Number(e.target.value))}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          aria-label={typeof label === 'string' ? label : undefined}
        />
      </span>
    </div>
  );
}

/** Pill switch. */
export function Switch({ on, onChange }: { on: boolean; onChange?: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange?.(!on)}
      className={`relative inline-block h-[19px] w-[34px] flex-shrink-0 rounded-full transition-colors ${FOCUS_RING} ${
        on ? 'bg-accent' : 'bg-[#cdd2dc]'
      }`}
    >
      <span
        className={`absolute top-[2px] h-[15px] w-[15px] rounded-full bg-white transition-all ${
          on ? 'left-[17px]' : 'left-[2px]'
        }`}
      />
    </button>
  );
}

const TIER_COLOR: Record<string, string> = {
  BUDGET: 'text-ok',
  MODERATE: 'text-faint',
  PREMIUM: 'text-accent',
};

/** Style-pack tier badge — colour-coded BUDGET / MODERATE / PREMIUM. */
export function TierBadge({ tier }: { tier: string }) {
  const t = tier.toUpperCase();
  return (
    <span className={`text-[10px] font-bold tracking-[0.8px] ${TIER_COLOR[t] ?? 'text-faint'}`}>{t}</span>
  );
}

/** Small info / suggestion pill. */
export function Chip({
  children,
  tone = 'neutral',
  dot,
  icon,
  className = '',
  onClick,
}: {
  children: ReactNode;
  tone?: 'accent' | 'neutral' | 'ok' | 'warn';
  dot?: boolean;
  icon?: IconName;
  className?: string;
  onClick?: () => void;
}) {
  const tones: Record<string, string> = {
    accent: 'text-accent bg-wash',
    neutral: 'text-ink bg-soft',
    ok: 'text-ok bg-[#e9f6ef]',
    warn: 'text-warn bg-[#fbf0e3]',
  };
  const dotColor: Record<string, string> = {
    accent: 'bg-accent',
    neutral: 'bg-faint',
    ok: 'bg-ok',
    warn: 'bg-warn',
  };
  const Tag = onClick ? 'button' : 'span';
  return (
    <Tag
      {...(onClick ? { onClick, type: 'button' as const } : {})}
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold ${tones[tone]} ${onClick ? FOCUS_RING : ''} ${className}`}
    >
      {dot && <span className={`h-[7px] w-[7px] rounded-full ${dotColor[tone]}`} />}
      {icon && <Icon name={icon} className="text-[14px]" />}
      {children}
    </Tag>
  );
}
