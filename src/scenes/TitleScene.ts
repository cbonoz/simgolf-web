import * as Phaser from 'phaser';
import { courseStore } from '../state/course';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super({ key: 'TitleScene' });
  }

  create(): void {
    const { width, height } = this.cameras.main;

    // Background
    this.cameras.main.setBackgroundColor('#1a472a');

    // Title
    const title = this.add.text(width / 2, height / 2 - 100, '⛳ SimGolf Web', {
      fontSize: '48px',
      fontFamily: 'sans-serif',
      color: '#ffffff',
      fontStyle: 'bold',
    });
    title.setOrigin(0.5);

    // Subtitle
    const subtitle = this.add.text(width / 2, height / 2 - 50, 'Build. Watch. Improve.', {
      fontSize: '20px',
      fontFamily: 'sans-serif',
      color: '#a8d8a8',
    });
    subtitle.setOrigin(0.5);

    // Continue button (only if local save exists)
    const hasSave = courseStore.getState().hasLocalSave();
    if (hasSave) {
      const continueBtn = this.add.text(width / 2, height / 2 + 30, '[ Continue ]', {
        fontSize: '24px',
        fontFamily: 'sans-serif',
        color: '#4caf50',
        backgroundColor: '#2a2a2a',
        padding: { x: 20, y: 10 },
      });
      continueBtn.setOrigin(0.5);
      continueBtn.setInteractive({ useHandCursor: true });
      continueBtn.on('pointerover', () => continueBtn.setColor('#81c784'));
      continueBtn.on('pointerout', () => continueBtn.setColor('#4caf50'));
      continueBtn.on('pointerdown', () => {
        this.scene.start('BuilderScene');
      });
    }

    // New Course button
    const newCourseBtn = this.add.text(width / 2, height / 2 + (hasSave ? 90 : 30), '[ New Course ]', {
      fontSize: '24px',
      fontFamily: 'sans-serif',
      color: '#4caf50',
      backgroundColor: '#2a2a2a',
      padding: { x: 20, y: 10 },
    });
    newCourseBtn.setOrigin(0.5);
    newCourseBtn.setInteractive({ useHandCursor: true });
    newCourseBtn.on('pointerover', () => newCourseBtn.setColor('#81c784'));
    newCourseBtn.on('pointerout', () => newCourseBtn.setColor('#4caf50'));
    newCourseBtn.on('pointerdown', () => {
      courseStore.getState().resetCourse();
      this.scene.start('BuilderScene');
    });

    // Load Save button
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);

    const loadBtn = this.add.text(width / 2, height / 2 + (hasSave ? 150 : 90), '📂 Load Save', {
      fontSize: '18px',
      fontFamily: 'sans-serif',
      color: '#bbbbbb',
      backgroundColor: '#2a2a2a',
      padding: { x: 16, y: 8 },
    });
    loadBtn.setOrigin(0.5);
    loadBtn.setInteractive({ useHandCursor: true });
    loadBtn.on('pointerover', () => loadBtn.setColor('#ffffff'));
    loadBtn.on('pointerout', () => loadBtn.setColor('#bbbbbb'));
    loadBtn.on('pointerdown', () => {
      fileInput.click();
    });

    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const json = reader.result as string;
        if (courseStore.getState().loadFromSave(json)) {
          // Also save to local storage for auto-save
          courseStore.getState().saveCourse();
          this.scene.start('BuilderScene');
        } else {
          alert('Failed to load save file. It may be corrupted or from a newer version.');
        }
      };
      reader.readAsText(file);
      fileInput.value = '';
    });

    // Cleanup file input on scene shutdown
    this.events.on('shutdown', () => {
      fileInput.remove();
    });

    // Instructions
    const instructions = this.add.text(width / 2, height / 2 + (hasSave ? 210 : 160), 'Build your course while golfers play in real-time!', {
      fontSize: '14px',
      fontFamily: 'sans-serif',
      color: '#888888',
    });
    instructions.setOrigin(0.5);

    // GitHub link
    const github = this.add.text(width / 2, height - 30, 'View on GitHub', {
      fontSize: '12px',
      fontFamily: 'sans-serif',
      color: '#666666',
    });
    github.setOrigin(0.5);
    github.setInteractive({ useHandCursor: true });
    github.on('pointerover', () => github.setColor('#4caf50'));
    github.on('pointerout', () => github.setColor('#666666'));
    github.on('pointerdown', () => {
      window.open('https://github.com/cbonoz/simgolf-web', '_blank');
    });
  }
}
