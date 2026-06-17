import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dark';
type Size = 'sm' | 'md';

/**
 * The one button. A small, intentional hierarchy so the UI reads as designed,
 * not hand-rolled per component:
 *   primary   = solid indigo, the single most important action on a surface
 *   secondary = white with a hairline border (the default)
 *   ghost     = transparent, for low-emphasis / toolbar actions
 *   danger    = quiet until hover, for destructive actions
 * Every variant shares one focus ring, one motion, one radius.
 */
const BASE =
  'inline-flex select-none items-center justify-center gap-1.5 rounded-lg font-medium ' +
  'transition-[background-color,border-color,color,box-shadow,transform] duration-150 ' +
  'outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-1 focus-visible:ring-offset-panel ' +
  'active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-accent text-white shadow-[0_10px_22px_-10px_rgba(75,70,229,0.6)] hover:bg-[#403bd6] active:bg-[#3a35c4]',
  secondary:
    'border border-line bg-panel text-ink hover:bg-soft',
  ghost: 'text-dim hover:bg-soft hover:text-ink',
  danger:
    'border border-transparent text-rose-600 hover:border-rose-200 hover:bg-rose-50',
  dark: 'bg-ink text-white hover:bg-[#2a2d37] active:bg-[#13141b]',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  iconRight?: IconName;
  children?: ReactNode;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  iconRight,
  className = '',
  children,
  ...rest
}: Props) {
  const iconOnly = !children;
  const sizeClass = iconOnly ? (size === 'sm' ? 'h-8 w-8' : 'h-10 w-10') : SIZES[size];
  return (
    <button className={`${BASE} ${VARIANTS[variant]} ${sizeClass} ${className}`} {...rest}>
      {icon && <Icon name={icon} className={size === 'sm' ? 'text-[15px]' : 'text-[17px]'} />}
      {children}
      {iconRight && <Icon name={iconRight} className={size === 'sm' ? 'text-[15px]' : 'text-[17px]'} />}
    </button>
  );
}
