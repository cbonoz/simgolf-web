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
    // Offset so the grid is centered in the world
    // tileToWorld(0,0) gives the top corner of the diamond grid
    // tileToWorld(COLS-1, ROWS-1) gives the bottom
    // We need x to be positive for all tiles, so offset by the leftmost point
    // Leftmost tile is (col-0, row=ROWS-1): x = (0 - (ROWS-1)) * (TILE_WIDTH/2)
    this.offsetX = (GRID_ROWS - 1) * (TILE_WIDTH / 2) + 100; // 100px padding
    this.offsetY = 100; // top padding
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

  /** Get the center of the grid in world coordinates */
  getGridCenter(): { x: number; y: number } {
    const topLeft = this.tileToWorld(0, 0);
    const topRight = this.tileToWorld(GRID_COLS - 1, 0);
    const bottomLeft = this.tileToWorld(0, GRID_ROWS - 1);
    const bottomRight = this.tileToWorld(GRID_COLS - 1, GRID_ROWS - 1);
    return {
      x: (topLeft.x + topRight.x + bottomLeft.x + bottomRight.x) / 4,
      y: (topLeft.y + topRight.y + bottomLeft.y + bottomRight.y) / 4,
    };
  }

  /** Get the world bounds that encompass the entire grid */
  getWorldBounds(): { x: number; y: number; width: number; height: number } {
    const topLeft = this.tileToWorld(0, 0);
    const topRight = this.tileToWorld(GRID_COLS - 1, 0);
    const bottomLeft = this.tileToWorld(0, GRID_ROWS - 1);
    const bottomRight = this.tileToWorld(GRID_COLS - 1, GRID_ROWS - 1);

    const minX = Math.min(topLeft.x, bottomLeft.x) - 100;
    const minY = Math.min(topLeft.y, topRight.y) - 100;
    const maxX = Math.max(topRight.x, bottomRight.x) + 100;
    const maxY = Math.max(bottomLeft.y, bottomRight.y) + 100;

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  getOffset(): { x: number; y: number } {
    return { x: this.offsetX, y: this.offsetY };
  }
}
