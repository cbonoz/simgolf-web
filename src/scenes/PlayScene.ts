import * as Phaser from 'phaser';
import { courseStore } from '../state/course';
import { GRID_COLS, GRID_ROWS } from '../utils/constants';
import { tileToScreen } from '../utils/helpers';

export class PlayScene extends Phaser.Scene {
  private uiContainer!: HTMLDivElement;
  private statusText!: HTMLDivElement;
  private backBtn!: HTMLButtonElement;

  // Grid offset — must match BuilderScene
  private readonly OFFSET_X = (GRID_ROWS - 1) * (64 / 2) + 100;
  private readonly OFFSET_Y = 100;

  constructor() {
    super({ key: 'PlayScene' });
  }

  create(): void {
    // Center camera on the grid (same as BuilderScene)
    const cam = this.cameras.main;
    const centerCol = (GRID_COLS - 1) / 2;
    const centerRow = (GRID_ROWS - 1) / 2;
    cam.scrollX = (centerCol - centerRow) * (64 / 2) + this.OFFSET_X - cam.width / 2;
    cam.scrollY = (centerCol + centerRow) * (32 / 2) + this.OFFSET_Y - cam.height / 2;

    // Render the course grid
    this.renderCourse();

    // Create HTML UI overlay
    this.createUI();

    // Enable camera pan + zoom
    this.setupCameraControls();
  }

  private tileToWorld(col: number, row: number): { x: number; y: number } {
    return tileToScreen(col, row, this.OFFSET_X, this.OFFSET_Y);
  }

  private renderCourse(): void {
    const store = courseStore.getState();
    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        const tile = store.grid[row][col];
        const pos = this.tileToWorld(col, row);
        const sprite = this.add.sprite(pos.x, pos.y, `tile_${tile.type}`);
        sprite.setOrigin(0.5, 0.5);
        sprite.setDepth((col + row) * GRID_COLS + col);
      }
    }

    // Render tees and flags
    for (const hole of store.holes) {
      if (hole.tee) {
        const pos = this.tileToWorld(hole.tee.col, hole.tee.row);
        const teeSprite = this.add.sprite(pos.x, pos.y - 4, 'tee_marker');
        teeSprite.setOrigin(0.5, 1);
        teeSprite.setDepth((hole.tee.col + hole.tee.row) * GRID_COLS + hole.tee.col + 0.3);
      }
      if (hole.cup) {
        const pos = this.tileToWorld(hole.cup.col, hole.cup.row);
        const flagSprite = this.add.sprite(pos.x, pos.y - 6, 'flag');
        flagSprite.setOrigin(0.5, 1);
        flagSprite.setDepth((hole.cup.col + hole.cup.row) * GRID_COLS + hole.cup.col + 0.3);
      }
    }
  }

  private createUI(): void {
    this.uiContainer = document.createElement('div');
    this.uiContainer.id = 'play-ui';
    this.uiContainer.style.cssText = `
      position: fixed; top: 10px; left: 10px; z-index: 100;
      background: rgba(0,0,0,0.85); border-radius: 8px; padding: 12px 16px;
      display: flex; flex-direction: column; gap: 8px; font-family: sans-serif;
      min-width: 180px;
    `;

    const title = document.createElement('div');
    title.textContent = '⛳ Play Mode';
    title.style.cssText = 'color: #fff; font-weight: bold; font-size: 14px;';
    this.uiContainer.appendChild(title);

    this.statusText = document.createElement('div');
    this.statusText.textContent = 'Course is open for play!';
    this.statusText.style.cssText = 'color: #a8d8a8; font-size: 12px;';
    this.uiContainer.appendChild(this.statusText);

    this.backBtn = document.createElement('button');
    this.backBtn.textContent = '🔙 Back to Builder';
    this.backBtn.style.cssText = `
      margin-top: 4px; padding: 8px; border: 2px solid #1565c0; border-radius: 4px;
      cursor: pointer; font-size: 12px; background: #444; color: #90caf9; font-weight: bold;
    `;
    this.backBtn.addEventListener('click', () => {
      this.scene.start('BuilderScene');
    });
    this.uiContainer.appendChild(this.backBtn);

    document.body.appendChild(this.uiContainer);
  }

  private setupCameraControls(): void {
    const cam = this.cameras.main;
    let isPanning = false;
    let panStart = { x: 0, y: 0 };

    // Prevent right-click context menu
    this.game.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonDown()) {
        isPanning = true;
        panStart = { x: pointer.x, y: pointer.y };
      }
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (isPanning) {
        const dx = pointer.x - panStart.x;
        const dy = pointer.y - panStart.y;
        cam.scrollX -= dx / cam.zoom;
        cam.scrollY -= dy / cam.zoom;
        panStart = { x: pointer.x, y: pointer.y };
      }
    });

    this.input.on('pointerup', () => {
      isPanning = false;
    });

    // Zoom
    if (this.input.mouse) this.input.mouse.disableContextMenu();

    this.game.canvas.addEventListener('wheel', (e: WheelEvent) => {
      e.preventDefault();
      const zoomDelta = e.deltaY > 0 ? -0.1 : 0.1;
      const newZoom = Phaser.Math.Clamp(cam.zoom + zoomDelta, 0.3, 3);
      cam.setZoom(newZoom);
    }, { passive: false });
  }

  update(): void {
    // Empty update loop — golfers and ball flight will be added in later tasks
  }

  shutdown(): void {
    this.uiContainer?.remove();
  }
}
