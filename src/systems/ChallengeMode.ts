import { courseStore, HoleConfig } from '../state/course';
import { golferStore, Golfer } from '../state/golfers';
import { GRID_COLS, GRID_ROWS, TERRAIN_EFFECTS, MAX_STROKES_PER_HOLE, type TerrainType } from '../utils/constants';
import { GAME_CONFIG } from '../utils/gameConfig';
import { totalCoursePar } from '../utils/helpers';

export type PlayerState = 'addressing' | 'aiming' | 'powering' | 'flight' | 'walking' | 'hole_complete' | 'complete' | 'waiting';

/**
 * Pure state for challenge mode — no Phaser dependencies.
 * Owns player position, scoring, state machine, stroke simulation.
 */
export class ChallengeMode {
  // State
  active = false;
  playerCol = 0;
  playerRow = 0;
  playerStrokes = 0;
  playerTotalStrokes = 0;
  playerCurrentHole = 1;
  playerScorecard: number[] = [];
  opponentId: number | null = null;
  opponentScorecard: number[] = [];
  playerState: PlayerState = 'addressing';
  playerWalkTarget: { col: number; row: number } | null = null;

  // Input tracking (owned by challenge mode so rendering code can query it)
  powerHeld = false;
  powerStartTime = 0;

  // UI creation — returns DOM elements for the host to append
  private scorecardEl: HTMLDivElement | null = null;
  private resultOverlay: HTMLDivElement | null = null;

  // Callbacks the host must provide for Phaser-dependent operations
  private host: ChallengeHost;

  constructor(host: ChallengeHost) {
    this.host = host;
  }

  /** Start a new challenge. Call from the host's start button handler. */
  start(): string | null {
    const store = courseStore.getState();
    const hole1 = store.holes.find((h) => h.id === 1);
    if (!hole1?.tee) {
      return 'Set up hole 1 (tee + cup) first!';
    }

    this.active = true;
    this.playerCurrentHole = 1;
    this.playerStrokes = 0;
    this.playerTotalStrokes = 0;
    this.playerScorecard = [];
    this.opponentScorecard = [];
    this.opponentId = null;
    this.playerState = 'addressing';
    this.playerCol = hole1.tee.col;
    this.playerRow = hole1.tee.row;
    this.playerWalkTarget = null;
    this.powerHeld = false;

    // Create player marker (delegate to host for Phaser sprite)
    this.host.onChallengeStarted(this.playerCol, this.playerRow);

    // Spawn opponent
    const gStore = golferStore.getState();
    const opponent = gStore.spawnGolfer(hole1.tee.col, hole1.tee.row);
    if (opponent) {
      this.opponentId = opponent.id;
      gStore.updateGolfer(opponent.id, {
        state: 'addressing' as const,
        stateTimer: GAME_CONFIG.INITIAL_ADDRESS_TIME + opponent.trait.thinkingTime,
      });
      this.host.onOpponentSpawned(opponent, hole1.tee.col, hole1.tee.row);
    }

    // Create scorecard
    this.createScorecard();

    this.host.onUIChanged('challenge-started');
    return null; // no error
  }

  /** End the challenge — clean up state. */
  end(): void {
    this.active = false;
    this.playerState = 'complete';

    // Clean up opponent
    if (this.opponentId !== null) {
      golferStore.getState().removeGolfer(this.opponentId);
      this.host.onOpponentRemoved(this.opponentId);
      this.opponentId = null;
    }

    this.cleanupScorecard();
    this.host.onChallengeEnded();
  }

  /** Called every frame when challenge is active. Returns true if frame was handled. */
  update(delta: number): boolean {
    if (!this.active || this.playerState === 'complete') return false;

    if (this.playerState === 'hole_complete') {
      this.playerScorecard.push(this.playerStrokes);
      this.playerTotalStrokes += this.playerStrokes;
      this.advanceHole();
      this.updateScorecardUI();
      return true;
    }

    if (this.playerState === 'waiting') {
      return true; // handled — no state transition, just waiting for opponent
    }

    return true;
  }

  /** Handle aiming input — returns {col, row, dist} for aim line rendering */
  handleAim(col: number, row: number): { col: number; row: number; dist: number } | null {
    if (this.playerState !== 'addressing') return null;
    const dx = col - this.playerCol;
    const dy = row - this.playerRow;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) return null;
    return { col, row, dist };
  }

  /** Execute the swing after aim + power. Returns a result descriptor for the host to render. */
  executeSwing(aimCol: number, aimRow: number, power: number): SwingResult {
    this.powerHeld = false;
    const store = courseStore.getState();
    const hole = store.holes.find((h) => h.id === this.playerCurrentHole);

    // Play swing SFX
    this.host.onPlaySfx('swing');

    // Max strokes cap
    if (this.playerStrokes >= MAX_STROKES_PER_HOLE) {
      this.playerState = 'hole_complete';
      this.updateScorecardUI();
      return { type: 'max_strokes' };
    }

    // Auto-hole-out if standing on cup
    if (hole?.cup && this.playerCol === hole.cup.col && this.playerRow === hole.cup.row) {
      this.playerStrokes++;
      this.playerState = 'hole_complete';
      this.updateScorecardUI();
      this.host.onPlaySfx('cup');
      this.host.onFollowPlayer(this.playerCol, this.playerRow);
      return { type: 'holed_out', message: '🏌️ Holed out!' };
    }

    // Putting on green
    const currentTile = store.grid[this.playerRow][this.playerCol];
    if (currentTile.type === 'green' && hole?.cup && this.playerStrokes > 0) {
      this.playerCol = hole.cup.col;
      this.playerRow = hole.cup.row;
      this.playerStrokes++;
      this.playerState = 'hole_complete';
      this.updateScorecardUI();
      this.host.onPlaySfx('cup');
      this.host.onPlayerMoved(this.playerCol, this.playerRow);
      this.host.onFollowPlayer(this.playerCol, this.playerRow);
      return { type: 'sunk_putt', message: '🏌️ Sunk the putt!' };
    }

    // Calculate shot trajectory
    const result = this.calculateShot(aimCol, aimRow, power, currentTile, hole);
    if (result.type === 'water_hazard') {
      // Water penalty: host handles the visual
      this.host.onPlaySfx('splash');
      return result;
    }

    return result;
  }

  /** Called when ball flight completes — updates state based on landing */
  onBallLanded(landingCol: number, landingRow: number): { message?: string; autoPutt?: boolean } {
    const store = courseStore.getState();
    const hole = store.holes.find((h) => h.id === this.playerCurrentHole);

    this.playerCol = landingCol;
    this.playerRow = landingRow;

    // Check for auto-putt on green within range
    const lTile = store.grid[landingRow][landingCol];
    if (lTile.type === 'green' && hole?.cup) {
      const dCup = Math.abs(landingCol - hole.cup.col) + Math.abs(landingRow - hole.cup.row);
      if (dCup <= 3) {
        this.playerCol = hole.cup.col;
        this.playerRow = hole.cup.row;
        this.playerStrokes++;
        this.playerState = 'hole_complete';
        this.updateScorecardUI();
        this.host.onPlaySfx('cup');
        this.host.onPlayerMoved(this.playerCol, this.playerRow);
        this.host.onFollowPlayer(this.playerCol, this.playerRow);
        return { autoPutt: true, message: '🏌️ Sunk the putt!' };
      }
    }

    this.playerStrokes++;
    this.playerState = 'addressing';
    this.updateScorecardUI();
    this.host.onFollowPlayer(this.playerCol, this.playerRow);
    return {};
  }

  /** Register opponent hole completion for scoring */
  onOpponentHoleComplete(strokes: number): void {
    this.opponentScorecard.push(strokes);
    this.updateScorecardUI();

    // Show result if both are done
    if (this.playerState === 'waiting' && this.opponentScorecard.length >= this.playerScorecard.length) {
      this.showResult();
    }
  }

  // ---- Private methods ----

  private calculateShot(
    aimCol: number, aimRow: number, power: number,
    currentTile: { type: string },
    hole: HoleConfig | undefined,
  ): SwingResult {
    const store = courseStore.getState();
    const maxDistance = Math.round(power * 10);
    const dCol = aimCol - this.playerCol;
    const dRow = aimRow - this.playerRow;
    const dist = Math.sqrt(dCol * dCol + dRow * dRow) || 1;

    const currentTileType = currentTile.type as TerrainType;
    const effect = TERRAIN_EFFECTS[currentTileType] || { lieQuality: 0.5, distanceModifier: 0.5 };
    const accuracy = effect.lieQuality * (1 - maxDistance * 0.03);
    const maxScatter = (1 - Math.max(0.1, accuracy)) * 1.5;
    const scatterAngle = (Math.random() - 0.5) * 2 * maxScatter;
    const distanceMod = effect.distanceModifier * (0.85 + Math.random() * 0.3);
    const effectiveSteps = Math.round(maxDistance * distanceMod);

    const cosAngle = Math.cos(scatterAngle);
    const sinAngle = Math.sin(scatterAngle);
    const dirNormX = dCol / dist;
    const dirNormY = dRow / dist;
    const scatterDX = dirNormX * cosAngle - dirNormY * sinAngle;
    const scatterDY = dirNormX * sinAngle + dirNormY * cosAngle;

    const steps = Math.min(effectiveSteps, Math.round(dist));
    let landingCol = this.playerCol;
    let landingRow = this.playerRow;
    let previousCol = this.playerCol;
    let previousRow = this.playerRow;
    let hitWater = false;
    let hitTree = false;

    for (let i = 0; i < steps; i++) {
      const nc = Math.round(this.playerCol + scatterDX * (i + 1));
      const nr = Math.round(this.playerRow + scatterDY * (i + 1));
      if (nc < 0 || nc >= GRID_COLS || nr < 0 || nr >= GRID_ROWS) break;

      const tile = store.grid[nr][nc];
      if (tile.type === 'trees') {
        hitTree = true;
        landingCol = previousCol;
        landingRow = previousRow;
        this.host.onPlaySfx('tree');
        break;
      }
      if (tile.type === 'water') {
        hitWater = true;
        landingCol = nc;
        landingRow = nr;
        this.host.onPlaySfx('splash');
        break;
      }
      previousCol = nc;
      previousRow = nr;
      landingCol = nc;
      landingRow = nr;
    }

    landingCol = Math.max(0, Math.min(GRID_COLS - 1, landingCol));
    landingRow = Math.max(0, Math.min(GRID_ROWS - 1, landingRow));

    if (hitWater) {
      return {
        type: 'water_hazard',
        landingCol,
        landingRow,
        returnCol: previousCol,
        returnRow: previousRow,
      };
    }

    return {
      type: 'in_flight',
      fromCol: this.playerCol,
      fromRow: this.playerRow,
      landingCol,
      landingRow,
      hitTree,
      isGreen: store.grid[landingRow][landingCol].type === 'green',
    };
  }

  private advanceHole(): void {
    const store = courseStore.getState();
    const nextHole = store.holes.find((h) => h.id === this.playerCurrentHole + 1);
    if (!nextHole?.tee) {
      // Round complete — keep active so opponent tracking still works during waiting
      this.playerState = 'complete';
      this.showResult();
      return;
    }
    this.playerCurrentHole++;
    this.playerStrokes = 0;
    this.playerCol = nextHole.tee.col;
    this.playerRow = nextHole.tee.row;
    this.playerState = 'addressing';
    this.playerWalkTarget = null;
    this.host.onPlayerMoved(this.playerCol, this.playerRow);
    this.host.onFollowPlayer(this.playerCol, this.playerRow);
  }

  private showResult(): void {
    const store = courseStore.getState();

    const oppTotal = this.opponentScorecard.length > 0
      ? this.opponentScorecard.reduce((a, b) => a + b, 0)
      : this.playerTotalStrokes + 999;

    // If opponent hasn't finished, wait
    if (this.opponentScorecard.length < this.playerScorecard.length) {
      this.playerState = 'waiting';
      return;
    }

    // Both players done — deactivate challenge and show results
    this.active = false;

    const playerWon = this.playerTotalStrokes < oppTotal;
    const tie = this.playerTotalStrokes === oppTotal;

    const basePrize = tie ? 100 : 200;
    const repMult = store.getReputationMultiplier();
    const ratingMult = store.getCourseRatingMultiplier();
    const prize = Math.round(basePrize * repMult * ratingMult);

    store.addMoney(prize);

    // Update course record
    if (store.courseRecord === null || this.playerTotalStrokes < store.courseRecord) {
      store.setCourseRecord(this.playerTotalStrokes, new Date().toISOString(), totalCoursePar(store.holes));
    }

    this.host.onChallengeComplete({
      playerWon,
      tie,
      prize,
      playerTotalStrokes: this.playerTotalStrokes,
      oppTotal,
      playerScorecard: [...this.playerScorecard],
      opponentScorecard: [...this.opponentScorecard],
    });
  }

  private createScorecard(): void {
    this.cleanupScorecard();
    this.scorecardEl = document.createElement('div');
    this.scorecardEl.id = 'challenge-scorecard';
    this.scorecardEl.style.cssText = `
      position: fixed; bottom: 50px; left: 50%; transform: translateX(-50%); z-index: 100;
      background: rgba(0,0,0,0.85); border-radius: 8px; padding: 8px 16px;
      color: #fff; font-family: sans-serif; font-size: 12px; line-height: 1.4;
      border: 1px solid #e67e22; text-align: center; white-space: nowrap;
    `;
    document.body.appendChild(this.scorecardEl);
    this.updateScorecardUI();
  }

  updateScorecardUI(): void {
    if (!this.scorecardEl) return;
    const store = courseStore.getState();
    const hole = store.holes.find((h) => h.id === this.playerCurrentHole);
    const par = hole?.par ?? 3;

    // Player scores
    const scorecardStr = this.playerScorecard.map((s, i) => {
      const h = store.holes.find((hh) => hh.id === i + 1);
      const p = h?.par ?? 3;
      const vs = s - p;
      return vs <= 0 ? `${s} (${vs})` : `${s} (+${vs})`;
    }).join(' | ');

    let totalVsPar = this.playerTotalStrokes;
    for (let i = 0; i < this.playerScorecard.length; i++) {
      const h = store.holes.find((hh) => hh.id === i + 1);
      totalVsPar -= h?.par ?? 3;
    }
    const totalStr = totalVsPar <= 0
      ? `${this.playerTotalStrokes} (${totalVsPar})`
      : `${this.playerTotalStrokes} (+${totalVsPar})`;

    // Opponent scores
    let opponentStr = '';
    if (this.opponentScorecard.length > 0) {
      const oppTotal = this.opponentScorecard.reduce((a, b) => a + b, 0);
      let oppVsPar = oppTotal;
      for (let i = 0; i < this.opponentScorecard.length; i++) {
        const h = store.holes.find((hh) => hh.id === i + 1);
        oppVsPar -= h?.par ?? 3;
      }
      const oppParStr = oppVsPar <= 0 ? `${oppTotal} (${oppVsPar})` : `${oppTotal} (+${oppVsPar})`;

      opponentStr = `<div style="color:#aaa;font-size:11px;">`;
      opponentStr += this.opponentScorecard.map((s, i) => {
        const h = store.holes.find((hh) => hh.id === i + 1);
        const p = h?.par ?? 3;
        const vs = s - p;
        return vs <= 0 ? `${s} (${vs})` : `${s} (+${vs})`;
      }).join(' | ');
      opponentStr += ` | <span style="color:#64b5f6;">Total: ${oppParStr}</span></div>`;
    }

    const inProgress = `H${this.playerCurrentHole}: ${this.playerStrokes}/${par} strokes`;

    let html = `<div style="font-weight:bold;color:#e67e22;">🏌️ You</div>`;
    if (this.playerScorecard.length > 0) {
      html += `<div style="color:#a8d8a8;font-size:11px;">${scorecardStr} | <span style="color:#ffd700;">Total: ${totalStr}</span></div>`;
    }
    html += `<div style="margin-top:2px;">${inProgress}</div>`;
    if (opponentStr) {
      html += `<div style="margin-top:2px;border-top:1px solid #444;padding-top:2px;"><span style="color:#64b5f6;">🤖 Opponent</span></div>${opponentStr}`;
    }
    this.scorecardEl.innerHTML = html;
  }

  private cleanupScorecard(): void {
    if (this.scorecardEl) {
      this.scorecardEl.remove();
      this.scorecardEl = null;
    }
  }

  /** Full cleanup when challenge ends */
  cleanup(): void {
    this.cleanupScorecard();
    if (this.resultOverlay) {
      this.resultOverlay.remove();
      this.resultOverlay = null;
    }
  }
}

// ---- Host interface & types ----

export interface ChallengeHost {
  onChallengeStarted(col: number, row: number): void;
  onOpponentSpawned(opponent: Golfer, col: number, row: number): void;
  onOpponentRemoved(opponentId: number): void;
  onChallengeEnded(): void;
  onPlayerMoved(col: number, row: number): void;
  onFollowPlayer(col: number, row: number): void;
  onPlaySfx(name: string): void;
  onUIChanged(state: string): void;
  onChallengeComplete(result: ChallengeResultData): void;
}

export interface ChallengeResultData {
  playerWon: boolean;
  tie: boolean;
  prize: number;
  playerTotalStrokes: number;
  oppTotal: number;
  playerScorecard: number[];
  opponentScorecard: number[];
}

export type SwingResult =
  | { type: 'max_strokes' }
  | { type: 'holed_out'; message: string }
  | { type: 'sunk_putt'; message: string }
  | { type: 'water_hazard'; landingCol: number; landingRow: number; returnCol: number; returnRow: number }
  | { type: 'in_flight'; fromCol: number; fromRow: number; landingCol: number; landingRow: number; hitTree: boolean; isGreen: boolean };
