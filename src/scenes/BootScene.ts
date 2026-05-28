import * as Phaser from 'phaser';
import { TILE_WIDTH, TILE_HEIGHT, TERRAIN_COLORS, TerrainType, TERRAIN_TYPES, VEGETATION_TYPES, BUILDING_TYPES } from '../utils/constants';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    // Golfer characters (16x16 frames, 8x8 grid)
    this.load.spritesheet('golfers', 'assets/sprites/golfers.png', { frameWidth: 16, frameHeight: 16 });

    // Load all vegetation sprites from the isometric-plants pack
    for (const v of VEGETATION_TYPES) {
      this.load.image(v.key, `assets/sprites/isometric-plants/${v.key}.png`);
    }
  }

  create(): void {
    console.log('[Boot] Generating textures...');
    this.generateTileTextures();
    this.generateEntityTextures();
    this.generateBuildingTextures();
    console.log('[Boot] Textures generated, starting TitleScene');

    // Fade in, then transition to TitleScene
    this.cameras.main.fadeIn(400);
    this.time.delayedCall(500, () => {
      this.cameras.main.fadeOut(300, 0, 0, 0);
      this.time.delayedCall(350, () => {
        this.scene.start('TitleScene');
      });
    });
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
        // Base tile is plain dark ground — real vegetation sprites overlay on top
        break;
      case 'rough':
        g.fillStyle(0x5a6b2e, 0.4);
        g.fillRect(cx - 4, cy - 2, 2, 4);
        g.fillRect(cx + 3, cy, 2, 3);
        break;
    }
  }

  private generateEntityTextures(): void {
    // Golfer icons — humanoid shapes with shirt + pants + hat
    const golferPalettes = [
      { shirt: 0xe74c3c, pants: 0xffffff, hat: 0xe74c3c }, // Red
      { shirt: 0x3498db, pants: 0xffffff, hat: 0x3498db }, // Blue
      { shirt: 0xf1c40f, pants: 0x2c3e50, hat: 0xf1c40f }, // Yellow
      { shirt: 0x2ecc71, pants: 0xffffff, hat: 0x2ecc71 }, // Green
      { shirt: 0xe67e22, pants: 0xecf0f1, hat: 0xe67e22 }, // Orange
      { shirt: 0x9b59b6, pants: 0xffffff, hat: 0x9b59b6 }, // Purple
      { shirt: 0x1abc9c, pants: 0x2c3e50, hat: 0x1abc9c }, // Teal
      { shirt: 0xe91e63, pants: 0xffffff, hat: 0xe91e63 }, // Pink
    ];

    golferPalettes.forEach((palette, i) => {
      const g = this.add.graphics();
      const w = 14;
      const h = 20;

      // Body (shirt) — rounded rectangle
      g.fillStyle(palette.shirt, 1);
      g.fillRoundedRect(2, 6, w - 4, 8, 2);

      // Head
      g.fillStyle(0xffdbac, 1); // skin tone
      g.fillCircle(w / 2, 5, 3);

      // Hat
      g.fillStyle(palette.hat, 1);
      g.fillRoundedRect(1, 1, w - 2, 3, 1);
      g.fillRect(0, 3, w, 1);

      // Pants
      g.fillStyle(palette.pants, 1);
      g.fillRoundedRect(3, 12, w - 6, 6, 1);

      // Shoes
      g.fillStyle(0x333333, 1);
      g.fillRect(3, 18, 3, 2);
      g.fillRect(w - 6, 18, 3, 2);

      // Shadow
      g.fillStyle(0x000000, 0.15);
      g.fillEllipse(w / 2, h - 1, w - 2, 3);

      g.generateTexture(`golfer_${i}`, w, h + 2);
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

    // Generic particle (small white dot) — used for splash effects, tinted at runtime
    const particleG = this.add.graphics();
    particleG.fillStyle(0xffffff, 1);
    particleG.fillCircle(3, 3, 3);
    particleG.generateTexture('particle', 6, 6);
    particleG.destroy();

    // Player ball (for challenge mode) — brighter orange/red
    const playerBallG = this.add.graphics();
    playerBallG.fillStyle(0xff6600, 1);
    playerBallG.fillCircle(5, 5, 4);
    playerBallG.lineStyle(1, 0xffaa00, 0.8);
    playerBallG.strokeCircle(5, 5, 4);
    playerBallG.fillStyle(0xffffff, 0.4);
    playerBallG.fillCircle(4, 3, 1.5);
    playerBallG.generateTexture('ball_player', 10, 10);
    playerBallG.destroy();

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

  private generateBuildingTextures(): void {
    for (const bld of BUILDING_TYPES) {
      const g = this.add.graphics();
      const w = TILE_WIDTH * (bld.width === 2 ? 2 : 1) + 16;
      const h = TILE_HEIGHT * (bld.height >= 2 ? 3 : 2) + 16;

      const bldColor = bld.category === 'revenue' ? 0x8B7355 : bld.category === 'decor' ? 0x6b8e6b : 0x7a6b5a;
      const roofColor = bld.category === 'revenue' ? 0xc0392b : bld.category === 'decor' ? 0x5b9bd5 : 0xe67e22;
      const trimColor = bld.category === 'revenue' ? 0xd4a76a : bld.category === 'decor' ? 0x8fbc8f : 0xf39c12;

      const cw = w / 2;
      const ch = h * 0.3;

      // Building body
      g.fillStyle(bldColor, 1);
      g.beginPath();
      g.moveTo(cw, ch);
      g.lineTo(cw + w * 0.4, ch + h * 0.25);
      g.lineTo(cw + w * 0.4, ch + h * 0.65);
      g.lineTo(cw, ch + h * 0.9);
      g.lineTo(cw - w * 0.4, ch + h * 0.65);
      g.lineTo(cw - w * 0.4, ch + h * 0.25);
      g.closePath();
      g.fillPath();

      // Front face detail
      g.fillStyle(bldColor + 0x0a0a0a, 0.8);
      g.beginPath();
      g.moveTo(cw, ch);
      g.lineTo(cw + w * 0.4, ch + h * 0.25);
      g.lineTo(cw + w * 0.4, ch + h * 0.65);
      g.lineTo(cw, ch + h * 0.9);
      g.lineTo(cw, ch + h * 0.9 - 4);
      g.lineTo(cw + w * 0.4 - 4, ch + h * 0.65 - 2);
      g.lineTo(cw + w * 0.4 - 4, ch + h * 0.25 + 2);
      g.lineTo(cw, ch + 4);
      g.closePath();
      g.fillPath();

      // Roof
      g.fillStyle(roofColor, 1);
      g.beginPath();
      g.moveTo(cw, ch - h * 0.2);
      g.lineTo(cw + w * 0.45, ch + h * 0.05);
      g.lineTo(cw, ch + h * 0.3);
      g.lineTo(cw - w * 0.45, ch + h * 0.05);
      g.closePath();
      g.fillPath();

      g.lineStyle(2, 0xffffff, 0.2);
      g.beginPath();
      g.moveTo(cw, ch - h * 0.2);
      g.lineTo(cw - w * 0.45, ch + h * 0.05);
      g.strokePath();

      g.lineStyle(2, trimColor, 0.8);
      g.beginPath();
      g.moveTo(cw - w * 0.4, ch + h * 0.05);
      g.lineTo(cw + w * 0.4, ch + h * 0.05);
      g.strokePath();

      // Door
      g.fillStyle(0x5c3a1e, 0.9);
      g.fillRect(cw - 4, ch + h * 0.4, 8, h * 0.3);

      // Windows
      g.fillStyle(0x87ceeb, 0.6);
      if (bld.width >= 2) {
        g.fillRect(cw - w * 0.2, ch + h * 0.25, 6, 8);
        g.fillRect(cw + w * 0.1, ch + h * 0.25, 6, 8);
      } else {
        g.fillRect(cw + w * 0.12, ch + h * 0.25, 6, 8);
      }

      // Shadow
      g.fillStyle(0x000000, 0.15);
      g.beginPath();
      g.moveTo(cw - w * 0.3, ch + h * 0.9);
      g.lineTo(cw + w * 0.3, ch + h * 0.9);
      g.lineTo(cw + w * 0.5, ch + h * 0.75);
      g.lineTo(cw, ch + h * 0.55);
      g.closePath();
      g.fillPath();

      g.generateTexture(`building_${bld.key}`, w, h + 8);
      g.destroy();
    }
  }
}
