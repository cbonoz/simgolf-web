/**
 * GolferAI — pure decision logic for AI golfer stroke simulation.
 *
 * Separates the "physical simulation" (where the ball goes, what
 * happens when it lands) from visual presentation (tracers, reactions,
 * sprite effects).
 *
 * All functions are pure — they only depend on game state and
 * constants, not on Phaser objects or scene references.
 *
 * BuilderScene calls these functions to compute outcomes and then
 * handles rendering via its own methods (emitShotTracer,
 * triggerGolferReaction, etc.).
 */

import { Tile, HoleConfig } from '../state/course';
import { Golfer } from '../state/golfers';
import {
  GRID_COLS,
  GRID_ROWS,
  TERRAIN_EFFECTS,
  MAX_STROKES_PER_HOLE,
} from '../utils/constants';
import { GAME_CONFIG } from '../utils/gameConfig';
import { clampTile } from '../utils/helpers';

// --- Public types -----------------------------------------------------------

export interface StrokeResult {
  landingCol: number;
  landingRow: number;
  treeHit: { col: number; row: number } | null;
}

export interface LandingResolution {
  newStrokes: number;
  newState: 'reacting' | 'hole_complete';
  stateTimer: number;
  newTilePos: { col: number; row: number };
  walkTarget: { col: number; row: number } | null;
}

export type ReactionType =
  | 'celebration'
  | 'frustration'
  | 'hole_complete_celebration'
  | 'hole_complete_pickup'
  | 'nod';

// --- Stroke computation (pure) ---------------------------------------------

/**
 * Compute where an AI golfer's shot will land.
 *
 * Factors in: distance to cup, club selection, skill, terrain lie,
 * skill modifiers, random angle/distribution error, tree collision.
 *
 * Returns the landing tile and whether a tree was hit along the way.
 */
export function computeStroke(
  golfer: Golfer,
  hole: HoleConfig | undefined,
  grid: Tile[][],
): StrokeResult {
  if (!hole?.cup) {
    // No cup — degenerate case; caller should handle
    return {
      landingCol: golfer.tilePos.col,
      landingRow: golfer.tilePos.row,
      treeHit: null,
    };
  }

  const cupPos = hole.cup;
  const currentPos = golfer.tilePos;

  const dx = cupPos.col - currentPos.col;
  const dy = cupPos.row - currentPos.row;
  const distance = Math.abs(dx) + Math.abs(dy);

  let targetDistance = pickClubDistance(distance);

  // --- Skill modifiers ---
  const hasLongDrive = golfer.skills.some(s => s.name === 'Long Drive');
  const hasPowerSwing = golfer.skills.some(s => s.name === 'Power Swing');
  const hasShortGame = golfer.skills.some(s => s.name === 'Short Game');
  const hasIronMan = golfer.skills.some(s => s.name === 'Iron Man');
  const hasWindReader = golfer.skills.some(s => s.name === 'Wind Reader');

  if (hasLongDrive) targetDistance += 2;
  if (hasPowerSwing) targetDistance += 2;
  if (hasShortGame && distance < 6) targetDistance += 2;

  // --- Terrain lie effects ---
  const currentTile = grid[currentPos.row][currentPos.col];
  const lieEffect = TERRAIN_EFFECTS[currentTile.type];

  const terrainPenalty = hasWindReader ? 0.5 : 1.0;
  const isCleanLie = currentTile.type === 'fairway' || currentTile.type === 'green';
  const lieQuality = isCleanLie
    ? 1.0
    : 1.0 - (1.0 - lieEffect.lieQuality) * terrainPenalty;
  const lieDistMod = isCleanLie
    ? 1.0
    : 1.0 - (1.0 - lieEffect.distanceModifier) * terrainPenalty;

  const accuracyBonus =
    hasIronMan && currentTile.type === 'fairway' ? 0.2 : 0;

  const errorFactor = (1 - (golfer.skill + accuracyBonus)) * (2 - lieQuality);
  const angleError =
    (Math.random() - 0.5) * 2 * Math.PI * 0.25 * errorFactor;
  const distanceError = 1 + (Math.random() - 0.5) * 0.3 * errorFactor;

  targetDistance = Math.round(targetDistance * distanceError * lieDistMod);
  targetDistance = Math.max(1, targetDistance);

  let landingCol: number;
  let landingRow: number;

  if (distance <= 1) {
    landingCol = cupPos.col;
    landingRow = cupPos.row;
  } else {
    const angle = Math.atan2(dy, dx) + angleError;
    landingCol = Math.round(currentPos.col + Math.cos(angle) * targetDistance);
    landingRow = Math.round(currentPos.row + Math.sin(angle) * targetDistance);
  }

  const clamped = clampTile(landingCol, landingRow, GRID_COLS, GRID_ROWS);
  landingCol = clamped.col;
  landingRow = clamped.row;

  // --- Tree collision: trace flight path tile-by-tile ---
  const treeHit = traceFlightPath(
    currentPos.col,
    currentPos.row,
    landingCol,
    landingRow,
    grid,
  );

  if (treeHit) {
    const deflected = computeTreeDeflection(
      treeHit,
      currentPos,
      landingCol,
      landingRow,
      grid,
    );
    landingCol = deflected.col;
    landingRow = deflected.row;
  }

  return { landingCol, landingRow, treeHit };
}

// --- Club selection (pure) -------------------------------------------------

/**
 * Pick a target distance for the golfer's shot based on remaining
 * distance to the cup. Simulates rough club selection.
 */
export function pickClubDistance(distanceToCup: number): number {
  if (distanceToCup >= 15) return 8;
  if (distanceToCup >= 10) return 6;
  if (distanceToCup >= 6) return 4;
  if (distanceToCup >= 3) return 2;
  return 1;
}

// --- Flight path tracing (pure) --------------------------------------------

/**
 * Trace a line from (c1,r1) to (c2,r2) using Bresenham's line algorithm.
 * Returns the {col, row} of the LAST passable tile before a tree tile,
 * or null if no tree is in the path.
 */
export function traceFlightPath(
  c1: number,
  r1: number,
  c2: number,
  r2: number,
  grid: Tile[][],
): { col: number; row: number } | null {
  let lastGood: { col: number; row: number } | null = null;
  const dx = Math.abs(c2 - c1);
  const dy = Math.abs(r2 - r1);
  const sx = c1 < c2 ? 1 : -1;
  const sy = r1 < r2 ? 1 : -1;
  let err = dx - dy;
  let cx = c1;
  let ry = r1;

  while (cx !== c2 || ry !== r2) {
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; cx += sx; }
    if (e2 < dx) { err += dx; ry += sy; }

    if (cx < 0 || cx >= GRID_COLS || ry < 0 || ry >= GRID_ROWS) break;

    const tile = grid[ry][cx];
    if (tile.type === 'trees') {
      return lastGood ?? { col: c1, row: r1 };
    }
    lastGood = { col: cx, row: ry };
  }
  return null;
}

// --- Tree deflection (pure) -------------------------------------------------

/**
 * When a ball hits a tree, compute a deflection to an adjacent
 * non-tree, non-water tile. If no valid deflection exists, fall back
 * to the tree tile itself.
 */
export function computeTreeDeflection(
  treeHit: { col: number; row: number },
  currentPos: { col: number; row: number },
  _originalLandingCol: number,
  _originalLandingRow: number,
  grid: Tile[][],
): { col: number; row: number } {
  const dirCol = Math.sign(_originalLandingCol - currentPos.col) || 1;
  const dirRow = Math.sign(_originalLandingRow - currentPos.row) || 1;

  const candidates: [number, number][] = [];
  const addDir = (dc: number, dr: number) => {
    const nc = treeHit.col + dc;
    const nr = treeHit.row + dr;
    if (
      nc >= 0 &&
      nc < GRID_COLS &&
      nr >= 0 &&
      nr < GRID_ROWS &&
      grid[nr][nc].type !== 'trees' &&
      grid[nr][nc].type !== 'water'
    ) {
      candidates.push([nc, nr]);
    }
  };

  if (dirCol !== 0 && dirRow !== 0) {
    addDir(dirCol, 0);
    addDir(0, dirRow);
    addDir(-dirCol, dirRow);
    addDir(dirCol, -dirRow);
  } else if (dirCol !== 0) {
    addDir(dirCol, 1);
    addDir(dirCol, -1);
    addDir(0, 1);
    addDir(0, -1);
  } else {
    addDir(1, dirRow);
    addDir(-1, dirRow);
    addDir(1, 0);
    addDir(-1, 0);
  }

  if (candidates.length > 0) {
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    return { col: pick[0], row: pick[1] };
  }

  // Fallback: land at the tree tile
  return { col: treeHit.col, row: treeHit.row };
}

// --- Landing resolution (pure) ----------------------------------------------

/**
 * Given a landing tile and golfer state, determine:
 * - Did the golfer hole out? (green + within putt range)
 * - Did they hit water or trees? (deflect back)
 * - Otherwise, they land on the tile.
 *
 * Returns the updated state properties without mutating anything.
 */
export function resolveLanding(
  landingCol: number,
  landingRow: number,
  previousPos: { col: number; row: number },
  golfer: Pick<Golfer, 'strokes' | 'skills' | 'id' | 'skill'>,
  grid: Tile[][],
  cupPos: { col: number; row: number } | undefined,
): LandingResolution {
  const tile = grid[landingRow][landingCol];

  let newStrokes = golfer.strokes + 1;
  let newState: 'reacting' | 'hole_complete' = 'reacting';
  let stateTimer: number = GAME_CONFIG.BALL_LAND_REACT_TIME;
  let newTilePos = { col: landingCol, row: landingRow };

  if (tile.type === 'water') {
    newStrokes += 1;
    newTilePos = { ...previousPos };
    stateTimer = GAME_CONFIG.WATER_REACT_TIME;
  } else if (tile.type === 'sand') {
    // Sand hazard: penalty stroke but ball stays in the sand
    newStrokes += 1;
    stateTimer = GAME_CONFIG.SAND_REACT_TIME;
  } else if (tile.type === 'trees') {
    newTilePos = { ...previousPos };
    stateTimer = GAME_CONFIG.TREE_REACT_TIME;
  } else if (tile.type === 'green' && cupPos) {
    const distToCup =
      Math.abs(landingCol - cupPos.col) +
      Math.abs(landingRow - cupPos.row);
    const puttBonus = golfer.skills.some(s => s.name === 'Accurate Putter')
      ? 1.5
      : 1.0;
    const puttRange = Math.max(1, Math.round(golfer.skill * 3 * puttBonus));

    if (distToCup <= puttRange) {
      newTilePos = { col: cupPos.col, row: cupPos.row };
      newState = 'hole_complete';
      stateTimer = GAME_CONFIG.HOLE_OUT_TIME;
    }
  }

  if (newStrokes >= MAX_STROKES_PER_HOLE) {
    newState = 'hole_complete';
    stateTimer = GAME_CONFIG.MAX_STROKES_TIME;
  }

  return {
    newStrokes,
    newState,
    stateTimer,
    newTilePos,
    walkTarget: newState === 'reacting' ? newTilePos : null,
  };
}

// --- Reaction determination (pure) ------------------------------------------

/**
 * Determine what kind of visual reaction the golfer should have
 * based on the shot outcome and current state.
 */
export function determineReaction(
  tileType: string,
  newStrokes: number,
  par: number,
  nextState: string,
): ReactionType {
  if (nextState === 'hole_complete') {
    if (newStrokes <= par - 2 || newStrokes === 1) return 'hole_complete_celebration';
    if (newStrokes <= par) return 'celebration';
    return 'hole_complete_pickup';
  }

  if (tileType === 'water' || tileType === 'sand' || tileType === 'trees') return 'frustration';
  if (newStrokes >= MAX_STROKES_PER_HOLE - 1) return 'frustration';

  if (newStrokes + 1 <= par - 1) return 'celebration';
  if (newStrokes + 1 <= par) return 'nod';

  return 'frustration';
}
