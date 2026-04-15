import { createStore } from 'zustand/vanilla';
import { GRID_COLS, GRID_ROWS, TerrainType } from '../utils/constants';

export interface Tile {
  type: TerrainType;
  hole: number | null;
  isTee: boolean;
  isCup: boolean;
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
  setTile: (col: number, row: number, type: TerrainType) => void;
  setTee: (holeId: number, col: number, row: number) => void;
  setCup: (holeId: number, col: number, row: number) => void;
  addMoney: (amount: number) => void;
  spendMoney: (amount: number) => boolean;
  getTile: (col: number, row: number) => Tile;
  resetCourse: () => void;
}

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

  setTile: (col, row, type) =>
    set((state) => {
      const grid = state.grid.map((r) => [...r]);
      grid[row][col] = { ...grid[row][col], type };
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
    }),
}));
