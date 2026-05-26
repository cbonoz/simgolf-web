import * as Phaser from 'phaser';
import { courseStore, Tile, HoleConfig } from '../state/course';
import { golferStore, Golfer, generateThought } from '../state/golfers';
import { GRID_COLS, GRID_ROWS, TILE_WIDTH, TILE_HEIGHT, TerrainType, TERRAIN_TYPES, TERRAIN_COST, VEGETATION_TYPES, TERRAIN_EFFECTS, MAX_STROKES_PER_HOLE } from '../utils/constants';
import { tileToScreen, screenToTile, clampTile, calculatePar } from '../utils/helpers';
import { Ball } from '../entities/Ball';

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
  private vegetationOverlaySprites: Map<string, Phaser.GameObjects.Sprite> = new Map();
  private selectedVegetation: string = VEGETATION_TYPES[0].key;
  private vegetationPickerContainer!: HTMLDivElement;
  private vegetationSidePanel: HTMLDivElement | null = null;
  private modeButtons: HTMLButtonElement[] = [];
  private holeButtons: HTMLButtonElement[] = [];
  private holeStatusDisplay!: HTMLDivElement;
  private terrainButtonsContainer!: HTMLDivElement;
  private holeControlsContainer!: HTMLDivElement;

  // Golfers (unified build+play)
  private golferSprites: Map<number, Phaser.GameObjects.Sprite> = new Map();
  private activeBall: Ball | null = null;
  private spawnTimer = 0;
  private readonly SPAWN_INTERVAL = 4000; // ms between spawns
  private readonly MAX_GOLFERS = 8;
  private timeScale = 1;
  private scorecardEl!: HTMLDivElement;
  private timeControlsContainer!: HTMLDivElement;
  private golferTooltip: HTMLDivElement | null = null;
  private golferCountDisplay!: HTMLDivElement;
  private playActive = true; // golfers active by default

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
    const cam = this.cameras.main;
    const centerCol = (GRID_COLS - 1) / 2;
    const centerRow = (GRID_ROWS - 1) / 2;
    cam.scrollX = (centerCol - centerRow) * (TILE_WIDTH / 2) + this.OFFSET_X - cam.width / 2;
    cam.scrollY = (centerCol + centerRow) * (TILE_HEIGHT / 2) + this.OFFSET_Y - cam.height / 2;

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

    // Clean up DOM elements on scene shutdown
    this.events.on('shutdown', this.shutdown, this);

    // Keyboard
    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
    }

    this.createUI();
    this.setupInput();
    this.refreshHoleOverlays();
    if (loaded) this.updateHoleUI();
    document.addEventListener('keydown', this.keydownHandler);

    // Initialize golfers for unified build+play
    golferStore.getState().resetGolfers();
    this.spawnInitialGolfers();
  }

  private spawnInitialGolfers(): void {
    const store = courseStore.getState();
    const hole1 = store.holes.find((h) => h.id === 1);
    if (!hole1?.tee) return;
    // Spawn one pair (2 golfers) + one solo = 3 initial golfers
    this.spawnGolferPair();
    this.spawnGolfer();
  }

  private spawnGolferPair(): [Golfer, Golfer] | null {
    const store = courseStore.getState();
    const hole1 = store.holes.find((h) => h.id === 1);
    if (!hole1?.tee) return null;

    const gStore = golferStore.getState();
    if (gStore.golfers.length + 2 > this.MAX_GOLFERS) return null;

    // Spawn two golfers with slight offset
    const golferA = gStore.spawnGolfer(hole1.tee.col, hole1.tee.row);
    const golferB = gStore.spawnGolfer(hole1.tee.col, hole1.tee.row);
    if (!golferA || !golferB) return null;

    // Offset B slightly so they don't perfectly overlap
    golferB.tilePos = { col: hole1.tee.col, row: hole1.tee.row };

    const posA = this.tileToWorld(golferA.tilePos.col, golferA.tilePos.row);
    const posB = this.tileToWorld(golferB.tilePos.col, golferB.tilePos.row);

    const spriteA = this.add.sprite(posA.x - 3, posA.y - 4, `golfer_${golferA.colorIndex}`);
    spriteA.setOrigin(0.5, 1);
    spriteA.setScale(1.0);
    spriteA.setDepth(this.getGolferDepth(golferA.tilePos.col, golferA.tilePos.row));
    this.golferSprites.set(golferA.id, spriteA);

    const spriteB = this.add.sprite(posB.x + 3, posB.y - 4, `golfer_${golferB.colorIndex}`);
    spriteB.setOrigin(0.5, 1);
    spriteB.setScale(1.0);
    spriteB.setDepth(this.getGolferDepth(golferB.tilePos.col, golferB.tilePos.row));
    this.golferSprites.set(golferB.id, spriteB);

    return [golferA, golferB];
  }

  private spawnGolfer(): Golfer | null {
    const store = courseStore.getState();
    const hole1 = store.holes.find((h) => h.id === 1);
    if (!hole1?.tee) return null;

    const gStore = golferStore.getState();
    if (gStore.golfers.length >= this.MAX_GOLFERS) return null;

    const golfer = gStore.spawnGolfer(hole1.tee.col, hole1.tee.row);
    if (!golfer) return null;

    const pos = this.tileToWorld(golfer.tilePos.col, golfer.tilePos.row);
    const sprite = this.add.sprite(pos.x, pos.y - 4, `golfer_${golfer.colorIndex}`);
    sprite.setOrigin(0.5, 1);
    sprite.setScale(0.9); // Slightly smaller than pair sprites
    sprite.setDepth(this.getGolferDepth(golfer.tilePos.col, golfer.tilePos.row));
    this.golferSprites.set(golfer.id, sprite);

    return golfer;
  }

  private getGolferDepth(col: number, row: number): number {
    return (col + row) * GRID_COLS + col + 0.5;
  }

  private tileToWorld(col: number, row: number): { x: number; y: number } {
    return tileToScreen(col, row, this.OFFSET_X, this.OFFSET_Y);
  }

  private worldToTile(worldX: number, worldY: number): { col: number; row: number } {
    const result = screenToTile(worldX, worldY, this.OFFSET_X, this.OFFSET_Y);
    return clampTile(result.col, result.row, GRID_COLS, GRID_ROWS);
  }

  private updateHelpText(): void {
    if (this.builderMode === 'paint') {
      this.helpText.textContent = 'Left-click: Paint | Click golfer: Inspect | Scroll: Zoom | Right-drag: Pan | Ctrl+Z: Undo';
    } else {
      this.helpText.textContent = 'Left-click: Place tee/cup | Click golfer: Inspect | Scroll: Zoom | Right-drag: Pan | Ctrl+Z: Undo';
    }
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
        sprite.setDepth((col + row) * GRID_COLS + col);
        this.tileSprites[row][col] = sprite;

        if (tile.vegetation) {
          this.addVegetationOverlay(col, row, pos, tile.vegetation);
        }
      }
    }
  }

  private addVegetationOverlay(
    col: number,
    row: number,
    pos: { x: number; y: number },
    vegetationKey: string
  ): void {
    const key = `${col},${row}`;
    if (this.vegetationOverlaySprites.has(key)) return;

    const plant = this.add.sprite(pos.x, pos.y - 4, vegetationKey);
    plant.setOrigin(0.5, 1);
    plant.setScale(0.55);
    plant.setDepth((col + row) * GRID_COLS + col + 0.5);
    this.vegetationOverlaySprites.set(key, plant);
  }

  private removeVegetationOverlay(col: number, row: number): void {
    const key = `${col},${row}`;
    const plant = this.vegetationOverlaySprites.get(key);
    if (plant) {
      plant.destroy();
      this.vegetationOverlaySprites.delete(key);
    }
  }

  private refreshGrid(): void {
    const store = courseStore.getState();
    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        const tile = store.grid[row][col];
        this.tileSprites[row][col].setTexture(`tile_${tile.type}`);

        const key = `${col},${row}`;
        if (tile.vegetation) {
          const pos = this.tileToWorld(col, row);
          this.addVegetationOverlay(col, row, pos, tile.vegetation);
        } else {
          this.removeVegetationOverlay(col, row);
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

      // Check if clicking on a golfer (inspect mode)
      const clickedGolfer = this.findGolferAt(pointer.worldX, pointer.worldY);
      if (clickedGolfer) {
        this.showGolferTooltip(clickedGolfer);
        return;
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

    // Prevent painting over tees or cups
    if (tile.isTee || tile.isCup) {
      this.showTemporaryMessage("Can't paint over tee or cup!");
      return;
    }

    // Trees terrain: place or replace vegetation
    if (this.selectedTerrain === 'trees') {
      if (tile.type !== 'trees') {
        // Need to place base terrain first
        const terrainCost = TERRAIN_COST.trees;
        const vegInfo = VEGETATION_TYPES.find((v) => v.key === this.selectedVegetation);
        const vegCost = vegInfo?.cost ?? 0;
        const totalCost = terrainCost + vegCost;

        if (store.money < totalCost) {
          this.showTemporaryMessage(`Not enough money! Need $${totalCost.toLocaleString()}, have $${store.money.toLocaleString()}`);
          return;
        }
        if (store.spendMoney(totalCost)) {
          store.setTile(col, row, 'trees');
          store.setVegetation(col, row, this.selectedVegetation);
          this.refreshGrid();
        }
      } else if (tile.vegetation !== this.selectedVegetation) {
        // Already trees, just changing vegetation
        const vegInfo = VEGETATION_TYPES.find((v) => v.key === this.selectedVegetation);
        const vegCost = vegInfo?.cost ?? 0;
        if (store.money < vegCost) {
          this.showTemporaryMessage(`Not enough money! Need $${vegCost.toLocaleString()}, have $${store.money.toLocaleString()}`);
          return;
        }
        if (store.spendMoney(vegCost)) {
          store.setVegetation(col, row, this.selectedVegetation);
          this.refreshGrid();
        }
      }
      return;
    }

    // Non-tree terrain painting
    if (tile.type === this.selectedTerrain) return;

    const cost = TERRAIN_COST[this.selectedTerrain];
    if (store.money < cost) {
      this.showTemporaryMessage(`Not enough money! Need $${cost.toLocaleString()}, have $${store.money.toLocaleString()}`);
      return;
    }

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
        sprite.setDepth((hole.tee.col + hole.tee.row) * GRID_COLS + hole.tee.col + 0.3);
        this.teeSprites.set(`tee_${hole.id}`, sprite);
      }
      if (hole.cup) {
        const pos = this.tileToWorld(hole.cup.col, hole.cup.row);
        const sprite = this.add.sprite(pos.x, pos.y - 6, 'flag');
        sprite.setOrigin(0.5, 1);
        sprite.setDepth((hole.cup.col + hole.cup.row) * GRID_COLS + hole.cup.col + 0.3);
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
        this.updateVegetationPickerVisibility();
      });
      this.terrainButtonsContainer.appendChild(btn);
    }
    this.terrainPalette.appendChild(this.terrainButtonsContainer);

    // Compact "Current Plant" indicator inside the builder panel
    this.vegetationPickerContainer = document.createElement('div');
    this.vegetationPickerContainer.style.cssText =
      'display: none; flex-direction: column; gap: 6px; margin-top: 4px; padding-top: 8px; border-top: 1px solid #555;';

    const currentLabel = document.createElement('div');
    currentLabel.textContent = '🌿 Current Plant';
    currentLabel.style.cssText = 'color: #aaa; font-size: 11px;';
    this.vegetationPickerContainer.appendChild(currentLabel);

    const currentPreview = document.createElement('div');
    currentPreview.id = 'veg-current-preview';
    currentPreview.style.cssText =
      'display: flex; align-items: center; gap: 8px; padding: 6px; background: #2a2a2a; border-radius: 4px; cursor: pointer;';
    currentPreview.addEventListener('click', () => this.showVegetationSidePanel());
    this.vegetationPickerContainer.appendChild(currentPreview);

    this.terrainPalette.appendChild(this.vegetationPickerContainer);

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
    this.updateVegetationPickerVisibility();
    this.updateVegetationPickerSelection();
    this.updateHoleUI();

    // Return to Menu button
    const returnBtn = document.createElement('button');
    returnBtn.textContent = '🔙 Return to Menu';
    returnBtn.style.cssText = `
      margin-top: 4px; padding: 8px; border: 2px solid #1565c0; border-radius: 4px;
      cursor: pointer; font-size: 12px; background: #444; color: #90caf9;
      font-weight: bold;
    `;
    returnBtn.addEventListener('click', () => {
      courseStore.getState().saveCourse();
      this.scene.start('TitleScene');
    });
    this.terrainPalette.appendChild(returnBtn);

    // Time controls + golfer info (unified build+play)
    const playSection = document.createElement('div');
    playSection.style.cssText = 'display: flex; flex-direction: column; gap: 6px; margin-top: 8px; padding-top: 8px; border-top: 1px solid #555;';

    const playTitle = document.createElement('div');
    playTitle.textContent = '⛳ Golfers';
    playTitle.style.cssText = 'color: #fff; font-weight: bold; font-size: 13px;';
    playSection.appendChild(playTitle);

    // Time controls
    this.timeControlsContainer = document.createElement('div');
    this.timeControlsContainer.style.cssText = 'display: flex; gap: 4px;';

    const speeds = [
      { label: '⏸️', value: 0 },
      { label: '▶️', value: 1 },
      { label: '⏩', value: 2 },
      { label: '⏩⏩', value: 5 },
    ];

    for (const s of speeds) {
      const btn = document.createElement('button');
      btn.textContent = s.label;
      btn.dataset.speed = String(s.value);
      btn.style.cssText = `
        flex: 1; padding: 4px; border: 2px solid transparent; border-radius: 4px;
        cursor: pointer; font-size: 12px; background: ${s.value === 1 ? '#4a8f3f' : '#444'};
        color: #fff;
      `;
      btn.addEventListener('click', () => {
        this.timeScale = s.value;
        this.playActive = s.value > 0;
        // Update all time buttons
        const buttons = this.timeControlsContainer.querySelectorAll('button');
        buttons.forEach((b) => {
          const speedVal = Number((b as HTMLButtonElement).dataset.speed);
          (b as HTMLButtonElement).style.background = speedVal === this.timeScale ? '#4a8f3f' : '#444';
        });
      });
      this.timeControlsContainer.appendChild(btn);
    }
    playSection.appendChild(this.timeControlsContainer);

    // Golfer count display
    this.golferCountDisplay = document.createElement('div');
    this.golferCountDisplay.style.cssText = 'color: #a8d8a8; font-size: 11px;';
    this.golferCountDisplay.textContent = '0 golfers on course';
    playSection.appendChild(this.golferCountDisplay);

    // Scorecard
    this.scorecardEl = document.createElement('div');
    this.scorecardEl.style.cssText = 'color: #ccc; font-size: 10px; line-height: 1.4; max-height: 120px; overflow-y: auto;';
    playSection.appendChild(this.scorecardEl);

    this.terrainPalette.appendChild(playSection);

    // Download Save button
    const downloadBtn = document.createElement('button');
    downloadBtn.textContent = '💾 Download Save';
    downloadBtn.style.cssText = `
      margin-top: 4px; padding: 8px; border: 2px solid #1565c0; border-radius: 4px;
      cursor: pointer; font-size: 12px; background: #444; color: #90caf9;
      font-weight: bold;
    `;
    downloadBtn.addEventListener('click', () => {
      const json = courseStore.getState().serialize();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'simgolf-course.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
    this.terrainPalette.appendChild(downloadBtn);

    // Money display (clickable to expand loan controls)
    this.moneyDisplay = document.createElement('div');
    this.moneyDisplay.id = 'money-display';
    this.moneyDisplay.style.cssText = `
      position: fixed; top: 10px; right: 10px; z-index: 100;
      background: rgba(0,0,0,0.85); border-radius: 8px; padding: 10px 16px;
      cursor: pointer; user-select: none;
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
    } else {
      this.terrainButtonsContainer.style.display = 'none';
      this.holeControlsContainer.style.display = 'flex';
    }
    this.updateHelpText();
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

  private updateVegetationPickerVisibility(): void {
    if (this.selectedTerrain === 'trees') {
      this.vegetationPickerContainer.style.display = 'flex';
    } else {
      this.vegetationPickerContainer.style.display = 'none';
      this.hideVegetationSidePanel();
    }
  }

  private updateVegetationPickerSelection(): void {
    // Update the compact preview inside the builder panel
    const preview = this.vegetationPickerContainer.querySelector('#veg-current-preview') as HTMLDivElement;
    if (!preview) return;

    const veg = VEGETATION_TYPES.find((v) => v.key === this.selectedVegetation);
    if (!veg) return;

    preview.innerHTML = '';
    const img = document.createElement('img');
    img.src = `assets/sprites/isometric-plants/${veg.key}.png`;
    img.style.cssText = 'width: 32px; height: 32px; object-fit: contain;';
    preview.appendChild(img);

    const info = document.createElement('div');
    info.style.cssText = 'display: flex; flex-direction: column; gap: 2px;';
    const name = document.createElement('span');
    name.textContent = veg.name;
    name.style.cssText = 'font-size: 11px; color: #fff; font-weight: 500;';
    info.appendChild(name);
    const price = document.createElement('span');
    price.textContent = `$${veg.cost}`;
    price.style.cssText = 'font-size: 10px; color: #4caf50;';
    info.appendChild(price);
    preview.appendChild(info);

    const hint = document.createElement('span');
    hint.textContent = '▶';
    hint.style.cssText = 'margin-left: auto; font-size: 10px; color: #888;';
    preview.appendChild(hint);
  }

  private showVegetationSidePanel(): void {
    if (this.vegetationSidePanel) return;

    const panel = document.createElement('div');
    panel.id = 'veg-side-panel';
    panel.style.cssText = `
      position: fixed; top: 10px; left: 190px; z-index: 101;
      background: rgba(0,0,0,0.9); border-radius: 8px; padding: 12px;
      display: flex; flex-direction: column; gap: 8px; font-family: sans-serif;
      width: 320px; max-height: calc(100vh - 20px);
    `;

    // Header with close button
    const header = document.createElement('div');
    header.style.cssText = 'display: flex; justify-content: space-between; align-items: center;';

    const title = document.createElement('div');
    title.textContent = '🌿 Select Plant';
    title.style.cssText = 'color: #fff; font-size: 14px; font-weight: bold;';
    header.appendChild(title);

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'background: none; border: none; color: #aaa; font-size: 16px; cursor: pointer;';
    closeBtn.addEventListener('click', () => this.hideVegetationSidePanel());
    header.appendChild(closeBtn);

    panel.appendChild(header);

    // Category filter tabs
    const categories = [...new Set(VEGETATION_TYPES.map((v) => v.category))];
    const tabs = document.createElement('div');
    tabs.style.cssText = 'display: flex; gap: 4px; flex-wrap: wrap;';

    let activeCategory = 'All';
    const filterButtons: HTMLButtonElement[] = [];

    const allBtn = document.createElement('button');
    allBtn.textContent = 'All';
    allBtn.style.cssText = 'padding: 4px 10px; border-radius: 12px; border: none; cursor: pointer; font-size: 11px; background: #4a8f3f; color: #fff;';
    filterButtons.push(allBtn);
    tabs.appendChild(allBtn);

    for (const cat of categories) {
      const btn = document.createElement('button');
      btn.textContent = cat;
      btn.style.cssText = 'padding: 4px 10px; border-radius: 12px; border: none; cursor: pointer; font-size: 11px; background: #444; color: #ccc;';
      filterButtons.push(btn);
      tabs.appendChild(btn);
    }

    allBtn.addEventListener('click', () => {
      activeCategory = 'All';
      updateFilter();
    });
    for (let i = 1; i < filterButtons.length; i++) {
      filterButtons[i].addEventListener('click', () => {
        activeCategory = categories[i - 1];
        updateFilter();
      });
    }

    panel.appendChild(tabs);

    // Grid container
    const gridContainer = document.createElement('div');
    gridContainer.style.cssText = 'display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; overflow-y: auto; min-height: 0; max-height: calc(100vh - 160px);';
    panel.appendChild(gridContainer);

    const updateFilter = () => {
      // Update tab styles
      filterButtons.forEach((btn, i) => {
        const cat = i === 0 ? 'All' : categories[i - 1];
        const isActive = cat === activeCategory;
        btn.style.background = isActive ? '#4a8f3f' : '#444';
        btn.style.color = isActive ? '#fff' : '#ccc';
      });

      // Rebuild grid
      gridContainer.innerHTML = '';
      const filtered = activeCategory === 'All'
        ? VEGETATION_TYPES
        : VEGETATION_TYPES.filter((v) => v.category === activeCategory);

      for (const veg of filtered) {
        const btn = document.createElement('button');
        btn.dataset.vegKey = veg.key;
        const isSel = veg.key === this.selectedVegetation;
        btn.style.cssText = `
          display: flex; flex-direction: column; align-items: center; gap: 3px;
          padding: 6px 2px; border: 2px solid ${isSel ? '#6bbf5e' : 'transparent'};
          border-radius: 6px; cursor: pointer; font-size: 10px;
          background: ${isSel ? '#3d5c33' : '#2a2a2a'}; color: #fff;
        `;

        const imgBox = document.createElement('div');
        imgBox.style.cssText = 'width: 52px; height: 52px; background: #e8e8e8; border-radius: 4px; display: flex; align-items: center; justify-content: center; overflow: hidden;';
        const img = document.createElement('img');
        img.src = `assets/sprites/isometric-plants/${veg.key}.png`;
        img.style.cssText = 'width: 44px; height: 44px; object-fit: contain;';
        imgBox.appendChild(img);
        btn.appendChild(imgBox);

        const name = document.createElement('span');
        name.textContent = veg.name;
        name.style.cssText = 'font-size: 10px; color: #fff;';
        btn.appendChild(name);

        const price = document.createElement('span');
        price.textContent = `$${veg.cost}`;
        price.style.cssText = 'font-size: 9px; color: #4caf50; font-weight: bold;';
        btn.appendChild(price);

        btn.addEventListener('click', () => {
          this.selectedVegetation = veg.key;
          this.updateVegetationPickerSelection();
          this.hideVegetationSidePanel();
        });

        gridContainer.appendChild(btn);
      }
    };

    updateFilter();
    document.body.appendChild(panel);
    this.vegetationSidePanel = panel;
  }

  private hideVegetationSidePanel(): void {
    if (this.vegetationSidePanel) {
      this.vegetationSidePanel.remove();
      this.vegetationSidePanel = null;
    }
  }

  private updateMoneyDisplay(): void {
    const store = courseStore.getState();
    if (!this.moneyDisplay) return;

    let header = this.moneyDisplay.querySelector('.money-header') as HTMLElement;
    let expanded = this.moneyDisplay.querySelector('.money-expanded') as HTMLElement;

    if (!header) {
      this.moneyDisplay.innerHTML = '';
      header = document.createElement('div');
      header.className = 'money-header';
      header.style.cssText = 'cursor: pointer; color: #4caf50; font-family: monospace; font-size: 18px; font-weight: bold;';
      this.moneyDisplay.appendChild(header);

      expanded = document.createElement('div');
      expanded.className = 'money-expanded';
      expanded.style.cssText = 'display: none; margin-top: 6px; padding-top: 6px; border-top: 1px solid #444;';
      expanded.innerHTML = `
        <div class="debt-info" style="font-family:monospace;font-size:13px;line-height:1.6;color:#ccc;"></div>
        <div style="display:flex;gap:4px;margin-top:4px;">
          <input type="number" min="0" step="100" value="1000"
            style="width:80px;padding:6px;border:1px solid #555;border-radius:4px;background:#333;color:#fff;font-size:12px;font-family:monospace;">
          <button class="loan-borrow"
            style="padding:6px 10px;border:1px solid #2e7d32;border-radius:4px;cursor:pointer;font-size:11px;background:#444;color:#81c784;font-weight:bold;">Borrow</button>
          <button class="loan-repay"
            style="padding:6px 10px;border:1px solid #ef5350;border-radius:4px;cursor:pointer;font-size:11px;background:#444;color:#ef5350;font-weight:bold;">Repay</button>
        </div>
      `;
      this.moneyDisplay.appendChild(expanded);

      const input = expanded.querySelector('input')!;
      expanded.querySelector('.loan-borrow')!.addEventListener('click', () => {
        const amount = parseInt(input.value, 10);
        if (amount > 0) {
          courseStore.getState().takeLoan(amount);
          this.updateMoneyDisplay();
          input.value = '1000';
        }
      });
      expanded.querySelector('.loan-repay')!.addEventListener('click', () => {
        const amount = parseInt(input.value, 10);
        if (amount > 0) {
          courseStore.getState().repayLoan(amount);
          this.updateMoneyDisplay();
          input.value = '1000';
        }
      });

      // Toggle expanded section on header click
      header.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = expanded!.style.display !== 'none';
        expanded!.style.display = isOpen ? 'none' : 'block';
        this.updateMoneyDisplay();
      });

      // Dismiss on outside click
      const dismiss = (e: MouseEvent) => {
        if (!this.moneyDisplay!.contains(e.target as Node)) {
          expanded!.style.display = 'none';
        }
      };
      document.addEventListener('click', dismiss);

      // Clean up on scene shutdown
      this.events.on('shutdown', () => {
        document.removeEventListener('click', dismiss);
      });
    }

    const cashColor = store.money > 0 ? '#4caf50' : '#ef5350';
    header.innerHTML = `<span style="color:${cashColor};">💰 $${store.money.toLocaleString()}</span>`;

    const debtInfo = this.moneyDisplay.querySelector('.debt-info') as HTMLElement;
    if (debtInfo) {
      const net = store.money - store.debt;
      const lines: string[] = [];
      lines.push(`Cash: <span style="color:${cashColor};">$${store.money.toLocaleString()}</span>`);
      if (store.debt > 0) {
        lines.push(`Debt: <span style="color:#ef5350;">-$${store.debt.toLocaleString()}</span>`);
      } else {
        lines.push('Debt: <span style="color:#666;">$0</span>');
      }
      const netColor = net >= 0 ? '#81c784' : '#ef5350';
      lines.push(`Net: <span style="color:${netColor};">$${net.toLocaleString()}</span>`);
      debtInfo.innerHTML = lines.join('<br>');
    }
  }

  update(time: number, delta: number): void {
    // Keyboard camera pan
    if (this.cursors) {
      const cam = this.cameras.main;
      const speed = 5;
      if (this.cursors.left.isDown) cam.scrollX -= speed;
      if (this.cursors.right.isDown) cam.scrollX += speed;
      if (this.cursors.up.isDown) cam.scrollY -= speed;
      if (this.cursors.down.isDown) cam.scrollY += speed;
    }

    if (!this.playActive) {
      // Still sync sprite positions when paused
      this.syncGolferSprites();
      this.updateScorecard();
      return;
    }

    const scaledDelta = delta * this.timeScale;

    // Update ball flight
    if (this.activeBall) {
      this.activeBall.update(scaledDelta);
      if (this.activeBall.complete) {
        this.activeBall = null;
      }
    }

    // Spawn timer — spawn in pairs
    this.spawnTimer += scaledDelta;
    if (this.spawnTimer >= this.SPAWN_INTERVAL) {
      this.spawnTimer = 0;
      // Try pair first, fall back to solo if near capacity
      const pair = this.spawnGolferPair();
      if (!pair) {
        this.spawnGolfer();
      }
    }

    // Update each golfer
    const gStore = golferStore.getState();
    const store = courseStore.getState();

    for (const golfer of [...gStore.golfers]) {
      if (golfer.state === 'round_complete') continue;

      golfer.stateTimer -= scaledDelta;
      if (golfer.stateTimer > 0) continue;

      switch (golfer.state) {
        case 'addressing':
          this.transitionToSwinging(golfer);
          break;
        case 'swinging':
          this.executeSwing(golfer);
          break;
        case 'ball_flight':
          break;
        case 'reacting':
          this.transitionToNext(golfer);
          break;
        case 'walking':
          this.transitionToAddressing(golfer);
          break;
        case 'hole_complete':
          this.transitionToNextHole(golfer);
          break;
      }
    }

    // Sync sprite positions — pairs get slight x-offset
    this.syncGolferSprites();

    // Update UI
    this.updateScorecard();
    this.updateGolferCount();
  }

  private syncGolferSprites(): void {
    const gStore = golferStore.getState();
    // Group golfers by tile position to detect pairs
    const tileGroups = new Map<string, Golfer[]>();
    for (const golfer of gStore.golfers) {
      const key = `${golfer.tilePos.col},${golfer.tilePos.row}`;
      const group = tileGroups.get(key) ?? [];
      group.push(golfer);
      tileGroups.set(key, group);
    }

    for (const [_, golfers] of tileGroups) {
      // Sort by ID for stable ordering
      golfers.sort((a, b) => a.id - b.id);
      const count = golfers.length;
      for (let i = 0; i < count; i++) {
        const golfer = golfers[i];
        const sprite = this.golferSprites.get(golfer.id);
        if (sprite) {
          const pos = this.tileToWorld(golfer.tilePos.col, golfer.tilePos.row);
          // Spread multiple golfers on same tile horizontally
          const spreadX = count === 1 ? 0 : (i - (count - 1) / 2) * 6;
          sprite.setPosition(pos.x + spreadX, pos.y - 4);
          sprite.setDepth(this.getGolferDepth(golfer.tilePos.col, golfer.tilePos.row) + i * 0.01);
        }
      }
    }
  }

  private updateScorecard(): void {
    const gStore = golferStore.getState();
    if (gStore.golfers.length === 0) {
      this.scorecardEl.innerHTML = '<em>No golfers on course</em>';
      return;
    }

    let html = '<table style="border-collapse:collapse;width:100%;"><tr><th style="text-align:left;padding:1px 3px;">#</th><th style="text-align:left;padding:1px 3px;">Hole</th><th style="text-align:left;padding:1px 3px;">Str</th><th style="text-align:left;padding:1px 3px;">Tot</th></tr>';
    for (const g of gStore.golfers) {
      const holeLabel = g.currentHole <= 9 ? `H${g.currentHole}` : 'Done';
      html += `<tr><td style="padding:1px 3px;">${g.id}</td><td style="padding:1px 3px;">${holeLabel}</td><td style="padding:1px 3px;">${g.strokes}</td><td style="padding:1px 3px;">${g.totalStrokes}</td></tr>`;
    }
    html += '</table>';
    this.scorecardEl.innerHTML = html;
  }

  private updateGolferCount(): void {
    const gStore = golferStore.getState();
    const active = gStore.golfers.filter((g) => g.onCourse).length;
    this.golferCountDisplay.textContent = `${active} golfer${active !== 1 ? 's' : ''} on course`;
  }

  // === GOLFER CLICK INSPECT ===

  private findGolferAt(worldX: number, worldY: number): Golfer | null {
    const gStore = golferStore.getState();
    for (const golfer of gStore.golfers) {
      const pos = this.tileToWorld(golfer.tilePos.col, golfer.tilePos.row);
      const dx = worldX - pos.x;
      const dy = worldY - (pos.y - 4);
      if (dx * dx + dy * dy < 400) { // ~20px radius
        return golfer;
      }
    }
    return null;
  }

  private showGolferTooltip(golfer: Golfer): void {
    this.hideGolferTooltip();

    const store = courseStore.getState();
    const thought = generateThought(golfer, store.grid, store.holes);

    const tooltip = document.createElement('div');
    tooltip.id = 'golfer-tooltip';
    tooltip.style.cssText = `
      position: fixed; z-index: 200; background: rgba(0,0,0,0.9); border-radius: 8px;
      padding: 10px 14px; color: #fff; font-family: sans-serif; font-size: 12px;
      max-width: 220px; pointer-events: none; line-height: 1.5;
      border: 1px solid #555;
    `;

    const name = document.createElement('div');
    name.textContent = golfer.name;
    name.style.cssText = 'font-weight: bold; color: #ffcc80; margin-bottom: 4px;';
    tooltip.appendChild(name);

    const stats = document.createElement('div');
    stats.style.cssText = 'color: #ccc; font-size: 11px;';
    stats.innerHTML = `
      Skill: ${Math.round(golfer.skill * 100)}% | Hole ${golfer.currentHole}<br>
      Strokes: ${golfer.strokes} | Total: ${golfer.totalStrokes}
    `;
    tooltip.appendChild(stats);

    const thoughtEl = document.createElement('div');
    thoughtEl.textContent = `💭 "${thought}"`;
    thoughtEl.style.cssText = 'color: #a8d8a8; font-style: italic; margin-top: 6px; font-size: 11px;';
    tooltip.appendChild(thoughtEl);

    // Position near the golfer sprite
    const sprite = this.golferSprites.get(golfer.id);
    if (sprite) {
      const matrix = sprite.getWorldTransformMatrix();
      tooltip.style.left = `${matrix.tx + 20}px`;
      tooltip.style.top = `${matrix.ty - 40}px`;
    } else {
      tooltip.style.left = '50%';
      tooltip.style.top = '50%';
      tooltip.style.transform = 'translate(-50%, -50%)';
    }

    document.body.appendChild(tooltip);
    this.golferTooltip = tooltip;

    // Auto-hide after 3 seconds
    setTimeout(() => this.hideGolferTooltip(), 3000);
  }

  private hideGolferTooltip(): void {
    if (this.golferTooltip) {
      this.golferTooltip.remove();
      this.golferTooltip = null;
    }
  }

  // === GOLF SIMULATION (from PlayScene) ===

  private transitionToSwinging(golfer: Golfer): void {
    golferStore.getState().updateGolfer(golfer.id, {
      state: 'swinging',
      stateTimer: 400,
    });
  }

  private executeSwing(golfer: Golfer): void {
    const store = courseStore.getState();
    const hole = store.holes.find((h) => h.id === golfer.currentHole);
    if (!hole?.cup) {
      golferStore.getState().updateGolfer(golfer.id, {
        state: 'hole_complete',
        stateTimer: 0,
      });
      return;
    }

    const cupPos = hole.cup;
    const currentPos = golfer.tilePos;

    const dx = cupPos.col - currentPos.col;
    const dy = cupPos.row - currentPos.row;
    const distance = Math.abs(dx) + Math.abs(dy);

    let targetDistance = this.pickClubDistance(distance);

    const errorFactor = 1 - golfer.skill;
    const angleError = (Math.random() - 0.5) * 2 * Math.PI * 0.25 * errorFactor;
    const distanceError = 1 + (Math.random() - 0.5) * 0.3 * errorFactor;

    targetDistance = Math.round(targetDistance * distanceError);
    targetDistance = Math.max(1, targetDistance);

    let landingCol: number;
    let landingRow: number;

    if (distance <= 1) {
      landingCol = cupPos.col;
      landingRow = cupPos.row;
    } else {
      const angle = Math.atan2(dy, dx) + angleError;
      landingCol = Math.round(currentPos.col + Math.cos(angle) * targetDistance);
      landingRow = Math.round(currentPos.row + Math.sin(angle) * targetDistance);
    }

    const clamped = clampTile(landingCol, landingRow, GRID_COLS, GRID_ROWS);
    landingCol = clamped.col;
    landingRow = clamped.row;

    const previousPos = { ...golfer.tilePos };

    golferStore.getState().updateGolfer(golfer.id, {
      state: 'ball_flight',
      stateTimer: 600,
      previousTilePos: previousPos,
    });

    this.activeBall = new Ball(
      this,
      currentPos.col,
      currentPos.row,
      landingCol,
      landingRow,
      this.OFFSET_X,
      this.OFFSET_Y,
      500,
      () => this.onBallLanded(golfer.id, landingCol, landingRow, previousPos)
    );
  }

  private pickClubDistance(distanceToCup: number): number {
    if (distanceToCup >= 15) return 8;
    if (distanceToCup >= 10) return 6;
    if (distanceToCup >= 6) return 4;
    if (distanceToCup >= 3) return 2;
    return 1;
  }

  private onBallLanded(golferId: number, landingCol: number, landingRow: number, previousPos: { col: number; row: number }): void {
    const gStore = golferStore.getState();
    const golfer = gStore.golfers.find((g) => g.id === golferId);
    if (!golfer || golfer.state === 'round_complete') return;

    const store = courseStore.getState();
    const tile = store.grid[landingRow][landingCol];
    const hole = store.holes.find((h) => h.id === golfer.currentHole);
    const cupPos = hole?.cup;

    let newStrokes = golfer.strokes + 1;
    let newState: 'reacting' | 'hole_complete' = 'reacting';
    let stateTimer = 400;
    let newTilePos = { col: landingCol, row: landingRow };

    const effect = TERRAIN_EFFECTS[tile.type];

    if (tile.type === 'water') {
      newStrokes += 1;
      newTilePos = previousPos;
      stateTimer = 800;
    } else if (tile.type === 'trees') {
      stateTimer = 600;
    } else if (tile.type === 'green' && cupPos) {
      const distToCup = Math.abs(landingCol - cupPos.col) + Math.abs(landingRow - cupPos.row);
      const puttRange = Math.max(1, Math.round(golfer.skill * 3));

      if (distToCup <= puttRange) {
        newTilePos = { col: cupPos.col, row: cupPos.row };
        newState = 'hole_complete';
        stateTimer = 800;
      }
    }

    if (newStrokes >= MAX_STROKES_PER_HOLE) {
      newState = 'hole_complete';
      stateTimer = 500;
    }

    gStore.updateGolfer(golferId, {
      tilePos: newTilePos,
      strokes: newStrokes,
      state: newState,
      stateTimer,
    });
  }

  private transitionToNext(golfer: Golfer): void {
    const store = courseStore.getState();
    const hole = store.holes.find((h) => h.id === golfer.currentHole);
    if (!hole?.cup) return;

    const cupPos = hole.cup;
    const distToCup = Math.abs(golfer.tilePos.col - cupPos.col) + Math.abs(golfer.tilePos.row - cupPos.row);

    if (distToCup <= 0 || golfer.strokes >= MAX_STROKES_PER_HOLE) {
      golferStore.getState().updateGolfer(golfer.id, {
        state: 'hole_complete',
        stateTimer: 0,
      });
    } else {
      golferStore.getState().updateGolfer(golfer.id, {
        state: 'addressing',
        stateTimer: 600,
      });
    }
  }

  private transitionToNextHole(golfer: Golfer): void {
    const store = courseStore.getState();

    // Greens fee per hole (base $5 + par bonus)
    const hole = store.holes.find((h) => h.id === golfer.currentHole);
    const par = hole?.par ?? 3;
    const greensFee = 5 + par; // $8 for par-3, $9 for par-4, $10 for par-5
    store.addMoney(greensFee);

    const scorecard = [...golfer.scorecard, golfer.strokes];
    const newTotal = golfer.totalStrokes + golfer.strokes;

    const nextHoleId = golfer.currentHole + 1;
    const nextHole = store.holes.find((h) => h.id === nextHoleId);

    if (!nextHole?.tee || nextHoleId > 9) {
      golferStore.getState().updateGolfer(golfer.id, {
        scorecard,
        totalStrokes: newTotal,
        state: 'round_complete',
        stateTimer: 0,
        onCourse: false,
      });

      const roundRevenue = 20 + Math.round(golfer.skill * 30);
      store.addMoney(roundRevenue);

      const sprite = this.golferSprites.get(golfer.id);
      if (sprite) {
        sprite.destroy();
        this.golferSprites.delete(golfer.id);
      }
      golferStore.getState().removeGolfer(golfer.id);
      return;
    }

    golferStore.getState().updateGolfer(golfer.id, {
      currentHole: nextHoleId,
      tilePos: { col: nextHole.tee.col, row: nextHole.tee.row },
      strokes: 0,
      scorecard,
      totalStrokes: newTotal,
      state: 'addressing',
      stateTimer: 800,
    });
  }

  private transitionToAddressing(golfer: Golfer): void {
    golferStore.getState().updateGolfer(golfer.id, {
      state: 'addressing',
      stateTimer: 600,
    });
  }

  shutdown(): void {
    this.teeSprites.forEach((s) => s.destroy());
    this.flagSprites.forEach((s) => s.destroy());
    this.vegetationOverlaySprites.forEach((s) => s.destroy());
    this.vegetationOverlaySprites.clear();
    this.golferSprites.forEach((s) => s.destroy());
    this.golferSprites.clear();
    this.hideVegetationSidePanel();
    this.hideGolferTooltip();
    this.terrainPalette?.remove();
    this.moneyDisplay?.remove();
    this.helpText?.remove();
    document.querySelectorAll('.builder-toast').forEach((el) => el.remove());
    document.removeEventListener('keydown', this.keydownHandler);
  }
}
