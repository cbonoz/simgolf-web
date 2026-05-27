import * as Phaser from 'phaser';
import { courseStore } from '../state/course';
import { GRID_COLS, GRID_ROWS, TILE_WIDTH, TILE_HEIGHT, TERRAIN_COLORS } from '../utils/constants';

export class TitleScene extends Phaser.Scene {
  private bgSprites: Phaser.GameObjects.GameObject[] = [];
  private bgGolferTimers: Phaser.Time.TimerEvent[] = [];
  private bgEmojis: { text: Phaser.GameObjects.Text; lifetime: number }[] = [];

  constructor() {
    super({ key: 'TitleScene' });
  }

  create(): void {
    const { width, height } = this.cameras.main;

    // Background gradient
    this.cameras.main.setBackgroundColor('#0d2818');

    // --- Animated background: floating isometric tiles ---
    this.createAnimatedBackground(width, height);

    // --- Title ---
    const title = this.add.text(width / 2, height * 0.22, '⛳ SimGolf Web', {
      fontSize: '52px',
      fontFamily: 'sans-serif',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(100);

    // Title glow effect
    this.tweens.add({
      targets: title,
      alpha: { from: 0.85, to: 1 },
      duration: 2000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // --- Subtitle ---
    this.add.text(width / 2, height * 0.30, 'Build. Watch. Improve.', {
      fontSize: '20px',
      fontFamily: 'sans-serif',
      color: '#a8d8a8',
    }).setOrigin(0.5).setDepth(100);

    // --- Continue button ---
    const hasSave = courseStore.getState().hasLocalSave();
    const buttonY = height * 0.42;

    if (hasSave) {
      this.createButton(width / 2, buttonY, '[ Continue ]', '#4caf50', '#81c784', () => {
        this.cleanupBgSprites();
        this.scene.start('BuilderScene');
      });
    }

    // New Course button
    this.createButton(
      width / 2,
      buttonY + (hasSave ? 65 : 0) + 10,
      '[ New Course ]',
      '#4caf50', '#81c784',
      () => {
        courseStore.getState().resetCourse();
        this.cleanupBgSprites();
        this.scene.start('BuilderScene');
      }
    );

    // Load Save button
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);

    this.createButton(
      width / 2,
      buttonY + (hasSave ? 130 : 75),
      '📂 Load Save',
      '#bbbbbb', '#ffffff',
      () => fileInput.click(),
      18
    );

    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const json = reader.result as string;
        if (courseStore.getState().loadFromSave(json)) {
          courseStore.getState().saveCourse();
          this.cleanupBgSprites();
          this.scene.start('BuilderScene');
        } else {
          alert('Failed to load save file. It may be corrupted or from a newer version.');
        }
      };
      reader.readAsText(file);
      fileInput.value = '';
    });

    this.events.on('shutdown', () => {
      fileInput.remove();
      // Stop all timers and tweens
      this.time.removeAllEvents();
      this.tweens.killAll();
      this.cleanupBgSprites();
    });

    // --- Instructions ---
    this.add.text(width / 2, height * 0.62, 'Build your course while golfers play in real-time!', {
      fontSize: '14px',
      fontFamily: 'sans-serif',
      color: '#888888',
    }).setOrigin(0.5).setDepth(100);

    // --- GitHub link ---
    const github = this.add.text(width / 2, height - 30, 'View on GitHub', {
      fontSize: '12px',
      fontFamily: 'sans-serif',
      color: '#666666',
    }).setOrigin(0.5).setDepth(100).setInteractive({ useHandCursor: true });
    github.on('pointerover', () => github.setColor('#4caf50'));
    github.on('pointerout', () => github.setColor('#666666'));
    github.on('pointerdown', () => {
      window.open('https://github.com/cbonoz/simgolf-web', '_blank');
    });
  }

  private createButton(
    x: number, y: number, text: string, color: string, hoverColor: string,
    onClick: () => void, fontSize = 24
  ): void {
    const btn = this.add.text(x, y, text, {
      fontSize: `${fontSize}px`,
      fontFamily: 'sans-serif',
      color,
      backgroundColor: '#2a2a2a',
      padding: { x: 20, y: 10 },
    }).setOrigin(0.5).setDepth(100).setInteractive({ useHandCursor: true });
    btn.on('pointerover', () => btn.setColor(hoverColor));
    btn.on('pointerout', () => btn.setColor(color));
    btn.on('pointerdown', onClick);
  }

  private createAnimatedBackground(w: number, h: number): void {
    // Draw a grid of dimmed isometric tiles in the background
    const tileW = TILE_WIDTH;
    const tileH = TILE_HEIGHT;
    const terrainTypes = ['fairway', 'rough', 'sand', 'green'] as const;
    const terrainColors: Record<string, number> = {
      fairway: 0x2d6b2a,
      rough: 0x4a5b1e,
      sand: 0x9b8a4a,
      green: 0x4ab84a,
    };

    // Scatter tiles in the background, clipped to screen area
    // We'll place them with isometric spacing but dimmed (alpha 0.15-0.25)
    const spacingX = tileW * 0.8;
    const spacingY = tileH * 0.6;

    for (let row = -2; row < Math.ceil(h / spacingY) + 2; row++) {
      for (let col = -2; col < Math.ceil(w / spacingX) + 2; col++) {
        const type = terrainTypes[Math.floor(Math.random() * terrainTypes.length)];
        const color = terrainColors[type];
        const isoX = (col - row) * (tileW / 2) + w / 2;
        const isoY = (col + row) * (tileH / 2) + h * 0.35;

        // Skip if off screen
        if (isoX < -tileW || isoX > w + tileW || isoY < -tileH || isoY > h + tileH) continue;

        const g = this.add.graphics();
        g.fillStyle(color, 0.12 + Math.random() * 0.1);
        g.beginPath();
        g.moveTo(tileW / 2, 0);
        g.lineTo(tileW, tileH / 2);
        g.lineTo(tileW / 2, tileH);
        g.lineTo(0, tileH / 2);
        g.closePath();
        g.fillPath();
        g.setPosition(isoX, isoY);
        this.bgSprites.push(g);
      }
    }

    // --- Floating golfer silhouettes ---
    // Create 3-4 golfer sprites that drift across the screen at different speeds
    const golferColors = [0xe74c3c, 0x3498db, 0xf1c40f, 0x2ecc71, 0xe67e22];
    for (let i = 0; i < 4; i++) {
      const shirtColor = golferColors[i % golferColors.length];
      const startX = -60 - Math.random() * 80;
      const startY = h * 0.3 + Math.random() * h * 0.4;
      const speed = 8 + Math.random() * 12; // pixels per second
      const alpha = 0.12 + Math.random() * 0.08;
      const scale = 1.5 + Math.random() * 1.0;

      const g = this.add.graphics();
      g.fillStyle(shirtColor, alpha);
      // Simple golfer shape
      g.fillRoundedRect(3, 6, 10, 8, 2); // body
      g.fillStyle(0xffdbac, alpha);
      g.fillCircle(8, 5, 3); // head
      g.fillStyle(shirtColor, alpha);
      g.fillRoundedRect(2, 1, 12, 3, 1); // hat
      g.fillStyle(0xffffff, alpha * 0.8);
      g.fillRoundedRect(4, 12, 8, 6, 1); // pants
      g.setScale(scale);

      // Cloud icon over head
      const thoughtBubble = this.add.text(0, -20, ['💭', '🤔', '⛳', '🏌️', '☕', '💰'][Math.floor(Math.random() * 6)], {
        fontSize: '14px',
      }).setAlpha(alpha * 1.5);

      // Create a container for the golfer + thought
      const container = this.add.container(startX, startY, [g, thoughtBubble]);
      container.setDepth(5 + i);
      this.bgSprites.push(container);

      // Animate drifting across
      this.tweens.add({
        targets: container,
        x: w + 100,
        duration: (w + 200) / speed * 1000,
        delay: Math.random() * 15000,
        repeat: -1,
        onRepeat: () => {
          container.y = h * 0.25 + Math.random() * h * 0.45;
          thoughtBubble.setText(['💭', '🤔', '⛳', '🏌️', '☕', '💰'][Math.floor(Math.random() * 6)]);
        },
      });

      // Slight bob up and down
      this.tweens.add({
        targets: container,
        y: container.y - 4 + Math.random() * 8,
        duration: 2000 + Math.random() * 1000,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    // --- Floating golf balls ---
    for (let i = 0; i < 6; i++) {
      const ball = this.add.graphics();
      ball.fillStyle(0xffffff, 0.15 + Math.random() * 0.1);
      ball.fillCircle(4, 4, 3);
      ball.lineStyle(1, 0xcccccc, 0.1);
      ball.strokeCircle(4, 4, 3);

      const startX = -20 - Math.random() * 40;
      const startY = h * 0.1 + Math.random() * h * 0.7;
      const speed = 15 + Math.random() * 20;
      const scale = 1.0 + Math.random() * 2.0;
      ball.setScale(scale);

      this.bgSprites.push(ball);
      ball.setPosition(startX, startY);

      // Arc trajectory (ball flight-like)
      this.tweens.add({
        targets: ball,
        x: w + 50,
        y: startY - 40 - Math.random() * 50,
        duration: (w + 100) / speed * 1000,
        delay: Math.random() * 20000,
        repeat: -1,
        yoyo: false,
        ease: 'Quad.easeOut',
        onRepeat: () => {
          ball.y = h * 0.1 + Math.random() * h * 0.7;
        },
      });
    }

    // --- Floating flag sprites ---
    for (let i = 0; i < 3; i++) {
      const flagG = this.add.graphics();
      flagG.fillStyle(0x888888, 0.12);
      flagG.fillRect(5, 4, 2, 16);
      flagG.fillStyle(0xe74c3c, 0.12);
      flagG.fillTriangle(7, 4, 7, 12, 16, 8);

      const fx = w * 0.1 + Math.random() * w * 0.8;
      const fy = h * 0.05 + Math.random() * h * 0.2;
      const flagScale = 1.5 + Math.random() * 2.0;
      flagG.setScale(flagScale);
      flagG.setPosition(fx, fy);
      flagG.setAlpha(0.3 + Math.random() * 0.2);
      this.bgSprites.push(flagG);

      // Gentle sway
      this.tweens.add({
        targets: flagG,
        x: fx + 5 + Math.random() * 5,
        duration: 3000 + Math.random() * 2000,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    // --- Animated emoji burst ---
    this.time.addEvent({
      delay: 3000,
      loop: true,
      callback: () => this.spawnEmojiBurst(w, h),
    });

    // Spawn first one immediately
    this.spawnEmojiBurst(w, h);
  }

  private spawnEmojiBurst(w: number, h: number): void {
    const emojis = ['⛳', '🏌️', '🏆', '🌲', '☕', '💰', '🌿', '💎', '⭐', '🎯', '🔥', '💪'];
    const count = 3 + Math.floor(Math.random() * 5);

    for (let i = 0; i < count; i++) {
      const emoji = emojis[Math.floor(Math.random() * emojis.length)];
      const size = 16 + Math.random() * 24;
      const startX = Math.random() * w * 0.8 + w * 0.1;
      const startY = h * 0.5 + Math.random() * h * 0.4;
      const alpha = 0.08 + Math.random() * 0.15;

      const text = this.add.text(startX, startY, emoji, {
        fontSize: `${size}px`,
      }).setAlpha(0).setDepth(0);

      this.bgSprites.push(text);

      // Float up and fade
      this.tweens.add({
        targets: text,
        y: startY - 40 - Math.random() * 80,
        alpha,
        duration: 2000 + Math.random() * 2000,
        ease: 'Power2',
        onComplete: () => {
          // Fade out
          this.tweens.add({
            targets: text,
            alpha: 0,
            duration: 1500,
            delay: 500 + Math.random() * 1000,
          });
        },
      });
    }
  }

  private cleanupBgSprites(): void {
    for (const sprite of this.bgSprites) {
      sprite.destroy();
    }
    this.bgSprites = [];
  }
}
