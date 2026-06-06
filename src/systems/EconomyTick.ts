import { DayCycle } from './DayCycle';

/**
 * Host interface: methods the BuilderScene must provide for EconomyTick.
 * Covers DOM-dependent operations for showing revenue/decor indicators.
 */
export interface EconomyTickHost {
  /** Update the money display in the UI */
  refreshMoneyDisplay(): void;
  /** The DOM element for showing revenue/decor indicators */
  revenueIndicatorEl: HTMLDivElement | null;
}

/**
 * EconomyTick — owns the revenue tick timer and processes building revenue
 * and decor reputation bonuses each tick.
 *
 * Delegates to DayCycle for actual revenue/decor computation.
 *
 * Responsible for:
 * - Timing revenue ticks at a fixed interval
 * - Calling DayCycle.processRevenueTick to compute + apply building revenue
 * - Calling DayCycle.processDecorBonuses to apply decor reputation bonuses
 */
export class EconomyTick {
  revenueTickTimer = 0;
  readonly REVENUE_TICK_INTERVAL = 30000; // ms at 1x scale (30 game seconds)

  private host: EconomyTickHost;
  private dayCycle: DayCycle;

  constructor(host: EconomyTickHost, dayCycle: DayCycle) {
    this.host = host;
    this.dayCycle = dayCycle;
  }

  /**
   * Call from the scene's update loop, passing scaled delta in ms.
   * Processes revenue ticks at the configured interval.
   */
  update(scaledDelta: number): void {
    this.revenueTickTimer += scaledDelta;
    if (this.revenueTickTimer >= this.REVENUE_TICK_INTERVAL) {
      this.revenueTickTimer = 0;
      this.dayCycle.processRevenueTick(this.host.revenueIndicatorEl, () => this.host.refreshMoneyDisplay());
      this.dayCycle.processDecorBonuses(this.host.revenueIndicatorEl);
    }
  }
}
