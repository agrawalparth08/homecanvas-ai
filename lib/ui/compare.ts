/**
 * Before/After comparison helpers (Phase 7), pure. The binary scene-swap toggle
 * already ships (BottomBar `showBefore`); these support a spatial slider. The
 * 3D dual-render compositing (two overlaid canvases clipped at `pos`) is the
 * remaining GPU-visual piece; this position math is its testable core.
 */
export type CompareMode = 'off' | 'toggle' | 'slider';

/** Map a pointer clientX within a rect to a 0..1 slider position (always finite). */
export function clampSliderPos(clientX: number, rect: { left: number; width: number }): number {
  if (!Number.isFinite(clientX) || !Number.isFinite(rect.left) || !(rect.width > 0)) return 0;
  const t = (clientX - rect.left) / rect.width;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}
