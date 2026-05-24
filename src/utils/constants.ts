// Grid dimensions
export const GRID_COLS = 40;
export const GRID_ROWS = 30;

// Isometric tile dimensions (diamond: width = 2× height)
export const TILE_WIDTH = 64;
export const TILE_HEIGHT = 32;

// Terrain types
export type TerrainType = 'fairway' | 'rough' | 'sand' | 'water' | 'trees' | 'green';

export const TERRAIN_TYPES: TerrainType[] = ['fairway', 'rough', 'sand', 'water', 'trees', 'green'];

// Terrain costs
export const TERRAIN_COST: Record<TerrainType, number> = {
  fairway: 5,
  rough: 2,
  sand: 8,
  water: 50,
  trees: 15,
  green: 25,
};

// Terrain colors (for procedural generation)
export const TERRAIN_COLORS: Record<TerrainType, number> = {
  fairway: 0x4a8f3f,
  rough: 0x6b7c3e,
  sand: 0xd4b96a,
  water: 0x3a7ecf,
  trees: 0x2d5a27,
  green: 0x5cb85c,
};

// Vegetation / Foliage types (sprite key, display name, cost)
export interface VegetationType {
  key: string;
  name: string;
  cost: number;
  category: string;
}

export const VEGETATION_TYPES: VegetationType[] = [
  // Big trees (premium)
  { key: 'bigtree01', name: 'Oak', cost: 50, category: 'Tree' },
  { key: 'bigtree02', name: 'Elm', cost: 45, category: 'Tree' },
  { key: 'bigtree03', name: 'Maple', cost: 40, category: 'Tree' },
  // Pines
  { key: 'pine-full01', name: 'Pine A', cost: 30, category: 'Pine' },
  { key: 'pine-full02', name: 'Pine B', cost: 28, category: 'Pine' },
  { key: 'pine-half01', name: 'Snow Pine', cost: 35, category: 'Pine' },
  // Palms
  { key: 'palm01', name: 'Palm A', cost: 25, category: 'Palm' },
  { key: 'palm02', name: 'Palm B', cost: 22, category: 'Palm' },
  // Bushes
  { key: 'bush01', name: 'Bush A', cost: 10, category: 'Bush' },
  { key: 'bush02', name: 'Bush B', cost: 12, category: 'Bush' },
  { key: 'bush03', name: 'Bush C', cost: 8, category: 'Bush' },
  // Grasses & ground cover
  { key: 'grasses01', name: 'Grass A', cost: 3, category: 'Grass' },
  { key: 'grasses02', name: 'Grass B', cost: 4, category: 'Grass' },
  { key: 'weed01', name: 'Weeds', cost: 2, category: 'Grass' },
  // Bamboo
  { key: 'bamboo01', name: 'Bamboo', cost: 15, category: 'Bamboo' },
  // Cactus
  { key: 'cactus01', name: 'Cactus', cost: 18, category: 'Cactus' },
];

// Game settings
export const MAX_STROKES_PER_HOLE = 10;
export const MAX_GOLFERS_ON_COURSE = 12;
export const STARTING_MONEY = 5000;

// Day cycle
export const DAY_LENGTH_SECONDS = 360; // 6 minutes real time = 1 day at 1x speed
export const TIME_SCALE_MULTIPLIER = 1; // 1 game minute = 1 real second at 1x
