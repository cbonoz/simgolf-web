import * as Phaser from 'phaser';
import { courseStore } from '../state/course';
import { golferStore, Golfer } from '../state/golfers';
import { GRID_COLS, GRID_ROWS, TILE_WIDTH, TILE_HEIGHT, TERRAIN_EFFECTS, MAX_STROKES_PER_HOLE } from '../utils/constants';
import { tileToScreen, clampTile } from '../utils/helpers';
import { Ball } from '../entities/Ball';

export class PlayScene extends Phaser.Scene {
  private uiContainer!: HTMLDivElement;
  private statusText!: HTMLDivElement;
  private scorecardEl!: HTMLDivElement;
  private backBtn!: HTMLButtonElement;

  // Grid offset — must match BuilderScene
  private readonly OFFSET_X = (GRID_ROWS - 1) * (TILE_WIDTH / 2) + 100;
  private readonly OFFSET_Y = 100;

  // Game objects
  private golferSprites: Map<number, Phaser.GameObjects.Sprite> = new Map();
  private activeBall: Ball | null = null;
  private spawnTimer = 0;
  private readonly SPAWN_INTERVAL = 4000; // ms between spawns
  private readonly MAX_GOLFERS = 8;

  constructor() {
    super({ key: 'PlayScene' });
  }

  create(): void {
    const cam = this.cameras.main;
    const centerCol = (GRID_COLS - 1) / 2;
    const centerRow = (GRID_ROWS - 1) / 2;
    cam.scrollX = (centerCol - centerRow) * (TILE_WIDTH / 2) + this.OFFSET_X - cam.width / 2;
    cam.scrollY = (centerCol + centerRow) * (TILE_HEIGHT / 2) + this.OFFSET_Y - cam.height / 2;

    // Reset golfers for fresh play session
    golferStore.getState().resetGolfers();

    // Render the course grid
    this.renderCourse();

    // Create HTML UI overlay
    this.createUI();

    // Enable camera pan + zoom
    this.setupCameraControls();

    // Spawn initial golfers
    this.spawnInitialGolfers();
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

  private spawnInitialGolfers(): void {
    const store = courseStore.getState();
    const hole1 = store.holes.find((h) => h.id === 1);
    if (!hole1?.tee) {
      this.statusText.textContent = 'No tee set for Hole 1!';
      return;
    }

    // Spawn 3 golfers to start
    for (let i = 0; i < 3; i++) {
      this.spawnGolfer();
    }
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
    sprite.setDepth(this.getDepth(golfer.tilePos.col, golfer.tilePos.row));
    this.golferSprites.set(golfer.id, sprite);

    return golfer;
  }

  private getDepth(col: number, row: number): number {
    return (col + row) * GRID_COLS + col + 0.5;
  }

  private createUI(): void {
    this.uiContainer = document.createElement('div');
    this.uiContainer.id = 'play-ui';
    this.uiContainer.style.cssText = `
      position: fixed; top: 10px; left: 10px; z-index: 100;
      background: rgba(0,0,0,0.85); border-radius: 8px; padding: 12px 16px;
      display: flex; flex-direction: column; gap: 8px; font-family: sans-serif;
      min-width: 200px; max-height: 80vh; overflow-y: auto;
    `;

    const title = document.createElement('div');
    title.textContent = '⛳ Play Mode';
    title.style.cssText = 'color: #fff; font-weight: bold; font-size: 14px;';
    this.uiContainer.appendChild(title);

    this.statusText = document.createElement('div');
    this.statusText.textContent = 'Course is open for play!';
    this.statusText.style.cssText = 'color: #a8d8a8; font-size: 12px;';
    this.uiContainer.appendChild(this.statusText);

    // Scorecard
    this.scorecardEl = document.createElement('div');
    this.scorecardEl.style.cssText = 'color: #ccc; font-size: 11px; line-height: 1.5;';
    this.uiContainer.appendChild(this.scorecardEl);

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

  private updateScorecard(): void {
    const gStore = golferStore.getState();
    if (gStore.golfers.length === 0) {
      this.scorecardEl.innerHTML = '<em>No golfers on course</em>';
      return;
    }

    let html = '<table style="border-collapse:collapse;width:100%;"><tr><th style="text-align:left;padding:2px 4px;">#</th><th style="text-align:left;padding:2px 4px;">Hole</th><th style="text-align:left;padding:2px 4px;">Str</th><th style="text-align:left;padding:2px 4px;">Tot</th></tr>';
    for (const g of gStore.golfers) {
      const holeLabel = g.currentHole <= 9 ? `H${g.currentHole}` : 'Done';
      const strokes = g.strokes;
      const total = g.totalStrokes;
      html += `<tr><td style="padding:2px 4px;">${g.id}</td><td style="padding:2px 4px;">${holeLabel}</td><td style="padding:2px 4px;">${strokes}</td><td style="padding:2px 4px;">${total}</td></tr>`;
    }
    html += '</table>';
    this.scorecardEl.innerHTML = html;
  }

  private setupCameraControls(): void {
    const cam = this.cameras.main;
    let isPanning = false;
    let panStart = { x: 0, y: 0 };

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

    if (this.input.mouse) this.input.mouse.disableContextMenu();

    this.game.canvas.addEventListener('wheel', (e: WheelEvent) => {
      e.preventDefault();
      const zoomDelta = e.deltaY > 0 ? -0.1 : 0.1;
      const newZoom = Phaser.Math.Clamp(cam.zoom + zoomDelta, 0.3, 3);
      cam.setZoom(newZoom);
    }, { passive: false });
  }

  // === GOLF SIMULATION ===

  update(time: number, delta: number): void {
    // Update ball flight
    if (this.activeBall) {
      this.activeBall.update(delta);
      if (this.activeBall.complete) {
        this.activeBall = null;
      }
    }

    // Spawn timer
    this.spawnTimer += delta;
    if (this.spawnTimer >= this.SPAWN_INTERVAL) {
      this.spawnTimer = 0;
      this.spawnGolfer();
    }

    // Update each golfer
    const gStore = golferStore.getState();
    const store = courseStore.getState();

    for (const golfer of [...gStore.golfers]) {
      if (golfer.state === 'round_complete') continue;

      golfer.stateTimer -= delta;
      if (golfer.stateTimer > 0) continue;

      // State machine transitions
      switch (golfer.state) {
        case 'addressing':
          this.transitionToSwinging(golfer);
          break;
        case 'swinging':
          this.executeSwing(golfer);
          break;
        case 'ball_flight':
          // Ball flight is handled by Ball object; when it completes it calls onComplete
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

    // Sync sprite positions
    for (const golfer of gStore.golfers) {
      const sprite = this.golferSprites.get(golfer.id);
      if (sprite) {
        const pos = this.tileToWorld(golfer.tilePos.col, golfer.tilePos.row);
        sprite.setPosition(pos.x, pos.y - 4);
        sprite.setDepth(this.getDepth(golfer.tilePos.col, golfer.tilePos.row));
      }
    }

    // Update UI
    this.updateScorecard();
  }

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
      // No cup for this hole — skip
      golferStore.getState().updateGolfer(golfer.id, {
        state: 'hole_complete',
        stateTimer: 0,
      });
      return;
    }

    const cupPos = hole.cup;
    const currentPos = golfer.tilePos;

    // Calculate ideal direction toward cup
    const dx = cupPos.col - currentPos.col;
    const dy = cupPos.row - currentPos.row;
    const distance = Math.abs(dx) + Math.abs(dy);

    // Determine target distance based on club selection
    let targetDistance = this.pickClubDistance(distance);

    // Skill-based error
    const errorFactor = 1 - golfer.skill;
    const angleError = (Math.random() - 0.5) * 2 * Math.PI * 0.25 * errorFactor;
    const distanceError = 1 + (Math.random() - 0.5) * 0.3 * errorFactor;

    targetDistance = Math.round(targetDistance * distanceError);
    targetDistance = Math.max(1, targetDistance);

    // Calculate landing tile
    let landingCol: number;
    let landingRow: number;

    if (distance <= 1) {
      // On the green or very close — putt toward cup
      landingCol = cupPos.col;
      landingRow = cupPos.row;
    } else {
      // Direction with error
      const angle = Math.atan2(dy, dx) + angleError;
      landingCol = Math.round(currentPos.col + Math.cos(angle) * targetDistance);
      landingRow = Math.round(currentPos.row + Math.sin(angle) * targetDistance);
    }

    // Clamp to grid
    const clamped = clampTile(landingCol, landingRow, GRID_COLS, GRID_ROWS);
    landingCol = clamped.col;
    landingRow = clamped.row;

    // Save previous position for hazard recovery
    const previousPos = { ...golfer.tilePos };

    // Start ball flight animation
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
    // Simple club selection based on distance remaining
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

    // Increment stroke count
    let newStrokes = golfer.strokes + 1;
    let newState: 'reacting' | 'hole_complete' = 'reacting';
    let stateTimer = 400;
    let newTilePos = { col: landingCol, row: landingRow };

    // Check terrain effects
    const effect = TERRAIN_EFFECTS[tile.type];

    if (tile.type === 'water') {
      // Penalty stroke + reset to previous position
      newStrokes += 1; // penalty
      newTilePos = previousPos;
      stateTimer = 800; // longer reaction for water
    } else if (tile.type === 'trees') {
      // Ball stops, next swing gets random deflection (handled in next swing)
      stateTimer = 600;
    } else if (tile.type === 'green' && cupPos) {
      // Putting mode
      const distToCup = Math.abs(landingCol - cupPos.col) + Math.abs(landingRow - cupPos.row);
      const puttRange = Math.max(1, Math.round(golfer.skill * 3));

      if (distToCup <= puttRange) {
        // Putt goes in!
        newTilePos = { col: cupPos.col, row: cupPos.row };
        newState = 'hole_complete';
        stateTimer = 800; // celebration
      }
    }

    // Max strokes check
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
      // Hole complete
      golferStore.getState().updateGolfer(golfer.id, {
        state: 'hole_complete',
        stateTimer: 0,
      });
    } else {
      // Address again for next stroke
      golferStore.getState().updateGolfer(golfer.id, {
        state: 'addressing',
        stateTimer: 600,
      });
    }
  }

  private transitionToNextHole(golfer: Golfer): void {
    const store = courseStore.getState();

    // Save score for this hole
    const scorecard = [...golfer.scorecard, golfer.strokes];
    const newTotal = golfer.totalStrokes + golfer.strokes;

    const nextHoleId = golfer.currentHole + 1;
    const nextHole = store.holes.find((h) => h.id === nextHoleId);

    if (!nextHole?.tee || nextHoleId > 9) {
      // Round complete
      golferStore.getState().updateGolfer(golfer.id, {
        scorecard,
        totalStrokes: newTotal,
        state: 'round_complete',
        stateTimer: 0,
        onCourse: false,
      });

      // Add revenue (placeholder — real economy in M4)
      const revenue = 20 + Math.round(golfer.skill * 30);
      store.addMoney(revenue);

      // Remove golfer after a delay (handled by not spawning them again)
      const sprite = this.golferSprites.get(golfer.id);
      if (sprite) {
        sprite.destroy();
        this.golferSprites.delete(golfer.id);
      }
      golferStore.getState().removeGolfer(golfer.id);
      return;
    }

    // Move to next hole
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
    // Walking state is brief visual — go straight to addressing
    golferStore.getState().updateGolfer(golfer.id, {
      state: 'addressing',
      stateTimer: 600,
    });
  }

  shutdown(): void {
    // Clean up sprites
    this.golferSprites.forEach((s) => s.destroy());
    this.golferSprites.clear();
    if (this.activeBall) {
      this.activeBall.sprite.destroy();
      this.activeBall = null;
    }
    this.uiContainer?.remove();
  }
}
