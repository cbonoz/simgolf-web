# SimGolf Web — MVP Implementation Plan

## What is SimGolf?

Sid Meier's SimGolf (2002) is a golf course management sim with three intertwined loops:

1. **Build** — Design holes on a grid (tee → fairway → green, with hazards & terrain)
2. **Watch** — AI golfers play your course, generating revenue & reputation
3. **Improve** — Spend revenue on upgrades, new holes, facilities, landscaping

**Core appeal:** Satisfying builder + emergent comedy from bad AI golfers hitting water, trees, and each other.

---

## MVP Scope (6-8 weeks, solo)

The MVP strips SimGolf to its **core loop**: build a 9-hole course, watch golfers play, earn money, improve. No story mode, no deep sim, but the *feel* should be there.

### What's IN

| Feature | Notes |
|---------|-------|
| Grid-based course builder | 40×30 tile grid, paint terrain |
| 6 terrain types | Fairway, Rough, Sand, Water, Trees, Green |
| Tee + Hole (cup) placement | 1 tee + 1 cup per hole, 9 holes |
| AI golfer pathing | Simple stroke simulation with error |
| Scoring | Stroke count per hole, total scorecard |
| Revenue system | Green fees + concessions per golfer |
| Day/night cycle | Accelerated — 1 day ≈ 30s real time |
| Basic economy | Money in → spend on terrain purchases |
| Undo/redo | Builder QoL |

### What's OUT (future phases)

- Full resort management (hotel, pro shop, memberships)
- Terrain editing tools (raise/lower elevation)
- Weather system
- Multiplayer / leaderboards
- Sound & music
- Mobile-responsive (desktop-first)
- Save/load (use localStorage for MVP)
- Tournaments & events

---

## Architecture

```
simgolf-web/
├── index.html              # Entry point
├── package.json
├── vite.config.ts
├── src/
│   ├── main.ts             # Bootstrapper, game loop
│   ├── state/
│   │   ├── store.ts        # Zustand store (single source of truth)
│   │   ├── course.ts        # Course state, tile grid
│   │   ├── economy.ts       # Money, revenue, expenses
│   │   └── golfers.ts       # Active golfer AI state
│   ├── engine/
│   │   ├── renderer.ts      # Canvas rendering (2D)
│   │   ├── input.ts         # Mouse/touch → tile coordinates
│   │   ├── pathfinding.ts   # Golfer stroke simulation
│   │   └── tick.ts          # Game day cycle, golfer spawning
│   ├── builder/
│   │   ├── Brush.ts         # Terrain painting tool
│   │   ├── HoleConfig.ts    # Tee + cup placement
│   │   └── UndoStack.ts     # Undo/redo history
│   ├── sim/
│   │   ├── Golfer.ts        # AI golfer entity
│   │   ├── Swing.ts         # Stroke simulation (power + error)
│   │   └── Scoring.ts       # Scorecard tracking
│   ├── ui/
│   │   ├── Toolbar.tsx       # Terrain palette, tools
│   │   ├── Scorecard.tsx     # Per-hole scores
│   │   ├── FinanceBar.tsx    # Money display
│   │   └── DayIndicator.tsx  # Day/time display
│   └── assets/
│       └── tiles.ts          # Procedural tile sprites (no images needed)
└── tests/
    └── ...
```

### Tech Stack

| Choice | Why |
|--------|-----|
| **Vite + TypeScript** | Fast dev, strict types catch sim bugs |
| **HTML5 Canvas** | 2D grid game — no need for WebGL/Three.js |
| **Zustand** | Lightweight state, great for game state |
| **No framework for UI** | Minimal UI — plain HTML/CSS overlays on canvas |
| **No external assets** | Procedural tile colors/patterns, ship zero images |

---

## Core Systems — Design

### 1. Grid & Terrain

```
Tile = {
  type: 'fairway' | 'rough' | 'sand' | 'water' | 'trees' | 'green'
  hole: number | null      // which hole this tile belongs to
  isTee: boolean
  isCup: boolean
}
```

- Grid is `40×30` (1200 tiles). Each tile is ~20px on screen.
- Terrain affects golfer ball physics:
  - Fairway: full distance
  - Rough: 50% distance
  - Sand: 30% distance
  - Water: penalty stroke, reset to previous position
  - Trees: ball stops, random deflection next swing
  - Green: puts ball near cup

### 2. Course Builder

**Two modes:**
- **Paint mode** — Select terrain type, click/drag to paint tiles
- **Hole mode** — Place tee and cup for each of 9 holes

**Validation rules:**
- Each hole must have exactly 1 tee and 1 cup
- Tee and cup must be on fairway or green tiles
- Holes must not overlap paths (optional for MVP)
- Water can't be placed on tee/cup

**Undo:** Store grid snapshots (diff-based for perf if needed later).

### 3. AI Golfer Simulation

This is the soul of the game. Golfers should be *believable*, not perfect.

```
Golfer = {
  id: number
  skill: 0.3 - 0.9          // 0.9 = scratch, 0.3 = hack
  currentHole: 1-9
  position: {x, y}
  strokes: number
  state: 'walking' | 'addressing' | 'swinging' | 'ball_flight' | 'reacting'
}
```

**Stroke simulation:**
1. Calculate ideal direction toward cup
2. Add random error scaled by `(1 - skill)`
3. Calculate distance based on club selection (auto for MVP)
4. Ball travels along vector, modified by terrain on landing
5. If ball lands in water → penalty + replay
6. If ball on green and within `skill * 3` tiles of cup → putt goes in
7. Max strokes per hole = 10 (pick up)

**Swing loop per golfer (~2s real time):**
```
ADDRESS (0.5s) → SWING (0.5s) → BALL_FLIGHT (0.5s) → REACT (0.3s) → next stroke or next hole
```

**Spawning:** 1-3 golfers tee off every ~5s game time. Max 12 on course.

### 4. Economy

```
Revenue:
  - Green fees: $20-50 per golfer (based on course reputation)
  - Concessions: $5-10 per golfer (random)

Expenses:
  - Terrain cost: $5-50 per tile painted (water = expensive, fairway = cheap)
  - Per-day maintenance: $100 base + $2 per tile of non-rough

Profit = Revenue - Expenses per day

Starting money: $5000
```

**Reputation** = average of last 10 golfers' satisfaction:
- Under par → +2 rep
- Par → +1 rep  
- Bogey → 0 rep
- Double bogey+ → -1 rep
- Hit water/trees → -1 rep each

Reputation 1-5 stars → multiplies green fees.

### 5. Game Loop & Day Cycle

```
1 real second = 1 game minute
1 game day = 6 real minutes (can add speed toggle later)
```

**Day phases:**
- 6:00-10:00 — Golfers arrive, tee off in groups
- 10:00-18:00 — Peak play, max golfers on course
- 18:00-20:00 — Winding down, last groups finishing
- 20:00-6:00 — Night → day summary, revenue collection

**Day summary screen:**
- Golfers served, revenue, expenses, profit
- Reputation change
- Available funds

---

## Milestone Breakdown

### M1: Grid & Rendering (Week 1-2)
- [ ] Canvas setup, grid rendering with tile colors
- [ ] Terrain type enum + tile map
- [ ] Mouse input → tile coordinates
- [ ] Paint brush tool (click/drag to change terrain)
- [ ] Terrain palette UI (sidebar)
- [ ] Basic camera (pan, zoom)
- [ ] Save grid state to localStorage

### M2: Hole Design (Week 2-3)
- [ ] Hole mode: place tee + cup for 9 holes
- [ ] Hole numbering + color coding
- [ ] Validation: enforce tee/cup rules
- [ ] Show hole paths (tee → cup line)
- [ ] Undo/redo for builder

### M3: Golfer AI (Week 3-5) — *the hard part*
- [ ] Golfer entity (position, state, skill)
- [ ] Stroke simulation (direction + distance + error)
- [ ] Ball flight animation (arc interpolation)
- [ ] Terrain interaction on landing
- [ ] Putt detection and hole completion
- [ ] Max stroke limit (10 per hole)
- [ ] Transition between holes (9-hole round)
- [ ] Spawner: schedule golfers throughout day

### M4: Economy & Day Cycle (Week 5-6)
- [ ] Money tracking (Zustand store)
- [ ] Terrain costs (can't paint without funds)
- [ ] Revenue from green fees per completed round
- [ ] Day/night cycle with time acceleration
- [ ] Day summary overlay (revenue, expenses, profit)
- [ ] Starting money + initial terrain budget

### M5: Polish & Juice (Week 6-8)
- [ ] Scorecard UI (strokes per hole, par)
- [ ] Finance bar overlay
- [ ] Golfer reaction animations (celebration, frustration)
- [ ] Sound effects (just a few — club swing, ball splash, crowd)
- [ ] Speed controls (1x, 2x, 5x)
- [ ] Intro screen + "start round" button
- [ ] Deploy to GitHub Pages

---

## Visual Style (MVP)

Keep it **simple and readable**. No pixel art needed.

- **Grid:** Light green background, darker grid lines
- **Fairway:** Striped green (alternating horizontal bands)
- **Rough:** Muted olive green
- **Sand:** Tan/beige
- **Water:** Blue with subtle wave pattern
- **Trees:** Dark green circles
- **Green:** Smooth bright green circle around cup
- **Tee:** White square marker
- **Cup:** Black circle with flag
- **Golfers:** Colored dots (red, blue, yellow) moving on course
- **Ball:** Small white circle with brief trail on flight

All procedural — no sprite sheets, no image assets. Canvas primitives only.

---

## Key Risk: Golfer AI Feel

The #1 thing that makes SimGolf fun is **watching golfers struggle**. If the AI is too perfect or too random, the game is boring.

**Tuning tips:**
- Skill distribution should be a bell curve centered around 0.5 (most golfers are mediocre)
- Bad swings should be *slightly* biased toward obstacles (more fun to watch)
- Ball-in-water should trigger a visible "splash" and the golfer should visibly react
- Skip 2-3 seconds between strokes so the player can follow the action
- Show a brief "thought bubble" before each swing (adds personality)

**Test early with exaggerated bad swings** — tune down once it feels entertaining.

---

## Quick Start (Day 1)

```bash
npm create vite@latest simgolf-web -- --template vanilla-ts
cd simgolf-web
npm install zustand
# Start building M1
```

Prototype the grid + terrain painting first. Get something on screen within the first session. The golfer AI can wait — there's no game without a course to play on.

---

*Plan saved 2026-04-14. Repo: github.com/cbonoz/simgolf-web*
