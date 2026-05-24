# SimGolf Web

A browser-based isometric golf course management sim inspired by Sid Meier's SimGolf (2002). Build courses, watch AI golfers play (and struggle), earn revenue, and improve your resort.

## Play

[Play SimGolf Web](https://cbonoz.github.io/simgolf-web/) *(coming soon)*

## Gameplay

1. **Build** — Design a 9-hole course on an isometric grid. Paint fairways, rough, sand, water, trees, and greens. Place tees and cups.
2. **Open** — Invite AI golfers to play your course. Watch them slice drives into water, chunk chips into sand, and occasionally drain a putt.
3. **Earn** — Green fees and concessions generate revenue. Happy golfers boost your reputation (and your prices).
4. **Improve** — Spend earnings on better terrain, more holes, and course upgrades.

## Tech Stack

- **Phaser 3** — Isometric tilemap rendering, sprites, camera, input
- **TypeScript** — Strict types to keep the sim honest
- **Bun** — Package manager and fast runtime
- **Vite** — Dev server and bundler
- **Zustand** — Lightweight state for economy, reputation, AI

## Setup

```bash
bun install
bun run dev
```

Open `http://localhost:5173` and start building.

## Project Structure

```
src/
├── main.ts              # Phaser game config + boot
├── scenes/              # Phaser scenes (Builder, Play, DaySummary, Title)
├── state/               # Zustand stores (course, economy, golfers)
├── systems/             # IsoTransform, StrokeSim, TerrainEffects, DayCycle
├── entities/            # Golfer, Ball, TileCursor
├── ui/                  # HTML overlays (toolbar, scorecard, finance bar)
└── utils/               # Constants, helpers
```

## Roadmap

- [ ] M1: Isometric grid & rendering
- [ ] M2: Course builder (paint, holes, validation)
- [ ] M3: AI golfer simulation
- [ ] M4: Economy & day cycle
- [ ] M5: Polish & juice

See [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) for full details.

## Art & Assets

All in-game sprites are currently generated procedurally at runtime (see `BootScene.ts`). To upgrade to external art, assets can be sourced from free/open collections. Integrate them by loading PNGs in `preload()` and referencing the keys in scene code.

### Recommended Free Asset Sources

- **[OpenGameArt.org](https://opengameart.org)** — Community-contributed sprites, tilesets, and textures under CC0/CC-BY licenses
- **[Kenney.nl](https://kenney.nl/assets)** — High-quality free game asset packs (CC0)
- **[itch.io](https://itch.io/game-assets/free)** — Free and paid asset packs from indie creators

### Searching Tips

When looking for sprites, use search terms like:
- `isometric tree`, `isometric bush`, `isometric terrain`
- `golf course`, `isometric grass`, `isometric sand`
- Filter by license: prioritize **CC0** (no attribution) or **CC-BY** (attribution required)

## License

MIT
