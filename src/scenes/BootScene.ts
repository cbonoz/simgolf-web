import * as Phaser from 'phaser';
import { TILE_WIDTH, TILE_HEIGHT, TERRAIN_COLORS, TerrainType, TERRAIN_TYPES } from '../utils/constants';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    // No external assets
  }

  create(): void {
    console.log('[Boot] Generating textures...');
    this.generateTileTextures();
    this.generateEntityTextures();
    console.log('[Boot] Textures generated, starting TitleScene');
    this.scene.start('TitleScene');
  }

  private generateTileTextures(): void {
    for (const type of TERRAIN_TYPES) {
      this.generateIsoDiamond(type, TERRAIN_COLORS[type]);
    }
  }

  private generateIsoDiamond(type: TerrainType, color: number): void {
    const w = TILE_WIDTH;
    const h = TILE_HEIGHT;
    const g = this.add.graphics();

    // Fill diamond shape
    g.fillStyle(color, 1);
    g.beginPath();
    g.moveTo(w / 2, 0);
    g.lineTo(w, h / 2);
    g.lineTo(w / 2, h);
    g.lineTo(0, h / 2);
    g.closePath();
    g.fillPath();

    // Subtle edge highlight (top-left edges)
    g.lineStyle(1, 0xffffff, 0.15);
    g.beginPath();
    g.moveTo(w / 2, 0);
    g.lineTo(0, h / 2);
    g.strokePath();

    // Subtle edge shadow (bottom-right edges)
    g.lineStyle(1, 0x000000, 0.15);
    g.beginPath();
    g.moveTo(w / 2, h);
    g.lineTo(w, h / 2);
    g.strokePath();

    // Type-specific details
    this.addTileDetails(g, type, w, h);

    g.generateTexture(`tile_${type}`, w, h);
    g.destroy();
  }

  private addTileDetails(g: Phaser.GameObjects.Graphics, type: TerrainType, w: number, h: number): void {
    const cx = w / 2;
    const cy = h / 2;

    switch (type) {
      case 'fairway':
        g.lineStyle(1, 0x3d7a33, 0.3);
        g.beginPath();
        g.moveTo(6, cy - 4);
        g.lineTo(w - 6, cy - 4);
        g.strokePath();
        g.beginPath();
        g.moveTo(6, cy + 4);
        g.lineTo(w - 6, cy + 4);
        g.strokePath();
        break;
      case 'green':
        g.fillStyle(0x68cc68, 0.3);
        g.fillCircle(cx, cy, 6);
        break;
      case 'sand':
        g.fillStyle(0xc4a55a, 0.6);
        const sandOffsets = [[-8, -2], [-3, 3], [2, -1], [7, 2], [5, -3]];
        for (const [dx, dy] of sandOffsets) {
          g.fillCircle(cx + dx, cy + dy, 1);
        }
        break;
      case 'water':
        g.lineStyle(1, 0x6ba3e8, 0.5);
        g.beginPath();
        g.moveTo(8, cy - 2);
        g.lineTo(cx - 4, cy - 4);
        g.lineTo(cx + 4, cy + 2);
        g.lineTo(w - 8, cy);
        g.strokePath();
        break;
      case 'trees':
        g.fillStyle(0x1a4a15, 0.8);
        g.fillTriangle(cx, cy - 6, cx - 5, cy + 2, cx + 5, cy + 2);
        g.fillStyle(0x5c3a1a, 0.8);
        g.fillRect(cx - 1, cy + 2, 2, 4);
        break;
      case 'rough':
        g.fillStyle(0x5a6b2e, 0.4);
        g.fillRect(cx - 4, cy - 2, 2, 4);
        g.fillRect(cx + 3, cy, 2, 3);
        break;
    }
  }

  private generateEntityTextures(): void {
    // Golfer (small colored circles)
    const golferColors = [0xe74c3c, 0x3498db, 0xf1c40f, 0x2ecc71, 0xe67e22];
    golferColors.forEach((color, i) => {
      const g = this.add.graphics();
      g.fillStyle(color, 1);
      g.fillCircle(8, 8, 6);
      g.lineStyle(1, 0x000000, 0.3);
      g.strokeCircle(8, 8, 6);
      g.generateTexture(`golfer_${i}`, 16, 16);
      g.destroy();
    });

    // Ball (tiny white circle)
    const ballG = this.add.graphics();
    ballG.fillStyle(0xffffff, 1);
    ballG.fillCircle(4, 4, 3);
    ballG.lineStyle(1, 0xcccccc, 0.5);
    ballG.strokeCircle(4, 4, 3);
    ballG.generateTexture('ball', 8, 8);
    ballG.destroy();

    // Tee marker
    const teeG = this.add.graphics();
    teeG.fillStyle(0xffffff, 0.8);
    teeG.beginPath();
    teeG.moveTo(6, 0);
    teeG.lineTo(12, 6);
    teeG.lineTo(6, 12);
    teeG.lineTo(0, 6);
    teeG.closePath();
    teeG.fillPath();
    teeG.generateTexture('tee_marker', 12, 12);
    teeG.destroy();

    // Flag
    const flagG = this.add.graphics();
    flagG.fillStyle(0x888888, 1);
    flagG.fillRect(5, 4, 2, 16);
    flagG.fillStyle(0xe74c3c, 1);
    flagG.fillTriangle(7, 4, 7, 12, 16, 8);
    flagG.generateTexture('flag', 18, 20);
    flagG.destroy();

    // Cursor highlight
    const cursorG = this.add.graphics();
    cursorG.fillStyle(0xffff00, 0.2);
    cursorG.lineStyle(2, 0xffff00, 0.8);
    cursorG.beginPath();
    cursorG.moveTo(32, 0);
    cursorG.lineTo(64, 16);
    cursorG.lineTo(32, 32);
    cursorG.lineTo(0, 16);
    cursorG.closePath();
    cursorG.fillPath();
    cursorG.strokePath();
    cursorG.generateTexture('cursor', 64, 32);
    cursorG.destroy();
  }
}
