import * as Phaser from 'phaser';
import { courseStore, Tile, HoleConfig, PlacedBuilding, getClubhousePosition } from '../state/course';
import { golferStore, Golfer, generateThought } from '../state/golfers';
import { GRID_COLS, GRID_ROWS, TILE_WIDTH, TILE_HEIGHT, TerrainType, TERRAIN_TYPES, TERRAIN_COST, VEGETATION_TYPES, TERRAIN_EFFECTS, MAX_STROKES_PER_HOLE, BUILDING_TYPES, BuildingType } from '../utils/constants';
import { GAME_CONFIG } from '../utils/gameConfig';
import { tileToScreen, screenToTile, clampTile, calculatePar, totalCoursePar, countConfiguredHoles } from '../utils/helpers';
import { Ball } from '../entities/Ball';
import { MusicScene } from './MusicScene';

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

  // Height mode: raise (+1) or lower (-1)
  private heightMode: 'raise' | 'lower' | null = null;

  // Hole mode
  private builderMode: 'paint' | 'hole' | 'height' | 'none' = 'paint';
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
  private heightControlsContainer!: HTMLDivElement;
  private modeButtons!: HTMLButtonElement[];
  // Golfers (unified build+play)
  private golferSprites: Map<number, Phaser.GameObjects.Sprite> = new Map();
  private activeBalls: Map<number, Ball> = new Map();
  private spawnTimer = 0;
  private readonly SPAWN_INTERVAL = GAME_CONFIG.SPAWN_INTERVAL;
  private readonly MAX_GOLFERS = GAME_CONFIG.MAX_GOLFERS;
  private readonly MIN_GOLFERS = GAME_CONFIG.MIN_GOLFERS;
  private timeScale = 1;
  private scorecardEl!: HTMLDivElement;
  private courseRecordEl!: HTMLDivElement;
  private courseAvgEl!: HTMLDivElement;
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
    if (e.key === 'Escape' && this.builderMode !== 'none') {
      e.preventDefault();
      this.builderMode = 'none';
      this.updateModeButtons();
      this.updateUIVisibility();
    }
  };

  // Grid offset so all tiles are in positive world space
  private readonly OFFSET_X = (GRID_ROWS - 1) * (TILE_WIDTH / 2) + 100;
  private readonly OFFSET_Y = 100;

  // Shot tracers
  private tracerGraphics: Phaser.GameObjects.Graphics[] = [];
  private readonly TRACER_FADE_DURATION = GAME_CONFIG.TRACER_FADE_DURATION;

  // Landing ball markers (persistent sprites at landing positions)
  private landingBallSprites: Map<number, Phaser.GameObjects.Sprite> = new Map();

  // Elevation slope wall sprites
  private slopeTileSprites: Phaser.GameObjects.Sprite[] = [];

  // Building sprites
  private buildingSprites: Map<string, Phaser.GameObjects.Sprite> = new Map();

  // SFX
  private musicScene!: MusicScene;

  constructor() {
    super({ key: 'BuilderScene' });
  }

  create(): void {
    // Center camera on the grid with zoom to see clubhouse
    const cam = this.cameras.main;
    const centerCol = (GRID_COLS - 1) / 2;
    const centerRow = (GRID_ROWS - 1) / 2;
    cam.scrollX = (centerCol - centerRow) * (TILE_WIDTH / 2) + this.OFFSET_X - cam.width / 2;
    cam.scrollY = (centerCol + centerRow) * (TILE_HEIGHT / 2) + this.OFFSET_Y - cam.height / 2;
    // Zoom out to 0.6 so more of the course (including clubhouse) is visible
    cam.setZoom(0.6);

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

    // Get reference to MusicScene for SFX
    this.musicScene = this.scene.get('MusicScene') as MusicScene;
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

    // Spawn at clubhouse, immediately start walking to tee
    const chPos = getClubhousePosition();
    const golferA = gStore.spawnGolfer(chPos.col, chPos.row);
    const golferB = gStore.spawnGolfer(chPos.col, chPos.row);
    if (!golferA || !golferB) return null;

    // Set both to walk toward the first tee
    gStore.updateGolfer(golferA.id, {
      state: 'walking',
      stateTimer: GAME_CONFIG.WALK_STEP_TIME,
      walkTarget: { col: hole1.tee.col, row: hole1.tee.row },
    });
    gStore.updateGolfer(golferB.id, {
      state: 'walking',
      stateTimer: GAME_CONFIG.WALK_STEP_TIME,
      walkTarget: { col: hole1.tee.col, row: hole1.tee.row },
    });

    // Build sprites at clubhouse position (from golfer tilePos set by spawnGolfer)
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

    // Spawn at clubhouse, immediately start walking to tee
    const chPos = getClubhousePosition();
    const golfer = gStore.spawnGolfer(chPos.col, chPos.row);
    if (!golfer) return null;

    // Walk to first tee
    gStore.updateGolfer(golfer.id, {
      state: 'walking',
      stateTimer: GAME_CONFIG.WALK_STEP_TIME,
      walkTarget: { col: hole1.tee.col, row: hole1.tee.row },
    });

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
    } else if (this.builderMode === 'hole') {
      this.helpText.textContent = 'Left-click: Place tee/cup | Click golfer: Inspect | Scroll: Zoom | Right-drag: Pan | Ctrl+Z: Undo';
    } else if (this.builderMode === 'height') {
      this.helpText.textContent = 'Left-click: Raise/Lower tile | Click golfer: Inspect | Scroll: Zoom | Right-drag: Pan | Ctrl+Z: Undo | Esc: Resume';
    } else {
      this.helpText.textContent = 'Click golfer: Inspect | Scroll: Zoom | Right-drag: Pan | Ctrl+Z: Undo | Esc: Resume';
    }
  }

  private createGrid(): void {
    const store = courseStore.getState();
    this.tileSprites = [];
    // Height scale: 1 unit = 4 pixels of Y offset
    const HEIGHT_SCALE = 4;

    for (let row = 0; row < GRID_ROWS; row++) {
      this.tileSprites[row] = [];
      for (let col = 0; col < GRID_COLS; col++) {
        const basePos = this.tileToWorld(col, row);
        const tile = store.grid[row][col];
        const heightOffset = tile.height * HEIGHT_SCALE;
        const pos = { x: basePos.x, y: basePos.y - heightOffset };
        const sprite = this.add.sprite(pos.x, pos.y, `tile_${tile.type}`);
        sprite.setOrigin(0.5, 0.5);
        sprite.setDepth((col + row) * GRID_COLS + col + tile.height * 2);
        this.tileSprites[row][col] = sprite;

        // Draw slope walls if this tile is higher or lower than neighbors
        this.addSlopeWalls(col, row, pos, tile.height, store.grid);

        if (tile.vegetation) {
          this.addVegetationOverlay(col, row, pos, tile.vegetation);
        }
      }
    }

    // Render buildings from the course store
    this.renderAllBuildings();
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
    const sprite = this.vegetationOverlaySprites.get(key);
    if (sprite) {
      sprite.destroy();
      this.vegetationOverlaySprites.delete(key);
    }
  }

  /**
   * Helper: convert tile coords to world position accounting for elevation.
   */
  private tileWorldWithHeight(col: number, row: number, height: number): { x: number; y: number } {
    const base = this.tileToWorld(col, row);
    return { x: base.x, y: base.y - height * 4 };
  }

  /** Draw slope wall graphics between tiles of different heights */
  private addSlopeWalls(col: number, row: number, pos: { x: number; y: number }, height: number, grid: Tile[][]): void {
    const HEIGHT_SCALE = 4;
    const cx = pos.x;
    const cy = pos.y;
    const hw = TILE_WIDTH / 2;
    const hh = TILE_HEIGHT / 2;

    if (height > 0) {
      // RAISED TILE: draw column faces only on edges where neighbor is LOWER
      // This creates continuous terrain blocks instead of separate columns.
      const wallH = height * HEIGHT_SCALE;
      const shade = Math.min(30 + height * 12, 90);
      const colColor = Phaser.Display.Color.GetColor(shade + 40, shade + 10, shade - 20);

      // Check all 4 neighbors — only draw face where neighbor is lower
      const dirEdges: [number, number, number, number, number, number][] = [
        // [dc, dr, ax, ay, bx, by] — edge vertices (from this tile's perspective)
        [0, -1, cx - hw, cy, cx, cy - hh],        // top neighbor: edge = left → top
        [0, 1, cx + hw, cy, cx, cy + hh],          // bottom neighbor: edge = right → bottom
        [-1, 0, cx, cy - hh, cx - hw, cy],          // left neighbor: edge = top → left
        [1, 0, cx, cy + hh, cx + hw, cy],           // right neighbor: edge = bottom → right
      ];

      for (const [dc, dr, ax, ay, bx, by] of dirEdges) {
        const nc = col + dc;
        const nr = row + dr;
        // Skip if off grid or neighbor is same height or higher
        if (nc >= 0 && nc < GRID_COLS && nr >= 0 && nr < GRID_ROWS &&
            grid[nr][nc].height >= height) continue;

        const g = this.add.graphics();
        g.setDepth((col + row) * GRID_COLS + col - 0.5);
        g.fillStyle(colColor, 1);
        g.beginPath();
        g.moveTo(ax, ay); g.lineTo(bx, by);
        g.lineTo(bx, by + wallH); g.lineTo(ax, ay + wallH);
        g.closePath(); g.fillPath();
        this.slopeTileSprites.push(g as unknown as Phaser.GameObjects.Sprite);
      }
    }

    // LOWER TILE ADJACENT TO HIGHER TILE: draw upward faces on edges
    // where a neighbor is higher than this tile.
    const dirs: [number, number][] = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    for (const [dc, dr] of dirs) {
      const nc = col + dc;
      const nr = row + dr;
      if (nc < 0 || nc >= GRID_COLS || nr < 0 || nr >= GRID_ROWS) continue;
      const nh = grid[nr][nc].height;
      if (nh <= height) continue;

      const diff = nh - height;
      const wallH = diff * HEIGHT_SCALE;

      const g = this.add.graphics();
      g.setDepth((col + row) * GRID_COLS + col + 0.1);

      // Lighter dirt for the face
      const shade = Math.min(0x44 + diff * 10, 0x66);
      g.fillStyle(Phaser.Display.Color.GetColor(shade + 0x33, shade, shade - 0x10), 1);

      // The shared edge face goes UPWARD from this lower tile
      let ax: number, ay: number, bx: number, by: number;
      if (dc === 0) {
        // Row neighbor
        if (dr < 0) {
          // Above: edge from left to top
          ax = cx - hw; ay = cy;
          bx = cx; by = cy - hh;
        } else {
          // Below: edge from right to bottom
          ax = cx + hw; ay = cy;
          bx = cx; by = cy + hh;
        }
      } else {
        // Col neighbor
        if (dc < 0) {
          // Left: edge from top to left
          ax = cx; ay = cy - hh;
          bx = cx - hw; by = cy;
        } else {
          // Right: edge from bottom to right
          ax = cx; ay = cy + hh;
          bx = cx + hw; by = cy;
        }
      }

      g.beginPath();
      g.moveTo(ax, ay); g.lineTo(bx, by);
      g.lineTo(bx, by - wallH); g.lineTo(ax, ay - wallH);
      g.closePath(); g.fillPath();
      this.slopeTileSprites.push(g as unknown as Phaser.GameObjects.Sprite);
    }
  }

  // === BUILDING RENDERING ===

  private renderAllBuildings(): void {
    const store = courseStore.getState();
    for (const bld of store.buildings) {
      this.renderBuilding(bld.typeKey, bld.col, bld.row);
    }
  }

  private renderBuilding(typeKey: string, col: number, row: number): void {
    const key = `${col},${row}`;
    // Remove existing sprite at this position if any
    const existing = this.buildingSprites.get(key);
    if (existing) existing.destroy();

    const pos = this.tileToWorld(col, row);
    const sprite = this.add.sprite(pos.x, pos.y - 8, `building_${typeKey}`);
    sprite.setOrigin(0.5, 1);
    sprite.setDepth((col + row) * GRID_COLS + col + 0.4);
    this.buildingSprites.set(key, sprite);
  }

  private removeBuildingSprite(col: number, row: number): void {
    const key = `${col},${row}`;
    const sprite = this.buildingSprites.get(key);
    if (sprite) {
      sprite.destroy();
      this.buildingSprites.delete(key);
    }
  }

  private refreshGrid(): void {
    const store = courseStore.getState();
    const HEIGHT_SCALE = 4;
    // Clean up old slope walls
    this.slopeTileSprites.forEach((g) => g.destroy());
    this.slopeTileSprites = [];

    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        const tile = store.grid[row][col];
        this.tileSprites[row][col].setTexture(`tile_${tile.type}`);

        // Update position for height
        const basePos = this.tileToWorld(col, row);
        const heightOffset = tile.height * HEIGHT_SCALE;
        const pos = { x: basePos.x, y: basePos.y - heightOffset };
        this.tileSprites[row][col].setPosition(pos.x, pos.y);
        this.tileSprites[row][col].setDepth((col + row) * GRID_COLS + col + tile.height * 2);

        // Draw slope walls
        this.addSlopeWalls(col, row, pos, tile.height, store.grid);

        const key = `${col},${row}`;
        if (tile.vegetation) {
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

    // --- Panning (right-click + drag, or left-click + drag when deselected) ---
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonDown() || (this.builderMode === 'none' && pointer.leftButtonDown())) {
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

      // Check if clicking on a building
      const clickedBuilding = this.findBuildingAt(pointer.worldX, pointer.worldY);
      if (clickedBuilding) {
        this.showBuildingTooltip(clickedBuilding);
        return;
      }

      // Check if clicking on a tee or cup marker on the course tile
      const clickedTile = this.worldToTile(pointer.worldX, pointer.worldY);
      const gridTile = courseStore.getState().grid[clickedTile.row]?.[clickedTile.col];
      if (gridTile && (gridTile.isTee || gridTile.isCup) && pointer.leftButtonDown()) {
        const holeConfig = courseStore.getState().holes.find((h) => h.id === gridTile.hole);
        if (holeConfig) {
          this.showHoleTooltip(holeConfig, gridTile.isTee, pointer.worldX, pointer.worldY);
          return;
        }
      }

      // Left click: start painting — skip in none mode, already handled by panning
      if (this.builderMode === 'none') return;
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
        `Tile: ${tile.col},${tile.row}  H:${store.grid[tile.row]?.[tile.col]?.height ?? 0}  Zoom: ${cam.zoom.toFixed(2)}\n` +
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
    if (this.builderMode === 'none') return;
    this.ensureActionSnapshot();
    if (this.builderMode === 'paint') {
      this.paintTile(col, row);
    } else if (this.builderMode === 'height') {
      this.paintHeightTile(col, row);
    } else {
      this.placeHoleElement(col, row);
    }
  }

  private paintHeightTile(col: number, row: number): void {
    if (!this.heightMode) return;
    const store = courseStore.getState();
    const delta = this.heightMode === 'raise' ? 1 : -1;
    const current = store.grid[row][col].height;
    const next = current + delta;
    if (next < -10 || next > 10) return;
    store.adjustHeight(col, row, delta);
    this.refreshGrid();
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
      // Place tee — costs fairway terrain price
      const cost = TERRAIN_COST.fairway;
      if (!store.spendMoney(cost)) {
        this.showTemporaryMessage(`Not enough money! Need $${cost}, have $${store.money}`);
        return;
      }
      // Auto-place fairway underneath
      const tileType = store.grid[row][col].type;
      if (tileType !== 'fairway' && tileType !== 'green') {
        store.setTile(col, row, 'fairway');
        this.refreshGrid();
      }
      store.setTee(this.selectedHoleId, col, row);
      this.refreshHoleOverlays();
      this.updateHoleUI();
    } else if (!hole.cup) {
      // Place cup — costs green terrain price
      if (hole.tee.col === col && hole.tee.row === row) {
        this.showTemporaryMessage('Cup cannot be on the same tile as tee!');
        return;
      }
      const cost = TERRAIN_COST.green;
      if (!store.spendMoney(cost)) {
        this.showTemporaryMessage(`Not enough money! Need $${cost}, have $${store.money}`);
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
      // Both placed — show confirmation before clearing
      this.showRestartHoleModal(this.selectedHoleId, col, row);
    }
  }

  private showRestartHoleModal(holeId: number, newCol: number, newRow: number): void {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.7); z-index: 500; display: flex;
      align-items: center; justify-content: center;
    `;

    const modal = document.createElement('div');
    modal.style.cssText = `
      background: #2a2a2a; border: 2px solid #ef5350; border-radius: 12px;
      padding: 24px 32px; max-width: 360px; text-align: center;
      font-family: sans-serif; color: #fff;
    `;

    const title = document.createElement('div');
    title.textContent = '⚠️ Restart Hole?';
    title.style.cssText = 'font-size: 18px; font-weight: bold; color: #ff9800; margin-bottom: 12px;';
    modal.appendChild(title);

    const body = document.createElement('div');
    body.style.cssText = 'font-size: 14px; color: #ccc; line-height: 1.5; margin-bottom: 20px;';
    body.innerHTML = `
      Hole ${holeId} already has a tee and cup.<br><br>
      Restarting will <strong>clear the current hole</strong> and place a new tee here for <strong>$${TERRAIN_COST.fairway}</strong>.
    `;
    modal.appendChild(body);

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display: flex; gap: 12px; justify-content: center;';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = `
      padding: 10px 20px; border: 2px solid #555; border-radius: 6px;
      cursor: pointer; font-size: 14px; background: #444; color: #ccc;
      font-weight: bold;
    `;
    cancelBtn.addEventListener('click', () => overlay.remove());
    btnRow.appendChild(cancelBtn);

    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = 'Restart Hole';
    confirmBtn.style.cssText = `
      padding: 10px 20px; border: 2px solid #ef5350; border-radius: 6px;
      cursor: pointer; font-size: 14px; background: #c62828; color: #fff;
      font-weight: bold;
    `;
    confirmBtn.addEventListener('click', () => {
      const store = courseStore.getState();
      const cost = TERRAIN_COST.fairway;
      if (!store.spendMoney(cost)) {
        this.showTemporaryMessage(`Not enough money! Need $${cost}, have $${store.money}`);
        overlay.remove();
        return;
      }
      store.clearHole(holeId);
      const tileType = store.grid[newRow][newCol].type;
      if (tileType !== 'fairway' && tileType !== 'green') {
        store.setTile(newCol, newRow, 'fairway');
        this.refreshGrid();
      }
      store.setTee(holeId, newCol, newRow);
      this.refreshHoleOverlays();
      this.updateHoleUI();
      overlay.remove();
    });
    btnRow.appendChild(confirmBtn);

    modal.appendChild(btnRow);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
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
      min-width: 180px; width: 180px; max-height: 90vh; overflow-y: auto;
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
    const noneBtn = document.createElement('button');
    noneBtn.textContent = '✕';
    noneBtn.title = 'Deselect tool (Esc)';
    const heightBtn = document.createElement('button');
    heightBtn.textContent = '⛰️ Hgt';
    heightBtn.title = 'Raise/lower terrain';
    this.modeButtons = [paintBtn, holeBtn, heightBtn, noneBtn];

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
    noneBtn.addEventListener('click', () => {
      this.builderMode = 'none';
      this.updateModeButtons();
      this.updateUIVisibility();
    });
    heightBtn.addEventListener('click', () => {
      this.builderMode = 'height';
      this.heightMode = 'raise';
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

    // Height controls container
    this.heightControlsContainer = document.createElement('div');
    this.heightControlsContainer.style.cssText = 'display: none; flex-direction: column; gap: 6px;';

    const heightLabel = document.createElement('div');
    heightLabel.textContent = 'Elevation (click to adjust):';
    heightLabel.style.cssText = 'color: #aaa; font-size: 12px;';
    this.heightControlsContainer.appendChild(heightLabel);

    const raiseBtn = document.createElement('button');
    raiseBtn.textContent = '⬆️ Raise (+1)';
    raiseBtn.style.cssText = `
      padding: 8px; border: 2px solid #8f6f3f; border-radius: 4px;
      cursor: pointer; font-size: 12px; background: #5a4a2a; color: #ffcc80;
      font-weight: bold;
    `;
    raiseBtn.addEventListener('click', () => {
      this.heightMode = 'raise';
      raiseBtn.style.borderColor = '#e0b06b';
      lowerBtn.style.borderColor = '#8f6f3f';
    });
    this.heightControlsContainer.appendChild(raiseBtn);

    const lowerBtn = document.createElement('button');
    lowerBtn.textContent = '⬇️ Lower (−1)';
    lowerBtn.style.cssText = `
      padding: 8px; border: 2px solid #8f6f3f; border-radius: 4px;
      cursor: pointer; font-size: 12px; background: #4a3a2a; color: #b0a0a0;
      font-weight: bold;
    `;
    lowerBtn.addEventListener('click', () => {
      this.heightMode = 'lower';
      raiseBtn.style.borderColor = '#8f6f3f';
      lowerBtn.style.borderColor = '#e0b06b';
    });
    this.heightControlsContainer.appendChild(lowerBtn);

    const heightInfo = document.createElement('div');
    heightInfo.style.cssText = 'color: #888; font-size: 10px; line-height: 1.3;';
    heightInfo.textContent = 'Raise clicked tiles by 1. Adjacent tiles marked with slopes. Range: −10 to +10.';
    this.heightControlsContainer.appendChild(heightInfo);

    this.terrainPalette.appendChild(this.heightControlsContainer);

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
    playSection.id = 'golfer-panel';
    playSection.style.cssText = `
      position: fixed; top: 55px; right: 10px; z-index: 100;
      background: rgba(0,0,0,0.85); border-radius: 8px; padding: 12px;
      display: flex; flex-direction: column; gap: 6px; font-family: sans-serif;
      min-width: 180px;
    `;

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

    // Course record display
    this.courseRecordEl = document.createElement('div');
    this.courseRecordEl.style.cssText = 'color: #ffd700; font-size: 11px; margin-top: 2px;';
    this.courseRecordEl.textContent = '';
    playSection.appendChild(this.courseRecordEl);

    // Course par + average display
    this.courseAvgEl = document.createElement('div');
    this.courseAvgEl.style.cssText = 'color: #aaa; font-size: 10px; margin-top: 1px;';
    this.courseAvgEl.textContent = '';
    playSection.appendChild(this.courseAvgEl);

    // Scorecard
    this.scorecardEl = document.createElement('div');
    this.scorecardEl.style.cssText = 'color: #ccc; font-size: 10px; line-height: 1.4; max-height: 180px; overflow-y: auto;';
    playSection.appendChild(this.scorecardEl);

    document.body.appendChild(playSection);

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
    this.modeButtons[2].style.background = this.builderMode === 'height' ? '#8f6f3f' : '#444';
    this.modeButtons[2].style.borderColor = this.builderMode === 'height' ? '#e0b06b' : 'transparent';
    this.modeButtons[3].style.background = this.builderMode === 'none' ? '#8f3f3f' : '#444';
    this.modeButtons[3].style.borderColor = this.builderMode === 'none' ? '#e06b6b' : 'transparent';
  }

  private updateUIVisibility(): void {
    if (this.builderMode === 'paint') {
      this.terrainPalette.style.display = 'flex';
      this.terrainButtonsContainer.style.display = 'flex';
      this.holeControlsContainer.style.display = 'none';
      this.heightControlsContainer.style.display = 'none';
    } else if (this.builderMode === 'hole') {
      this.terrainPalette.style.display = 'flex';
      this.terrainButtonsContainer.style.display = 'none';
      this.holeControlsContainer.style.display = 'flex';
      this.heightControlsContainer.style.display = 'none';
    } else if (this.builderMode === 'height') {
      this.terrainPalette.style.display = 'flex';
      this.terrainButtonsContainer.style.display = 'none';
      this.holeControlsContainer.style.display = 'none';
      this.heightControlsContainer.style.display = 'flex';
    } else {
      // Deselected — keep palette visible but show no tool content
      this.terrainPalette.style.display = 'flex';
      this.terrainButtonsContainer.style.display = 'none';
      this.holeControlsContainer.style.display = 'none';
      this.heightControlsContainer.style.display = 'none';
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
    const stars = '⭐'.repeat(Math.round(store.reputation));
    header.innerHTML = `<span style="color:${cashColor};">💰 $${store.money.toLocaleString()}</span> <span style="font-size:13px;color:#ffd700;">${stars}</span>`;

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
      const repMult = Math.round(store.getReputationMultiplier() * 100);
      lines.push(`Reputation: <span style="color:#ffd700;">${store.reputation.toFixed(1)} ★</span> (${repMult}% fees)`);
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

    // Update ball flights (per-golfer, supports simultaneous swings)
    for (const [golferId, ball] of this.activeBalls) {
      ball.update(scaledDelta);
      if (ball.complete) {
        // Save the sprite as a landing marker before removing from active balls
        this.landingBallSprites.set(golferId, ball.sprite);
        this.activeBalls.delete(golferId);
      }
    }

    // Spawn timer — slow fallback, but main trigger is hole completion
    this.spawnTimer += scaledDelta;
    const gStore = golferStore.getState();
    const activeCount = gStore.golfers.filter((g) => g.onCourse && g.state !== 'round_complete').length;

    if (activeCount < this.MIN_GOLFERS && this.spawnTimer >= this.SPAWN_INTERVAL) {
      this.spawnTimer = 0;
      const pair = this.spawnGolferPair();
      if (!pair) this.spawnGolfer();
    }

    // Update each golfer
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
          this.stepTowardWalkTarget(golfer);
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
    const lerpRate = 0.08;
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
          const targetX = pos.x + spreadX;
          const targetY = pos.y - 4;

          // Lerp toward target for smooth gliding movement
          // Snap instantly only during ball flight to keep up with ball
          const instant = golfer.state === 'ball_flight';
          if (instant) {
            sprite.setPosition(targetX, targetY);
          } else {
            sprite.x += (targetX - sprite.x) * lerpRate;
            sprite.y += (targetY - sprite.y) * lerpRate;
            // Snap if very close to avoid perpetual micro-movement
            if (Math.abs(sprite.x - targetX) < 0.5) sprite.x = targetX;
            if (Math.abs(sprite.y - targetY) < 0.5) sprite.y = targetY;
          }

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
    const active = gStore.golfers.filter((g) => g.onCourse && g.state !== 'round_complete').length;
    this.golferCountDisplay.textContent = `${active} golfer${active !== 1 ? 's' : ''} on course`;

    // Update course record display
    const store = courseStore.getState();
    if (store.courseRecord !== null && store.courseRecordDate && store.courseRecordPar !== null) {
      const date = new Date(store.courseRecordDate);
      const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const vsPar = store.courseRecord - store.courseRecordPar;
      const parStr = vsPar <= 0 ? `${vsPar}` : `+${vsPar}`;
      this.courseRecordEl.textContent = `🏆 Course Record: ${parStr} (Par: ${store.courseRecordPar}) — ${dateStr}`;
    } else {
      this.courseRecordEl.textContent = '';
    }

    // Course par + average
    const coursePar = totalCoursePar(store.holes);
    const numHoles = countConfiguredHoles(store.holes);
    if (numHoles > 0) {
      const scores = store.completedScores;
      if (scores.length > 0) {
        const avg = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
        this.courseAvgEl.textContent = `Par ${coursePar} · Avg: ${avg.toFixed(1)} (${scores.length} rounds)`;
      } else {
        this.courseAvgEl.textContent = `Par ${coursePar} (${numHoles} holes)`;
      }
    } else {
      this.courseAvgEl.textContent = '';
    }
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
      position: fixed; z-index: 200; background: rgba(0,0,0,0.95); border-radius: 10px;
      padding: 16px 20px; color: #fff; font-family: sans-serif; font-size: 14px;
      width: 280px; pointer-events: none; line-height: 1.6;
      border: 1px solid #ffcc80;
      top: 10px; right: 220px;
    `;

    const name = document.createElement('div');
    name.textContent = golfer.name;
    name.style.cssText = 'font-weight: bold; color: #ffcc80; font-size: 18px; margin-bottom: 4px;';
    tooltip.appendChild(name);

    // Trait line
    const traitEl = document.createElement('div');
    traitEl.style.cssText = 'color: #ddd; font-size: 13px; margin-bottom: 4px;';
    traitEl.textContent = `${golfer.trait.emoji} ${golfer.trait.name} — ${golfer.trait.description}`;
    tooltip.appendChild(traitEl);

    // Skills
    const skillsEl = document.createElement('div');
    skillsEl.style.cssText = 'display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 6px;';
    for (const skill of golfer.skills) {
      const badge = document.createElement('span');
      badge.textContent = `${skill.emoji}${skill.name}`;
      badge.style.cssText = `
        background: #2a4a2a; color: #a8d8a8; padding: 2px 8px; border-radius: 8px;
        font-size: 12px; border: 1px solid #3a6a3a;
      `;
      skillsEl.appendChild(badge);
    }
    tooltip.appendChild(skillsEl);

    const stats = document.createElement('div');
    stats.style.cssText = 'color: #ccc; font-size: 13px;';
    stats.innerHTML = `
      Skill: ${Math.round(golfer.skill * 100)}% | Hole ${golfer.currentHole}<br>
      Strokes: ${golfer.strokes} | Total: ${golfer.totalStrokes}
    `;
    tooltip.appendChild(stats);

    const thoughtEl = document.createElement('div');
    thoughtEl.textContent = `💭 "${thought}"`;
    thoughtEl.style.cssText = 'color: #a8d8a8; font-style: italic; margin-top: 8px; font-size: 13px;';
    tooltip.appendChild(thoughtEl);

    document.body.appendChild(tooltip);
    this.golferTooltip = tooltip;

    setTimeout(() => this.hideGolferTooltip(), 3000);
  }

  private hideGolferTooltip(): void {
    if (this.golferTooltip) {
      this.golferTooltip.remove();
      this.golferTooltip = null;
    }
  }

  // === BUILDING CLICK INSPECT ===

  private buildingTooltip: HTMLDivElement | null = null;

  private findBuildingAt(worldX: number, worldY: number): PlacedBuilding | null {
    const store = courseStore.getState();
    const tile = this.worldToTile(worldX, worldY);
    // Check if any building occupies this tile
    for (const bld of store.buildings) {
      const bt = BUILDING_TYPES.find((b) => b.key === bld.typeKey);
      if (!bt) continue;
      // Check if click is within the building's footprint
      for (let dc = 0; dc < (bt.width || 1); dc++) {
        for (let dr = 0; dr < (bt.height || 1); dr++) {
          if (bld.col + dc === tile.col && bld.row + dr === tile.row) {
            return bld;
          }
        }
      }
    }
    return null;
  }

  private showBuildingTooltip(building: PlacedBuilding): void {
    this.hideBuildingTooltip();
    const bt = BUILDING_TYPES.find((b) => b.key === building.typeKey);
    if (!bt) return;

    const sprite = this.buildingSprites.get(`${building.col},${building.row}`);
    if (!sprite) return;

    const matrix = sprite.getWorldTransformMatrix();
    const tooltip = document.createElement('div');
    tooltip.id = 'building-tooltip';
    tooltip.style.cssText = `
      position: fixed; z-index: 200; background: rgba(0,0,0,0.9); border-radius: 8px;
      padding: 10px 14px; color: #fff; font-family: sans-serif; font-size: 12px;
      max-width: 220px; pointer-events: none; line-height: 1.5;
      border: 1px solid #555;
      left: ${matrix.tx + 20}px; top: ${matrix.ty - 60}px;
    `;

    const name = document.createElement('div');
    name.textContent = bt.name;
    name.style.cssText = 'font-weight: bold; color: #ffcc80; font-size: 14px; margin-bottom: 4px;';
    tooltip.appendChild(name);

    const desc = document.createElement('div');
    desc.textContent = bt.description;
    desc.style.cssText = 'color: #ccc; margin-bottom: 6px;';
    tooltip.appendChild(desc);

    const details = document.createElement('div');
    details.style.cssText = 'color: #aaa; font-size: 11px;';
    const catLabel = bt.category === 'revenue' ? '💰 Income' : bt.category === 'decor' ? '🌿 Decor' : '🔧 Service';
    details.innerHTML = `
      ${catLabel}<br>
      Cost: <span style="color:#4caf50;">$${bt.cost.toLocaleString()}</span><br>
      Size: ${bt.width}x${bt.height} tiles
      ${building.typeKey === 'clubhouse' ? '<br><span style="color:#ff9800;">🏛️ Starting building — cannot be removed</span>' : ''}
    `;
    tooltip.appendChild(details);

    document.body.appendChild(tooltip);
    this.buildingTooltip = tooltip;

    setTimeout(() => this.hideBuildingTooltip(), 3000);
  }

  private hideBuildingTooltip(): void {
    if (this.buildingTooltip) {
      this.buildingTooltip.remove();
      this.buildingTooltip = null;
    }
  }

  // === HOLE CLICK INFO ===

  private holeTooltip: HTMLDivElement | null = null;

  private showHoleTooltip(hole: HoleConfig, isTee: boolean, worldX: number, worldY: number): void {
    this.hideHoleTooltip();
    const cam = this.cameras.main;
    const screenX = worldX - cam.scrollX;
    const screenY = (worldY - 4) - cam.scrollY;

    const tooltip = document.createElement('div');
    tooltip.id = 'hole-tooltip';
    tooltip.style.cssText = `
      position: fixed; z-index: 200; background: rgba(0,0,0,0.9); border-radius: 8px;
      padding: 10px 14px; color: #fff; font-family: sans-serif; font-size: 12px;
      max-width: 200px; pointer-events: none; line-height: 1.5;
      border: 1px solid #555;
      left: ${screenX + 15}px; top: ${screenY - 30}px;
    `;

    const label = isTee ? 'Tee' : 'Cup';
    const marker = isTee ? '⛳' : '🚩';

    const distance = hole.tee && hole.cup
      ? Math.abs(hole.tee.col - hole.cup.col) + Math.abs(hole.tee.row - hole.cup.row)
      : null;

    const title = document.createElement('div');
    title.textContent = `${marker} Hole ${hole.id} — ${label}`;
    title.style.cssText = 'font-weight: bold; color: #ffcc80; font-size: 14px; margin-bottom: 4px;';
    tooltip.appendChild(title);

    const details = document.createElement('div');
    details.style.cssText = 'color: #ccc; font-size: 11px;';
    let html = `Par ${hole.par}`;
    if (distance !== null) html += `<br>Distance: ${distance} tiles`;
    if (hole.tee) html += `<br>Tee: (${hole.tee.col}, ${hole.tee.row})`;
    if (hole.cup) html += `<br>Cup: (${hole.cup.col}, ${hole.cup.row})`;
    details.innerHTML = html;
    tooltip.appendChild(details);

    document.body.appendChild(tooltip);
    this.holeTooltip = tooltip;
    setTimeout(() => this.hideHoleTooltip(), 3000);
  }

  private hideHoleTooltip(): void {
    if (this.holeTooltip) {
      this.holeTooltip.remove();
      this.holeTooltip = null;
    }
  }

  // === GOLF SIMULATION (from PlayScene) ===

  private transitionToSwinging(golfer: Golfer): void {
    golferStore.getState().updateGolfer(golfer.id, {
      state: 'swinging',
      stateTimer: GAME_CONFIG.SWING_TIME,
    });
  }

  private executeSwing(golfer: Golfer): void {
    this.musicScene.playSfx('swing');
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

    // --- Skill modifiers ---
    const hasLongDrive = golfer.skills.some(s => s.name === 'Long Drive');
    const hasPowerSwing = golfer.skills.some(s => s.name === 'Power Swing');
    const hasShortGame = golfer.skills.some(s => s.name === 'Short Game');
    const hasIronMan = golfer.skills.some(s => s.name === 'Iron Man');
    const hasWindReader = golfer.skills.some(s => s.name === 'Wind Reader');

    // Long Drive / Power Swing: add bonus distance
    if (hasLongDrive) targetDistance += 2;
    if (hasPowerSwing) targetDistance += 2;
    // Short Game: bonus on short approaches (<6 tile distance)
    if (hasShortGame && distance < 6) targetDistance += 2;

    // --- Terrain lie effects ---
    const currentTile = store.grid[currentPos.row][currentPos.col];
    const lieEffect = TERRAIN_EFFECTS[currentTile.type];

    // Wind Reader: reduces terrain penalty
    const terrainPenalty = hasWindReader ? 0.5 : 1.0;
    const lieQuality = currentTile.type === 'fairway' || currentTile.type === 'green' ? 1.0
      : 1.0 - (1.0 - lieEffect.lieQuality) * terrainPenalty;
    const lieDistMod = currentTile.type === 'fairway' || currentTile.type === 'green' ? 1.0
      : 1.0 - (1.0 - lieEffect.distanceModifier) * terrainPenalty;

    // Iron Man: bonus accuracy on fairway
    const accuracyBonus = (hasIronMan && currentTile.type === 'fairway') ? 0.2 : 0;

    const errorFactor = (1 - (golfer.skill + accuracyBonus)) * (2 - lieQuality);
    const angleError = (Math.random() - 0.5) * 2 * Math.PI * 0.25 * errorFactor;
    const distanceError = 1 + (Math.random() - 0.5) * 0.3 * errorFactor;

    targetDistance = Math.round(targetDistance * distanceError * lieDistMod);
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

    // --- Tree collision: trace the flight path tile-by-tile ---
    const treeHit = this.traceFlightPath(currentPos.col, currentPos.row, landingCol, landingRow, store.grid);
    if (treeHit) {
      // Ball hits a tree — deflect to the tile just before the tree
      landingCol = treeHit.col;
      landingRow = treeHit.row;
      // If the deflected tile is the same as where the golfer is standing,
      // scatter to a random adjacent tile instead
      if (landingCol === currentPos.col && landingRow === currentPos.row) {
        const dirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
        const valid = dirs.filter(([dc, dr]) => {
          const nc = currentPos.col + dc;
          const nr = currentPos.row + dr;
          return nc >= 0 && nc < GRID_COLS && nr >= 0 && nr < GRID_ROWS
            && store.grid[nr][nc].type !== 'trees'
            && store.grid[nr][nc].type !== 'water';
        });
        if (valid.length > 0) {
          const [dc, dr] = valid[Math.floor(Math.random() * valid.length)];
          landingCol = currentPos.col + dc;
          landingRow = currentPos.row + dr;
        }
      }
      const gStore = golferStore.getState();
      const g = gStore.golfers.find((gg) => gg.id === golfer.id);
      if (g) {
        gStore.updateGolfer(golfer.id, { treeHits: g.treeHits + 1 });
      }
    }

    const previousPos = { ...golfer.tilePos };

    // Emit shot tracer
    this.emitShotTracer(currentPos.col, currentPos.row, landingCol, landingRow);

    golferStore.getState().updateGolfer(golfer.id, {
      state: 'ball_flight',
      stateTimer: GAME_CONFIG.BALL_FLIGHT_TIME,
      previousTilePos: previousPos,
    });

    this.activeBalls.set(golfer.id, new Ball(
      this,
      currentPos.col,
      currentPos.row,
      landingCol,
      landingRow,
      this.OFFSET_X,
      this.OFFSET_Y,
      GAME_CONFIG.BALL_FLIGHT_TIME, // ball travel time
      () => this.onBallLanded(golfer.id, landingCol, landingRow, previousPos)
    ));
  }

  private pickClubDistance(distanceToCup: number): number {
    if (distanceToCup >= 15) return 8;
    if (distanceToCup >= 10) return 6;
    if (distanceToCup >= 6) return 4;
    if (distanceToCup >= 3) return 2;
    return 1;
  }

  /**
   * Trace a line from (c1,r1) to (c2,r2) using Bresenham's line algorithm.
   * Returns {col, row} of the LAST passable tile before a tree tile,
   * or null if no tree is in the path.
   */
  private traceFlightPath(
    c1: number, r1: number,
    c2: number, r2: number,
    grid: Tile[][]
  ): { col: number; row: number } | null {
    let lastGood: { col: number; row: number } | null = null;
    const dx = Math.abs(c2 - c1);
    const dy = Math.abs(r2 - r1);
    const sx = c1 < c2 ? 1 : -1;
    const sy = r1 < r2 ? 1 : -1;
    let err = dx - dy;
    let cx = c1;
    let ry = r1;

    while (cx !== c2 || ry !== r2) {
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; cx += sx; }
      if (e2 < dx) { err += dx; ry += sy; }

      if (cx < 0 || cx >= GRID_COLS || ry < 0 || ry >= GRID_ROWS) break;

      const tile = grid[ry][cx];
      if (tile.type === 'trees') {
        // Hit a tree — return the last good tile before it
        return lastGood ?? { col: c1, row: r1 };
      }
      lastGood = { col: cx, row: ry };
    }
    return null;
  }

  /**
   * Draw a fading arc tracer from the golfer's start tile to the landing tile.
   * The arc fades out over ~3 seconds via a Phaser tween on the Graphics alpha.
   */
  private emitShotTracer(fromCol: number, fromRow: number, toCol: number, toRow: number): void {
    const start = this.tileToWorld(fromCol, fromRow);
    const end = this.tileToWorld(toCol, toRow);

    const gfx = this.add.graphics();
    gfx.setDepth(9996);

    // Calculate arc control point: mid-point with a height proportional to distance
    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2;
    const arcH = Math.abs(toCol - fromCol) + Math.abs(toRow - fromRow);
    const arcPeak = Math.max(15, arcH * 5);

    // Draw a quadratic bezier arc (30 segments)
    gfx.lineStyle(2, 0xffffff, 0.6);
    gfx.beginPath();
    gfx.moveTo(start.x, start.y - 4);
    for (let i = 1; i <= 30; i++) {
      const t = i / 30;
      const px = Phaser.Math.Linear(start.x, end.x, t);
      const py = Phaser.Math.Linear(start.y, end.y, t);
      const arc = Math.sin(t * Math.PI) * arcPeak;
      gfx.lineTo(px, py - 4 - arc);
    }
    gfx.strokePath();

    // Fade out and destroy
    this.tracerGraphics.push(gfx);
    this.tweens.add({
      targets: gfx,
      alpha: { from: 0.6, to: 0 },
      duration: this.TRACER_FADE_DURATION,
      onComplete: () => {
        gfx.destroy();
        const idx = this.tracerGraphics.indexOf(gfx);
        if (idx >= 0) this.tracerGraphics.splice(idx, 1);
      },
    });
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
    let stateTimer = GAME_CONFIG.BALL_LAND_REACT_TIME;
    let newTilePos = { col: landingCol, row: landingRow };

    const effect = TERRAIN_EFFECTS[tile.type];

    // SFX based on landing terrain
    if (tile.type === 'water') {
      this.musicScene.playSfx('splash');
    } else if (tile.type === 'trees') {
      this.musicScene.playSfx('tree');
    }

    if (tile.type === 'water') {
      newStrokes += 1;
      newTilePos = previousPos;
      stateTimer = GAME_CONFIG.WATER_REACT_TIME;
      // Track water hit for reputation
      const g = gStore.golfers.find((gg) => gg.id === golferId);
      if (g) {
        gStore.updateGolfer(golferId, { waterHits: g.waterHits + 1 });
      }
    } else if (tile.type === 'trees') {
      // Ball landed in trees — deflect back (can't play from tree tile)
      newTilePos = previousPos;
      stateTimer = GAME_CONFIG.TREE_REACT_TIME;
      const g = gStore.golfers.find((gg) => gg.id === golferId);
      if (g) {
        gStore.updateGolfer(golferId, { treeHits: g.treeHits + 1 });
      }
    } else if (tile.type === 'green' && cupPos) {
      const distToCup = Math.abs(landingCol - cupPos.col) + Math.abs(landingRow - cupPos.row);
      // Accurate Putter: +50% putting range
      const puttBonus = golfer.skills.some(s => s.name === 'Accurate Putter') ? 1.5 : 1.0;
      const puttRange = Math.max(1, Math.round(golfer.skill * 3 * puttBonus));

      if (distToCup <= puttRange) {
        newTilePos = { col: cupPos.col, row: cupPos.row };
        newState = 'hole_complete';
        stateTimer = GAME_CONFIG.HOLE_OUT_TIME;
        this.musicScene.playSfx('cup');
      } else {
        this.musicScene.playSfx('thwack');
      }
    } else {
      // Landed on fairway, rough, or sand
      this.musicScene.playSfx('thwack');
    }

    if (newStrokes >= MAX_STROKES_PER_HOLE) {
      newState = 'hole_complete';
      stateTimer = GAME_CONFIG.MAX_STROKES_TIME;
    }

    gStore.updateGolfer(golferId, {
      strokes: newStrokes,
      state: newState,
      stateTimer,
      // Don't update tilePos here — let transitionToNext handle walking
      // Store the landing position for walking
      walkTarget: newState === 'reacting' ? newTilePos : null,
    });
  }

  /**
   * Show a floating popup over the golfer with a happiness emoji (based on
   * score vs par) and the greens fee earned. Fades out after ~2.5s.
   */
  private showHoleResultPopup(golfer: Golfer, par: number, greensFee: number): void {
    const scoreVsPar = golfer.strokes - par;

    // Pick emoji based on performance
    const emoji = scoreVsPar <= -1 ? '😄' :
      scoreVsPar === 0 ? '😊' :
      scoreVsPar <= 2 ? '😐' :
      scoreVsPar <= 4 ? '😣' : '😡';

    const sprite = this.golferSprites.get(golfer.id);
    if (!sprite) return;

    // Use the sprite's actual world position (handles lerp + camera zoom/scroll)
    const matrix = sprite.getWorldTransformMatrix();
    const el = document.createElement('div');
    el.style.cssText = `
      position: fixed; z-index: 300; pointer-events: none;
      font-family: sans-serif; font-size: 20px; text-align: center;
      color: #fff; font-weight: bold; line-height: 1.3;
      transition: opacity 2s ease-out, transform 2s ease-out;
      left: ${matrix.tx}px; top: ${matrix.ty - 30}px;
      transform: translate(-50%, 0);
    `;
    el.innerHTML = `${emoji}<br><span style="font-size:14px;color:#4caf50;">+$${greensFee}</span>`;
    document.body.appendChild(el);

    // Float up and fade out
    requestAnimationFrame(() => {
      el.style.transform = 'translate(-50%, -40px)';
      el.style.opacity = '0';
    });
    setTimeout(() => el.remove(), 2500);
  }

  private transitionToNext(golfer: Golfer): void {
    const store = courseStore.getState();
    const hole = store.holes.find((h) => h.id === golfer.currentHole);
    if (!hole?.cup) return;

    const cupPos = hole.cup;
    const distToCup = Math.abs(golfer.tilePos.col - cupPos.col) + Math.abs(golfer.tilePos.row - cupPos.row);

    if (distToCup <= 0 || golfer.strokes >= MAX_STROKES_PER_HOLE) {
      // Remove ball marker — hole is done
      this.removeBallSprite(golfer.id);
      golferStore.getState().updateGolfer(golfer.id, {
        state: 'hole_complete',
        stateTimer: 0,
      });
    } else {
      // Walk toward the ball's position (walkTarget was set by onBallLanded)
      const landingPos = golfer.walkTarget;
      // Remove the ball marker sprite — golfer is about to move to it
      this.removeBallSprite(golfer.id);
      if (!landingPos || (landingPos.col === golfer.tilePos.col && landingPos.row === golfer.tilePos.row)) {
        // Ball stayed on same tile — just re-address
        golferStore.getState().updateGolfer(golfer.id, {
          state: 'addressing',
          stateTimer: GAME_CONFIG.ADDRESS_TIME,
          walkTarget: null,
        });
      } else {
        // Walk to the landing position
        golferStore.getState().updateGolfer(golfer.id, {
          state: 'walking',
          stateTimer: GAME_CONFIG.WALK_STEP_TIME,
          previousTilePos: null,
          // walkTarget already set by onBallLanded
          // keep it as-is
        });
      }
    }
  }

  private transitionToNextHole(golfer: Golfer): void {
    const store = courseStore.getState();

    // Greens fee per hole (base $5 + par bonus), scaled by reputation
    const hole = store.holes.find((h) => h.id === golfer.currentHole);
    const par = hole?.par ?? 3;
    const baseGreensFee = 5 + par; // $8 for par-3, $9 for par-4, $10 for par-5
    const repMult = store.getReputationMultiplier();
    const greensFee = Math.round(baseGreensFee * repMult);
    store.addMoney(greensFee);

    // Show floating emoji + greens fee popup over this golfer
    this.showHoleResultPopup(golfer, par, greensFee);

    // Trigger a spawn only when ALL active golfers have finished hole 1
    // This ensures the initial group clears the first tee before new golfers arrive
    const gStore = golferStore.getState();
    const activeOnHole1 = gStore.golfers.filter(
      (g) => g.onCourse && g.state !== 'round_complete' && g.currentHole === 1
    ).length;
    if (activeOnHole1 === 0) {
      const activeCount = gStore.golfers.filter((g) => g.onCourse && g.state !== 'round_complete').length;
      if (activeCount < this.MAX_GOLFERS) {
        this.spawnGolferPair();
      }
    }

    const scorecard = [...golfer.scorecard, golfer.strokes];
    const newTotal = golfer.totalStrokes + golfer.strokes;

    const nextHoleId = golfer.currentHole + 1;
    const nextHole = store.holes.find((h) => h.id === nextHoleId);

    if (!nextHole?.tee || nextHoleId > 9) {
      // Walk back to clubhouse after round complete instead of instant removal
      const clubhousePos = getClubhousePosition();
      golferStore.getState().updateGolfer(golfer.id, {
        scorecard,
        totalStrokes: newTotal,
        state: 'walking',
        stateTimer: GAME_CONFIG.WALK_STEP_TIME,
        walkTarget: { col: clubhousePos.col, row: clubhousePos.row },
      });

      // Keep the money/popup/etc — it already happened above
      // The actual round_complete logic fires when golfer arrives at clubhouse
      return;
    }

    golferStore.getState().updateGolfer(golfer.id, {
      currentHole: nextHoleId,
      strokes: 0,
      scorecard,
      totalStrokes: newTotal,
      state: 'walking',
      stateTimer: GAME_CONFIG.WALK_STEP_TIME_NEXT_HOLE,
      walkTarget: { col: nextHole.tee.col, row: nextHole.tee.row },
    });
  }

  /**
   * Move the golfer one tile toward their walkTarget using a step toward
   * whichever axis has the larger remaining distance. When they arrive,
   * transition to addressing (or hole_address for next-tee walks).
   */
  private stepTowardWalkTarget(golfer: Golfer): void {
    const target = golfer.walkTarget;
    if (!target) {
      // No target — just address
      golferStore.getState().updateGolfer(golfer.id, {
        state: 'addressing',
        stateTimer: GAME_CONFIG.ADDRESS_TIME,
        walkTarget: null,
      });
      return;
    }

    const { col: curCol, row: curRow } = golfer.tilePos;
    const dc = target.col - curCol;
    const dr = target.row - curRow;

    if (dc === 0 && dr === 0) {
      // Arrived!

      // Check if we walked to the clubhouse (round complete) — remove golfer
      const clubhousePos = getClubhousePosition();
      if (target.col === clubhousePos.col && target.row === clubhousePos.row) {
        // Round complete — award bonus, remove golfer
        this.completeGolferRound(golfer);
        return;
      }

      const wasHoleWalk = golfer.strokes === 0; // just started a new hole
      golferStore.getState().updateGolfer(golfer.id, {
        state: 'addressing',
        stateTimer: wasHoleWalk ? GAME_CONFIG.ADDRESS_TIME_NEXT_HOLE : GAME_CONFIG.ADDRESS_TIME,
        walkTarget: null,
      });
      return;
    }

    // Move one tile: prefer the axis with larger distance
    let stepCol = 0;
    let stepRow = 0;
    if (Math.abs(dc) >= Math.abs(dr)) {
      stepCol = dc > 0 ? 1 : -1;
    } else {
      stepRow = dr > 0 ? 1 : -1;
    }

    const newCol = curCol + stepCol;
    const newRow = curRow + stepRow;

    golferStore.getState().updateGolfer(golfer.id, {
      tilePos: { col: newCol, row: newRow },
      stateTimer: GAME_CONFIG.WALK_STEP_TIME, // ms until next step
    });
  }

  private transitionToAddressing(golfer: Golfer): void {
    golferStore.getState().updateGolfer(golfer.id, {
      state: 'addressing',
      stateTimer: GAME_CONFIG.ADDRESS_TIME,
    });
  }

  /** Destroy the landing ball marker sprite for a golfer */
  private removeBallSprite(golferId: number): void {
    const sprite = this.landingBallSprites.get(golferId);
    if (sprite) {
      sprite.destroy();
      this.landingBallSprites.delete(golferId);
    }
  }

  /** Award round completion bonus, compute satisfaction, and remove golfer */
  private completeGolferRound(golfer: Golfer): void {
    const store = courseStore.getState();
    const repMult = store.getReputationMultiplier();

    // Round completion bonus scaled by reputation
    const baseRoundRevenue = 20 + Math.round(golfer.skill * 30);
    const roundRevenue = Math.round(baseRoundRevenue * repMult);
    store.addMoney(roundRevenue);

    // Compute satisfaction and update reputation
    const coursePar = totalCoursePar(store.holes);
    const scoreVsPar = golfer.totalStrokes - coursePar;
    let satisfaction = 3.0;
    if (scoreVsPar <= -3) satisfaction = 5.0;
    else if (scoreVsPar <= 0) satisfaction = 4.0;
    else if (scoreVsPar <= 2) satisfaction = 3.0;
    else if (scoreVsPar <= 5) satisfaction = 2.0;
    else satisfaction = 1.0;

    satisfaction -= golfer.waterHits * 0.5;
    satisfaction -= golfer.treeHits * 0.3;
    satisfaction = Math.max(1.0, Math.min(5.0, satisfaction));
    store.addReputation(Math.round(satisfaction * 10) / 10);

    // Update course record if this round is the best
    if (store.courseRecord === null || golfer.totalStrokes < store.courseRecord) {
      const currentPar = totalCoursePar(store.holes);
      store.setCourseRecord(golfer.totalStrokes, new Date().toISOString(), currentPar);
    }
    // Track completed score for average
    store.addCompletedScore(golfer.totalStrokes);

    const sprite = this.golferSprites.get(golfer.id);
    if (sprite) {
      sprite.destroy();
      this.golferSprites.delete(golfer.id);
    }
    this.removeBallSprite(golfer.id);
    golferStore.getState().removeGolfer(golfer.id);
  }

  shutdown(): void {
    this.teeSprites.forEach((s) => s.destroy());
    this.teeSprites.clear();
    this.flagSprites.forEach((s) => s.destroy());
    this.flagSprites.clear();
    this.vegetationOverlaySprites.forEach((s) => s.destroy());
    this.vegetationOverlaySprites.clear();
    this.slopeTileSprites.forEach((g) => g.destroy());
    this.slopeTileSprites = [];
    this.buildingSprites.forEach((s) => s.destroy());
    this.buildingSprites.clear();
    this.golferSprites.forEach((s) => s.destroy());
    this.golferSprites.clear();
    this.activeBalls.forEach((b) => b.sprite.destroy());
    this.activeBalls.clear();
    this.landingBallSprites.forEach((s) => s.destroy());
    this.landingBallSprites.clear();
    this.tracerGraphics.forEach((g) => g.destroy());
    this.tracerGraphics = [];
    this.hideVegetationSidePanel();
    this.hideGolferTooltip();
    this.hideBuildingTooltip();
    this.hideHoleTooltip();
    this.terrainPalette?.remove();
    document.getElementById('golfer-panel')?.remove();
    document.getElementById('music-player')?.remove();
    this.moneyDisplay?.remove();
    this.helpText?.remove();
    document.querySelectorAll('.builder-toast').forEach((el) => el.remove());
    document.removeEventListener('keydown', this.keydownHandler);
  }
}
