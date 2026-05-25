import { createStore } from 'zustand/vanilla';

export type GolferState = 'walking' | 'addressing' | 'swinging' | 'ball_flight' | 'reacting' | 'hole_complete' | 'round_complete';

export interface Golfer {
  id: number;
  skill: number; // 0.3 - 0.9
  colorIndex: number; // 0-4 for sprite variation
  currentHole: number; // 1-9
  tilePos: { col: number; row: number };
  previousTilePos: { col: number; row: number } | null;
  strokes: number;
  totalStrokes: number;
  state: GolferState;
  stateTimer: number; // ms remaining in current state
  scorecard: number[]; // strokes per hole
  onCourse: boolean;
}

export interface GolferStoreState {
  golfers: Golfer[];
  nextId: number;
  completedRounds: number;
  spawnGolfer: (startCol: number, startRow: number) => Golfer | null;
  removeGolfer: (id: number) => void;
  updateGolfer: (id: number, updates: Partial<Golfer>) => void;
  resetGolfers: () => void;
}

export const golferStore = createStore<GolferStoreState>()((set, get) => ({
  golfers: [],
  nextId: 1,
  completedRounds: 0,

  spawnGolfer: (startCol, startRow) => {
    const state = get();
    if (state.golfers.length >= 12) return null;

    const skill = 0.3 + Math.random() * 0.6; // bell curve centered on mediocre
    const golfer: Golfer = {
      id: state.nextId,
      skill: Math.round(skill * 100) / 100,
      colorIndex: Math.floor(Math.random() * 5),
      currentHole: 1,
      tilePos: { col: startCol, row: startRow },
      previousTilePos: null,
      strokes: 0,
      totalStrokes: 0,
      state: 'addressing',
      stateTimer: 800, // brief pause before first swing
      scorecard: [],
      onCourse: true,
    };

    set({
      golfers: [...state.golfers, golfer],
      nextId: state.nextId + 1,
    });

    return golfer;
  },

  removeGolfer: (id) =>
    set((state) => ({
      golfers: state.golfers.filter((g) => g.id !== id),
    })),

  updateGolfer: (id, updates) =>
    set((state) => ({
      golfers: state.golfers.map((g) =>
        g.id === id ? { ...g, ...updates } : g
      ),
    })),

  resetGolfers: () =>
    set({ golfers: [], nextId: 1, completedRounds: 0 }),
}));
