import * as Phaser from 'phaser';
import { tileToScreen } from '../utils/helpers';

export class Ball {
  sprite: Phaser.GameObjects.Sprite;
  private startPos: { x: number; y: number };
  private endPos: { x: number; y: number };
  private arcHeight: number;
  private duration: number;
  private elapsed: number;
  private onComplete: () => void;
  private isComplete = false;

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

    this.sprite.setPosition(x, y - arcOffset);

    if (progress >= 1) {
      this.isComplete = true;
      // Don't destroy the sprite — leave it at landing position as a marker.
      // The onComplete callback will handle making the golfer visible there,
      // and whoever cleans up the ball later can call removeSprite().
      this.sprite.setDepth(9994); // below golfer depth so golfer sprite shows on top
      this.onComplete();
    }
  }

  /** Remove the ball sprite from the scene (e.g. when golfer walks over it) */
  removeSprite(): void {
    if (this.sprite && this.sprite.active) {
      this.sprite.destroy();
    }
  }
}
