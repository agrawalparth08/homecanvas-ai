/**
 * Natural-language vocabulary for the MockAgentProvider (Phase 4).
 * Maps phrases in a user message to colours, library materials, style packs,
 * and rooms in the scene. Longest-match wins so "grey marble" beats "marble".
 */
import type { HomeScene, Room } from '../scene/schemas';

export const COLORS: Record<string, string> = {
  'sage green': '#9caf88', sage: '#a8b89a', 'forest green': '#335a3a', olive: '#7a7d42', green: '#5a7d54',
  white: '#f3f3f1', 'warm white': '#f4efe6', 'off white': '#f0ece2', cream: '#efe6d2',
  charcoal: '#36393f', black: '#1f2024', grey: '#9aa0a6', gray: '#9aa0a6', 'light grey': '#c4c8cc',
  beige: '#e7dcc8', tan: '#c9a86a', brown: '#6b4a32',
  navy: '#2c3e57', 'powder blue': '#bcd2e0', 'sky blue': '#9cc3e0', blue: '#5b7fa6', teal: '#2b8a86',
  terracotta: '#b3614a', rust: '#a8542f', mustard: '#c9a227', ochre: '#c98a2b',
  blush: '#d8a0a8', pink: '#d8a0a8', lavender: '#b9a7cf', plum: '#6e4a6b',
};

// material keyword -> library material id (most specific first when matched longest)
export const MATERIALS: Record<string, string> = {
  'grey marble': 'mat-floor-marble-grey', 'gray marble': 'mat-floor-marble-grey',
  'ivory marble': 'mat-floor-marble-ivory', marble: 'mat-floor-marble-ivory',
  walnut: 'mat-floor-walnut', oak: 'mat-floor-oak', teak: 'mat-wood-teak',
  'matt tile': 'mat-tile-grey-matt', 'matte tile': 'mat-tile-grey-matt',
  'grey tile': 'mat-tile-grey', porcelain: 'mat-tile-grey', tile: 'mat-tile-grey',
  terracotta: 'mat-floor-terracotta', kota: 'mat-floor-kota', stone: 'mat-floor-kota',
  granite: 'mat-counter-granite', limewash: 'mat-limewash-sand', 'beige paint': 'mat-paint-beige',
};

// furniture noun -> catalog key (longest match wins: "coffee table" > "table")
export const FURNITURE: Record<string, string> = {
  'coffee table': 'coffeeTable', 'dining table': 'diningTable', 'tv unit': 'tvUnit', 'tv stand': 'tvUnit',
  'pooja unit': 'poojaUnit', pooja: 'poojaUnit', mandir: 'poojaUnit',
  'book shelf': 'bookshelf', bookshelf: 'bookshelf', 'console table': 'console', console: 'console',
  wardrobe: 'wardrobe', almirah: 'wardrobe', 'king bed': 'kingBed', 'double bed': 'bed', bed: 'bed',
  sofa: 'sofa', couch: 'sofa', loveseat: 'loveseat', settee: 'loveseat',
  armchair: 'armchair', 'arm chair': 'armchair', chair: 'chair', table: 'diningTable',
  rug: 'rug', carpet: 'rug', plant: 'plant',
};

export const STYLE_PACK_ALIASES: Record<string, string> = {
  'indian modern': 'indian-modern',
  rajasthani: 'rajasthani-heritage', heritage: 'rajasthani-heritage',
  japandi: 'fusion-japandi', fusion: 'fusion-japandi',
  'warm minimal': 'warm-minimal', minimal: 'warm-minimal',
  'contemporary luxury': 'contemporary-luxury', luxury: 'contemporary-luxury', contemporary: 'contemporary-luxury',
  // P5: 7 added packs (12 total)
  'coastal kerala': 'coastal-kerala', kerala: 'coastal-kerala', coastal: 'coastal-kerala', backwater: 'coastal-kerala',
  'goan portuguese': 'goan-portuguese', goan: 'goan-portuguese', portuguese: 'goan-portuguese', azulejo: 'goan-portuguese',
  'chettinad heritage': 'chettinad-heritage', chettinad: 'chettinad-heritage', athangudi: 'chettinad-heritage',
  'modern farmhouse': 'modern-farmhouse', farmhouse: 'modern-farmhouse',
  'scandinavian light': 'scandinavian-light', scandinavian: 'scandinavian-light', nordic: 'scandinavian-light', scandi: 'scandinavian-light', hygge: 'scandinavian-light',
  'mid century modern': 'mid-century-modern', 'mid-century': 'mid-century-modern', 'mid century': 'mid-century-modern', mcm: 'mid-century-modern', retro: 'mid-century-modern',
  'monochrome luxe': 'monochrome-luxe', monochrome: 'monochrome-luxe', monochromatic: 'monochrome-luxe', 'black and white': 'monochrome-luxe',
};

function longestMatch(text: string, table: Record<string, string>): { phrase: string; value: string } | null {
  const t = text.toLowerCase();
  let best: { phrase: string; value: string } | null = null;
  for (const [phrase, value] of Object.entries(table)) {
    if (t.includes(phrase) && (!best || phrase.length > best.phrase.length)) best = { phrase, value };
  }
  return best;
}

export const resolveColor = (t: string) => longestMatch(t, COLORS);
export const resolveMaterial = (t: string) => longestMatch(t, MATERIALS);
export const resolveStylePack = (t: string) => longestMatch(t, STYLE_PACK_ALIASES);
export const resolveFurniture = (t: string) => longestMatch(t, FURNITURE);

/** Find the room a message refers to (by room name, longest match). */
export function resolveRoom(text: string, scene: HomeScene): Room | null {
  const t = text.toLowerCase();
  let best: { room: Room; len: number } | null = null;
  for (const floor of scene.floors) {
    for (const room of floor.rooms) {
      const name = room.name.toLowerCase();
      // match full name, or any significant word of it (>=4 chars)
      const words = name.split(/[^a-z0-9]+/).filter((w) => w.length >= 4);
      const hit = t.includes(name) ? name.length : words.some((w) => t.includes(w)) ? Math.max(...words.filter((w) => t.includes(w)).map((w) => w.length)) : 0;
      if (hit > 0 && (!best || hit > best.len)) best = { room, len: hit };
    }
  }
  return best?.room ?? null;
}

export const wantsWholeHome = (t: string) => /\b(whole|entire|all\s+rooms?|everywhere|every\s+room|the\s+home|whole\s+house)\b/i.test(t);
