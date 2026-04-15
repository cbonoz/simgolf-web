import * as Phaser from 'phaser';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super({ key: 'TitleScene' });
  }

  create(): void {
    const { width, height } = this.cameras.main;

    // Background
    this.cameras.main.setBackgroundColor('#1a472a');

    // Title
    const title = this.add.text(width / 2, height / 2 - 60, '⛳ SimGolf Web', {
      fontSize: '48px',
      fontFamily: 'sans-serif',
      color: '#ffffff',
      fontStyle: 'bold',
    });
    title.setOrigin(0.5);

    // Subtitle
    const subtitle = this.add.text(width / 2, height / 2, 'Build. Watch. Improve.', {
      fontSize: '20px',
      fontFamily: 'sans-serif',
      color: '#a8d8a8',
    });
    subtitle.setOrigin(0.5);

    // Start button
    const startBtn = this.add.text(width / 2, height / 2 + 80, '[ New Course ]', {
      fontSize: '24px',
      fontFamily: 'sans-serif',
      color: '#4caf50',
      backgroundColor: '#2a2a2a',
      padding: { x: 20, y: 10 },
    });
    startBtn.setOrigin(0.5);
    startBtn.setInteractive({ useHandCursor: true });

    startBtn.on('pointerover', () => {
      startBtn.setColor('#81c784');
    });
    startBtn.on('pointerout', () => {
      startBtn.setColor('#4caf50');
    });
    startBtn.on('pointerdown', () => {
      this.scene.start('BuilderScene');
    });

    // Instructions
    const instructions = this.add.text(width / 2, height / 2 + 160, 'Paint terrain → Design 9 holes → Open for play', {
      fontSize: '14px',
      fontFamily: 'sans-serif',
      color: '#888888',
    });
    instructions.setOrigin(0.5);
  }
}
