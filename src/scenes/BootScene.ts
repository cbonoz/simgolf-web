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
    const rng = this.makeSeededRng(type);

    switch (type) {
      case 'fairway': {
        // Subtle gradient — lighter top edge
        g.fillStyle(0xffffff, 0.08);
        g.beginPath();
        g.moveTo(w / 2, 0);
        g.lineTo(w, h / 2);
        g.lineTo(w / 2, h * 0.45);
        g.lineTo(0, h / 2);
        g.closePath();
        g.fillPath();

        // Mowing stripes — alternating lighter/darker diagonal bands
        g.lineStyle(1, 0x4a8a3e, 0.3);
        for (let y = -h; y < h * 2; y += 8) {
          const x1 = 0;
          const x2 = w;
          const y1 = y;
          const y2 = y + 4;
          // Clip to diamond by checking isometric bounds
          g.beginPath();
          g.moveTo(x1 - 10, y1);
          g.lineTo(x2 + 10, y2);
          g.strokePath();
        }

        // Tiny noise dots for texture
        for (let i = 0; i < 20; i++) {
          const nx = 4 + Math.floor(rng() * (w - 8));
          const ny = 4 + Math.floor(rng() * (h - 8));
          // Only place inside diamond
          if (this.isInsideIsoDiamond(nx, ny, w, h)) {
            g.fillStyle(rng() > 0.5 ? 0x4a8a3e : 0x6ab84e, 0.25);
            g.fillCircle(nx, ny, 1);
          }
        }
        break;
      }
      case 'rough': {
        // Rough gradient — slightly darker bottom
        g.fillStyle(0x000000, 0.06);
        g.beginPath();
        g.moveTo(0, h / 2);
        g.lineTo(w / 2, h);
        g.lineTo(w, h / 2);
        g.lineTo(w / 2, h * 0.55);
        g.closePath();
        g.fillPath();

        // Wild grass tufts — short strokes
        for (let i = 0; i < 14; i++) {
          const nx = 4 + Math.floor(rng() * (w - 8));
          const ny = 4 + Math.floor(rng() * (h - 8));
          if (this.isInsideIsoDiamond(nx, ny, w, h)) {
            g.lineStyle(1, 0x5a6b2e, 0.35 + rng() * 0.2);
            g.beginPath();
            g.moveTo(nx, ny);
            const tuftDir = rng() * 0.5 - 0.25;
            g.lineTo(nx + tuftDir, ny - 2 - rng() * 2);
            g.strokePath();
          }
        }

        // Variation dots
        for (let i = 0; i < 10; i++) {
          const nx = 4 + Math.floor(rng() * (w - 8));
          const ny = 4 + Math.floor(rng() * (h - 8));
          if (this.isInsideIsoDiamond(nx, ny, w, h)) {
            g.fillStyle(0x8a9c5a, 0.15);
            g.fillCircle(nx, ny, 1.5);
          }
        }
        break;
      }
      case 'sand': {
        // Sand grain texture — many tiny dots
        for (let i = 0; i < 30; i++) {
          const nx = 4 + Math.floor(rng() * (w - 8));
          const ny = 4 + Math.floor(rng() * (h - 8));
          if (this.isInsideIsoDiamond(nx, ny, w, h)) {
            const shade = rng() > 0.5 ? 0xf0d48a : 0xc4a55a;
            g.fillStyle(shade, 0.3);
            g.fillCircle(nx, ny, 0.8 + rng() * 0.5);
          }
        }

        // Subtle ripple lines
        g.lineStyle(1, 0xc4a55a, 0.2);
        g.beginPath();
        g.moveTo(8, cy - 3);
        g.lineTo(cx - 3, cy - 6);
        g.lineTo(cx + 3, cy + 3);
        g.lineTo(w - 8, cy);
        g.strokePath();
        g.beginPath();
        g.moveTo(6, cy + 3);
        g.lineTo(cx - 5, cy);
        g.lineTo(cx + 5, cy + 6);
        g.lineTo(w - 6, cy + 3);
        g.strokePath();
        break;
      }
      case 'water': {
        // Deeper gradient — darker at edges
        g.fillStyle(0x000000, 0.08);
        g.beginPath();
        g.moveTo(w / 2, 0);
        g.lineTo(w, h / 2);
        g.lineTo(w / 2, h);
        g.lineTo(0, h / 2);
        g.closePath();
        g.fillPath();

        // Water wave lines — multiple subtle lines
        g.lineStyle(1, 0x6ba3e8, 0.35);
        for (let wave = -1; wave <= 1; wave++) {
          const wy = cy + wave * 5;
          g.beginPath();
          g.moveTo(10, wy - 2);
          g.lineTo(cx - 4, wy - 4);
          g.lineTo(cx + 4, wy + 2);
          g.lineTo(w - 10, wy);
          g.strokePath();
        }

        // Light reflection spots
        for (let i = 0; i < 6; i++) {
          const nx = 6 + Math.floor(rng() * (w - 12));
          const ny = 4 + Math.floor(rng() * (h - 8));
          if (this.isInsideIsoDiamond(nx, ny, w, h)) {
            g.fillStyle(0x8fc8ff, 0.2 + rng() * 0.15);
            g.fillCircle(nx, ny, 1 + rng() * 1.5);
          }
        }
        break;
      }
      case 'trees': {
        // Base tile — dark forest floor with leaf litter texture
        g.fillStyle(0x000000, 0.05);
        g.beginPath();
        g.moveTo(0, h / 2);
        g.lineTo(w / 2, h);
        g.lineTo(w, h / 2);
        g.lineTo(w / 2, h * 0.55);
        g.closePath();
        g.fillPath();

        // Leaf litter dots
        for (let i = 0; i < 12; i++) {
          const nx = 4 + Math.floor(rng() * (w - 8));
          const ny = 4 + Math.floor(rng() * (h - 8));
          if (this.isInsideIsoDiamond(nx, ny, w, h)) {
            g.fillStyle(0x4a7a3e, 0.2);
            g.fillCircle(nx, ny, 1 + rng() * 1);
          }
        }
        break;
      }
      case 'green': {
        // Green gradient — lighter center, darker edges
        g.fillStyle(0xffffff, 0.1);
        g.fillCircle(cx, cy, 6);

        // Subtle gradient bands
        g.fillStyle(0x000000, 0.04);
        g.beginPath();
        g.moveTo(0, h / 2);
        g.lineTo(w / 2, h);
        g.lineTo(w, h / 2);
        g.lineTo(w / 2, h * 0.55);
        g.closePath();
        g.fillPath();

        // Putting surface — very fine, smooth texture
        for (let i = 0; i < 10; i++) {
          const nx = 4 + Math.floor(rng() * (w - 8));
          const ny = 4 + Math.floor(rng() * (h - 8));
          if (this.isInsideIsoDiamond(nx, ny, w, h)) {
            g.fillStyle(0x5ab85a, 0.2);
            g.fillCircle(nx, ny, 1);
          }
        }
        break;
      }
    }
  }

  /** Simple seeded PRNG for deterministic noise patterns */
  private makeSeededRng(seed: string): () => number {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      const c = seed.charCodeAt(i);
      hash = ((hash << 5) - hash) + c;
      hash |= 0;
    }
    let state = hash;
    return () => {
      state = state * 1664525 + 1013904223;
      return ((state >>> 0) % 1000) / 1000;
    };
  }

  /** Check if a point (x,y) is inside the isometric diamond (64x32) */
  private isInsideIsoDiamond(x: number, y: number, w: number, h: number): boolean {
    const cx = w / 2;
    const cy = h / 2;
    const dx = Math.abs(x - cx);
    const dy = Math.abs(y - cy);
    // Diamond equation: dx/(w/2) + dy/(h/2) <= 1
    return (dx / cx) + (dy / cy) <= 1.0;
  }

  private generateEntityTextures(): void {
    // Golfer icons — humanoid shapes with shirt + pants + hat
    // 3 body types × 8 color palettes = 24 distinct golfer textures
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

    // Body shape definitions: name, and proportions relative to base (14w x 20h)
    // slim: narrower body, taller — lanky look
    // average: standard proportions
    // broad: wider body, shorter — stocky look
    type BodyDef = { bodyW: number; bodyH: number; bodyOffX: number; bodyOffY: number; pantsOffX: number; pantsW: number; legOffX: number; scale: number };
    const bodyDefs: Record<string, BodyDef> = {
      slim:    { bodyW: 8,  bodyH: 9,  bodyOffX: 3,  bodyOffY: 6, pantsOffX: 4,  pantsW: 6,  legOffX: 4,  scale: 0.85 },
      average: { bodyW: 10, bodyH: 8,  bodyOffX: 2,  bodyOffY: 6, pantsOffX: 3,  pantsW: 8,  legOffX: 3,  scale: 1.0 },
      broad:   { bodyW: 12, bodyH: 7,  bodyOffX: 1,  bodyOffY: 6, pantsOffX: 2,  pantsW: 10, legOffX: 2,  scale: 1.1 },
    };

    golferPalettes.forEach((palette, colorIdx) => {
      for (const [bodyKey, def] of Object.entries(bodyDefs)) {
        const g = this.add.graphics();
        const w = 14;
        const h = 20;
        const sc = def.scale;

        // Shadow
        g.fillStyle(0x000000, 0.15);
        g.fillEllipse(w / 2, h - 1, w * sc - 2, 3);

        // Body (shirt)
        g.fillStyle(palette.shirt, 1);
        g.fillRoundedRect(def.bodyOffX, def.bodyOffY, def.bodyW, def.bodyH, 2);

        // Head
        const headCX = Math.round(w / 2);
        const headR = Math.round(3 * sc);
        g.fillStyle(0xffdbac, 1); // skin tone
        g.fillCircle(headCX, 5, headR);

        // Hat
        g.fillStyle(palette.hat, 1);
        const hatW = Math.round(w * sc);
        const hatOffX = Math.round((w - hatW) / 2);
        g.fillRoundedRect(hatOffX, 1, hatW, 3, 1);
        g.fillRect(0, 3, w, 1);

        // Pants
        g.fillStyle(palette.pants, 1);
        g.fillRoundedRect(def.pantsOffX, 12, def.pantsW, 6, 1);

        // Shoes
        g.fillStyle(0x333333, 1);
        g.fillRect(def.legOffX, 18, 3, 2);
        g.fillRect(w - def.legOffX - 3, 18, 3, 2);

        g.generateTexture(`golfer_${colorIdx}_${bodyKey}`, w, h + 2);
        g.destroy();
      }
    });

    // Accessory overlays — separate small textures rendered on top of golfer sprites
    const accessG = this.add.graphics();

    // Glasses overlay (14x8, placed at head area)
    accessG.clear();
    accessG.lineStyle(1, 0x333333, 0.9);
    accessG.strokeRect(2, 3, 4, 3);  // left lens
    accessG.strokeRect(8, 3, 4, 3);  // right lens
    accessG.lineBetween(6, 4, 8, 4); // bridge
    accessG.generateTexture('accessory_glasses', 14, 8);
    accessG.clear();

    // Visor overlay (14x6, placed at top of head)
    accessG.fillStyle(0x333333, 0.8);
    accessG.fillRoundedRect(0, 1, 14, 3, 1);
    accessG.fillRect(0, 3, 14, 1);
    accessG.generateTexture('accessory_visor', 14, 6);
    accessG.clear();

    // Mustache overlay (14x5, placed below nose)
    accessG.lineStyle(2, 0x333333, 0.9);
    accessG.beginPath();
    accessG.moveTo(3, 2);
    accessG.lineTo(7, 3);
    accessG.lineTo(11, 2);
    accessG.strokePath();
    accessG.generateTexture('accessory_mustache', 14, 5);

    accessG.destroy();

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

      // === Distinct building silhouettes based on key ===

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

      // === Roof type per building ===
      if (bld.key === 'clubhouse') {
        // Tall A-frame roof with chimney
        g.fillStyle(roofColor, 1);
        g.beginPath();
        g.moveTo(cw, ch - h * 0.35);
        g.lineTo(cw + w * 0.5, ch + h * 0.05);
        g.lineTo(cw, ch + h * 0.3);
        g.lineTo(cw - w * 0.5, ch + h * 0.05);
        g.closePath();
        g.fillPath();
        // Chimney
        g.fillStyle(0x555555, 0.9);
        g.fillRect(cw + w * 0.15, ch - h * 0.3, 6, h * 0.25);
        g.fillStyle(0x666666, 0.8);
        g.fillRect(cw + w * 0.13, ch - h * 0.35, 10, 4);
        // Extra smoke detail
        g.fillStyle(0x888888, 0.3);
        g.fillCircle(cw + w * 0.18, ch - h * 0.38, 3);
      } else if (bld.key === 'shop') {
        // Flat roof with sign board
        g.fillStyle(roofColor, 1);
        g.beginPath();
        g.moveTo(cw, ch - h * 0.15);
        g.lineTo(cw + w * 0.45, ch + h * 0.05);
        g.lineTo(cw, ch + h * 0.3);
        g.lineTo(cw - w * 0.45, ch + h * 0.05);
        g.closePath();
        g.fillPath();
        // Sign board extending out
        g.fillStyle(0xffd700, 0.7);
        g.beginPath();
        g.moveTo(cw - w * 0.25, ch + h * 0.15);
        g.lineTo(cw - w * 0.35, ch + h * 0.1);
        g.lineTo(cw - w * 0.35, ch + h * 0.05);
        g.lineTo(cw - w * 0.25, ch + h * 0.1);
        g.closePath();
        g.fillPath();
      } else if (bld.key === 'snack_bar') {
        // Angled awning roof
        g.fillStyle(roofColor, 1);
        g.beginPath();
        g.moveTo(cw, ch - h * 0.2);
        g.lineTo(cw + w * 0.45, ch + h * 0.05);
        g.lineTo(cw, ch + h * 0.2);
        g.lineTo(cw - w * 0.45, ch + h * 0.05);
        g.closePath();
        g.fillPath();
        // Awning stripes
        g.fillStyle(0xffffff, 0.2);
        g.fillRect(cw - w * 0.3, ch + h * 0.08, 4, h * 0.08);
        g.fillRect(cw - w * 0.1, ch + h * 0.08, 4, h * 0.08);
        g.fillRect(cw + w * 0.1, ch + h * 0.08, 4, h * 0.08);
      } else if (bld.key === 'fountain') {
        // Dome/tiered roof — blueish
        g.fillStyle(0x5b9bd5, 1);
        g.beginPath();
        g.moveTo(cw, ch - h * 0.15);
        g.lineTo(cw + w * 0.35, ch + h * 0.02);
        g.lineTo(cw + w * 0.35, ch + h * 0.15);
        g.lineTo(cw, ch + h * 0.3);
        g.lineTo(cw - w * 0.35, ch + h * 0.15);
        g.lineTo(cw - w * 0.35, ch + h * 0.02);
        g.closePath();
        g.fillPath();
        // Water spout
        g.fillStyle(0x87ceeb, 0.6);
        g.fillCircle(cw, ch + h * 0.15, 3);
        g.fillStyle(0x87ceeb, 0.3);
        g.fillCircle(cw, ch, 4);
      } else if (bld.key === 'bench') {
        // Simple flat sloped roof
        g.fillStyle(roofColor, 1);
        g.beginPath();
        g.moveTo(cw, ch - h * 0.1);
        g.lineTo(cw + w * 0.4, ch + h * 0.05);
        g.lineTo(cw, ch + h * 0.2);
        g.lineTo(cw - w * 0.4, ch + h * 0.05);
        g.closePath();
        g.fillPath();
      } else {
        // Default gabled roof (garden, etc.)
        g.fillStyle(roofColor, 1);
        g.beginPath();
        g.moveTo(cw, ch - h * 0.2);
        g.lineTo(cw + w * 0.45, ch + h * 0.05);
        g.lineTo(cw, ch + h * 0.3);
        g.lineTo(cw - w * 0.45, ch + h * 0.05);
        g.closePath();
        g.fillPath();
      }

      // Roof trim line
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
