import type { Material } from '../scene/schemas';

/**
 * Built-in procedural PBR materials. `textureSetRef` keys resolve against the
 * local CC0 asset cache (lib/assets) — when a set hasn't been downloaded yet
 * the renderer falls back to the flat baseColor, so the app works with zero
 * downloads.
 */
export const MATERIAL_LIBRARY: Material[] = [
  {
    id: 'mat-paint-white',
    name: 'White Paint',
    category: 'paint',
    baseColor: '#f3f3f1',
    pbr: { roughness: 0.94, metallic: 0, repeatScale: 1000 },
    styleTags: ['neutral', 'minimal'],
  },
  {
    id: 'mat-paint-beige',
    name: 'Soft Beige Paint',
    category: 'paint',
    baseColor: '#e7dcc8',
    pbr: { roughness: 0.93, metallic: 0, repeatScale: 1000 },
    styleTags: ['warm', 'japandi'],
  },
  {
    id: 'mat-limewash-sand',
    name: 'Sand Limewash',
    category: 'limewash',
    baseColor: '#ddd0b8',
    pbr: { roughness: 0.97, metallic: 0, textureSetRef: 'plaster_rough', repeatScale: 1500 },
    styleTags: ['earthy', 'heritage'],
  },
  {
    id: 'mat-floor-oak',
    name: 'Warm Oak Flooring',
    category: 'wood',
    baseColor: '#b08a5e',
    pbr: { roughness: 0.55, metallic: 0, textureSetRef: 'wood_floor_oak', repeatScale: 1400 },
    styleTags: ['warm', 'japandi', 'scandinavian'],
  },
  {
    id: 'mat-floor-walnut',
    name: 'Dark Walnut Flooring',
    category: 'wood',
    baseColor: '#6b4a32',
    pbr: { roughness: 0.5, metallic: 0, textureSetRef: 'wood_floor_walnut', repeatScale: 1400 },
    styleTags: ['luxury', 'contemporary'],
  },
  {
    id: 'mat-floor-marble-ivory',
    name: 'Ivory Marble',
    category: 'marble',
    baseColor: '#e9e4da',
    pbr: { roughness: 0.18, metallic: 0, textureSetRef: 'marble_ivory', repeatScale: 1200 },
    styleTags: ['luxury', 'premium', 'indian-modern'],
  },
  {
    id: 'mat-floor-marble-grey',
    name: 'Grey Marble',
    category: 'marble',
    baseColor: '#b6babe',
    // reuse the marble veining, tinted grey; polished sheen.
    pbr: { roughness: 0.16, metallic: 0, textureSetRef: 'marble_ivory', tint: '#9aa0a6', repeatScale: 1500 },
    styleTags: ['contemporary', 'luxury', 'minimal'],
  },
  {
    id: 'mat-tile-grey-matt',
    name: 'Grey Matt Tile',
    category: 'ceramicTile',
    baseColor: '#8f928f',
    // square porcelain tiles, matt finish, grey tint — terraces.
    pbr: { roughness: 0.9, metallic: 0, textureSetRef: 'tiles_porcelain', tint: '#8f928f', repeatScale: 500 },
    styleTags: ['minimal', 'contemporary', 'outdoor'],
  },
  {
    id: 'mat-floor-kota',
    name: 'Kota Stone',
    category: 'stone',
    baseColor: '#7e8470',
    pbr: { roughness: 0.6, metallic: 0, textureSetRef: 'stone_kota', repeatScale: 1100 },
    styleTags: ['earthy', 'kerala', 'heritage'],
  },
  {
    id: 'mat-floor-terracotta',
    name: 'Terracotta Tile',
    category: 'terracotta',
    baseColor: '#b3614a',
    pbr: { roughness: 0.8, metallic: 0, textureSetRef: 'terracotta_tiles', repeatScale: 900 },
    styleTags: ['earthy', 'boho', 'heritage'],
  },
  {
    id: 'mat-tile-grey',
    name: 'Grey Porcelain Tile',
    category: 'ceramicTile',
    baseColor: '#b9b9b4',
    pbr: { roughness: 0.3, metallic: 0, textureSetRef: 'tiles_porcelain', repeatScale: 600 },
    styleTags: ['minimal', 'contemporary'],
  },
  {
    id: 'mat-counter-granite',
    name: 'Black Granite',
    category: 'granite',
    baseColor: '#2d2c2a',
    pbr: { roughness: 0.25, metallic: 0.05, textureSetRef: 'granite_black', repeatScale: 800 },
    styleTags: ['kitchen', 'premium'],
  },
  {
    id: 'mat-ceiling-white',
    name: 'Ceiling White',
    category: 'paint',
    baseColor: '#f8f6f1',
    pbr: { roughness: 0.96, metallic: 0, repeatScale: 1000 },
    styleTags: ['neutral'],
  },
  {
    id: 'mat-wood-teak',
    name: 'Teak Wood',
    category: 'wood',
    baseColor: '#8a5a34',
    pbr: { roughness: 0.45, metallic: 0, textureSetRef: 'wood_teak', repeatScale: 700 },
    styleTags: ['indian-modern', 'heritage'],
  },
  {
    id: 'mat-fabric-linen',
    name: 'Natural Linen',
    category: 'fabric',
    baseColor: '#cfc4ae',
    pbr: { roughness: 0.95, metallic: 0, textureSetRef: 'fabric_linen', repeatScale: 400 },
    styleTags: ['japandi', 'minimal'],
  },
  {
    id: 'mat-fabric-emerald',
    name: 'Emerald Velvet',
    category: 'fabric',
    baseColor: '#1f5448',
    pbr: { roughness: 0.7, metallic: 0, repeatScale: 400 },
    styleTags: ['luxury', 'rajasthani'],
  },
  {
    id: 'mat-fabric-rust',
    name: 'Rust Cotton Weave',
    category: 'fabric',
    baseColor: '#a8542f',
    pbr: { roughness: 0.92, metallic: 0, repeatScale: 400 },
    styleTags: ['boho', 'rajasthani', 'earthy'],
  },
  {
    id: 'mat-cane-natural',
    name: 'Natural Cane',
    category: 'cane',
    baseColor: '#c9a86a',
    pbr: { roughness: 0.85, metallic: 0, repeatScale: 300 },
    styleTags: ['japandi', 'boho', 'indian-modern'],
  },
  {
    id: 'mat-brass-aged',
    name: 'Aged Brass',
    category: 'brass',
    baseColor: '#a98343',
    pbr: { roughness: 0.35, metallic: 0.9, repeatScale: 500 },
    styleTags: ['luxury', 'heritage', 'indian-modern'],
  },
  {
    id: 'mat-rug-wool',
    name: 'Wool Rug',
    category: 'fabric',
    baseColor: '#b9a98c',
    pbr: { roughness: 1, metallic: 0, repeatScale: 800 },
    styleTags: ['warm'],
  },
  {
    id: 'mat-stair-stone',
    name: 'Sandstone Steps',
    category: 'stone',
    baseColor: '#c8b394',
    pbr: { roughness: 0.75, metallic: 0, textureSetRef: 'stone_sandstone', repeatScale: 900 },
    styleTags: ['heritage', 'earthy'],
  },
  {
    id: 'mat-paint-terracotta',
    name: 'Terracotta Accent Paint',
    category: 'paint',
    baseColor: '#b46a4a',
    pbr: { roughness: 0.93, metallic: 0, repeatScale: 1000 },
    styleTags: ['earthy', 'boho', 'rajasthani'],
  },
];

export function libraryMaterial(id: string): Material {
  const material = MATERIAL_LIBRARY.find((m) => m.id === id);
  if (!material) throw new Error(`material library has no "${id}"`);
  return material;
}

/** A material with its nested pbr/styleTags deep-copied — never the singleton. */
export function cloneMaterial(m: Material): Material {
  return { ...m, pbr: { ...m.pbr }, styleTags: [...m.styleTags] };
}

/**
 * Fresh copies of the whole library. Seed a scene's `materials` with THIS, not
 * `[...MATERIAL_LIBRARY]` — the latter shares element references, so immer's
 * autoFreeze would deep-freeze the global singletons on the first commit.
 */
export function cloneLibrary(): Material[] {
  return MATERIAL_LIBRARY.map(cloneMaterial);
}
