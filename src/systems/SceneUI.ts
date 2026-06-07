import { courseStore } from '../state/course';
import { golferStore, generateThought } from '../state/golfers';
import {
  totalCoursePar,
  countConfiguredHoles,
  formatVsPar,
  vsParColor,
  computeCourseStats,
  computeCourseRating,
} from '../utils/helpers';

/**
 * Host interface: methods the BuilderScene must provide for SceneUI.
 * Covers scene-dependent operations and callbacks.
 */
export interface SceneUIHost {
  formatGameTimeDisplay(minutes: number): string;
  onTimeScaleChanged(scale: number): void;
  onChallengeClicked(): void;
  isAutoFollowEnabled(): boolean;
  onToggleAutoFollow(): void;
}

/**
 * SceneUI — owns the golfer-panel (right sidebar) and its DOM lifecycle.
 *
 * Responsible for:
 * - Creating the golfer-panel HTML elements (clock, time controls, scorecard, etc.)
 * - Updating the clock display each frame
 * - Rendering the scorecard table with golfer names, scores, and thoughts
 * - Displaying golfer count, course record, and course average stats
 * - Managing time-speed buttons
 * - Cleanup on scene shutdown
 */
export class SceneUI {
  // Top-level panel element
  private panelEl: HTMLDivElement | null = null;

  // Child elements
  private clockEl!: HTMLDivElement;
  private timeControlsContainer!: HTMLDivElement;
  private golferCountDisplay!: HTMLDivElement;
  private scorecardEl!: HTMLDivElement;
  private courseRecordEl!: HTMLDivElement;
  private courseAvgEl!: HTMLDivElement;
  private courseStatsEl!: HTMLDivElement;
  private challengeBtn!: HTMLButtonElement;

  private host: SceneUIHost;

  constructor(host: SceneUIHost) {
    this.host = host;
  }

  /** Create the golfer-panel DOM and attach to document body */
  create(): void {
    if (this.panelEl) return; // already created

    const panel = document.createElement('div');
    panel.id = 'golfer-panel';
    panel.style.cssText = `
      position: fixed; top: 55px; right: 10px; z-index: 100;
      background: rgba(0,0,0,0.85); border-radius: 8px; padding: 12px;
      display: flex; flex-direction: column; gap: 6px; font-family: sans-serif;
      min-width: 180px;
    `;

    // Title
    const playTitle = document.createElement('div');
    playTitle.textContent = '⛳ Golfers';
    playTitle.style.cssText = 'color: #fff; font-weight: bold; font-size: 13px;';
    panel.appendChild(playTitle);

    // Clock display
    this.clockEl = document.createElement('div');
    this.clockEl.style.cssText = 'color: #ffd700; font-size: 14px; font-weight: bold; text-align: center; padding: 4px 0;';
    this.clockEl.textContent = '6:00 AM - Day 1';
    panel.appendChild(this.clockEl);

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
        this.host.onTimeScaleChanged(s.value);
        // Update all time buttons
        const buttons = this.timeControlsContainer.querySelectorAll('button');
        buttons.forEach((b) => {
          const speedVal = Number((b as HTMLButtonElement).dataset.speed);
          (b as HTMLButtonElement).style.background = speedVal === s.value ? '#4a8f3f' : '#444';
        });
      });
      this.timeControlsContainer.appendChild(btn);
    }
    panel.appendChild(this.timeControlsContainer);

    // Golfer count display
    this.golferCountDisplay = document.createElement('div');
    this.golferCountDisplay.style.cssText = 'color: #a8d8a8; font-size: 11px;';
    this.golferCountDisplay.textContent = '0 golfers on course';
    panel.appendChild(this.golferCountDisplay);

    // Course record display
    this.courseRecordEl = document.createElement('div');
    this.courseRecordEl.style.cssText = 'color: #ffd700; font-size: 11px; margin-top: 2px;';
    this.courseRecordEl.textContent = '';
    panel.appendChild(this.courseRecordEl);

    // Course par + average display
    this.courseAvgEl = document.createElement('div');
    this.courseAvgEl.style.cssText = 'color: #aaa; font-size: 10px; margin-top: 1px;';
    this.courseAvgEl.textContent = '';
    panel.appendChild(this.courseAvgEl);

    // Course stats + rating display
    this.courseStatsEl = document.createElement('div');
    this.courseStatsEl.style.cssText = 'color: #888; font-size: 9px; margin-top: 2px; line-height: 1.3;';
    this.courseStatsEl.textContent = '';
    panel.appendChild(this.courseStatsEl);

    // Scorecard
    this.scorecardEl = document.createElement('div');
    this.scorecardEl.style.cssText = 'color: #ccc; font-size: 10px; line-height: 1.4; max-height: 180px; overflow-y: auto;';
    panel.appendChild(this.scorecardEl);

    // Challenge Mode button
    this.challengeBtn = document.createElement('button');
    this.challengeBtn.textContent = '🎮 Start Challenge';
    this.challengeBtn.style.cssText = `
      margin-top: 6px; padding: 8px; border: 2px solid #e67e22; border-radius: 6px;
      cursor: pointer; font-size: 12px; background: #5a3a1a; color: #f0c27a;
      font-weight: bold; width: 100%;
    `;
    this.challengeBtn.addEventListener('click', () => this.host.onChallengeClicked());
    panel.appendChild(this.challengeBtn);

    // Auto-follow camera toggle
    const autoFollowBtn = document.createElement('button');
    autoFollowBtn.textContent = this.host.isAutoFollowEnabled() ? '🎯 Auto Cam: ON' : '🎯 Auto Cam: OFF';
    autoFollowBtn.style.cssText = `
      margin-top: 4px; padding: 6px; border: 2px solid #555; border-radius: 6px;
      cursor: pointer; font-size: 11px; background: ${this.host.isAutoFollowEnabled() ? '#2d6a2d' : '#333'};
      color: ${this.host.isAutoFollowEnabled() ? '#8f8' : '#999'};
      font-weight: bold; width: 100%; transition: all 0.2s;
    `;
    autoFollowBtn.addEventListener('click', () => {
      this.host.onToggleAutoFollow();
      const on = this.host.isAutoFollowEnabled();
      autoFollowBtn.textContent = on ? '🎯 Auto Cam: ON' : '🎯 Auto Cam: OFF';
      autoFollowBtn.style.background = on ? '#2d6a2d' : '#333';
      autoFollowBtn.style.color = on ? '#8f8' : '#999';
    });
    panel.appendChild(autoFollowBtn);

    document.body.appendChild(panel);
    this.panelEl = panel;
  }

  /** Update the clock display */
  updateClock(gameTimeMinutes: number, dayCount: number): void {
    this.clockEl.textContent = `${this.host.formatGameTimeDisplay(gameTimeMinutes)} - Day ${dayCount}`;
  }

  /** Render the scorecard with golfer names, scores, and thoughts */
  updateScorecard(): void {
    const gStore = golferStore.getState();
    const store = courseStore.getState();

    if (gStore.golfers.length === 0) {
      this.scorecardEl.innerHTML = '<em>No golfers on course</em>';
      return;
    }

    const GOLFER_COLORS = ['#e74c3c', '#3498db', '#f1c40f', '#2ecc71', '#e67e22', '#9b59b6', '#1abc9c', '#e84393'];

    let html = '<table style="border-collapse:collapse;width:100%;font-size:10px;">';

    // Header
    html += '<tr style="border-bottom:1px solid #555;">';
    html += '<th style="text-align:left;padding:1px 3px;">Golfer</th>';
    html += '<th style="text-align:left;padding:1px 3px;">Hole</th>';
    html += '<th style="text-align:left;padding:1px 3px;">Ths</th>';
    html += '<th style="text-align:left;padding:1px 3px;">Tot</th>';
    html += '<th style="text-align:left;padding:1px 3px;">±Par</th>';
    html += '</tr>';

    for (const g of gStore.golfers) {
      const color = GOLFER_COLORS[g.colorIndex % GOLFER_COLORS.length];
      const holeLabel = g.currentHole <= 9 ? `H${g.currentHole}` : 'Done';

      // Calculate score vs par for current hole
      const hole = store.holes.find((h) => h.id === g.currentHole);
      const holePar = hole?.par ?? 3;

      // Calculate total vs par from completed holes
      let totalVsPar = 0;
      for (let i = 0; i < g.scorecard.length; i++) {
        const h = store.holes.find((h) => h.id === i + 1);
        totalVsPar += g.scorecard[i] - (h?.par ?? 3);
      }

      // This hole vs par (if completed)
      let holeVsParStr = '';
      let holeVsParColor = '#ccc';
      if (g.state === 'hole_complete' || g.state === 'round_complete') {
        const diff = g.strokes - holePar;
        holeVsParStr = formatVsPar(diff);
        holeVsParColor = vsParColor(diff);
      } else if (g.strokes > 0) {
        // In progress — show projected vs par
        const diff = g.strokes - holePar;
        holeVsParStr = g.strokes > holePar ? `+${g.strokes - holePar}` : `${g.strokes - holePar}`;
        holeVsParColor = vsParColor(diff);
      }

      // Total vs par string
      const totalVsParStr = formatVsPar(totalVsPar);
      const totalVsParColor = vsParColor(totalVsPar);

      // Golfer name with color dot
      const nameShort = g.name.length > 12 ? g.name.slice(0, 11) + '…' : g.name;

      html += '<tr style="border-bottom:1px solid #333;">';
      html += `<td style="padding:1px 3px;"><span style="color:${color};">●</span> ${nameShort}</td>`;
      html += `<td style="padding:1px 3px;">${holeLabel}</td>`;
      html += `<td style="padding:1px 3px;">${g.strokes}</td>`;
      html += `<td style="padding:1px 3px;">${g.totalStrokes}</td>`;
      html += `<td style="padding:1px 3px;color:${totalVsParColor};font-weight:bold;">${totalVsParStr}</td>`;
      html += '</tr>';

      // Show completed hole scores inline if they have a scorecard
      if (g.scorecard.length > 0) {
        let scoresStr = '';
        for (let i = 0; i < g.scorecard.length; i++) {
          const h = store.holes.find((h) => h.id === i + 1);
          const sPar = h?.par ?? 3;
          const sDiff = g.scorecard[i] - sPar;
          const sColor = vsParColor(sDiff);
          const label = formatVsPar(sDiff);
          scoresStr += `<span style="color:${sColor};">H${i + 1}:${g.scorecard[i]}${label !== 'E' ? label : ''}</span> `;
        }
        html += `<tr><td colspan="5" style="padding:0 3px 2px 3px;font-size:9px;color:#999;line-height:1.4;">${scoresStr}</td></tr>`;
      }

      // Show thought bubble
      const thought = generateThought(g, store.grid, store.holes);
      html += `<tr><td colspan="5" style="padding:0 3px 3px 3px;font-size:8px;color:#777;font-style:italic;">💭 ${thought}</td></tr>`;
    }

    html += '</table>';
    this.scorecardEl.innerHTML = html;
  }

  /** Update golfer count, course record, and course average */
  updateGolferCount(): void {
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

    // Course stats + rating
    const cStats = computeCourseStats(store.grid, store.holes, store.buildings);
    const rating = computeCourseRating(cStats);
    const stars = '★'.repeat(Math.round(rating)) + '☆'.repeat(5 - Math.round(rating));
    const starColor = rating >= 4.0 ? '#ffd700' : rating >= 3.0 ? '#f0c27a' : '#aaa';
    this.courseStatsEl.innerHTML = `🌟 <span style="color:${starColor};">${stars}</span> ${rating.toFixed(1)}<br>` +
      `<span style="color:#888;">⛳ ${cStats.holesConfigured} holes · Par ${cStats.totalPar}</span><br>` +
      `<span style="color:#4fc3f7;">💧 ${cStats.waterTiles} water</span> · <span style="color:#f0c27a;">🏖️ ${cStats.sandTiles} sand</span>` +
      (cStats.decorBuildings > 0 ? ` · <span style="color:#81c784;">🌿 ${cStats.decorBuildings} decor</span>` : '');
  }

  /** Clean up DOM elements */
  cleanup(): void {
    if (this.panelEl) {
      this.panelEl.remove();
      this.panelEl = null;
    }
  }
}
