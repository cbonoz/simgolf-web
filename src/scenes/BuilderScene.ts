import * as Phaser from 'phaser';
import { courseStore, Tile, HoleConfig } from '../state/course';
import { GRID_COLS, GRID_ROWS, TILE_WIDTH, TILE_HEIGHT, TerrainType, TERRAIN_TYPES, TERRAIN_COST } from '../utils/constants';
import { tileToScreen, screenToTile, clampTile, calculatePar } from '../utils/helpers';

type CourseSnapshot = {
  grid: Tile[][];
  holes: HoleConfig[];
  money: number;
};

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

  // Hole mode
  private builderMode: 'paint' | 'hole' = 'paint';
  private selectedHoleId: number = 1;
  private teeSprites: Map<string, Phaser.GameObjects.Sprite> = new Map();
  private flagSprites: Map<string, Phaser.GameObjects.Sprite> = new Map();
  private treeOverlaySprites: Map<string, Phaser.GameObjects.Sprite> = new Map();
  private modeButtons: HTMLButtonElement[] = [];
  private holeButtons: HTMLButtonElement[] = [];
  private holeStatusDisplay!: HTMLDivElement;
  private terrainButtonsContainer!: HTMLDivElement;
  private holeControlsContainer!: HTMLDivElement;

  // Undo/redo
  private undoStack: CourseSnapshot[] = [];
  private redoStack: CourseSnapshot[] = [];
  private currentActionSnapshot: CourseSnapshot | null = null;
  private keydownHandler = (e: KeyboardEvent) => {
    if ((e.key === 'z' || e.key === 'Z') && e.ctrlKey) {
      e.preventDefault();
      if (e.shiftKey) this.redo();
      else this.undo();
    }
    if ((e.key === 'y' || e.key === 'Y') && e.ctrlKey) {
      e.preventDefault();
      this.redo();
    }
  };

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

    // Load saved course if available
    const loaded = courseStore.getState().loadCourse();

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
    this.refreshHoleOverlays();
    if (loaded) this.updateHoleUI();
    document.addEventListener('keydown', this.keydownHandler);
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

        if (tile.type === 'trees') {
          this.addTreeOverlay(col, row, pos);
        }
      }
    }
  }

  private addTreeOverlay(col: number, row: number, pos: { x: number; y: number }): void {
    const key = `${col},${row}`;
    if (this.treeOverlaySprites.has(key)) return;

    const tree = this.add.sprite(pos.x, pos.y - 8, 'tree_birch');
    tree.setOrigin(0.5, 1);
    tree.setScale(0.15);
    tree.setDepth(9999);
    this.treeOverlaySprites.set(key, tree);
  }

  private removeTreeOverlay(col: number, row: number): void {
    const key = `${col},${row}`;
    const tree = this.treeOverlaySprites.get(key);
    if (tree) {
      tree.destroy();
      this.treeOverlaySprites.delete(key);
    }
  }

  private refreshGrid(): void {
    const store = courseStore.getState();
    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        const tile = store.grid[row][col];
        this.tileSprites[row][col].setTexture(`tile_${tile.type}`);

        const key = `${col},${row}`;
        if (tile.type === 'trees') {
          const pos = this.tileToWorld(col, row);
          this.addTreeOverlay(col, row, pos);
        } else {
          this.removeTreeOverlay(col, row);
        }
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
      this.handleTileClick(tile.col, tile.row);
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
        this.handleTileClick(tile.col, tile.row);
      }
    });

    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonDown() || this.isPanning) {
        this.isPanning = false;
        return;
      }
      this.finalizeAction();
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

  // === Undo / Redo ===

  private takeSnapshot(): CourseSnapshot {
    const state = courseStore.getState();
    return {
      grid: state.grid.map((row) => row.map((tile) => ({ ...tile }))),
      holes: state.holes.map((h) => ({
        ...h,
        tee: h.tee ? { ...h.tee } : null,
        cup: h.cup ? { ...h.cup } : null,
      })),
      money: state.money,
    };
  }

  private ensureActionSnapshot(): void {
    if (!this.currentActionSnapshot) {
      this.currentActionSnapshot = this.takeSnapshot();
    }
  }

  private finalizeAction(): void {
    if (this.currentActionSnapshot) {
      this.undoStack.push(this.currentActionSnapshot);
      this.redoStack = [];
      this.currentActionSnapshot = null;
      courseStore.getState().saveCourse();
    }
  }

  private restoreSnapshot(snapshot: CourseSnapshot): void {
    courseStore.setState({
      grid: snapshot.grid,
      holes: snapshot.holes,
      money: snapshot.money,
    });
    this.refreshGrid();
    this.refreshHoleOverlays();
    this.updateHoleUI();
    this.updateMoneyDisplay();
  }

  private undo(): void {
    if (this.undoStack.length === 0) return;
    this.currentActionSnapshot = null;
    const snapshot = this.undoStack.pop()!;
    this.redoStack.push(this.takeSnapshot());
    this.restoreSnapshot(snapshot);
  }

  private redo(): void {
    if (this.redoStack.length === 0) return;
    this.currentActionSnapshot = null;
    const snapshot = this.redoStack.pop()!;
    this.undoStack.push(this.takeSnapshot());
    this.restoreSnapshot(snapshot);
  }

  private handleTileClick(col: number, row: number): void {
    this.ensureActionSnapshot();
    if (this.builderMode === 'paint') {
      this.paintTile(col, row);
    } else {
      this.placeHoleElement(col, row);
    }
  }

  private paintTile(col: number, row: number): void {
    const tileKey = `${col},${row}`;
    if (tileKey === this.lastPaintedTile) return;
    this.lastPaintedTile = tileKey;
    if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) return;

    const store = courseStore.getState();
    const tile = store.grid[row][col];
    if (tile.type === this.selectedTerrain) return;

    // Prevent painting over tees or cups
    if (tile.isTee || tile.isCup) {
      this.showTemporaryMessage("Can't paint over tee or cup!");
      return;
    }

    const cost = TERRAIN_COST[this.selectedTerrain];
    if (store.money < cost) return;

    if (store.spendMoney(cost)) {
      store.setTile(col, row, this.selectedTerrain);
      this.refreshGrid();
    }
  }

  private placeHoleElement(col: number, row: number): void {
    const tileKey = `${col},${row}`;
    if (tileKey === this.lastPaintedTile) return;
    this.lastPaintedTile = tileKey;
    if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) return;

    const store = courseStore.getState();
    const hole = store.holes.find((h) => h.id === this.selectedHoleId);
    if (!hole) return;

    if (!hole.tee) {
      // Place tee — auto-place fairway underneath
      const tileType = store.grid[row][col].type;
      if (tileType !== 'fairway' && tileType !== 'green') {
        store.setTile(col, row, 'fairway');
        this.refreshGrid();
      }
      store.setTee(this.selectedHoleId, col, row);
      this.refreshHoleOverlays();
      this.updateHoleUI();
    } else if (!hole.cup) {
      // Place cup
      if (hole.tee.col === col && hole.tee.row === row) {
        this.showTemporaryMessage('Cup cannot be on the same tile as tee!');
        return;
      }
      // Auto-place green underneath
      const tileType = store.grid[row][col].type;
      if (tileType !== 'fairway' && tileType !== 'green') {
        store.setTile(col, row, 'green');
        this.refreshGrid();
      }
      store.setCup(this.selectedHoleId, col, row);
      const distance = Math.abs(hole.tee.col - col) + Math.abs(hole.tee.row - row);
      const par = calculatePar(distance);
      store.setPar(this.selectedHoleId, par);
      this.refreshHoleOverlays();
      this.updateHoleUI();
    } else {
      // Both placed - restart by clearing and placing new tee
      store.clearHole(this.selectedHoleId);
      // Auto-place fairway underneath new tee
      const tileType = store.grid[row][col].type;
      if (tileType !== 'fairway' && tileType !== 'green') {
        store.setTile(col, row, 'fairway');
        this.refreshGrid();
      }
      store.setTee(this.selectedHoleId, col, row);
      this.refreshHoleOverlays();
      this.updateHoleUI();
    }
  }

  private showTemporaryMessage(msg: string): void {
    const toast = document.createElement('div');
    toast.className = 'builder-toast';
    toast.textContent = msg;
    toast.style.cssText = `
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      background: rgba(200, 50, 50, 0.9); color: #fff; padding: 12px 20px;
      border-radius: 6px; font-family: sans-serif; font-size: 14px; z-index: 200;
      pointer-events: none;
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
  }

  private refreshHoleOverlays(): void {
    // Clear existing
    this.teeSprites.forEach((s) => s.destroy());
    this.teeSprites.clear();
    this.flagSprites.forEach((s) => s.destroy());
    this.flagSprites.clear();

    const store = courseStore.getState();
    for (const hole of store.holes) {
      if (hole.tee) {
        const pos = this.tileToWorld(hole.tee.col, hole.tee.row);
        const sprite = this.add.sprite(pos.x, pos.y - 4, 'tee_marker');
        sprite.setOrigin(0.5, 1);
        sprite.setDepth(9998);
        this.teeSprites.set(`tee_${hole.id}`, sprite);
      }
      if (hole.cup) {
        const pos = this.tileToWorld(hole.cup.col, hole.cup.row);
        const sprite = this.add.sprite(pos.x, pos.y - 6, 'flag');
        sprite.setOrigin(0.5, 1);
        sprite.setDepth(9998);
        this.flagSprites.set(`flag_${hole.id}`, sprite);
      }
    }
  }

  private createUI(): void {
    this.terrainPalette = document.createElement('div');
    this.terrainPalette.id = 'terrain-palette';
    this.terrainPalette.style.cssText = `
      position: fixed; top: 10px; left: 10px; z-index: 100;
      background: rgba(0,0,0,0.85); border-radius: 8px; padding: 12px;
      display: flex; flex-direction: column; gap: 6px; font-family: sans-serif;
      min-width: 160px; max-height: 90vh; overflow-y: auto;
    `;

    // Title
    const title = document.createElement('div');
    title.textContent = '🏗️ Builder';
    title.style.cssText = 'color: #fff; font-weight: bold; font-size: 14px; margin-bottom: 4px;';
    this.terrainPalette.appendChild(title);

    // Mode toggle
    const modeDiv = document.createElement('div');
    modeDiv.style.cssText = 'display: flex; gap: 4px; margin-bottom: 4px;';
    const paintBtn = document.createElement('button');
    paintBtn.textContent = '🎨 Paint';
    const holeBtn = document.createElement('button');
    holeBtn.textContent = '⛳ Holes';
    this.modeButtons = [paintBtn, holeBtn];

    for (const btn of this.modeButtons) {
      btn.style.cssText = `
        flex: 1; padding: 6px; border: 2px solid transparent; border-radius: 4px;
        cursor: pointer; font-size: 12px; background: #444; color: #fff;
      `;
      modeDiv.appendChild(btn);
    }
    this.updateModeButtons();

    paintBtn.addEventListener('click', () => {
      this.builderMode = 'paint';
      this.updateModeButtons();
      this.updateUIVisibility();
    });
    holeBtn.addEventListener('click', () => {
      this.builderMode = 'hole';
      this.updateModeButtons();
      this.updateUIVisibility();
    });

    this.terrainPalette.appendChild(modeDiv);

    // Terrain buttons container
    this.terrainButtonsContainer = document.createElement('div');
    this.terrainButtonsContainer.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';
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
      this.terrainButtonsContainer.appendChild(btn);
    }
    this.terrainPalette.appendChild(this.terrainButtonsContainer);

    // Hole controls container
    this.holeControlsContainer = document.createElement('div');
    this.holeControlsContainer.style.cssText = 'display: none; flex-direction: column; gap: 6px;';

    const holeLabel = document.createElement('div');
    holeLabel.textContent = 'Select Hole:';
    holeLabel.style.cssText = 'color: #aaa; font-size: 12px;';
    this.holeControlsContainer.appendChild(holeLabel);

    const holeGrid = document.createElement('div');
    holeGrid.style.cssText = 'display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px;';
    for (let i = 1; i <= 9; i++) {
      const btn = document.createElement('button');
      btn.textContent = String(i);
      btn.dataset.holeId = String(i);
      btn.style.cssText = `
        padding: 8px; border: 2px solid transparent; border-radius: 4px;
        cursor: pointer; font-size: 14px; font-weight: bold;
        background: ${i === this.selectedHoleId ? '#4a8f3f' : '#444'};
        color: #fff;
      `;
      btn.addEventListener('click', () => {
        this.selectedHoleId = i;
        this.updateHoleButtonSelection();
        this.updateHoleUI();
      });
      this.holeButtons.push(btn);
      holeGrid.appendChild(btn);
    }
    this.holeControlsContainer.appendChild(holeGrid);

    // Hole status
    this.holeStatusDisplay = document.createElement('div');
    this.holeStatusDisplay.style.cssText = 'color: #ccc; font-size: 12px; line-height: 1.5;';
    this.holeControlsContainer.appendChild(this.holeStatusDisplay);

    this.terrainPalette.appendChild(this.holeControlsContainer);

    // Help text (must be created before updateUIVisibility)
    this.helpText = document.createElement('div');
    this.helpText.id = 'help-text';
    this.helpText.style.cssText = `
      position: fixed; bottom: 10px; left: 50%; transform: translateX(-50%); z-index: 100;
      background: rgba(0,0,0,0.7); border-radius: 6px; padding: 8px 16px;
      color: #aaa; font-family: sans-serif; font-size: 12px;
    `;
    this.helpText.textContent = 'Left-click: Paint | Scroll: Zoom | Right-drag: Pan | Ctrl+Z: Undo';

    this.updateUIVisibility();
    this.updateHoleUI();

    // New Course button
    const newCourseBtn = document.createElement('button');
    newCourseBtn.textContent = '🗑️ New Course';
    newCourseBtn.style.cssText = `
      margin-top: 4px; padding: 8px; border: 2px solid #c62828; border-radius: 4px;
      cursor: pointer; font-size: 12px; background: #444; color: #ff8a80;
      font-weight: bold;
    `;
    newCourseBtn.addEventListener('click', () => {
      if (confirm('Start a new course? All progress will be lost.')) {
        courseStore.getState().resetCourse();
        courseStore.getState().saveCourse();
        this.undoStack = [];
        this.redoStack = [];
        this.refreshGrid();
        this.refreshHoleOverlays();
        this.updateHoleUI();
        this.updateMoneyDisplay();
      }
    });
    this.terrainPalette.appendChild(newCourseBtn);

    // Money display
    this.moneyDisplay = document.createElement('div');
    this.moneyDisplay.id = 'money-display';
    this.moneyDisplay.style.cssText = `
      position: fixed; top: 10px; right: 10px; z-index: 100;
      background: rgba(0,0,0,0.85); border-radius: 8px; padding: 10px 16px;
      color: #4caf50; font-family: monospace; font-size: 18px; font-weight: bold;
    `;
    this.updateMoneyDisplay();

    document.body.appendChild(this.terrainPalette);
    document.body.appendChild(this.moneyDisplay);
    document.body.appendChild(this.helpText);
  }

  private updateModeButtons(): void {
    this.modeButtons[0].style.background = this.builderMode === 'paint' ? '#4a8f3f' : '#444';
    this.modeButtons[0].style.borderColor = this.builderMode === 'paint' ? '#6bbf5e' : 'transparent';
    this.modeButtons[1].style.background = this.builderMode === 'hole' ? '#4a8f3f' : '#444';
    this.modeButtons[1].style.borderColor = this.builderMode === 'hole' ? '#6bbf5e' : 'transparent';
  }

  private updateUIVisibility(): void {
    if (this.builderMode === 'paint') {
      this.terrainButtonsContainer.style.display = 'flex';
      this.holeControlsContainer.style.display = 'none';
      this.helpText.textContent = 'Left-click: Paint | Scroll: Zoom | Right-drag: Pan | Ctrl+Z: Undo';
    } else {
      this.terrainButtonsContainer.style.display = 'none';
      this.holeControlsContainer.style.display = 'flex';
      this.helpText.textContent = 'Left-click: Place tee/cup | Scroll: Zoom | Right-drag: Pan | Ctrl+Z: Undo';
    }
  }

  private updateHoleButtonSelection(): void {
    for (const btn of this.holeButtons) {
      const id = Number(btn.dataset.holeId);
      btn.style.background = id === this.selectedHoleId ? '#4a8f3f' : '#444';
    }
  }

  private updateHoleUI(): void {
    const store = courseStore.getState();
    const hole = store.holes.find((h) => h.id === this.selectedHoleId);
    if (!hole) return;

    const teeStatus = hole.tee ? `✓ (${hole.tee.col},${hole.tee.row})` : '✗ (click tile)';
    const cupStatus = hole.cup ? `✓ (${hole.cup.col},${hole.cup.row})` : '✗ (click tile)';
    const parText = hole.par ? `Par ${hole.par}` : '-';

    this.holeStatusDisplay.innerHTML = `
      <div><strong>Hole ${hole.id}</strong></div>
      <div>Tee: ${teeStatus}</div>
      <div>Cup: ${cupStatus}</div>
      <div>Par: ${parText}</div>
    `;

    // Update hole buttons to show completion status
    for (const btn of this.holeButtons) {
      const id = Number(btn.dataset.holeId);
      const h = store.holes.find((hh) => hh.id === id);
      if (h?.tee && h?.cup) {
        btn.style.borderColor = '#4caf50';
      } else if (h?.tee || h?.cup) {
        btn.style.borderColor = '#ff9800';
      } else {
        btn.style.borderColor = 'transparent';
      }
    }
  }

  private updatePaletteSelection(): void {
    const buttons = this.terrainButtonsContainer.querySelectorAll('button');
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
    this.teeSprites.forEach((s) => s.destroy());
    this.flagSprites.forEach((s) => s.destroy());
    this.treeOverlaySprites.forEach((s) => s.destroy());
    this.terrainPalette?.remove();
    this.moneyDisplay?.remove();
    this.helpText?.remove();
    document.querySelectorAll('.builder-toast').forEach((el) => el.remove());
    document.removeEventListener('keydown', this.keydownHandler);
  }
}
