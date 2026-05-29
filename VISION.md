# SimGolf Web — Game Vision

We're building the spiritual successor to Sid Meier's SimGolf (2002). A cozy, charming golf course management sim where you design courses and watch AI golfers play them. The core appeal is twofold: expressive course design + emergent comedy from watching golfers struggle.

## Genre Vibe

Cozy tycoon + sandbox builder. Think SimGolf meets Mini Metro meets Prison Architect. Not a sim/management spreadsheet — the game should *feel* alive and be fun to watch.

## What We Have (MVP shell)

- Isometric 40×30 grid with 6 terrain types, procedural textures
- Paint/terrain builder with undo/redo, hole placement (tee + cup)
- Buildings: 6 types with revenue ticks, tooltips, decor bonuses
- AI golfers with stroke sim, terrain effects, putting, hole-to-hole, scoring
- Economy: green fees, reputation, loans, day/night cycle, day summary
- Challenge mode: play 1:1 against an AI opponent
- Camera pan + zoom, scene transitions, basic sound effects
- Deployed at www.chrisbuonocore.com/simgolf-web

## Where We're Going

### Near-term (make it feel like a real game — next 5-10 tasks)

**Game feel & polish**
- Better golfer sprites (not just colored circles — give them little bodies, hats, animations)
- Smoother ball flight with clearer arc trails
- Camera auto-follow on active golfer (optional toggle)
- Sound effects: proper swing whoosh, ball thwack, cup rattle, bird chirps
- Title screen that looks like a game (animated background, gradient, logo)

**Visual identity**
- Cohesive color palette — warm greens, golden hour vibe
- Tile textures that don't look like placeholder programmer art
- Water with subtle animation (not just blue tile)
- Trees that look like trees (cluster sprites, shadows)

**Gameplay depth**
- Golfer variety: different body shapes, colors, accessories — they should feel like characters
- More interesting stroke outcomes (bounces off trees, roll on fairway, plugged in sand)
- Stats overlay after each round (not just day summary — individual golfer stats)

### Medium-term (mechanics that make it compelling)

**Builder depth**
- Terrain height editing (raised greens, lowered bunkers)
- Decoration placement (flowers, rocks, signs, benches) that aren't buildings
- Paths/walkways between buildings
- Water features (ponds, streams with bridges)

**Economy & progression**
- Unlockable terrain types and buildings as reputation grows
- Course rating system (fun rating, beauty, difficulty) that drives green fees
- Staff you can hire (groundskeeper, cart girl, pro)
- Loan system with consequences (interest, collections)

**Golfer AI**
- Skill tiers with visible behavior differences
- Golfers that react to course conditions (complain about unfair holes)
- A "favorite golfer" you root for that plays multiple days
- Golfer names + generated backstories (procedural flavor text)

### Long-term (the dream)

- Multiple course slots (not just one save)
- Tournaments and events
- Course sharing via URL export/import
- Replay system for highlight shots
- Actually good-looking isometric art style (not just procedural shapes)

## Guardrails

- **Cozy not hardcore.** No stressful time pressure. No angry customers. Golfers get mildly frustrated, not furious.
- **Desktop-first.** Not mobile. Corner tick info, precise cursor, keyboard shortcuts.
- **Web-deployed.** No native install. Runs in browser, saves to localStorage.
- **No real money.** No ads, no premium currency. Just a fun free game.
- **Single-player only.** The appeal is watching your course come alive, not competing with randoms.

## Tone

Warm, playful, slightly silly. The game is in on the joke that watching pixel golfers hit balls into ponds is funny. Flavor text should be charming, not corporate. Colors warm, sounds soft, failure entertaining.
