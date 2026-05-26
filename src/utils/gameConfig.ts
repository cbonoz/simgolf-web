// Gameplay timing configuration
// All values in milliseconds unless noted
export const GAME_CONFIG = {
  // ---- Golfer pacing ----
  /** Initial pause before first swing */
  INITIAL_ADDRESS_TIME: 2500,
  /** Time spent in 'addressing' state on subsequent shots */
  ADDRESS_TIME: 1800,
  /** Pause after arriving at walk target (next tee) */
  ADDRESS_TIME_NEXT_HOLE: 1200,
  /** Time the swing animation plays */
  SWING_TIME: 800,
  /** Time the ball is in flight (visual animation) */
  BALL_FLIGHT_TIME: 1500,
  /** Pause after ball animation while golfer 'reacts' */
  BALL_LAND_REACT_TIME: 1200,
  /** Pause after ball lands in water */
  WATER_REACT_TIME: 1800,
  /** Pause after ball hits trees */
  TREE_REACT_TIME: 1500,
  /** Celebration pause after holing out */
  HOLE_OUT_TIME: 2000,
  /** Pause after max strokes reached */
  MAX_STROKES_TIME: 1200,
  /** Milliseconds per tile when walking to ball */
  WALK_STEP_TIME: 350,
  /** Milliseconds per tile when walking to next tee */
  WALK_STEP_TIME_NEXT_HOLE: 380,

  // ---- Golfer spawning ----
  /** Max golfers on course at once */
  MAX_GOLFERS: 8,
  /** Min active before fallback spawn kicks in */
  MIN_GOLFERS: 2,
  /** Min ms between fallback spawns */
  SPAWN_INTERVAL: 10000,

  // ---- Visual FX ----
  /** Shot tracer line fade-out duration */
  TRACER_FADE_DURATION: 6000,
} as const;
