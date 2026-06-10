import type { MaterialSpec, StylePack } from '../scene/schemas';

const paint = (name: string, color: string, tags: string[]): MaterialSpec => ({
  name,
  category: 'paint',
  baseColor: color,
  pbr: { roughness: 0.93, metallic: 0, repeatScale: 1000 },
  styleTags: tags,
});

/**
 * Phase 1 ships these five; the full set of twelve arrives in Phase 5.
 * Packs reference asset-cache texture keys; everything degrades to flat
 * PBR colors when textures aren't downloaded.
 */
export const STYLE_PACKS: StylePack[] = [
  {
    id: 'indian-modern',
    name: 'Indian Modern',
    description: 'Clean contemporary lines with warm Indian materiality — teak, brass, ivory marble.',
    palette: ['#f4efe6', '#8a5a34', '#a98343', '#1f3a36', '#b46a4a'],
    wallPaint: paint('Ivory Silk', '#f1ece1', ['indian-modern']),
    accentWall: paint('Deep Teal Accent', '#1f3a36', ['indian-modern']),
    floorMaterial: {
      name: 'Ivory Marble',
      category: 'marble',
      baseColor: '#e9e4da',
      pbr: { roughness: 0.18, metallic: 0, textureSetRef: 'marble_ivory', repeatScale: 1200 },
      styleTags: ['indian-modern'],
    },
    wetFloorMaterial: {
      name: 'Grey Porcelain',
      category: 'ceramicTile',
      baseColor: '#b9b9b4',
      pbr: { roughness: 0.3, metallic: 0, textureSetRef: 'tiles_porcelain', repeatScale: 600 },
      styleTags: ['indian-modern'],
    },
    furnitureFamilies: ['teak-frame', 'brass-detail', 'linen-upholstery'],
    lightingNotes: 'Warm 2700K, brass pendant over dining, recessed wash on accent wall.',
    textileNotes: 'Raw silk cushions, handloom cotton drapes in ivory and teal.',
    decorElements: ['brass urli', 'block-print art', 'potted plants'],
    budgetTier: 'moderate',
    reasoning:
      'Marble + teak + brass reads premium-Indian without ornamentation; teal accent anchors the living wall.',
    roomOverrides: {
      kitchen: {
        floorMaterial: {
          name: 'Grey Porcelain',
          category: 'ceramicTile',
          baseColor: '#b9b9b4',
          pbr: { roughness: 0.3, metallic: 0, textureSetRef: 'tiles_porcelain', repeatScale: 600 },
          styleTags: ['indian-modern'],
        },
      },
    },
  },
  {
    id: 'rajasthani-heritage',
    name: 'Rajasthani Heritage',
    description: 'Jaipur havelis — lime plaster, sandstone, jharokha arches, deep jewel textiles.',
    palette: ['#ddd0b8', '#b3614a', '#1f5448', '#a98343', '#7a2e2e'],
    wallPaint: {
      name: 'Sand Limewash',
      category: 'limewash',
      baseColor: '#ddd0b8',
      pbr: { roughness: 0.97, metallic: 0, textureSetRef: 'plaster_rough', repeatScale: 1500 },
      styleTags: ['rajasthani-heritage'],
    },
    accentWall: paint('Madder Red Accent', '#7a2e2e', ['rajasthani-heritage']),
    floorMaterial: {
      name: 'Sandstone',
      category: 'stone',
      baseColor: '#c8b394',
      pbr: { roughness: 0.75, metallic: 0, textureSetRef: 'stone_sandstone', repeatScale: 900 },
      styleTags: ['rajasthani-heritage'],
    },
    furnitureFamilies: ['carved-wood', 'inlay-work', 'jewel-velvet'],
    lightingNotes: 'Pierced-metal lanterns, warm pools of light, candle-scale at night.',
    textileNotes: 'Bandhani and leheriya silks, emerald and madder velvets, kilim dhurries.',
    decorElements: ['jaali screen', 'miniature paintings', 'blue pottery'],
    budgetTier: 'premium',
    reasoning: 'Limewash + sandstone is the authentic haveli base; jewel textiles carry the drama.',
  },
  {
    id: 'fusion-japandi',
    name: 'Fusion Japandi',
    description: 'Japanese restraint meets Indian craft — oak, cane, beige walls, linen.',
    palette: ['#e7dcc8', '#b08a5e', '#c9a86a', '#5b5a52', '#cfc4ae'],
    wallPaint: paint('Soft Beige', '#e7dcc8', ['fusion-japandi']),
    floorMaterial: {
      name: 'Warm Oak',
      category: 'wood',
      baseColor: '#b08a5e',
      pbr: { roughness: 0.55, metallic: 0, textureSetRef: 'wood_floor_oak', repeatScale: 1400 },
      styleTags: ['fusion-japandi'],
    },
    furnitureFamilies: ['low-profile-oak', 'cane-accent', 'linen-upholstery'],
    lightingNotes: 'Diffuse paper-shade pendants, 3000K, nothing glossy.',
    textileNotes: 'Undyed linen, khadi throws, single indigo accent.',
    decorElements: ['cane screen', 'ikebana-style stems', 'stoneware'],
    budgetTier: 'moderate',
    reasoning: "Cane is the bridge: Japandi's negative space with Indian craft warmth.",
  },
  {
    id: 'warm-minimal',
    name: 'Warm Minimal',
    description: 'Quiet, decluttered, sunlit — warm whites, pale oak, soft textures.',
    palette: ['#f4efe6', '#d9cdb8', '#b08a5e', '#9c9587', '#6e6759'],
    wallPaint: paint('Warm White', '#f4efe6', ['warm-minimal']),
    floorMaterial: {
      name: 'Pale Oak',
      category: 'wood',
      baseColor: '#c39e72',
      pbr: { roughness: 0.6, metallic: 0, textureSetRef: 'wood_floor_oak', repeatScale: 1400 },
      styleTags: ['warm-minimal'],
    },
    furnitureFamilies: ['soft-curves', 'boucle', 'light-wood'],
    lightingNotes: 'Indirect coves, one sculptural floor lamp per room.',
    textileNotes: 'Boucle, washed cotton, tonal layering — no pattern.',
    decorElements: ['single large artwork', 'ceramic vessels'],
    budgetTier: 'budget',
    reasoning: 'Fewest moves, maximum calm; works with existing furniture silhouettes.',
  },
  {
    id: 'contemporary-luxury',
    name: 'Contemporary Luxury',
    description: 'Hotel-suite polish — walnut, marble, bronze, layered lighting.',
    palette: ['#e9e4da', '#6b4a32', '#2d2c2a', '#a98343', '#44423d'],
    wallPaint: paint('Greige Silk', '#e3ddd2', ['contemporary-luxury']),
    accentWall: {
      name: 'Walnut Panelling',
      category: 'wood',
      baseColor: '#6b4a32',
      pbr: { roughness: 0.4, metallic: 0, textureSetRef: 'wood_floor_walnut', repeatScale: 900 },
      styleTags: ['contemporary-luxury'],
    },
    floorMaterial: {
      name: 'Ivory Marble',
      category: 'marble',
      baseColor: '#e9e4da',
      pbr: { roughness: 0.15, metallic: 0, textureSetRef: 'marble_ivory', repeatScale: 1400 },
      styleTags: ['contemporary-luxury'],
    },
    furnitureFamilies: ['walnut-veneer', 'bronze-detail', 'velvet'],
    lightingNotes: 'Layered: cove + picture lights + dimmable pendants, 2700K.',
    textileNotes: 'Velvet, high-thread cotton, silk-wool rugs.',
    decorElements: ['smoked-glass decor', 'sculptural lighting', 'large mirrors'],
    budgetTier: 'premium',
    reasoning: 'Walnut-against-marble contrast plus layered light is the suite formula.',
  },
];

export function getStylePack(id: string): StylePack {
  const pack = STYLE_PACKS.find((p) => p.id === id);
  if (!pack) throw new Error(`unknown style pack "${id}"`);
  return pack;
}
