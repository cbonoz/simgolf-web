import * as Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { TitleScene } from './scenes/TitleScene';
import { BuilderScene } from './scenes/BuilderScene';
import { MusicScene } from './scenes/MusicScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 1280,
  height: 720,
  parent: 'game',
  backgroundColor: '#2d5a27',
  scene: [BootScene, MusicScene, TitleScene, BuilderScene],
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
};

const game = new Phaser.Game(config);
