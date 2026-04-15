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

// Game settings
export const MAX_STROKES_PER_HOLE = 10;
export const MAX_GOLFERS_ON_COURSE = 12;
export const STARTING_MONEY = 5000;

// Day cycle
export const DAY_LENGTH_SECONDS = 360; // 6 minutes real time = 1 day at 1x speed
export const TIME_SCALE_MULTIPLIER = 1; // 1 game minute = 1 real second at 1x
