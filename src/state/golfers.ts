import { createStore } from 'zustand/vanilla';
import { Tile, HoleConfig } from './course';

export type GolferState = 'walking' | 'addressing' | 'swinging' | 'ball_flight' | 'reacting' | 'hole_complete' | 'round_complete';

const FIRST_NAMES = [
  'Al', 'Bob', 'Cal', 'Dan', 'Ed', 'Fred', 'Gil', 'Hal', 'Ian', 'Jay',
  'Ken', 'Leo', 'Mac', 'Ned', 'Otto', 'Pat', 'Quin', 'Ray', 'Sam', 'Ted',
  'Van', 'Walt', 'Abe', 'Ben', 'Chet', 'Don', 'Earl', 'Frank', 'Gary', 'Hank',
  'Ira', 'Jack', 'Karl', 'Lou', 'Max', 'Nick', 'Owen', 'Pete', 'Rex', 'Sid',
  'Tom', 'Vic', 'Will', 'Art', 'Bill', 'Carl', 'Dave', 'Eli', 'Finn', 'Gus',
];

const LAST_NAMES = [
  'Adams', 'Baker', 'Clark', 'Davis', 'Evans', 'Ford', 'Grant', 'Hill', 'Irwin', 'Jones',
  'King', 'Lewis', 'Miller', 'Nash', 'Owen', 'Parker', 'Quinn', 'Reed', 'Scott', 'Taylor',
  'Underwood', 'Vance', 'White', 'Young', 'Zane', 'Brooks', 'Cole', 'Dunn', 'Ellis', 'Frost',
  'Giles', 'Hart', 'Ingram', 'Jacobs', 'Klein', 'Long', 'Moss', 'Neal', 'Page', 'Ross',
];

function generateName(): string {
  const first = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
  const last = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
  return `${first} ${last}`;
}

export function generateThought(golfer: Golfer, grid?: Tile[][], holes?: HoleConfig[]): string {
  const { state, strokes, currentHole } = golfer;
  const hole = holes?.find((h) => h.id === currentHole);
  const par = hole?.par ?? 3;

  if (state === 'round_complete') {
    const totalPar = holes?.reduce((sum, h) => sum + h.par, 0) ?? 27;
    const total = golfer.totalStrokes;
    if (total <= totalPar - 3) return 'Best round of my life!';
    if (total <= totalPar) return 'Solid round out there.';
    if (total <= totalPar + 5) return 'Could\'ve been better.';
    return 'This course is brutal...';
  }

  if (state === 'hole_complete') {
    if (strokes === 1) return 'HOLE IN ONE! Unbelievable!';
    if (strokes <= par - 2) return 'Eagle! I\'m on fire!';
    if (strokes <= par - 1) return 'Nice birdie!';
    if (strokes === par) return 'Par. Good enough.';
    if (strokes === par + 1) return 'Bogey. That\'s frustrating.';
    if (strokes >= par + 3) return 'This hole is impossible!';
    return 'Finally done with this hole.';
  }

  if (strokes >= 8) return 'I\'ve lost count...';
  if (strokes >= 5 && par <= 3) return 'This par-3 is killing me!';

  // Terrain-based thoughts
  const tile = grid?.[golfer.tilePos.row]?.[golfer.tilePos.col];
  if (tile) {
    if (tile.type === 'water') return 'I\'m soaked! Who put water there?!';
    if (tile.type === 'trees') return 'These trees are everywhere!';
    if (tile.type === 'sand') return 'Ugh, not another bunker.';
    if (tile.type === 'rough') return 'This rough is thick.';
    if (tile.type === 'green') {
      const distToCup = Math.abs(golfer.tilePos.col - (hole?.cup?.col ?? 0)) + Math.abs(golfer.tilePos.row - (hole?.cup?.row ?? 0));
      if (distToCup <= 1) return 'Sink it, sink it...';
      if (distToCup <= 3) return 'Nice approach. Can I putt this?';
      return 'On the green, finally.';
    }
    if (tile.type === 'fairway') return 'Good lie on the fairway.';
  }

  if (state === 'addressing') return 'Let me think about this shot...';
  if (state === 'swinging') return 'Here we go...';
  if (state === 'ball_flight') return 'Get up!';
  if (state === 'reacting') return 'Where did that land?';

  return 'Nice course layout.';
}

export interface Golfer {
  id: number;
  name: string;
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
  waterHits: number;
  treeHits: number;
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
      name: generateName(),
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
      waterHits: 0,
      treeHits: 0,
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
