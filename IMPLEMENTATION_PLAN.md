# SimGolf Web — MVP Implementation Plan

## What is SimGolf?

Sid Meier's SimGolf (2002) is a golf course management sim with three intertwined loops:

1. **Build** — Design holes on an isometric grid (tee → fairway → green, with hazards & terrain)
2. **Watch** — AI golfers play your course, generating revenue & reputation
3. **Improve** — Spend revenue on upgrades, new holes, facilities, landscaping

**Core appeal:** Satisfying builder + emergent comedy from bad AI golfers hitting water, trees, and each other.

---

## MVP Scope (6-8 weeks, solo)

The MVP strips SimGolf to its **core loop**: build a 9-hole course, watch golfers play, earn money, improve. No story mode, no deep sim, but the *feel* should be there — especially the isometric charm.

### What's IN

| Feature | Notes |
|---------|-------|
| Isometric grid-based course builder | Diamond tile grid, Phaser isometric tilemap |
| 6 terrain types | Fairway, Rough, Sand, Water, Trees, Green |
| Tee + Hole (cup) placement | 1 tee + 1 cup per hole, 9 holes |
| AI golfer pathing | Simple stroke simulation with error |
| Scoring | Stroke count per hole, total scorecard |
| Revenue system | Green fees + concessions per golfer |
| Day/night cycle | Accelerated — 1 day ≈ 30s real time |
| Basic economy | Money in → spend on terrain purchases |
| Undo/redo | Builder QoL |
| Speed controls | 1x, 2x, 5x |

### What's OUT (future phases)

- Full resort management (hotel, pro shop, memberships)
- Elevation / terrain height editing
- Weather system
- Multiplayer / leaderboards
- Rich sound & music
- Mobile-responsive (desktop-first)
- Tournaments & events

---

## Architecture

```
simgolf-web/
├── index.html                  # Entry point
├── package.json
├── scripts/
│   ├── build.ts                # Bun production build script
│   └── dev-server.ts           # Bun dev server with TS transpile
├── public/
│   └── assets/
│       └── sprites/             # External sprite assets (isometric plants, etc.)
├── src/
│   ├── main.ts                 # Phaser game config + boot
│   ├── scenes/
│   │   ├── BootScene.ts        # Asset generation, procedural sprites
│   │   ├── BuilderScene.ts     # Course design mode (paint, hole config)
│   │   ├── PlayScene.ts        # Golfers playing, day cycle, revenue
│   │   ├── DaySummaryScene.ts  # End-of-day overlay
│   │   └── TitleScene.ts       # Start screen
│   ├── state/
│   │   ├── store.ts            # Zustand store (economy, reputation, settings)
│   │   ├── course.ts           # Course state, tile data model
│   │   └── golfers.ts          # Active golfer AI state
│   ├── systems/
│   │   ├── IsoTransform.ts     # Screen ↔ tile coordinate conversion
│   │   ├── StrokeSim.ts        # Swing power + error calculation
│   │   ├── TerrainEffects.ts   # Terrain → ball behavior mapping
│   │   ├── DayCycle.ts         # Time progression, golfer spawning
│   │   └── Economy.ts          # Revenue, expenses, reputation calc
│   ├── entities/
│   │   ├── Golfer.ts           # Phaser sprite + AI state
│   │   ├── Ball.ts             # Ball flight + terrain interaction
│   │   └── TileCursor.ts       # Builder hover highlight
│   ├── ui/
│   │   ├── Toolbar.ts          # Terrain palette, tool selection (HTML overlay)
│   │   ├── Scorecard.ts        # Per-hole scores (HTML overlay)
│   │   ├── FinanceBar.ts       # Money + reputation display (HTML overlay)
│   │   ├── DayIndicator.ts     # Day/time display (HTML overlay)
│   │   └── SpeedControls.ts    # 1x, 2x, 5x buttons (HTML overlay)
│   └── utils/
│       ├── constants.ts         # Grid size, tile dims, speeds
│       └── helpers.ts           # Math utilities
└── tests/
    └── ...
```

### Tech Stack

| Choice | Why |
|--------|-----|
| **Bun + TypeScript** | Package manager, dev server (`Bun.serve`), bundler (`Bun.build`) |
| **Phaser 3** | Isometric tilemap support, sprites, scene management, camera, input — handles the hard parts of isometric rendering |
| **Zustand** | Economy + game state that Phaser doesn't own. Lightweight, no boilerplate |
| **No React** | Phaser owns the canvas. Minimal UI is plain HTML/CSS overlays positioned over the game. No virtual dom overhead for what's essentially a few HUD elements |
| **No external sprite sheets** | Procedural texture generation in BootScene (draw tiles to Phaser text objects). Ship zero image assets |

---

## Core Systems — Design

### 1. Isometric Grid & Terrain

```
Tile = {
  type: 'fairway' | 'rough' | 'sand' | 'water' | 'trees' | 'green'
  hole: number | null      // which hole this tile belongs to
  isTee: boolean
  isCup: boolean
}
```

- Grid is `40×30` (1200 tiles) displayed as isometric diamond grid
- Tile size: `64×32` (standard isometric diamond: width = 2× height)
- Total canvas footprint: ~2560×960 before camera/zoom

**Isometric coordinate transform** (IsoTransform):
```
// Tile (col, row) → Screen (x, y)
screenX = (col - row) * (TILE_WIDTH / 2) + offsetX
screenY = (col + row) * (TILE_HEIGHT / 2) + offsetY

// Screen (x, y) → Tile (col, row) — for input
col = (screenX / (TILE_WIDTH / 2) + screenY / (TILE_HEIGHT / 2)) / 2
row = (screenY / (TILE_HEIGHT / 2) - screenX / (TILE_WIDTH / 2)) / 2
```

**Depth sorting:** Phaser 3.60+ supports `depthSort` on isometric tilemaps. For sprites (golfers, ball), set `depth = y + x` for correct visual overlap.

**Terrain effects on ball:**
| Terrain | Effect |
|---------|--------|
| Fairway | Full distance |
| Rough | 50% distance |
| Sand | 30% distance |
| Water | Penalty stroke, reset to previous position |
| Trees | Ball stops, random deflection next swing |
| Green | Puts ball near cup, enables putting |

### 2. Course Builder (BuilderScene)

**Two modes:**
- **Paint mode** — Select terrain type, click/drag to paint tiles isometrically
- **Hole mode** — Place tee and cup for each of 9 holes

**Builder UX:**
- IsoTransform converts mouse clicks to tile coordinates
- TileCursor sprite shows hover position (translucent diamond)
- Drag painting: flood-fill drag with selected terrain
- Right-click or ctrl-Z to undo

**Validation rules:**
- Each hole must have exactly 1 tee and 1 cup
- Tee and cup must be on fairway or green tiles
- Water can't be placed on tee/cup positions
- Par auto-calculated from tee-to-cup distance

**Undo:** Store tile diffs in a stack (only changed tiles per action).

### 3. AI Golfer Simulation (PlayScene)

This is the soul of the game. Golfers should be *believable*, not perfect.

```
Golfer = {
  id: number
  skill: 0.3 - 0.9          // 0.9 = scratch, 0.3 = hack
  currentHole: 1-9
  tilePos: {col, row}
  strokes: number
  state: 'walking' | 'addressing' | 'swinging' | 'ball_flight' | 'reacting'
  sprite: Phaser.GameObjects.Sprite
}
```

**Stroke simulation:**
1. Calculate ideal direction toward cup (isometric tile path)
2. Add random error scaled by `(1 - skill)` — bad golfers swing wild
3. Calculate distance based on club selection (auto for MVP)
4. Ball travels along vector, modified by terrain on landing
5. If ball lands in water → penalty + replay (with splash animation)
6. If ball on green and within `skill * 3` tiles of cup → putt goes in
7. Max strokes per hole = 10 (pick up)

**Swing loop per golfer (~2s real time):**
```
ADDRESS (0.5s) → SWING (0.5s) → BALL_FLIGHT (0.5s) → REACT (0.3s) → next stroke or next hole
```

**Isometric movement:** Golfers walk tile-to-tile using iso pathfinding. Ball flight interpolates between screen-space positions with a parabolic arc (height = distance * 0.3).

**Spawning:** 1-3 golfers tee off every ~5s game time. Max 12 on course.

**Depth sorting:** Each golfer sprite's depth = `(tilePos.col + tilePos.row)` so they render behind/in-front of terrain correctly.

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
1 real second = 1 game minute (at 1x speed)
1 game day = 6 real minutes at 1x
Speed: 1x, 2x, 5x (Phaser timeScale)
```

**Day phases:**
- 6:00-10:00 — Golfers arrive, tee off in groups
- 10:00-18:00 — Peak play, max golfers on course
- 18:00-20:00 — Winding down, last groups finishing
- 20:00-6:00 — Night → DaySummaryScene

**Day summary:**
- Golfers served, revenue, expenses, profit
- Reputation change
- Available funds
- "Continue" → back to builder or next day

### 6. Scene Flow

```
TitleScene → BuilderScene (initial course design)
                ↓ [player presses "Open for Play"]
            PlayScene (golfers arrive, day runs)
                ↓ [day ends]
         DaySummaryScene (revenue report)
                ↓ [continue]
            BuilderScene (improve course)
                ↓ [open again]
            PlayScene ... (loop)
```

Phaser scenes make this flow clean — each scene owns its own update loop and rendering, and we pass data via Zustand store.

---

## Visual Style

**Isometric SimGolf aesthetic** — colorful, readable, charming.

### Tile Rendering (Procedural)

All textures generated in BootScene using Phaser's `Graphics` → `generateTexture()`:

| Tile | Visual |
|------|--------|
| **Fairway** | Striped green (alternating horizontal bands) |
| **Rough** | Muted olive green, textured |
| **Sand** | Tan/beige with stipple dots |
| **Water** | Blue with animated wave lines |
| **Trees** | Dark green triangle on trunk (isometric) |
| **Green** | Smooth bright green with subtle grain |
| **Tee marker** | White square on fairway |
| **Cup + flag** | Black circle with red triangle flag |

### Golfers

- Small isometric sprites (colored dots/ovals): red, blue, yellow, green, orange
- Brief white trail on ball flight
- "Splash" particle burst on water hazard
- Exaggerated celebration/frustration animations (scale bounce)

### Camera

- Pan: drag to scroll (isometric world is larger than viewport)
- Zoom: scroll wheel (0.5x – 2x)
- Bounds: clamp to course grid edges

---

## Milestone Breakdown

### M1: Iso Grid & Rendering (Week 1-2)
- [x] Phaser 3 + Bun + TypeScript project scaffold
- [ ] BootScene: generate procedural tile textures
- [ ] Isometric tilemap: 40×30 diamond grid rendering
- [ ] IsoTransform: screen ↔ tile coordinate conversion
- [ ] Camera: pan (drag) + zoom (scroll)
- [ ] Depth sorting for isometric tiles
- [ ] Mouse input → iso tile coordinates
- [ ] TileCursor: hover highlight sprite
- [ ] Zustand store: course tile state

### M2: Course Builder (Week 2-3)
- [ ] Paint mode: terrain brush (click/drag to paint)
- [ ] Terrain palette UI (HTML overlay sidebar)
- [ ] Hole mode: place tee + cup for 9 holes
- [ ] Hole numbering + color coding on tiles
- [ ] Validation: enforce tee/cup placement rules
- [ ] Auto-par calculation from tee-to-cup distance
- [ ] Undo/redo for builder (tile diff stack)
- [ ] Save/load course to localStorage

### M3: Golfer AI (Week 3-5) — *the hard part*
- [ ] Golfer entity: Phaser sprite + Zustand state
- [ ] Stroke simulation: direction + distance + skill-based error
- [ ] Ball flight animation (isometric arc interpolation)
- [ ] Terrain interaction on landing (effects per type)
- [ ] Water hazard: splash animation + penalty
- [ ] Green/putting: proximity check, hole completion
- [ ] Max stroke limit (10 per hole)
- [ ] Hole-to-hole transition for 9-hole round
- [ ] Golfer spawner: schedule groups throughout day
- [ ] Depth sorting for golfer vs. terrain sprites

### M4: Economy & Day Cycle (Week 5-6)
- [ ] Zustand economy store (money, revenue, expenses)
- [ ] Terrain costs (can't paint without funds in builder)
- [ ] Revenue from green fees per completed round
- [ ] Reputation calculation (rolling average)
- [ ] Day/night cycle with Phaser timeScale
- [ ] DaySummaryScene: revenue, expenses, profit overlay
- [ ] Speed controls UI (1x, 2x, 5x)
- [ ] Starting money: $5000

### M5: Polish & Juice (Week 6-8)
- [ ] Scorecard UI (strokes per hole, par comparison)
- [ ] Finance bar overlay (money + stars)
- [ ] Golfer reaction animations (celebration, frustration, splash)
- [ ] Sound effects (club swing, ball splash, hole-in-one, crowd cheer)
- [ ] TitleScene: game intro + "New Course" button
- [ ] Scene transitions (Phaser camera fades)
- [ ] localStorage persistence (course + money + day count)
- [ ] Deploy to GitHub Pages

---

## Key Risk: Isometric Depth & Input

Isometric games have two notorious pitfalls:

1. **Depth sorting** — Sprites must be drawn back-to-front. In isometric, "back" = top-right. Phaser 3.60+ handles this for tilemaps, but we need to manually sort golfer/ball sprites by `(col + row)`. Getting this wrong = golfers floating behind trees they should be in front of. **Test early with multiple moving sprites.**

2. **Click detection** — Converting screen coordinates to isometric tile coordinates is non-trivial. IsoTransform needs to account for camera pan + zoom. **Test with zoom and pan from day 1.**

### Key Risk: Golfer AI Feel

The #1 thing that makes SimGolf fun is **watching golfers struggle**. If the AI is too perfect or too random, the game is boring.

**Tuning tips:**
- Skill distribution: bell curve centered around 0.5 (most golfers are mediocre)
- Bad swings slightly **biased toward obstacles** (more fun to watch)
- Ball-in-water → visible splash + golfer frustration animation
- 2-3 seconds between strokes so the player can follow action
- Brief "thought bubble" before each swing (adds personality)

**Test early with exaggerated bad swings** — tune down once it feels entertaining.

---

## Quick Start (Day 1)

```bash
# Setup
bun init -y simgolf-web
cd simgolf-web
bun add phaser zustand

# Start building M1
bun run dev
```

First milestone: get an isometric grid rendering with mouse-to-tile coordinate detection. The rest builds on that foundation.

---

*Updated 2026-04-14. Repo: github.com/cbonoz/simgolf-web*
*Framework: Phaser 3 + TypeScript + Bun + Zustand*
