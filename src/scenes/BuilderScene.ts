import * as Phaser from 'phaser';
import { useCourseStore } from '../state/course';
import { GRID_COLS, GRID_ROWS, TerrainType, TERRAIN_TYPES, TERRAIN_COST } from '../utils/constants';
import { IsoTransform } from '../systems/IsoTransform';

export class BuilderScene extends Phaser.Scene {
  private iso!: IsoTransform;
  private tileSprites: Phaser.GameObjects.Sprite[][] = [];
  private cursor!: Phaser.GameObjects.Sprite;
  private selectedTerrain: TerrainType = 'fairway';
  private isPainting = false;
  private lastPaintedTile: string = '';
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private terrainPalette!: HTMLDivElement;
  private moneyDisplay!: HTMLDivElement;
  private helpText!: HTMLDivElement;

  constructor() {
    super({ key: 'BuilderScene' });
  }

  create(): void {
    this.iso = new IsoTransform(this);

    // Center camera on the grid
    const center = this.iso.getGridCenter();
    const bounds = this.iso.getWorldBounds();

    this.cameras.main.setBounds(bounds.x, bounds.y, bounds.width, bounds.height);
    this.cameras.main.centerOn(center.x, center.y);

    // Create tile sprites
    this.createGrid();

    // Cursor highlight
    this.cursor = this.add.sprite(0, 0, 'cursor');
    this.cursor.setOrigin(0.5, 0.5);
    this.cursor.setDepth(1000);
    this.cursor.setVisible(false);

    // Keyboard controls
    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
    }

    // HTML overlays
    this.createUI();

    // Mouse/touch input
    this.setupInput();

    // Scroll zoom
    this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _gx: any[], _dx: number, _dy: number, dz: number) => {
      const cam = this.cameras.main;
      const newZoom = Phaser.Math.Clamp(cam.zoom - dz * 0.001, 0.5, 2);
      cam.setZoom(newZoom);
    });
  }

  private createGrid(): void {
    const store = useCourseStore.getState();
    this.tileSprites = [];

    for (let row = 0; row < GRID_ROWS; row++) {
      this.tileSprites[row] = [];
      for (let col = 0; col < GRID_COLS; col++) {
        const pos = this.iso.tileToWorld(col, row);
        const tile = store.grid[row][col];
        const sprite = this.add.sprite(pos.x, pos.y, `tile_${tile.type}`);
        sprite.setOrigin(0.5, 0.5);
        sprite.setDepth(col + row);
        this.tileSprites[row][col] = sprite;
      }
    }
  }

  private refreshGrid(): void {
    const store = useCourseStore.getState();
    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        const tile = store.grid[row][col];
        const sprite = this.tileSprites[row][col];
        sprite.setTexture(`tile_${tile.type}`);
      }
    }
    this.updateMoneyDisplay();
  }

  private setupInput(): void {
    const cam = this.cameras.main;

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      const worldX = pointer.worldX;
      const worldY = pointer.worldY;

      const tile = this.iso.worldToTile(worldX, worldY);
      if (tile.col < 0 || tile.col >= GRID_COLS || tile.row < 0 || tile.row >= GRID_ROWS) {
        this.cursor.setVisible(false);
        return;
      }

      const pos = this.iso.tileToWorld(tile.col, tile.row);
      this.cursor.setPosition(pos.x, pos.y);
      this.cursor.setVisible(true);

      // Right-drag pans camera
      if (pointer.isDown && pointer.rightButtonDown()) {
        cam.scrollX -= (pointer.x - pointer.prevPosition.x) / cam.zoom;
        cam.scrollY -= (pointer.y - pointer.prevPosition.y) / cam.zoom;
        return;
      }

      if (this.isPainting) {
        this.paintTile(tile.col, tile.row);
      }
    });

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonDown()) return;
      this.isPainting = true;
      this.lastPaintedTile = '';
      const tile = this.iso.worldToTile(pointer.worldX, pointer.worldY);
      this.paintTile(tile.col, tile.row);
    });

    this.input.on('pointerup', () => {
      this.isPainting = false;
      this.lastPaintedTile = '';
    });

    this.input.on('pointerout', () => {
      this.cursor.setVisible(false);
    });
  }

  private paintTile(col: number, row: number): void {
    const tileKey = `${col},${row}`;
    if (tileKey === this.lastPaintedTile) return;
    this.lastPaintedTile = tileKey;
    if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) return;

    const store = useCourseStore.getState();
    if (store.grid[row][col].type === this.selectedTerrain) return;

    const cost = TERRAIN_COST[this.selectedTerrain];
    if (store.money < cost) return;

    if (store.spendMoney(cost)) {
      store.setTile(col, row, this.selectedTerrain);
      this.refreshGrid();
    }
  }

  private createUI(): void {
    this.terrainPalette = document.createElement('div');
    this.terrainPalette.id = 'terrain-palette';
    this.terrainPalette.style.cssText = `
      position: fixed; top: 10px; left: 10px; z-index: 100;
      background: rgba(0,0,0,0.85); border-radius: 8px; padding: 12px;
      display: flex; flex-direction: column; gap: 4px; font-family: sans-serif;
      min-width: 140px;
    `;
    const title = document.createElement('div');
    title.textContent = '🏗️ Terrain';
    title.style.cssText = 'color: #fff; font-weight: bold; font-size: 14px; margin-bottom: 6px;';
    this.terrainPalette.appendChild(title);

    for (const type of TERRAIN_TYPES) {
      const btn = document.createElement('button');
      btn.textContent = `${type} ($${TERRAIN_COST[type]})`;
      btn.dataset.terrain = type;
      btn.style.cssText = `
        padding: 6px 12px; border: 2px solid transparent; border-radius: 4px;
        cursor: pointer; font-size: 12px; text-transform: capitalize;
        background: ${type === this.selectedTerrain ? '#4a8f3f' : '#444'};
        color: #fff; text-align: left;
      `;
      btn.addEventListener('click', () => {
        this.selectedTerrain = type as TerrainType;
        this.updatePaletteSelection();
      });
      this.terrainPalette.appendChild(btn);
    }

    this.moneyDisplay = document.createElement('div');
    this.moneyDisplay.id = 'money-display';
    this.moneyDisplay.style.cssText = `
      position: fixed; top: 10px; right: 10px; z-index: 100;
      background: rgba(0,0,0,0.85); border-radius: 8px; padding: 10px 16px;
      color: #4caf50; font-family: monospace; font-size: 18px; font-weight: bold;
    `;
    this.updateMoneyDisplay();

    this.helpText = document.createElement('div');
    this.helpText.id = 'help-text';
    this.helpText.style.cssText = `
      position: fixed; bottom: 10px; left: 50%; transform: translateX(-50%); z-index: 100;
      background: rgba(0,0,0,0.7); border-radius: 6px; padding: 8px 16px;
      color: #aaa; font-family: sans-serif; font-size: 12px;
    `;
    this.helpText.textContent = 'Left-click: Paint terrain | Scroll: Zoom | Right-drag: Pan';

    document.body.appendChild(this.terrainPalette);
    document.body.appendChild(this.moneyDisplay);
    document.body.appendChild(this.helpText);
  }

  private updatePaletteSelection(): void {
    const buttons = this.terrainPalette.querySelectorAll('button');
    buttons.forEach((btn) => {
      const terrain = (btn as HTMLButtonElement).dataset.terrain;
      (btn as HTMLButtonElement).style.background = terrain === this.selectedTerrain ? '#4a8f3f' : '#444';
    });
  }

  private updateMoneyDisplay(): void {
    const store = useCourseStore.getState();
    if (this.moneyDisplay) {
      this.moneyDisplay.textContent = `💰 $${store.money.toLocaleString()}`;
    }
  }

  update(): void {
    if (!this.cursors) return;
    const cam = this.cameras.main;
    const speed = 5;
    if (this.cursors.left.isDown) cam.scrollX -= speed;
    if (this.cursors.right.isDown) cam.scrollX += speed;
    if (this.cursors.up.isDown) cam.scrollY -= speed;
    if (this.cursors.down.isDown) cam.scrollY += speed;
  }

  shutdown(): void {
    this.terrainPalette?.remove();
    this.moneyDisplay?.remove();
    this.helpText?.remove();
  }
}
