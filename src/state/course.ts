import { createStore } from 'zustand/vanilla';
import { GRID_COLS, GRID_ROWS, TerrainType } from '../utils/constants';

export interface Tile {
  type: TerrainType;
  hole: number | null;
  isTee: boolean;
  isCup: boolean;
  vegetation: string | null; // sprite key for vegetation overlay
}

export interface HoleConfig {
  id: number;
  tee: { col: number; row: number } | null;
  cup: { col: number; row: number } | null;
  par: number;
}

export interface CourseState {
  grid: Tile[][];
  holes: HoleConfig[];
  money: number;
  debt: number;
  setTile: (col: number, row: number, type: TerrainType) => void;
  setVegetation: (col: number, row: number, vegetation: string | null) => void;
  setTee: (holeId: number, col: number, row: number) => void;
  setCup: (holeId: number, col: number, row: number) => void;
  setPar: (holeId: number, par: number) => void;
  clearHole: (holeId: number) => void;
  saveCourse: () => void;
  loadCourse: () => boolean;
  addMoney: (amount: number) => void;
  spendMoney: (amount: number) => boolean;
  getTile: (col: number, row: number) => Tile;
  resetCourse: () => void;
  serialize: () => string;
  loadFromSave: (json: string) => boolean;
  hasLocalSave: () => boolean;
  takeLoan: (amount: number) => void;
  repayLoan: (amount: number) => boolean;
}

export interface CourseSaveData {
  version: number;
  grid: Tile[][];
  holes: HoleConfig[];
  money: number;
  debt: number;
  savedAt: string;
}

export const SAVE_VERSION = 2;

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

export const courseStore = createStore<CourseState>()((set, get) => ({
  grid: createEmptyGrid(),
  holes: createDefaultHoles(),
  money: 5000,
  debt: 0,

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
        grid: data.grid,
        holes: data.holes,
        money: data.money,
        debt: data.debt ?? 0,
      });
      return true;
    } catch (e) {
      console.warn('Failed to load course:', e);
      return false;
    }
  },

  addMoney: (amount) =>
    set((state) => ({ money: state.money + amount })),

  spendMoney: (amount) => {
    const state = get();
    if (state.money < amount) return false;
    set({ money: state.money - amount });
    return true;
  },

  getTile: (col, row) => get().grid[row][col],

  resetCourse: () =>
    set({
      grid: createEmptyGrid(),
      holes: createDefaultHoles(),
      money: 5000,
      debt: 0,
    }),

  serialize: () => {
    const { grid, holes, money, debt } = get();
    const data: CourseSaveData = {
      version: SAVE_VERSION,
      grid,
      holes,
      money,
      debt,
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
        grid: data.grid,
        holes: data.holes,
        money: data.money,
        debt: data.debt ?? 0,
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
}));
