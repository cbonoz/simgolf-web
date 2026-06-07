import { TILE_WIDTH, TILE_HEIGHT } from './constants';

/**
 * Convert isometric tile coordinates to screen coordinates.
 * (0,0) tile maps to center-top of the grid.
 */
export function tileToScreen(col: number, row: number, offsetX = 0, offsetY = 0): { x: number; y: number } {
  const x = (col - row) * (TILE_WIDTH / 2) + offsetX;
  const y = (col + row) * (TILE_HEIGHT / 2) + offsetY;
  return { x, y };
}

/**
 * Convert screen coordinates to isometric tile coordinates.
 * Returns fractional tile coordinates — use Math.round for nearest tile.
 */
export function screenToTile(screenX: number, screenY: number, offsetX = 0, offsetY = 0): { col: number; row: number } {
  const sx = screenX - offsetX;
  const sy = screenY - offsetY;
  const col = (sx / (TILE_WIDTH / 2) + sy / (TILE_HEIGHT / 2)) / 2;
  const row = (sy / (TILE_HEIGHT / 2) - sx / (TILE_WIDTH / 2)) / 2;
  return { col, row };
}

/**
 * Clamp tile coordinates to grid bounds.
 */
export function clampTile(
  col: number,
  row: number,
  maxCols: number,
  maxRows: number
): { col: number; row: number } {
  return {
    col: Math.max(0, Math.min(maxCols - 1, Math.round(col))),
    row: Math.max(0, Math.min(maxRows - 1, Math.round(row))),
  };
}

/**
 * Calculate par for a hole based on Manhattan distance from tee to cup.
 */
export function calculatePar(distance: number): number {
  if (distance <= 3) return 2;   // Par 2
  if (distance <= 8) return 3;   // Par 3
  if (distance <= 14) return 4;  // Par 4
  return 5;                       // Par 5
}

/**
 * Compute total par for all configured holes (those with both tee and cup).
 */
export function totalCoursePar(holes: { tee: unknown; cup: unknown; par: number }[]): number {
  return holes
    .filter((h) => h.tee && h.cup)
    .reduce((sum, h) => sum + h.par, 0);
}

/**
 * Count how many holes are fully configured (tee + cup).
 */
export function countConfiguredHoles(holes: { tee: unknown; cup: unknown }[]): number {
  return holes.filter((h) => h.tee && h.cup).length;
}

/**
 * Format a score relative to par.
 * Returns "E" for even, "-N" for under par, "+N" for over par.
 */
export function formatVsPar(diff: number): string {
  if (diff === 0) return 'E';
  if (diff < 0) return `${diff}`;
  return `+${diff}`;
}

/**
 * Return a CSS color string for a score relative to par.
 * Green for under par, white for par, yellow for bogey, orange for double, red for worse.
 */
export function vsParColor(diff: number): string {
  if (diff <= -2) return '#2ecc71';   // Eagle or better — bright green
  if (diff === -1) return '#7dcea0';   // Birdie — light green
  if (diff === 0) return '#ffffff';    // Par — white
  if (diff === 1) return '#f1c40f';    // Bogey — yellow
  if (diff === 2) return '#e67e22';    // Double bogey — orange
  return '#e74c3c';                     // Triple+ — red
}

// === Skill tier system — visible labels for golfer skill levels ===

export interface SkillTier {
  label: string;
  emoji: string;
  color: string;   // CSS color for display
  dotColor: number; // Phaser hex color for sprite indicator
}

/**
 * Map a golfer's skill value (0.0–1.0) to a named tier.
 * Tiers help players quickly identify a golfer's approximate ability.
 */
export function getSkillTier(skill: number): SkillTier {
  if (skill >= 0.85) return { label: 'Champion', emoji: '🏆', color: '#ffd700', dotColor: 0xffd700 };
  if (skill >= 0.7)  return { label: 'Pro',      emoji: '⛳', color: '#4ade80', dotColor: 0x4ade80 };
  if (skill >= 0.55) return { label: 'Amateur',  emoji: '🏌️', color: '#60a5fa', dotColor: 0x60a5fa };
  if (skill >= 0.4)  return { label: 'Hacker',   emoji: '🎲', color: '#fbbf24', dotColor: 0xfbbf24 };
  return { label: 'Beginner', emoji: '🌱', color: '#a78bfa', dotColor: 0xa78bfa };
}

// === Course composition stats — used for course rating display ===

export interface CourseStats {
  holesConfigured: number;
  totalPar: number;
  waterTiles: number;
  sandTiles: number;
  decorBuildings: number;
  revenueBuildings: number;
}

/**
 * Compute course composition statistics from the current grid and buildings.
 * Used to display course difficulty, variety, and rating.
 */
export function computeCourseStats(
  grid: { type: string }[][],
  holes: { tee: unknown; cup: unknown; par: number }[],
  buildings: { typeKey: string }[],
): CourseStats {
  let waterTiles = 0;
  let sandTiles = 0;
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < (grid[r]?.length ?? 0); c++) {
      const t = grid[r][c];
      if (t?.type === 'water') waterTiles++;
      else if (t?.type === 'sand') sandTiles++;
    }
  }

  const holesConfigured = holes.filter((h) => h.tee && h.cup).length;
  const totalPar = totalCoursePar(holes);
  const decorBuildings = buildings.filter((b) =>
    ['bench', 'fountain', 'garden'].includes(b.typeKey),
  ).length;
  const revenueBuildings = buildings.filter((b) =>
    ['clubhouse', 'shop', 'snack_bar'].includes(b.typeKey),
  ).length;

  return { holesConfigured, totalPar, waterTiles, sandTiles, decorBuildings, revenueBuildings };
}

/**
 * Compute a 1-5 star course rating based on variety and hazards.
 * More variety + appropriate hazards = higher rating.
 * Returns a float 1.0–5.0.
 */
export function computeCourseRating(stats: CourseStats): number {
  if (stats.holesConfigured === 0) return 1.0;

  let score = 2.0;

  // Holes configured — more is better
  if (stats.holesConfigured >= 8) score += 1.5;
  else if (stats.holesConfigured >= 5) score += 1.0;
  else if (stats.holesConfigured >= 3) score += 0.5;

  // Water hazards add challenge (but too many hurts)
  if (stats.waterTiles >= 5 && stats.waterTiles <= 20) score += 0.5;
  else if (stats.waterTiles > 0 && stats.waterTiles < 5) score += 0.3;
  else if (stats.waterTiles > 20) score += 0.1;

  // Sand hazards
  if (stats.sandTiles >= 5 && stats.sandTiles <= 15) score += 0.5;
  else if (stats.sandTiles > 0 && stats.sandTiles < 5) score += 0.3;

  // Decor buildings add beauty
  if (stats.decorBuildings >= 3) score += 0.5;
  else if (stats.decorBuildings >= 1) score += 0.3;

  // Par variety (not all par-3s)
  if (stats.totalPar > stats.holesConfigured * 3) score += 0.3;

  return Math.max(1.0, Math.min(5.0, Math.round(score * 2) / 2));
}
