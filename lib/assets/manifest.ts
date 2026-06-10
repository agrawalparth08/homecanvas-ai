/**
 * Curated CC0 asset manifest (Poly Haven — CC0, personal & commercial safe).
 * `scripts/fetch-assets.ts` resolves each slug through the Poly Haven API and
 * downloads into the gitignored /asset-cache/. Everything in the app degrades
 * gracefully when a set (or the whole cache) is missing — materials fall back
 * to flat PBR colors and the environment falls back to procedural lightformers.
 */

export interface CuratedTexture {
  /** Key used by Material.pbr.textureSetRef. */
  key: string;
  /** Poly Haven asset slug. */
  slug: string;
}

export interface CuratedHdri {
  key: string;
  slug: string;
  resolution: '1k' | '2k';
}

export const CURATED_HDRIS: CuratedHdri[] = [
  { key: 'interior_day', slug: 'lebombo', resolution: '2k' },
  { key: 'sunset', slug: 'venice_sunset', resolution: '2k' },
];

export const CURATED_TEXTURES: CuratedTexture[] = [
  { key: 'wood_floor_oak', slug: 'wood_floor_deck' },
  { key: 'wood_floor_walnut', slug: 'dark_wood' },
  { key: 'wood_teak', slug: 'fine_grained_wood' },
  { key: 'marble_ivory', slug: 'marble_01' },
  { key: 'tiles_porcelain', slug: 'large_floor_tiles_02' },
  { key: 'terracotta_tiles', slug: 'clay_floor_001' },
  { key: 'stone_kota', slug: 'slate_floor_02' },
  { key: 'stone_sandstone', slug: 'sandstone_blocks_05' },
  { key: 'plaster_rough', slug: 'clay_plaster' },
  { key: 'granite_black', slug: 'granite_tile' },
  { key: 'fabric_linen', slug: 'rough_linen' },
];

export interface DownloadedTextureSet {
  key: string;
  slug: string;
  maps: {
    diffuse?: string;
    normal?: string;
    roughness?: string;
    arm?: string;
  };
}

export interface AssetCacheManifest {
  schemaVersion: 1;
  downloadedAt: string;
  hdris: Record<string, { file: string; slug: string }>;
  textures: Record<string, DownloadedTextureSet>;
}

export const EMPTY_ASSET_MANIFEST: AssetCacheManifest = {
  schemaVersion: 1,
  downloadedAt: '',
  hdris: {},
  textures: {},
};
