# Mayhem Circuit

A clean-room browser arena game set inside a decaying brutalist industrial megastructure. The original SWF is used only as a read-only behavioral reference; no original art, audio, branding, or code is shipped by this project.

## Run locally

Requirements: Node.js 20 or newer.

```powershell
npm install
npm run dev
```

Open `http://localhost:5173`. The WebSocket game server listens on port `8787`.

For LAN play, other players open `http://<host-ip>:5173` and enter the six-digit room code. Windows Firewall may ask for permission for Node.js on private networks; allow private-network access for LAN play.

For one-player setup and feel checks, create a room and choose **Solo test**. The sandbox uses the selected map, lives, crates, and weapon set, respawns after falls without declaring a winner, offers a `Test respawn` control, and can return directly to the lobby. Normal multiplayer matches still require at least two players.

## Visual systems

- Four semi-realistic comic combat silhouettes with fixed cyan, coral, amber, and violet pilot accents.
- Three connected megastructure sectors with authoritative cargo lifts, blast crushers, conveyors, and forge pistons.
- Server-authoritative limb integrity. Arm damage increases cooldown and recoil; leg damage reduces movement and jump output. Respawning restores all limbs.
- Event-driven tracers, explosions, sparks, smoke, blood decals, and cosmetic detached parts.
- `Gore` and `Camera shake` are local visual preferences available from the `FX` control.

The procedural environment is the guaranteed fallback. The final generated background and portrait specification is documented in `docs/ART_DIRECTION.md`; no SWF resources may be placed in `public/assets/`.

## Controls

- `A` / `D`: move
- `W`: jump
- `S`: drop through one-way platforms
- `J`: primary attack
- `K`: secondary attack
- `1`-`6`: select a weapon
- Mouse wheel: cycle weapons
- `Tab` (hold): weapon panel — keycap, live ammo, and attack patterns for every weapon in the match

Every weapon defines separate primary and secondary attacks with independent cooldown, ammo cost, recoil, damage, and knockback.

## AI pilots

The room host can fill empty slots with server-authoritative bot pilots from the lobby (`AI pilots` count plus `Skill` tier: Casual / Standard / Brutal). Bots occupy real player slots, fight under the same limb, cooldown, crate, and hazard rules as humans, perceive only public match state through a tier-dependent reaction delay, and never disconnect. They work in both solo sandbox sessions (1 human + up to 3 bots) and normal matches (any human/bot mix totaling at least 2 pilots). If the host leaves, ownership migrates immediately to another human; bots never inherit the room.

## Verification

With the development server running:

```powershell
npm run build
npm run test:logic
npm run test:smoke
npm run test:browser
npm run test:visual
npm run test:performance
```

`test:logic` checks deterministic limb penalties, hit regions, lift and mover travel, hazard phases, navigation-graph connectivity, and map authoring rules. `test:smoke` verifies room creation, joining, settings, authoritative match start, dual attacks, limb damage events, disconnect slot retention, reconnect, the solo sandbox lifecycle, bot roster materialization, bot activity, host migration away from bots, and sandbox-with-bots. `test:browser` covers multiplayer and solo UI flows, three maps, J/K, the Tab weapon panel, visual preferences, screenshots, and refresh recovery. `test:visual` checks the menu, lobby, canvas, HUD, overflow, and nonblank rendering at four desktop viewports. `test:performance` drives four isolated clients through simultaneous J/K attacks and records frame timing plus a load screenshot.

## Architecture

- `src/`: Phaser client, menus, HUD, rendering, input prediction, and interpolation.
- `server/`: authoritative Node.js WebSocket room and match server.
- `shared/`: maps, weapons, physics constants, and shared protocol types.
- `tests/`: repeatable network and browser smoke tests.
- `docs/`: behavioral reference notes and tuning priorities.

The first release intentionally excludes accounts, matchmaking, teams, mobile controls, spectators, and public hosting. (AI bot pilots were added in the August 2026 round as host-controlled slot fillers; see "AI pilots" above.)
