import { GRID_COLS, GRID_ROWS, TILE_WIDTH, TILE_HEIGHT } from '../utils/constants';
import { tileToScreen, screenToTile, clampTile } from '../utils/helpers';
import * as Phaser from 'phaser';

/**
 * Handles coordinate conversion between screen and isometric tile space,
 * accounting for camera position and zoom.
 */
export class IsoTransform {
  private scene: Phaser.Scene;
  private offsetX: number;
  private offsetY: number;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    // Center the grid horizontally, offset from top
    this.offsetX = 0;
    this.offsetY = 0;
    this.recalculateOffset();
  }

  /** Recalculate offset to center the grid on screen */
  recalculateOffset(): void {
    const cam = this.scene.cameras.main;
    // Top-left tile of the grid in screen coords
    // We want the grid centered in the world
    this.offsetX = (GRID_COLS * TILE_WIDTH) / 2;
    this.offsetY = TILE_HEIGHT * 2; // Some top padding
  }

  /** Tile (col, row) → world position (for placing sprites) */
  tileToWorld(col: number, row: number): { x: number; y: number } {
    return tileToScreen(col, row, this.offsetX, this.offsetY);
  }

  /** World position → nearest tile (for input) */
  worldToTile(worldX: number, worldY: number): { col: number; row: number } {
    const result = screenToTile(worldX, worldY, this.offsetX, this.offsetY);
    return clampTile(result.col, result.row, GRID_COLS, GRID_ROWS);
  }

  /** Screen position (pointer) → nearest tile, accounting for camera */
  screenToTileWorld(pointerX: number, pointerY: number): { col: number; row: number } {
    const cam = this.scene.cameras.main;
    const worldX = pointerX + cam.scrollX;
    const worldY = pointerY + cam.scrollY;
    // Account for zoom
    const zoom = cam.zoom;
    const adjustedX = (worldX - cam.width / 2) / zoom + cam.width / 2;
    const adjustedY = (worldY - cam.height / 2) / zoom + cam.height / 2;
    return this.worldToTile(adjustedX, adjustedY);
  }

  getOffset(): { x: number; y: number } {
    return { x: this.offsetX, y: this.offsetY };
  }
}
