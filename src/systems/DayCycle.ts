import { courseStore, getDayPhase } from '../state/course';
import { golferStore, Golfer } from '../state/golfers';
import { BUILDING_TYPES, type TerrainType } from '../utils/constants';
import { GAME_CONFIG } from '../utils/gameConfig';
import { totalCoursePar } from '../utils/helpers';

/**
 * Host interface: methods the BuilderScene must provide for DayCycle.
 * Covers Phaser-dependent and scene-specific operations.
 */
export interface DayCycleHost {
  /** Show a temporary toast message */
  showTemporaryMessage(msg: string): void;
  showSpawnInitialGolfers(): void;
  /** Format game minutes into display string (e.g. "12:30 PM") */
  formatGameTimeDisplay(minutes: number): string;
}

/**
 * DayCycle — owns the day/night state machine, revenue/economic ticks,
 * phase-based spawn parameters, and the end-of-day transition modal.
 *
 * Responsible for:
 * - Detecting night phase and triggering day-end transition
 * - Tracking revenue tick timing and processing building revenue + decor bonuses
 * - Mapping day phase → spawn params (rate, min/max golfers)
 * - Showing the end-of-day summary modal
 * - Advancing to the next day
 */
export class DayCycle {
  // Night/day state
  isNightMode = false;
  nightTransitionReady = false;
  nightTransitionEl: HTMLDivElement | null = null;

  // Day phase → spawn parameters
  spawnInterval: number = GAME_CONFIG.SPAWN_INTERVAL;
  maxGolfers: number = GAME_CONFIG.MAX_GOLFERS;
  minGolfers: number = GAME_CONFIG.MIN_GOLFERS;

  private host: DayCycleHost;

  constructor(host: DayCycleHost) {
    this.host = host;
  }

  /** Call from the scene's update loop after advancing game time */
  update(gameTimeMinutes: number): void {
    // Update spawn parameters based on current day phase
    this.updateSpawnParams(gameTimeMinutes);

    // Night phase detection
    this.checkNightPhase(gameTimeMinutes);
  }

  /** Update spawn parameters based on day phase */
  private updateSpawnParams(gameTimeMinutes: number): void {
    const phase = getDayPhase(gameTimeMinutes);
    switch (phase) {
      case 'morning':
        this.spawnInterval = 15000;  // slow build
        this.maxGolfers = 6;
        this.minGolfers = 1;
        break;
      case 'peak':
        this.spawnInterval = 6000;   // fast
        this.maxGolfers = 10;
        this.minGolfers = 2;
        break;
      case 'evening':
        this.spawnInterval = 12000;  // tapering
        this.maxGolfers = 8;
        this.minGolfers = 1;
        break;
      case 'night':
        this.spawnInterval = 999999; // effectively disabled
        this.maxGolfers = 0;
        this.minGolfers = 0;
        break;
    }
  }

  /** Check if we should enter/exit night mode based on game time */
  private checkNightPhase(gameTimeMinutes: number): void {
    const hour = (Math.floor(gameTimeMinutes / 60) % 24);
    const isNight = hour >= 20 || hour < 6;

    if (isNight && !this.isNightMode) {
      // Entering night mode — stop spawning, wait for golfers
      this.isNightMode = true;
      this.nightTransitionReady = false;
      this.host.showTemporaryMessage('🌙 Night has fallen — last golfers finishing up...');
    }

    if (!isNight && this.isNightMode) {
      // Morning came — exit night mode
      this.isNightMode = false;
      this.nightTransitionReady = false;
      this.hideNightTransitionModal();
    }

    if (this.isNightMode && !this.nightTransitionReady) {
      const gStore = golferStore.getState();
      const activeGolfers = gStore.golfers.filter((g) => g.onCourse && g.state !== 'round_complete');
      if (activeGolfers.length === 0) {
        // All golfers finished — ready to transition
        this.nightTransitionReady = true;
        this.showDayTransitionModal();
      }
    }
  }

  /** Process revenue tick from buildings */
  processRevenueTick(revenueIndicatorEl: HTMLDivElement | null, updateMoneyDisplay: () => void): void {
    const store = courseStore.getState();
    const repMult = store.getReputationMultiplier();
    const ratingMult = store.getCourseRatingMultiplier();
    const combinedMult = repMult * ratingMult;
    let totalRevenue = 0;
    for (const bld of store.buildings) {
      const bt = BUILDING_TYPES.find((b) => b.key === bld.typeKey);
      if (!bt || bt.category !== 'revenue') continue;
      const rate = bt.key === 'clubhouse' ? 50 : bt.key === 'shop' ? 25 : bt.key === 'snack_bar' ? 15 : 0;
      totalRevenue += Math.round(rate * combinedMult);
    }
    if (totalRevenue > 0) {
      store.addRevenue(totalRevenue);
      if (revenueIndicatorEl) {
        revenueIndicatorEl.textContent = `🏪 +$${totalRevenue}`;
        revenueIndicatorEl.style.opacity = '1';
        setTimeout(() => {
          revenueIndicatorEl.style.opacity = '0';
        }, 2500);
      }
      updateMoneyDisplay();
    }
  }

  /** Apply reputation bonuses from decor buildings (bench, fountain, garden) */
  processDecorBonuses(revenueIndicatorEl: HTMLDivElement | null): void {
    const store = courseStore.getState();
    const decorBuildings = store.buildings.filter((b) => {
      const bt = BUILDING_TYPES.find((t) => t.key === b.typeKey);
      return bt?.category === 'decor';
    });

    if (decorBuildings.length === 0) return;

    let totalBonus = 0;

    for (const bld of decorBuildings) {
      const bt = BUILDING_TYPES.find((t) => t.key === bld.typeKey);
      if (!bt) continue;

      let base: number;
      if (bt.key === 'bench') base = 0.1;
      else if (bt.key === 'fountain') base = 0.15;
      else if (bt.key === 'garden') base = 0.2;
      else continue;

      // Check adjacency within 3 tiles of any tee or cup
      const hasAdjacency = store.holes.some((h) => {
        const targets = [h.tee, h.cup].filter(Boolean);
        return targets.some((t) => {
          if (!t) return false;
          const dist = Math.abs(bld.col - t.col) + Math.abs(bld.row - t.row);
          return dist <= 3;
        });
      });

      const bonus = hasAdjacency ? base * 1.5 : base;
      totalBonus += bonus;
    }

    // Apply accumulated reputation
    for (let i = 0; i < 3; i++) {
      store.addReputation(2.5 + totalBonus);
    }

    // Show a decor notification
    if (totalBonus > 0 && revenueIndicatorEl) {
      const sbBonus = Math.round(totalBonus * 100) / 100;
      revenueIndicatorEl.textContent = `🌿 +${sbBonus} rep (decor)`;
      revenueIndicatorEl.style.opacity = '1';
      setTimeout(() => {
        revenueIndicatorEl.style.opacity = '0';
      }, 2500);
    }
  }

  /** Show the end-of-day transition overlay with summary */
  private showDayTransitionModal(): void {
    if (this.nightTransitionEl) return;

    const store = courseStore.getState();
    const netProfit = store.dailyRevenue - store.dailyExpenses;

    // Build expense breakdown HTML from categories tracked in the store
    const breakdown = store.dailyExpenseBreakdown;
    const categoryLabels: Record<string, string> = {
      'terrain': 'Terrain Painting',
      'buildings': 'Building Purchases',
      'holes': 'Tee & Cup Placement',
      'other': 'Other',
    };
    const categoryIcons: Record<string, string> = {
      'terrain': '🖌️',
      'buildings': '🏗️',
      'holes': '⛳',
      'other': '📋',
    };
    const breakdownLines = Object.entries(breakdown)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, amt]) => {
        const label = categoryLabels[cat] || cat;
        const icon = categoryIcons[cat] || '📋';
        return `<div style="display: flex; justify-content: space-between; padding: 2px 0 2px 16px; font-size: 12px; color: #bbb;">
          <span>${icon} ${label}</span>
          <span style="color: #f87171;">-$${amt}</span>
        </div>`;
      })
      .join('');

    const el = document.createElement('div');
    el.id = 'day-transition-modal';
    el.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 1000;
      background: rgba(0,0,0,0.85); display: flex; align-items: center; justify-content: center;
      font-family: sans-serif;
    `;

    const box = document.createElement('div');
    box.style.cssText = `
      background: linear-gradient(135deg, #1a1a2e, #16213e); border-radius: 12px;
      padding: 32px 40px; max-width: 480px; width: 90%; text-align: center;
      border: 1px solid #ffd700; color: #fff;
      box-shadow: 0 0 30px rgba(255,215,0,0.15);
    `;

    box.innerHTML = `
      <div style="font-size: 36px; margin-bottom: 8px;">🌙</div>
      <div style="font-size: 20px; font-weight: bold; margin-bottom: 16px; color: #ffd700;">
        Day ${store.dayCount} Complete
      </div>
      <div style="margin-bottom: 16px; line-height: 1.6; font-size: 14px;">
        <div style="display: flex; justify-content: space-between; padding: 4px 0;">
          <span style="color: #aaa;">⛳ Golfers Completed</span>
          <span style="font-weight: bold;">${store.dailyGolfersCompleted}</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 4px 0;">
          <span style="color: #aaa;">💰 Greens Fees + Revenue</span>
          <span style="color: #4ade80; font-weight: bold;">+$${store.dailyRevenue}</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #333;">
          <span style="color: #aaa;">🏗️ Expenses</span>
          <span style="color: #f87171; font-weight: bold;">-$${store.dailyExpenses}</span>
        </div>
        ${Object.keys(breakdown).length > 0 ? breakdownLines : ''}
        <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 16px;">
          <span style="color: #ffd700;">📊 Net Profit</span>
          <span style="font-weight: bold; color: ${netProfit >= 0 ? '#4ade80' : '#f87171'};">
            ${netProfit >= 0 ? '+' : ''}$${netProfit}
          </span>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 4px 0;">
          <span style="color: #aaa;">⭐ Reputation</span>
          <span style="font-weight: bold; color: #ffd700;">${'★'.repeat(Math.round(store.reputation))}${'☆'.repeat(5 - Math.round(store.reputation))}</span>
        </div>
      </div>
    `;

    const continueBtn = document.createElement('button');
    continueBtn.textContent = '▶ Continue to Next Day';
    continueBtn.style.cssText = `
      padding: 10px 24px; border-radius: 8px; border: 2px solid #ffd700;
      background: rgba(255,215,0,0.15); color: #ffd700; font-size: 14px;
      font-weight: bold; cursor: pointer; transition: background 0.2s;
    `;
    continueBtn.addEventListener('mouseenter', () => {
      continueBtn.style.background = 'rgba(255,215,0,0.3)';
    });
    continueBtn.addEventListener('mouseleave', () => {
      continueBtn.style.background = 'rgba(255,215,0,0.15)';
    });
    continueBtn.addEventListener('click', () => this.continueToNextDay());
    box.appendChild(continueBtn);

    el.appendChild(box);
    document.body.appendChild(el);
    this.nightTransitionEl = el;
  }

  /** Hide the day transition modal */
  private hideNightTransitionModal(): void {
    if (this.nightTransitionEl) {
      this.nightTransitionEl.remove();
      this.nightTransitionEl = null;
    }
  }

  /** Advance to the next day — reset time, counters, re-enable spawning */
  private continueToNextDay(): void {
    const store = courseStore.getState();
    store.resetDayCounters();
    store.nextDay(); // resets to 6:00 AM, increments dayCount
    this.isNightMode = false;
    this.nightTransitionReady = false;
    this.hideNightTransitionModal();

    // Spawn initial golfers for the new day
    this.host.showSpawnInitialGolfers();

    this.host.showTemporaryMessage(`☀️ Day ${store.dayCount + 1} begins!`);
  }

  /** Clean up DOM elements */
  cleanup(): void {
    this.hideNightTransitionModal();
  }
}
