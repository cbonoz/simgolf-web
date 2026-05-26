import { createStore } from 'zustand/vanilla';
import { Tile, HoleConfig } from './course';
import { GAME_CONFIG } from '../utils/gameConfig';

export type GolferState = 'walking' | 'addressing' | 'swinging' | 'ball_flight' | 'reacting' | 'hole_complete' | 'round_complete';

// === Personality traits (affects behavior/timing/thoughts) ===
export interface GolferTrait {
  name: string;
  emoji: string;
  description: string;
  // Behavioral modifiers
  thinkingTime: number; // ms added to addressing timer
  celebrationTime: number; // ms for hole_complete celebration
  reactionMultiplier: number; // 0.5-2.0 exaggeration on reactions
}

const TRAITS: GolferTrait[] = [
  { name: 'Cool', emoji: '😎', description: 'Stays calm under pressure', thinkingTime: 0, celebrationTime: 400, reactionMultiplier: 0.5 },
  { name: 'Hothead', emoji: '🤬', description: 'Gets angry at bad shots', thinkingTime: 200, celebrationTime: 600, reactionMultiplier: 2.0 },
  { name: 'Showboat', emoji: '🕺', description: 'Loves to show off', thinkingTime: 300, celebrationTime: 1200, reactionMultiplier: 1.8 },
  { name: 'Chatty', emoji: '💬', description: 'Talks to the ball', thinkingTime: 400, celebrationTime: 500, reactionMultiplier: 1.2 },
  { name: 'Focused', emoji: '🧘', description: 'Minimal wasted time', thinkingTime: -200, celebrationTime: 200, reactionMultiplier: 0.6 },
  { name: 'Lucky', emoji: '🍀', description: 'Things bounce their way', thinkingTime: 100, celebrationTime: 600, reactionMultiplier: 1.0 },
  { name: 'Grouch', emoji: '😤', description: 'Never satisfied', thinkingTime: 300, celebrationTime: 300, reactionMultiplier: 1.5 },
  { name: 'Joker', emoji: '😂', description: 'Laughs off bad shots', thinkingTime: 100, celebrationTime: 800, reactionMultiplier: 1.4 },
];

function randomTrait(): GolferTrait {
  return TRAITS[Math.floor(Math.random() * TRAITS.length)];
}

// === Golf skills (affects shot performance) ===
export interface GolferSkill {
  name: string;
  emoji: string;
  description: string;
}

const ALL_SKILLS: GolferSkill[] = [
  { name: 'Long Drive', emoji: '💪', description: 'Hits the ball farther' },
  { name: 'Short Game', emoji: '🎯', description: 'Better accuracy on approach' },
  { name: 'Accurate Putter', emoji: '🎱', description: 'Sinks putts from farther out' },
  { name: 'Power Swing', emoji: '⚡', description: 'Extra distance on drives' },
  { name: 'Bunker Master', emoji: '🏖️', description: 'Plays well from sand' },
  { name: 'Tree Dodger', emoji: '🌲', description: 'Bounces out of trouble' },
  { name: 'Clutch', emoji: '🔥', description: 'Performs better under par pressure' },
  { name: 'Iron Man', emoji: '🛡️', description: 'Consistent from the fairway' },
  { name: 'Scramble', emoji: '🔄', description: 'Good recovery from rough' },
  { name: 'Wind Reader', emoji: '🌬️', description: 'Less affected by terrain penalties' },
];

function randomSkills(): GolferSkill[] {
  // Each golfer gets 1-3 skills
  const count = 1 + Math.floor(Math.random() * 3);
  const shuffled = [...ALL_SKILLS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

// === Expanded name pool ===
const FIRST_NAMES = [
  'Al', 'Bob', 'Cal', 'Dan', 'Ed', 'Fred', 'Gil', 'Hal', 'Ian', 'Jay',
  'Ken', 'Leo', 'Mac', 'Ned', 'Otto', 'Pat', 'Quin', 'Ray', 'Sam', 'Ted',
  'Van', 'Walt', 'Abe', 'Ben', 'Chet', 'Don', 'Earl', 'Frank', 'Gary', 'Hank',
  'Ira', 'Jack', 'Karl', 'Lou', 'Max', 'Nick', 'Owen', 'Pete', 'Rex', 'Sid',
  'Tom', 'Vic', 'Will', 'Art', 'Bill', 'Carl', 'Dave', 'Eli', 'Finn', 'Gus',
  'Hugh', 'Jeb', 'Kip', 'Lyle', 'Milt', 'Nate', 'Orv', 'Rolf', 'Skip', 'Troy',
  'Buck', 'Chip', 'Dirk', 'Elmo', 'Floyd', 'Gabe', 'Hyun', 'Judd', 'Kurt', 'Liam',
  'Miles', 'Neal', 'Orin', 'Percy', 'Ricky', 'Shawn', 'Ty', 'Uri', 'Vince', 'Wade',
  'Sue', 'Liv', 'Kate', 'Meg', 'Fern', 'Jill',
];

const LAST_NAMES = [
  'Adams', 'Baker', 'Clark', 'Davis', 'Evans', 'Ford', 'Grant', 'Hill', 'Irwin', 'Jones',
  'King', 'Lewis', 'Miller', 'Nash', 'Owen', 'Parker', 'Quinn', 'Reed', 'Scott', 'Taylor',
  'Underwood', 'Vance', 'White', 'Young', 'Zane', 'Brooks', 'Cole', 'Dunn', 'Ellis', 'Frost',
  'Giles', 'Hart', 'Ingram', 'Jacobs', 'Klein', 'Long', 'Moss', 'Neal', 'Page', 'Ross',
  'Stone', 'Thorn', 'Vale', 'Wells', 'Cross', 'Drake', 'Flynn', 'Grove', 'Hyde', 'Jett',
  'Kane', 'Locke', 'Nash', 'Pierce', 'Slade', 'Tate', 'Vance', 'Ward', 'York', 'Zorn',
  'Ashford', 'Buckley', 'Chase', 'Dalton', 'Forrester', 'Hartley', 'Kendall', 'Marlow',
  'Sinclair', 'Whitley', 'Bronson', 'Calloway', 'Ellington', 'Harrington', 'Livingston',
];

const FIRST_NAMES_F = [
  'Anna', 'Bess', 'Claire', 'Dora', 'Ella', 'Faye', 'Grace', 'Hope', 'Ivy', 'Jane',
  'Kira', 'Lena', 'Maya', 'Nora', 'Opal', 'Pearl', 'Ruby', 'Sage', 'Tess', 'Vera',
  'Wren', 'Zoe',
];

function generateName(): string {
  // ~70% male names, ~20% female, ~10% unisex style
  const pool = Math.random() < 0.25 ? FIRST_NAMES_F : FIRST_NAMES;
  const first = pool[Math.floor(Math.random() * pool.length)];
  const last = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
  return `${first} ${last}`;
}

export function generateThought(golfer: Golfer, grid?: Tile[][], holes?: HoleConfig[]): string {
  const { state, strokes, currentHole, trait } = golfer;
  const hole = holes?.find((h) => h.id === currentHole);
  const par = hole?.par ?? 3;
  const hot = trait?.name === 'Hothead';
  const showboat = trait?.name === 'Showboat';
  const grouch = trait?.name === 'Grouch';
  const joker = trait?.name === 'Joker';

  if (state === 'round_complete') {
    const totalPar = holes?.reduce((sum, h) => sum + h.par, 0) ?? 27;
    const total = golfer.totalStrokes;
    if (total <= totalPar - 3) return showboat ? 'The crowd loves me!' : 'Best round of my life!';
    if (total <= totalPar) return grouch ? 'Could have been better.' : 'Solid round out there.';
    if (total <= totalPar + 5) return hot ? 'STUPID COURSE!' : 'Could\'ve been better.';
    return grouch ? 'Worst course ever.' : 'This course is brutal...';
  }

  if (state === 'hole_complete') {
    if (strokes === 1) {
      if (showboat) return 'DID YOU SEE THAT?!';
      if (joker) return 'Even a blind squirrel...';
      return 'HOLE IN ONE! Unbelievable!';
    }
    if (strokes <= par - 2) return showboat ? 'EASY. Just like I planned.' : 'Eagle! I\'m on fire!';
    if (strokes <= par - 1) return joker ? 'Beginner\'s luck!' : 'Nice birdie!';
    if (strokes === par) return grouch ? 'Barely acceptable.' : 'Par. Good enough.';
    if (strokes === par + 1) return hot ? 'YOU\'VE GOTTA BE KIDDING ME!' : 'Bogey. That\'s frustrating.';
    if (strokes >= par + 3) return grouch ? 'Design flaw.' : 'This hole is impossible!';
    return 'Finally done with this hole.';
  }

  if (strokes >= 8) return hot ? 'I\'VE LOST COUNT!' : 'I\'ve lost count...';
  if (strokes >= 5 && par <= 3) return 'This par-3 is killing me!';

  // Terrain-based thoughts
  const tile = grid?.[golfer.tilePos.row]?.[golfer.tilePos.col];
  if (tile) {
    if (tile.type === 'water') {
      if (joker) return 'At least my ball got a bath!';
      if (hot) return 'WATER?! SERIOUSLY?!';
      return 'I\'m soaked! Who put water there?!';
    }
    if (tile.type === 'trees') {
      if (trait?.name === 'Tree Dodger') return 'Trees don\'t scare me.';
      if (joker) return 'A tree walked in front of my ball!';
      return 'These trees are everywhere!';
    }
    if (tile.type === 'sand') {
      if (golfer.skills.some(s => s.name === 'Bunker Master')) return 'Right where I want it.';
      if (hot) return 'SAND! AGAIN!';
      return 'Ugh, not another bunker.';
    }
    if (tile.type === 'rough') {
      if (golfer.skills.some(s => s.name === 'Scramble')) return 'No problem, I love this lie.';
      return 'This rough is thick.';
    }
    if (tile.type === 'green') {
      const distToCup = Math.abs(golfer.tilePos.col - (hole?.cup?.col ?? 0)) + Math.abs(golfer.tilePos.row - (hole?.cup?.row ?? 0));
      if (distToCup <= 1) return showboat ? 'Watch and learn.' : 'Sink it, sink it...';
      if (distToCup <= 3) return 'Nice approach. Can I putt this?';
      return 'On the green, finally.';
    }
    if (tile.type === 'fairway') {
      if (golfer.skills.some(s => s.name === 'Iron Man')) return 'Right in my wheelhouse.';
      if (grouch) return 'Fairway. Finally something decent.';
      return 'Good lie on the fairway.';
    }
  }

  if (state === 'addressing') {
    if (trait?.name === 'Focused') return 'Clear mind, smooth swing.';
    if (trait?.name === 'Chatty') return 'Come on ball, you know what to do...';
    if (hot) return 'OK, make this one count.';
    return 'Let me think about this shot...';
  }
  if (state === 'swinging') return hot ? 'GAAAH!' : 'Here we go...';
  if (state === 'ball_flight') {
    if (trait?.name === 'Chatty') return 'GET UP! GET UP!';
    return 'Get up!';
  }
  if (state === 'reacting') {
    if (trait?.name === 'Cool') return '...';
    if (joker) return 'That happened.';
    return 'Where did that land?';
  }

  return 'Nice course layout.';
}

export interface Golfer {
  id: number;
  name: string;
  skill: number; // 0.3 - 0.9 (overall skill)
  colorIndex: number; // 0-4 for sprite variation
  currentHole: number; // 1-9
  tilePos: { col: number; row: number };
  previousTilePos: { col: number; row: number } | null;
  walkTarget: { col: number; row: number } | null; // tile being walked toward
  strokes: number;
  totalStrokes: number;
  state: GolferState;
  stateTimer: number; // ms remaining in current state
  scorecard: number[]; // strokes per hole
  onCourse: boolean;
  waterHits: number;
  treeHits: number;
  // New personality & skills
  trait: GolferTrait;
  skills: GolferSkill[];
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

    const skill = 0.3 + Math.random() * 0.6;
    const trait = randomTrait();
    const skills = randomSkills();
    const golfer: Golfer = {
      id: state.nextId,
      name: generateName(),
      skill: Math.round(skill * 100) / 100,
      colorIndex: Math.floor(Math.random() * 5),
      currentHole: 1,
      tilePos: { col: startCol, row: startRow },
      previousTilePos: null,
      walkTarget: null,
      strokes: 0,
      totalStrokes: 0,
      state: 'addressing',
      stateTimer: GAME_CONFIG.INITIAL_ADDRESS_TIME + trait.thinkingTime,
      scorecard: [],
      onCourse: true,
      waterHits: 0,
      treeHits: 0,
      trait,
      skills,
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
