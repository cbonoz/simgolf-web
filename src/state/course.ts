import { createStore } from 'zustand/vanilla';
import { GRID_COLS, GRID_ROWS, TerrainType, BuildingType } from '../utils/constants';
import { computeCourseStats, computeCourseRating } from '../utils/helpers';

export interface Tile {
  type: TerrainType;
  hole: number | null;
  isTee: boolean;
  isCup: boolean;
  vegetation: string | null; // sprite key for vegetation overlay
  height: number; // -10 to +10 elevation
}

export interface PlacedBuilding {
  typeKey: string;
  col: number;
  row: number;
}

export interface HoleConfig {
  id: number;
  tee: { col: number; row: number } | null;
  cup: { col: number; row: number } | null;
  par: number;
}

export type DayPhase = 'morning' | 'peak' | 'evening' | 'night';

/** Convert game time minutes (since 6:00) to a readable phase */
export function getDayPhase(minutes: number): DayPhase {
  const hour = (minutes / 60) % 24;
  if (hour >= 6 && hour < 10) return 'morning';
  if (hour >= 10 && hour < 18) return 'peak';
  if (hour >= 18 && hour < 20) return 'evening';
  return 'night';
}

/** Format game time as HH:MM */
export function formatGameTime(minutes: number): string {
  const totalMinutes = Math.floor(minutes);
  const hour = (Math.floor(totalMinutes / 60) % 24);
  const min = totalMinutes % 60;
  const h = hour % 12 === 0 ? 12 : hour % 12;
  const amPm = hour < 12 || hour >= 24 ? 'AM' : 'PM';
  return `${h}:${min.toString().padStart(2, '0')} ${amPm}`;
}

export interface CourseState {
  grid: Tile[][];
  holes: HoleConfig[];
  money: number;
  debt: number;
  reputation: number; // 1.0 - 5.0
  reputationHistory: number[]; // last 10 golfer satisfaction scores
  buildings: PlacedBuilding[];
  courseRecord: number | null; // best total strokes (lower = better)
  courseRecordDate: string | null; // ISO date when record was set
  courseRecordPar: number | null; // total course par when record was set
  completedScores: number[]; // total strokes from all completed rounds
  gameTimeMinutes: number; // minutes since 6:00 AM (starts at 360)
  dayCount: number; // current day number
  // --- Day tracking ---
  dailyRevenue: number; // greens fees + building revenue + round bonuses today
  dailyExpenses: number; // total spending today
  dailyExpenseBreakdown: Record<string, number>; // per-category breakdown of expenses
  dailyGolfersCompleted: number; // golfers who finished full rounds today
  addRevenue: (amount: number) => void;
  addExpense: (amount: number, category?: string) => void;
  addDailyGolferCompleted: () => void;
  resetDayCounters: () => void;
  // --- End day tracking ---

  setGameTime: (minutes: number) => void;
  advanceGameTime: (deltaMinutes: number) => void;
  nextDay: () => void; // reset time to 6:00 AM, increment day
  setTile: (col: number, row: number, type: TerrainType) => void;
  setTileHeight: (col: number, row: number, height: number) => void;
  adjustHeight: (col: number, row: number, delta: number) => void;
  setVegetation: (col: number, row: number, vegetation: string | null) => void;
  setTee: (holeId: number, col: number, row: number) => void;
  setCup: (holeId: number, col: number, row: number) => void;
  setPar: (holeId: number, par: number) => void;
  clearHole: (holeId: number) => void;
  saveCourse: () => void;
  loadCourse: () => boolean;
  addMoney: (amount: number) => void;
  spendMoney: (amount: number, category?: string) => boolean;
  getTile: (col: number, row: number) => Tile;
  resetCourse: () => void;
  serialize: () => string;
  loadFromSave: (json: string) => boolean;
  hasLocalSave: () => boolean;
  takeLoan: (amount: number) => void;
  repayLoan: (amount: number) => boolean;
  addReputation: (satisfaction: number) => void;
  getReputationMultiplier: () => number;
  getCourseRatingMultiplier: () => number;
  addBuilding: (typeKey: string, col: number, row: number) => void;
  removeBuilding: (col: number, row: number) => void;
  setCourseRecord: (strokes: number, date: string, coursePar: number) => void;
  addCompletedScore: (strokes: number) => void;
}

export interface CourseSaveData {
  version: number;
  grid: Tile[][];
  holes: HoleConfig[];
  money: number;
  debt: number;
  reputation: number;
  reputationHistory: number[];
  buildings?: PlacedBuilding[];
  courseRecord?: number | null;
  courseRecordDate?: string | null;
  courseRecordPar?: number | null;
  completedScores?: number[];
  savedAt: string;
}

export const SAVE_VERSION = 3;

function createEmptyGrid(): Tile[][] {
  const grid: Tile[][] = [];
  for (let row = 0; row < GRID_ROWS; row++) {
    grid[row] = [];
    for (let col = 0; col < GRID_COLS; col++) {
      grid[row][col] = {
        type: 'rough',
        hole: null,
        isTee: false,
        isCup: false,
        vegetation: null,
        height: 0,
      };
    }
  }
  return grid;
}

function createDefaultHoles(): HoleConfig[] {
  return Array.from({ length: 9 }, (_, i) => ({
    id: i + 1,
    tee: null,
    cup: null,
    par: 3,
  }));
}

/** Place the clubhouse at a random position on the course */
function defaultBuildings(): PlacedBuilding[] {
  // Random position — leave margin from edges so it's visible
  const margin = 3;
  const col = margin + Math.floor(Math.random() * (GRID_COLS - margin * 2 - 2));
  const row = margin * 2 + Math.floor(Math.random() * (GRID_ROWS - margin * 3 - 2));
  return [{ typeKey: 'clubhouse', col, row }];
}

/** Find the clubhouse position, or a reasonable default */
export function getClubhousePosition(): { col: number; row: number } {
  const state = courseStore.getState();
  const ch = state.buildings.find((b) => b.typeKey === 'clubhouse');
  if (ch) return { col: ch.col, row: ch.row };
  // Fallback
  return { col: 3, row: GRID_ROWS - 4 };
}

export const courseStore = createStore<CourseState>()((set, get) => ({
  grid: createEmptyGrid(),
  holes: createDefaultHoles(),
  money: 5000,
  debt: 0,
  reputation: 2.5,
  reputationHistory: [],
  buildings: defaultBuildings(),
  courseRecord: null,
  courseRecordDate: null,
  courseRecordPar: null,
  completedScores: [],
  gameTimeMinutes: 360, // 6:00 AM
  dayCount: 1,
  dailyRevenue: 0,
  dailyExpenses: 0,
  dailyExpenseBreakdown: {},
  dailyGolfersCompleted: 0,

  setTile: (col, row, type) =>
    set((state) => {
      const grid = state.grid.map((r) => [...r]);
      const tile = { ...grid[row][col], type };
      // Clear vegetation if terrain is no longer trees
      if (type !== 'trees') {
        tile.vegetation = null;
      }
      grid[row][col] = tile;
      return { grid };
    }),

  setTileHeight: (col, row, height) =>
    set((state) => {
      const grid = state.grid.map((r) => [...r]);
      const clamped = Math.max(-10, Math.min(10, height));
      grid[row][col] = { ...grid[row][col], height: clamped };
      return { grid };
    }),

  adjustHeight: (col, row, delta) =>
    set((state) => {
      const grid = state.grid.map((r) => [...r]);
      const current = grid[row][col].height;
      const clamped = Math.max(-10, Math.min(10, current + delta));
      grid[row][col] = { ...grid[row][col], height: clamped };
      return { grid };
    }),

  setVegetation: (col, row, vegetation) =>
    set((state) => {
      const grid = state.grid.map((r) => [...r]);
      grid[row][col] = { ...grid[row][col], vegetation };
      return { grid };
    }),

  setTee: (holeId, col, row) =>
    set((state) => {
      const holes = state.holes.map((h) =>
        h.id === holeId ? { ...h, tee: { col, row } } : h
      );
      const grid = state.grid.map((r) => [...r]);
      for (let r = 0; r < GRID_ROWS; r++) {
        for (let c = 0; c < GRID_COLS; c++) {
          if (grid[r][c].isTee && grid[r][c].hole === holeId) {
            grid[r][c] = { ...grid[r][c], isTee: false };
          }
        }
      }
      grid[row][col] = { ...grid[row][col], isTee: true, hole: holeId };
      return { holes, grid };
    }),

  setCup: (holeId, col, row) =>
    set((state) => {
      const holes = state.holes.map((h) =>
        h.id === holeId ? { ...h, cup: { col, row } } : h
      );
      const grid = state.grid.map((r) => [...r]);
      for (let r = 0; r < GRID_ROWS; r++) {
        for (let c = 0; c < GRID_COLS; c++) {
          if (grid[r][c].isCup && grid[r][c].hole === holeId) {
            grid[r][c] = { ...grid[r][c], isCup: false };
          }
        }
      }
      grid[row][col] = { ...grid[row][col], isCup: true, hole: holeId };
      return { holes, grid };
    }),

  setPar: (holeId, par) =>
    set((state) => ({
      holes: state.holes.map((h) =>
        h.id === holeId ? { ...h, par } : h
      ),
    })),

  clearHole: (holeId) =>
    set((state) => {
      const holes = state.holes.map((h) =>
        h.id === holeId ? { ...h, tee: null, cup: null, par: 3 } : h
      );
      const grid = state.grid.map((r) =>
        r.map((tile) => {
          if (tile.hole === holeId) {
            return { ...tile, isTee: false, isCup: false, hole: null };
          }
          return tile;
        })
      );
      return { holes, grid };
    }),

  saveCourse: () => {
    const state = get();
    try {
      localStorage.setItem('simgolf_course_v1', JSON.stringify({
        version: SAVE_VERSION,
        grid: state.grid,
        holes: state.holes,
        money: state.money,
        debt: state.debt,
        reputation: state.reputation,
        reputationHistory: state.reputationHistory,
        buildings: state.buildings,
        courseRecord: state.courseRecord,
        courseRecordDate: state.courseRecordDate,
        courseRecordPar: state.courseRecordPar,
        completedScores: state.completedScores,
        savedAt: new Date().toISOString(),
      }));
    } catch (e) {
      console.warn('Failed to save course:', e);
    }
  },

  loadCourse: () => {
    try {
      const raw = localStorage.getItem('simgolf_course_v1');
      if (!raw) return false;
      const data = JSON.parse(raw);
      set({
        grid: data.grid.map((row: Tile[]) =>
          row.map((tile) => ({ ...tile, height: tile.height ?? 0 }))
        ),
        holes: data.holes,
        money: data.money,
        debt: data.debt ?? 0,
        reputation: data.reputation ?? 2.5,
        reputationHistory: data.reputationHistory ?? [],
        buildings: data.buildings ?? defaultBuildings(),
        courseRecord: data.courseRecord ?? null,
        courseRecordDate: data.courseRecordDate ?? null,
        courseRecordPar: data.courseRecordPar ?? null,
        completedScores: data.completedScores ?? [],
      });
      return true;
    } catch (e) {
      console.warn('Failed to load course:', e);
      return false;
    }
  },

  addMoney: (amount) =>
    set((state) => ({ money: state.money + amount })),

  spendMoney: (amount, category) => {
    const state = get();
    if (state.money < amount) return false;
    const breakdown = { ...state.dailyExpenseBreakdown };
    const cat = category || 'terrain';
    breakdown[cat] = (breakdown[cat] || 0) + amount;
    set({
      money: state.money - amount,
      dailyExpenses: state.dailyExpenses + amount,
      dailyExpenseBreakdown: breakdown,
    });
    return true;
  },

  getTile: (col, row) => get().grid[row][col],

  resetCourse: () => {
    localStorage.removeItem('simgolf_course_v1');
    set({
      grid: createEmptyGrid(),
      holes: createDefaultHoles(),
      money: 5000,
      debt: 0,
      reputation: 2.5,
      reputationHistory: [],
      buildings: defaultBuildings(),
      courseRecord: null,
      courseRecordDate: null,
      courseRecordPar: null,
      completedScores: [],
      gameTimeMinutes: 360,
      dayCount: 1,
      dailyRevenue: 0,
      dailyExpenses: 0,
      dailyExpenseBreakdown: {},
      dailyGolfersCompleted: 0,
    });
  },

  serialize: () => {
    const { grid, holes, money, debt, reputation, reputationHistory, buildings, courseRecord, courseRecordDate, courseRecordPar, completedScores } = get();
    const data: CourseSaveData = {
      version: SAVE_VERSION,
      grid,
      holes,
      money,
      debt,
      reputation,
      reputationHistory,
      buildings,
      courseRecord,
      courseRecordDate,
      courseRecordPar,
      completedScores,
      savedAt: new Date().toISOString(),
    };
    return JSON.stringify(data);
  },

  loadFromSave: (json: string) => {
    try {
      const data: CourseSaveData = JSON.parse(json);
      if (data.version !== SAVE_VERSION) {
        console.warn(`Unknown save version ${data.version}, attempting to load anyway`);
      }
      set({
        grid: data.grid.map((row: Tile[]) =>
          row.map((tile) => ({ ...tile, height: tile.height ?? 0 }))
        ),
        holes: data.holes,
        money: data.money,
        debt: data.debt ?? 0,
        reputation: data.reputation ?? 2.5,
        reputationHistory: data.reputationHistory ?? [],
        buildings: data.buildings ?? defaultBuildings(),
        courseRecord: data.courseRecord ?? null,
        courseRecordDate: data.courseRecordDate ?? null,
        courseRecordPar: data.courseRecordPar ?? null,
        completedScores: data.completedScores ?? [],
      });
      return true;
    } catch (e) {
      console.warn('Failed to load from save data:', e);
      return false;
    }
  },

  hasLocalSave: () => {
    return localStorage.getItem('simgolf_course_v1') !== null;
  },

  takeLoan: (amount) => {
    if (amount <= 0) return;
    set((state) => ({ money: state.money + amount, debt: state.debt + amount }));
  },

  repayLoan: (amount) => {
    if (amount <= 0) return false;
    const state = get();
    const actual = Math.min(amount, state.money, state.debt);
    if (actual <= 0) return false;
    set({ money: state.money - actual, debt: state.debt - actual });
    return true;
  },

  addReputation: (satisfaction: number) => {
    set((state) => {
      const history = [...state.reputationHistory, satisfaction];
      if (history.length > 10) history.shift();
      const avg = history.reduce((a, b) => a + b, 0) / history.length;
      const clamped = Math.max(1.0, Math.min(5.0, avg));
      return { reputationHistory: history, reputation: Math.round(clamped * 10) / 10 };
    });
  },

  getReputationMultiplier: () => {
    const rep = get().reputation;
    // 1.0 = 0.6x, 2.5 = 1.0x, 5.0 = 1.6x
    return 0.6 + (rep - 1.0) * 0.25;
  },

  getCourseRatingMultiplier: () => {
    const state = get();
    const stats = computeCourseStats(state.grid, state.holes, state.buildings);
    const rating = computeCourseRating(stats);
    // 1.0★ = 0.8x, 2.5★ = 1.0x, 5.0★ = 1.6x
    return 0.8 + (rating - 1.0) * 0.2;
  },

  addBuilding: (typeKey, col, row) =>
    set((state) => ({
      buildings: [...state.buildings, { typeKey, col, row }],
    })),

  removeBuilding: (col, row) =>
    set((state) => ({
      // Clubhouse can't be removed — it's the default starting building
      buildings: state.buildings.filter((b) => {
        if (b.col === col && b.row === row) {
          return b.typeKey === 'clubhouse'; // don't remove clubhouse
        }
        return true;
      }),
    })),

  setCourseRecord: (strokes, date, coursePar) =>
    set({ courseRecord: strokes, courseRecordDate: date, courseRecordPar: coursePar }),

  addCompletedScore: (strokes) =>
    set((state) => ({
      completedScores: [...state.completedScores, strokes],
    })),

  addRevenue: (amount) =>
    set((state) => ({
      money: state.money + amount,
      dailyRevenue: state.dailyRevenue + amount,
    })),

  addExpense: (amount, category) =>
    set((state) => {
      const breakdown = { ...state.dailyExpenseBreakdown };
      const cat = category || 'other';
      breakdown[cat] = (breakdown[cat] || 0) + amount;
      return {
        money: state.money - amount,
        dailyExpenses: state.dailyExpenses + amount,
        dailyExpenseBreakdown: breakdown,
      };
    }),

  addDailyGolferCompleted: () =>
    set((state) => ({
      dailyGolfersCompleted: state.dailyGolfersCompleted + 1,
    })),

  resetDayCounters: () =>
    set({
      dailyRevenue: 0,
      dailyExpenses: 0,
      dailyExpenseBreakdown: {},
      dailyGolfersCompleted: 0,
    }),

  setGameTime: (minutes) =>
    set({ gameTimeMinutes: minutes }),

  advanceGameTime: (deltaMinutes) =>
    set((state) => {
      // Game time wraps — a day is 1440 minutes
      const total = state.gameTimeMinutes + deltaMinutes;
      return { gameTimeMinutes: total };
    }),

  nextDay: () =>
    set((state) => ({
      gameTimeMinutes: 360, // reset to 6:00 AM
      dayCount: state.dayCount + 1,
    })),
}));
