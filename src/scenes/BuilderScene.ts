import * as Phaser from 'phaser';
import { courseStore } from '../state/course';
import { GRID_COLS, GRID_ROWS, TILE_WIDTH, TILE_HEIGHT, TerrainType, TERRAIN_TYPES, TERRAIN_COST } from '../utils/constants';
import { tileToScreen, screenToTile, clampTile } from '../utils/helpers';

export class BuilderScene extends Phaser.Scene {
  private tileSprites: Phaser.GameObjects.Sprite[][] = [];
  private cursor!: Phaser.GameObjects.Sprite;
  private debugText!: Phaser.GameObjects.Text;
  private selectedTerrain: TerrainType = 'fairway';
  private isPainting = false;
  private isPanning = false;
  private lastPaintedTile: string = '';
  private panStart: { x: number; y: number } = { x: 0, y: 0 };
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private terrainPalette!: HTMLDivElement;
  private moneyDisplay!: HTMLDivElement;
  private helpText!: HTMLDivElement;

  // Grid offset so all tiles are in positive world space
  private readonly OFFSET_X = (GRID_ROWS - 1) * (TILE_WIDTH / 2) + 100;
  private readonly OFFSET_Y = 100;

  constructor() {
    super({ key: 'BuilderScene' });
  }

  create(): void {
    // Center camera on the grid
    const topLeft = this.tileToWorld(0, 0);
    const bottomRight = this.tileToWorld(GRID_COLS - 1, GRID_ROWS - 1);
    const gridCenterX = (topLeft.x + bottomRight.x) / 2;
    const gridCenterY = (topLeft.y + bottomRight.y) / 2;

    const cam = this.cameras.main;
    cam.scrollX = gridCenterX - cam.width / 2;
    cam.scrollY = gridCenterY - cam.height / 2;

    // Prevent right-click context menu so we can use right-drag for panning
    this.game.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // Create tile sprites
    this.createGrid();

    // Cursor highlight
    this.cursor = this.add.sprite(-1000, -1000, 'cursor');
    this.cursor.setOrigin(0.5, 0.5);
    this.cursor.setDepth(9999);
    this.cursor.setVisible(false);

    // Debug text (fixed to screen)
    this.debugText = this.add.text(10, 10, '', {
      fontSize: '12px',
      color: '#ffff00',
      fontFamily: 'monospace',
    }).setScrollFactor(0).setDepth(10000);

    // Keyboard
    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
    }

    this.createUI();
    this.setupInput();
  }

  private tileToWorld(col: number, row: number): { x: number; y: number } {
    return tileToScreen(col, row, this.OFFSET_X, this.OFFSET_Y);
  }

  private worldToTile(worldX: number, worldY: number): { col: number; row: number } {
    const result = screenToTile(worldX, worldY, this.OFFSET_X, this.OFFSET_Y);
    return clampTile(result.col, result.row, GRID_COLS, GRID_ROWS);
  }

  private createGrid(): void {
    const store = courseStore.getState();
    this.tileSprites = [];

    for (let row = 0; row < GRID_ROWS; row++) {
      this.tileSprites[row] = [];
      for (let col = 0; col < GRID_COLS; col++) {
        const pos = this.tileToWorld(col, row);
        const tile = store.grid[row][col];
        const sprite = this.add.sprite(pos.x, pos.y, `tile_${tile.type}`);
        sprite.setOrigin(0.5, 0.5);
        sprite.setDepth(col + row);
        this.tileSprites[row][col] = sprite;
      }
    }
  }

  private refreshGrid(): void {
    const store = courseStore.getState();
    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        const tile = store.grid[row][col];
        this.tileSprites[row][col].setTexture(`tile_${tile.type}`);
      }
    }
    this.updateMoneyDisplay();
  }

  private setupInput(): void {
    const cam = this.cameras.main;

    // --- Panning (right-click + drag, or middle-click + drag) ---
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonDown()) {
        // Start panning
        this.isPanning = true;
        this.panStart = { x: pointer.x, y: pointer.y };
        return; // Don't paint when panning
      }
      // Left click: start painting
      this.isPainting = true;
      this.lastPaintedTile = '';
      const tile = this.worldToTile(pointer.worldX, pointer.worldY);
      this.paintTile(tile.col, tile.row);
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      // Panning with right button held
      if (this.isPanning) {
        const dx = pointer.x - this.panStart.x;
        const dy = pointer.y - this.panStart.y;
        cam.scrollX -= dx / cam.zoom;
        cam.scrollY -= dy / cam.zoom;
        this.panStart = { x: pointer.x, y: pointer.y };
        this.cursor.setVisible(false);
        return;
      }

      // Update cursor position
      const worldX = pointer.worldX;
      const worldY = pointer.worldY;
      const tile = this.worldToTile(worldX, worldY);

      this.debugText.setText(
        `Tile: ${tile.col},${tile.row}  Zoom: ${cam.zoom.toFixed(2)}\n` +
        `Money: $${courseStore.getState().money}`
      );

      if (tile.col < 0 || tile.col >= GRID_COLS || tile.row < 0 || tile.row >= GRID_ROWS) {
        this.cursor.setVisible(false);
        return;
      }

      const pos = this.tileToWorld(tile.col, tile.row);
      this.cursor.setPosition(pos.x, pos.y);
      this.cursor.setVisible(true);

      // Paint if mouse is held down (left button)
      if (this.isPainting && pointer.leftButtonDown()) {
        this.paintTile(tile.col, tile.row);
      }
    });

    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonDown() || this.isPanning) {
        this.isPanning = false;
        return;
      }
      this.isPainting = false;
      this.lastPaintedTile = '';
    });

    this.input.on('pointerout', () => {
      this.cursor.setVisible(false);
    });

    // --- Zoom (scroll wheel) ---
    // Disable Phaser's built-in wheel handling in case it conflicts
    if (this.input.mouse) this.input.mouse.disableContextMenu();

    // Use DOM wheel event directly for reliable scroll zooming
    this.game.canvas.addEventListener('wheel', (e: WheelEvent) => {
      e.preventDefault();
      const zoomDelta = e.deltaY > 0 ? -0.1 : 0.1;
      const newZoom = Phaser.Math.Clamp(cam.zoom + zoomDelta, 0.3, 3);
      cam.setZoom(newZoom);
    }, { passive: false });
  }

  private paintTile(col: number, row: number): void {
    const tileKey = `${col},${row}`;
    if (tileKey === this.lastPaintedTile) return;
    this.lastPaintedTile = tileKey;
    if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) return;

    const store = courseStore.getState();
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
    this.helpText.textContent = 'Left-click: Paint | Scroll: Zoom | Right-drag: Pan';

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
    const store = courseStore.getState();
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
