# Spirefall

[![CI](https://github.com/Patr1ck2005/spirefall/actions/workflows/ci.yml/badge.svg)](https://github.com/Patr1ck2005/spirefall/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

<p align="center">
  <img src="docs/screenshots/match.jpg" alt="A live Fortress duel with tracers, kill feed, weapon HUD, and body integrity readout" width="840">
</p>

**Spirefall** is a clean-room browser arena shooter set inside a decaying brutalist megastructure. Four pilots battle across three sectors of one vertical spire — storm-lashed canopy, defense spine, and foundry floor — with server-authoritative physics, weapons, hazards, and dismemberment. Knock every rival off the structure; the last pilot standing holds the spire. The original SWF is used only as a read-only behavioral reference; no original art, audio, branding, or code is shipped by this project.

## Screenshots

| | |
|---|---|
| ![Main menu](docs/screenshots/menu.jpg) | ![Lobby](docs/screenshots/lobby.jpg) |
| **Main menu** | **Tournament lobby — roster, sector feed, match control, armory** |
| ![Canopy](docs/screenshots/canopy.jpg) | ![Fortress](docs/screenshots/fortress.jpg) |
| **Canopy — altitude 91, freight lifts above the storm line** | **Fortress — defense spine with blast crusher** |
| ![Factory](docs/screenshots/factory.jpg) | ![Four-player](docs/screenshots/four-player.jpg) |
| **Factory — foundry floor, conveyors and forge pistons** | **Four-player load test on the foundry floor** |

## Run locally

Requirements: Node.js 20 or newer.

**Windows one-click launcher** — double-click `Spirefall.bat`. On first run it installs dependencies, then it starts the game server and web client together and opens your browser at the game automatically. Keep the window open while playing; closing it stops both servers.

Manual setup:

```powershell
npm install
npm run dev
```

Open `http://localhost:5173`. The WebSocket game server listens on port `8787`.

**One-address play (no vite)** — after `npm run build`, the game server serves the compiled client itself: everything runs from `http://localhost:8787`, same origin, no second process. This is the mode LAN and tunnel play use.

For LAN play, other players open `http://<host-ip>:8787` (or `http://<host-ip>:5173` in dev mode) and enter the six-digit room code. Windows Firewall may ask for permission for Node.js on private networks; allow private-network access for LAN play.

**Playing over the internet** — for a friend outside your network, expose the one-address server with a free Cloudflare Tunnel (no account, no port forwarding, no fixed IP needed):

```powershell
winget install Cloudflare.cloudflared
npm run build
npm start
cloudflared tunnel --url http://localhost:8787
```

cloudflared prints a temporary public URL (like `https://random-words-1234.trycloudflare.com`); share it — your friend opens it and plays. Closing the command retires the URL. The game only runs while your terminal does, so this suits playing sessions rather than permanent hosting.

For one-player setup and feel checks, create a room and choose **Solo test**. The sandbox uses the selected map, lives, crates, and weapon set, respawns after falls without declaring a winner, offers a `Test respawn` control, and can return directly to the lobby. Normal multiplayer matches still require at least two pilots.

**Leaving a room** — `Leave spire` (lobby), `Exit match` (in-game HUD), and `Leave spire` (results screen) all exit immediately: the slot is released server-side with no reconnect hold, the local session is cleared, and the browser returns to the main menu.

## Game systems

- **Three sectors of one megastructure.** Canopy, Fortress, and Factory share a vertical industrial theme with ~20 platforms each: small ledges, staggered towers, solid walls, lethal floor gaps, one moving platform, and map-specific machinery.
- **Authoritative hazards.** Cargo lifts, blast crushers, conveyors, and forge pistons run entirely on server ticks — warning and lethal windows are fair and identical for every client.
- **Limb integrity instead of health bars.** Arm damage raises cooldown and recoil; leg damage cuts movement and jump output; hits are resolved per body region. Destroyed limbs are not invincible armor: shots into a stump carry over to a living limb, an explosive volley that grinds all four limbs to zero is a bleed-out kill, and a charged Voltrail rail (≥80%) executes anyone in its line. Respawning restores everything.
- **Matches always resolve.** A 4-minute time limit (most lives, then most intact limbs wins) backs up the last-pilot-standing rule, so camping and standoffs cannot drag a match out forever. In squad matches the same limit ranks squads by their total remaining lives (limb integrity breaks ties).
- **Squad matches (M30) on top of free-for-all.** The lobby's `Mode` selector (host-only) switches between classic FFA and 2-4 auto-balanced squads: joiners land on the thinnest squad, friendly fire is off (shots, blasts and blades pass through squadmates instead of being wasted on them), bots never target or dodge their allies, two squads spawn on opposite halves of the map and respawn there, and a match ends when every member of a squad is out — the results screen ranks squads, the banner names the winning squad, the kill feed and damage digits tint by squad color, and pilots wear a flat team-colored ring with edge-of-screen direction arrows (the camera only shows ~44% of the arena, so off-screen squadmates and enemies stamp a team-colored marker at the view edge). Holding `Tab` shows a squad scoreboard next to the weapon panel. Free-for-all is untouched: same rules, same spawns, no rings, no arrows.
- **A 1.5× arena under a following camera (M29).** The world is 1500×840 — a screen holds roughly 44% of it — so the camera eases after your pilot (snapping on respawn teleports) and the lighting rig keeps shadows locked to the world while it scrolls. All three maps were re-laid-out for the larger bounds with more storeys per sector.
- **Eight weapons, sixteen attacks — redesigned for sustained firepower.** The **Vein Ripper** SMG fires full-auto and dumps an overheat burst on `K`; the **Breach Scatter** shotgun pairs an 8-pellet blast with a short-range auto flame vent; the **Longbeam** rifle projects a continuous piercing light beam while `J` is held; the **Voltrail** is a hold-to-charge railgun whose damage, knockback, and beam width scale with charge (release at full charge for a screen-shaking shot); the **Forge Rocket** delivers rocket and cluster barrages; the **Cutter Blade** remains the melee answer; the **Echo Shard** ricochet gun banks resonant shards off platforms and cover — two-shard volleys on `J`, a heavy five-bounce slug on `K`; and the **Pyre Vent** (M27) sprays a rising cone of fuel that is lighter than air, so the arc licks up over cover — its fire doesn't chip barrels, it ignites them. All sixteen attacks are server-simulated, and held weapons slowly regenerate ammo so sustained fire stays viable.
- **Honest ballistics (M19) with swept capsule hits (M24).** Every attack has an enforced range — projectiles vanish at the cap (rockets air-burst), damage tapers to 60% across the last 40% of reach, and the Tab weapon panel shows a PRI/SEC range bar per weapon. Ricochets are no loophole: the Echo Shard's range cap covers its entire flight, bounces included. Lasers are the long-range identity: the Longbeam beam reaches 900 and a full-charge Voltrail rail reaches 1750, near the full width of the spire. Solid cover walls block bullets and beams — one armored pillar per sector, jumpable, and painted with hot accent edges so cover reads at a glance. Tracers and beams end exactly where the damage ends. Every attack — projectiles, hitscan rays, and melee swings alike — resolves against a full head-to-foot hit capsule swept along the round's actual flight path, so fast rounds cannot tunnel through a body and head- or knee-height shots land where they visually should. The server streams 30Hz snapshots and the client extrapolates pilot motion between them, so what you see is where combat actually is.
- **Randomized supply crates.** Platform-aligned sockets spawn weapon crates on randomized timers with highlight pulses and warning beams.
- **Explosive barrels (M25, fire propagation M27).** Four destructible drums per sector take damage from every attack — bullets, beams, blades, rocket splash, and the Pyre Vent's flame (which lights them instead of chipping them). A barrel cooks off for 46 damage in an 88px blast with rocket-style falloff, glows through leaking cracks as it takes damage, and — the M27 change — detonations spread FIRE to neighbouring drums on staggered fuses, so chain reactions read as an advancing fire line rather than a same-tick wave. Barrels respawn after 6-10s and never block movement or shots; kills through barrels attribute through the normal kill feed.
- **Event-driven effects.** Tracers, explosions, sparks, smoke, blood decals, and detached parts are driven by server combat events. Heavy shots add muzzle flashes, expanding shock rings, and scaled camera shake; charging pilots broadcast a visible charge ring so rivals can read the wind-up. Blood pools, bullet holes, and blast scorch marks anchor to the surface actually struck (never floating in mid-air), fade slowly through a match, and wipe clean between matches. Combat feedback closes the loop (M20): a kill feed attributes every elimination (`killer ▸ weapon ▸ victim`, with `THE SPIRE` for hazards and falls), a red arc around your pilot points back at whoever just hit you, floating damage numbers mark every hit (toggleable), and a low-health vignette pulses when your limbs are failing. Pilots squash and stretch through jumps and landings, kick up dust, breathe at idle, and every weapon carries its own animation signature — ejecting brass, a pump-action cycle, cooling barrel vents, charging rail coils, rocket backblast, spinning shard glints, and a full blade swing arc with dash afterimages. `Gore`, `Camera shake`, and `Damage numbers` are local visual preferences under the `FX` control.
- **Industrial-poster art with a real lighting engine (M26) and physically-grounded stylized shadows (M27).** The style is flat, confident color fields — every scene plate, platform and portrait is drawn procedurally in code (zero image assets). Depth comes from actual light: the plates carry Sobel-derived normal maps and render through Phaser's Light2D pipeline with a poster-graded shader, so every muzzle flash, explosion, barrel fire, searchlight and lightning strike pours per-pixel light onto the walls around it. Every light splits into three physically-honest components: the volumetric splash that shadows carve open, the camera-style bloom that rides above everything unoccluded, and the white-hot emitter core that is never darkened by its own shadow. Shadow strength IS light attenuation — walking toward a lamp deepens your cast shadow smoothly, leaving the radius dissolves it, no state, no popping — and every wedge dissolves through four flat bands plus a half-resolution composite pass that reads as a gaussian edge. All strong lights cast: muzzles (weight-scaled), explosions, barrel blasts, lightning (the strongest caster in the game), searchlight cones, hazard lamps and big projectiles. The governor eases continuously and the cinematic veil fades in on match start; fortress sits at canopy brightness with six lamps in the combat band. Pilots are lit by the room, not by a flashlight — and their only grounded shadow is the real one. An adaptive governor sheds shadows, then engine lights, then the whole pass when frames run long, and the system is toggleable under `FX` ("Dynamic lighting / 动态光影").
- **Procedural sound.** Every sound is synthesized in-browser with WebAudio — no audio assets. Each weapon's primary and secondary attack has a distinct signature, and hits, explosions, dismemberment, deaths, kills, respawns, hazards, crates, thunder, and UI flow all carry their own cues. World sounds attenuate and pan relative to your pilot, a low industrial ambience runs while a match is live, and the `FX` panel exposes a `Sound` toggle with a volume slider (persisted locally).
- **Immersive rendering.** Procedural industrial-poster scene plates with per-map palettes, emissive walkable cap strips, per-map atmosphere particles (canopy rain that splashes off platforms, fortress dust, factory embers and steam vents), and vector pilots with per-archetype silhouettes and light-responsive shading. The arena renders at 1.3× resolution and zooms to match — everything is drawn larger and sharper with zero change to physics or balance. There are no image assets to fail: the entire world is code.
- **Bilingual UI.** The interface defaults to Chinese and switches to English in one click from the header (`中/EN`); the choice persists locally. Weapon names stay English proper nouns in both locales.

## Controls

- `A` / `D`: move
- `W`: jump (triple jump)
- `S`: drop through one-way platforms
- `J`: primary attack
- `K`: secondary attack
- `1`-`8`: select a weapon
- Mouse wheel: cycle weapons
- `Tab` (hold): weapon panel — keycap, live ammo, and attack patterns for every weapon in the match; in squad matches a team scoreboard joins it

## AI pilots

The room host can fill empty slots with server-authoritative bot pilots from the lobby (`AI pilots` count plus `Skill` tier: Casual / Standard / Brutal). Bots occupy real player slots, fight under the same limb, cooldown, crate, and hazard rules as humans, and never disconnect. They navigate each map's platform graph — level-gap hops, shelf drop-throughs, ledgework — and manage their arsenal like players: a weapon manager scores every carried gun against the current engagement distance and ammo depth, so bots swap from blade to sidearm the moment a duel opens up, and cross the map for supply crates when genuinely dry. Fire control is disciplined: bots only pull the trigger inside the weapon's true range, with line of sight to the target (they never shoot into cover walls), and realign vertically to the target's shelf instead of spraying across the height gap. They remember who shot them last, dodge incoming projectiles at Standard/Brutal tiers (stepping toward whichever side actually has floor), sidestep crusher and piston warnings at Brutal, hop when wedged against an obstruction, and never walk off a ledge: a cliff guard vetoes any ordered step with no surface ahead, and a bot caught mid-air over a fall gap spends its spare jumps to reach the far side. An anti-stall watchdog commits them to a straight charge when a nav plan stalls. Brutal-tier pilots hold charged shots to full execution power. They work in both solo sandbox sessions (1 human + up to 3 bots) and normal matches (any human/bot mix totaling at least 2 pilots). If the host leaves, ownership migrates immediately to another human; bots never inherit the room.

## Verification

With the development server running:

```powershell
npm run build
npm run test:logic
npm run test:smoke
npm run test:ai
npm run test:browser
npm run test:visual
npm run test:performance
```

`test:logic` checks deterministic limb penalties (including the M27 spread penalty), hit regions, the swept-capsule hit geometry (tunneling regressions, capsule coverage, segment distance math), the movement budget (jump apex above the navigation rise limit), lift and mover travel, hazard phases, navigation-graph connectivity, map authoring rules, the M27 damage table with frozen cooldowns, the bot cliff-guard veto table, and the M30 squad rules (auto-balance, friendly-fire immunity, half-map squad spawns, squad standings). `test:smoke` verifies room creation, joining, settings, authoritative match start, weapon-slot switching (slots 7 and 8 plus over-range clamping), ranged hits, ricochet projectiles, solid-cover blocking, disconnect slot retention, reconnect, the solo sandbox lifecycle, bot roster materialization, bot activity, host migration away from bots, sandbox-with-bots, elimination freeze (no post-death simulation, no repeated death events, prompt match resolution), immediate `leave_room` slot release, and the M30 `set_teams` flow (squad persistence, invalid-count FFA fallback, teamId in snapshots). `test:ai` is the AI stability suite: bot free-for-alls must resolve on every map (backed by the 4-minute time limit), bots must engage an idle human, survive the layouts alone, never lock up mid-charge, and stay off fall gaps under sustained fire (a cliff-guard pressure test that plasters a ledge-born bot with ricochet fire for 30 seconds). `test:browser` covers multiplayer and solo UI flows, three maps, J/K, the Tab weapon panel with all eight weapons, the kill feed container, visual preferences, combat-feedback events (beam, pellet impacts, rocket explosions) with screenshots, refresh recovery, the default-Chinese locale guarantee (suites pin English via a test helper), and the lobby squad-mode selector (host-only editing, T1/T2 roster tags). `test:visual` checks the menu, lobby, canvas, HUD, overflow, and nonblank rendering at four desktop viewports. `test:performance` drives four isolated clients through simultaneous J/K attacks and records frame timing plus a load screenshot. `tests/tools/light-check.ts` captures idle/firing/blast frames per map and reports luma + dark-share so brightness grading stays measurable.

## Architecture

- `src/`: Phaser client, menus, HUD, rendering, input prediction, and interpolation.
- `server/`: authoritative Node.js WebSocket room and match server, including the bot pilot runtime.
- `shared/`: maps, weapons, physics constants, and shared protocol types — the single contract layer.
- `tests/`: repeatable network and browser smoke tests.
- `docs/`: behavioral reference notes, art direction with generation prompts, the weapon balance dossier, the release checklist, development progress, and screenshots.

The first release intentionally excludes accounts, matchmaking, mobile controls, spectators, and public hosting. (AI bot pilots were added in the August 2026 round as host-controlled slot fillers, see "AI pilots" above; squad matches landed in M30 as a lobby mode — what remains excluded is any form of persistent team or clan system.)

## For maintainers

- **Releases** — bump `version` in `package.json`, commit, then tag: `git tag -a vX.Y.Z -m "..."` and `git push origin vX.Y.Z`. GitHub Actions (`.github/workflows/ci.yml`) runs the full seven-suite verification on every push and PR; performance is report-only on CI runners (gate enforced locally).
- **Repository description / topics** (paste into GitHub → About):
  - Description: `Clean-room browser arena shooter — server-authoritative 60Hz combat, dismemberment, ricochet arsenal, hazards, and AI pilots across a decaying brutalist spire. Phaser 3 + TypeScript client, Node.js WebSocket server.`
  - Topics: `browser-game`, `phaser`, `typescript`, `websocket`, `multiplayer`, `arena-shooter`, `nodejs`, `clean-room`
  - Website link: leave unset (no public hosting by design).
- **Test runtime overrides** — `SPIREFALL_WS` / `SPIREFALL_WEB` / `SPIREFALL_BROWSER` re-point the browser suites at a different game server, web client, or Chromium-family executable (defaults keep local dev behavior: `127.0.0.1:8787` / `127.0.0.1:5173` / machine Edge → bundled Chromium).


<!-- project-hub:web-entry -->
统一网页入口、停止和重启方式见 [WEB_ENTRY.md](WEB_ENTRY.md)。以此处登记端口和新脚本为准。
