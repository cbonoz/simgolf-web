import * as Phaser from 'phaser';
import { tileToScreen } from '../utils/helpers';

export class Ball {
  sprite: Phaser.GameObjects.Sprite;
  private scene: Phaser.Scene;
  private startPos: { x: number; y: number };
  private endPos: { x: number; y: number };
  private arcHeight: number;
  private duration: number;
  private elapsed: number;
  private onComplete: () => void;
  private isComplete = false;
  private trail: Phaser.GameObjects.Graphics;
  private trailPositions: { x: number; y: number; alpha: number }[] = [];

  /** Trail config — set after construction to customize appearance */
  trailColor = 0xffffff;
  trailAlpha = 0.6;
  trailDotRadius = 1.5;
  trailInterval = 40; // ms between trail dots

  private lastTrailTime = 0;

  get complete(): boolean { return this.isComplete; }

  constructor(
    scene: Phaser.Scene,
    fromCol: number,
    fromRow: number,
    toCol: number,
    toRow: number,
    offsetX: number,
    offsetY: number,
    duration: number,
    onComplete: () => void
  ) {
    this.scene = scene;
    this.startPos = tileToScreen(fromCol, fromRow, offsetX, offsetY);
    this.endPos = tileToScreen(toCol, toRow, offsetX, offsetY);
    this.duration = duration;
    this.elapsed = 0;
    this.onComplete = onComplete;
    this.arcHeight = Math.abs(toCol - fromCol) + Math.abs(toRow - fromRow);
    this.arcHeight = Math.max(8, this.arcHeight * 6);

    this.sprite = scene.add.sprite(this.startPos.x, this.startPos.y - 4, 'ball');
    this.sprite.setOrigin(0.5, 0.5);
    this.sprite.setDepth(9997);

    // Create trail graphics layer
    this.trail = scene.add.graphics();
    this.trail.setDepth(9996);
  }

  update(delta: number): void {
    if (this.isComplete) return;

    this.elapsed += delta;
    const progress = Math.min(this.elapsed / this.duration, 1);

    // Linear interpolation in x/y
    const x = Phaser.Math.Linear(this.startPos.x, this.endPos.x, progress);
    const y = Phaser.Math.Linear(this.startPos.y, this.endPos.y, progress);

    // Parabolic arc: y offset = sin(π * progress) * arcHeight
    const arcOffset = Math.sin(progress * Math.PI) * this.arcHeight;
    const ballX = x;
    const ballY = y - arcOffset;

    this.sprite.setPosition(ballX, ballY);

    // Add trail dot at regular intervals
    this.lastTrailTime += delta;
    if (this.lastTrailTime >= this.trailInterval) {
      this.lastTrailTime = 0;
      this.trailPositions.push({
        x: ballX,
        y: ballY,
        alpha: this.trailAlpha,
      });
    }

    // Age & fade trail dots; keep max ~30 dots
    while (this.trailPositions.length > 30) {
      this.trailPositions.shift();
    }

    // Redraw trail
    this.trail.clear();
    const len = this.trailPositions.length;
    // Draw dots from oldest (faded) to newest (bright)
    for (let i = 0; i < len; i++) {
      const t = this.trailPositions[i];
      // Fade factor: older dots are more transparent
      const ageFactor = (i + 1) / len; // 0=oldest, 1=newest
      const fadeAlpha = t.alpha * ageFactor;
      // Shrink factor: older dots slightly smaller
      const r = this.trailDotRadius * (0.3 + 0.7 * ageFactor);

      this.trail.fillStyle(this.trailColor, fadeAlpha);
      this.trail.fillCircle(t.x, t.y, r);
    }

    if (progress >= 1) {
      this.isComplete = true;
      // Don't destroy the sprite — leave it at landing position as a marker.
      // The onComplete callback will handle making the golfer visible there,
      // and whoever cleans up the ball later can call removeSprite().
      this.sprite.setDepth(9994); // below golfer depth so golfer sprite shows on top
      this.trail.destroy();
      this.onComplete();
    }
  }

  /** Remove the ball sprite from the scene (e.g. when golfer walks over it) */
  removeSprite(): void {
    if (this.sprite && this.sprite.active) {
      this.sprite.destroy();
    }
    if (this.trail && this.trail.active) {
      this.trail.destroy();
    }
  }
}
