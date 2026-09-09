# Spirefall art direction

## Clean-room boundary

All runtime art is original. The reference SWF is used only to compare high-level play feel. Do not extract, trace, imitate, or redistribute its sprites, fonts, sound, logos, or branding.

## Visual language (M26 industrial poster)

- **Style: industrial poster.** Flat, confident color fields with hard edges — 2-3 value steps per form (shade / base / lit), bold silhouettes, no airbrush gradients, no painted texture. The design thesis: the sets are cardboard, the lights are real. Depth comes from actual per-pixel lighting, never from baked realism.
- **Depth from light, not rendering.** Scene plates and platforms carry height-derived normal maps and render through the poster-graded Light2D pipeline (`src/posterlight.ts`, half-lambert wrap so flat fields still catch broad light). Every event light — muzzle, explosion, barrel fire, searchlight, lightning — visibly splashes the walls around it.
- **One palette per sector, one source of truth.** `src/palette.ts` defines the sky / far / mid / near silhouette tones, platform value steps, the walkable cap color and the Light2D ambient grade per map. UI accents read from the same family.
- **Combat readability (hard rules).** The walkable cap strip is the loudest bright value in the world and lives on a non-lit emissive plate so lighting can never dim it (M20 rule). The central combat band stays a calm field with structure pushed to the frame edges and top (M15 rule). Cover walls keep full-opacity accent edges plus corner brackets on any backdrop.
- **Characters: vector v3, lit by the room.** Pilots are flat-vector rigs with per-archetype silhouettes. They carry no personal lights (M25b); instead the strongest nearby light is sampled each frame and warms their armor palette and paints a rim stroke on the lit side of the helmet — light responds onto the character without following them.
- **Violence: stylized dismemberment and persistent blood decals.** Gore can be disabled without changing authoritative limb state.

## Runtime assets

**There are none.** Since M26 the project ships zero image assets:

- Scene plates (albedo + height + Sobel normal map) and the platform world plate are drawn in code at load (`src/sceneplate.ts`) and registered as canvas textures.
- Walkable cap strips and cover-wall accent marks are baked into a separate emissive plate that never darkens.
- Lobby portraits are flat-vector canvas busts cached as data URLs (`src/portrait.ts`).
- All glow / cone / shadow textures are canvas-generated at boot (`src/lighting.ts`).

The AI-generated webp plates, portraits and material overlays that preceded M26 were retired (deleted from `public/assets/`) when the project pivoted from the semi-realistic "American comic" look to the industrial-poster style. Their generation-prompt archive below is kept as history only — do not resurrect it without a style-direction decision.

## Image generation prompts (RETIRED 2026-09, M26)

Everything below this line documents the retired AI-image pipeline. It no longer runs at load and the assets are gone. Preserved verbatim for provenance.

Generation pipeline (2026-08-23, environment plates regenerated 2026-09 with open compositions): Volcengine Ark `doubao-seedream-5.0-lite` via the local `~/.claude/scripts/genimg.sh` helper, opaque output, then converted to WebP at spec size with Pillow (environments generated 2560 x 1440 -> downsampled to 2048 x 1152; portraits and materials 1920 x 1920 -> 1024 x 1024). The earlier `gpt-image-2` plan was superseded when the local key proved invalid against the official API. Portrait equipment-light colors follow the fixed pilot accents (Breacher cyan, Warden coral, Rigger amber, Hunter violet). Generate each asset as a distinct job. No prompt may use the original game or Armor Games as a style reference.

### Canopy environment

```text
Use case: stylized-concept
Asset type: 2D arena game environment background plate
Primary request: the upper maintenance crown of an immense abandoned brutalist industrial megastructure high above a violent storm layer
Scene/backdrop: colossal concrete pylons very far in the distance, thin antenna silhouettes, suspended lift cables fading into fog, a vast softly glowing storm cloud ocean along the bottom
Style/medium: semi-realistic comic concept art with crisp industrial shapes and restrained painterly texture
Composition/framing: orthographic-like wide side view, 16:9; extremely open composition with a large calm dark blue-grey gradient filling the center, all structural detail dim, distant and pushed to the left and right edges only
Lighting/mood: cold storm daylight, sparse cyan navigation lights, tiny sodium amber accents, oppressive and weathered
Materials/textures: wet concrete, oxidized steel, distant fog
Constraints: original design; no people; no text; no logos; no watermark; no platforms; no foreground structures; no railings crossing the frame; keep the middle of the frame almost empty
Regenerated 2026-08-23 (M15): the first generation painted dense pylons that read as clutter behind the play area; this prompt pushes structure to the edges and keeps the center calm.
```

### Fortress environment

```text
Use case: stylized-concept
Asset type: 2D arena game environment background plate
Primary request: the armored defense spine inside an immense abandoned brutalist industrial megastructure
Scene/backdrop: one symmetric recessed gate corridor receding into deep darkness at the center, flanked by dim monolithic bastion walls washed by narrow searchlight cones
Style/medium: semi-realistic comic concept art with crisp industrial shapes and restrained painterly texture
Composition/framing: orthographic-like wide side view, 16:9; extremely dark low-contrast backdrop with structural detail only near the far left and right edges, the central band a calm near-black void
Lighting/mood: graphite darkness, red emergency beacons, white searchlight shafts, old dust
Materials/textures: scarred concrete, blackened armor plate, worn warning paint, soot
Constraints: original design; no people; no text; no logos; no watermark; no platforms; no foreground structures; no railings crossing the frame; keep the middle of the frame almost empty
Regenerated 2026-08-23 (M15): symmetry plus a dark center keeps the duel lane readable.
```

### Factory environment

```text
Use case: stylized-concept
Asset type: 2D arena game environment background plate
Primary request: the foundry and assembly gut deep inside an immense abandoned brutalist industrial megastructure
Scene/backdrop: a colossal furnace mouth glowing molten orange along the bottom edge, molten ducts and pressure pipes receding into green-black haze in the far distance
Style/medium: semi-realistic comic concept art with crisp industrial shapes and restrained painterly texture
Composition/framing: orthographic-like wide side view, 16:9; extremely open composition, the central band a calm dark void with only faint distant machine silhouettes near the top
Lighting/mood: furnace orange glow from below, petroleum green haze, black iron shadows, dirty heat shimmer
Materials/textures: burned steel, ceramic furnace brick, corrosion, smoke
Constraints: original design; no people; no text; no logos; no watermark; no platforms; no foreground structures; no railings crossing the frame; keep the middle of the frame almost empty
Regenerated 2026-08-23 (M15): furnace band anchors the bottom while the play space stays a calm void.
```

### Character portrait template

Generate Breacher first as the style anchor, then use it as a reference for Warden, Rigger, and Hunter while preserving medium, lighting, crop, and world materials.

```text
Use case: stylized-concept
Asset type: square multiplayer lobby character portrait
Primary request: <BREACHER | WARDEN | RIGGER | HUNTER>, an adult industrial combat mercenary from a decaying brutalist megastructure
Subject: chest-up, helmeted, semi-realistic proportions; <heavy shoulders and reinforced visor | high collar and long protective coat | asymmetric tool harness and patched engineering armor | narrow helmet and light climbing armor>
Style/medium: semi-realistic comic character render, hard graphic silhouette, realistic worn materials
Composition/framing: square chest-up portrait, centered, clear silhouette, camera at eye level
Lighting/mood: cold rim light with one restrained player-color equipment light; dark textured industrial wall behind the figure
Materials/textures: scratched steel, canvas, rubber seals, worn composite armor, grime
Constraints: original character; no text; no logos; no trademarks; no watermark; no exposed gore
```

### Material template

```text
Use case: stylized-concept
Asset type: seamless tileable game surface texture
Primary request: <wet oxidized crown decking | scarred armored concrete | burned foundry steel>
Style/medium: semi-realistic comic industrial texture with readable broad shapes
Composition/framing: flat orthographic material sample, seamless on all edges, no focal object
Lighting/mood: neutral reference lighting
Constraints: seamless; no text; no logos; no symbols; no watermark
```

### Far-parallax layers (retired 2026-09)

Far-parallax plates (`<map>-far.webp`) were generated on 2026-08-23 but retired in M18: the opaque near plate (106% scale) fully occluded them at runtime, they were never regenerated in the open-composition style, and dropping them removed ~364 KB of dead assets plus per-frame position nudges. The renderer now uses a single background plate per map plus the baked platform layer. If parallax depth is ever reintroduced, regenerate the far layers to the open-composition rules first and make the near plate semi-transparent or sub-100% scale so the layering is actually visible.

## UI and effect limits

- Camera shake: at most 12 px for 250 ms.
- Live particles: at most 200.
- Blood decals: at most 48.
- Detached visual parts: at most 16, recycled after 5 seconds.
- The Gore and Camera shake preferences are local-only and default to enabled.

## M20 visual audit (2026-09)

Screenshot review across all three sectors after M19, with fixes:

- **Cover wall silhouette on bright backdrops** — Canopy's cloud band washed
  out the thin accent stroke, so solid cover now draws its accent at full
  opacity plus four corner brackets (top/bottom, both sides). The wall keeps
  its "blocks shots" silhouette against any background.
- **Echo Shard readability** — the light-blue shard is tinted against Canopy's
  sky, so the flying shard gained a dark under-stroke beneath its white edge
  line; the silhouette now reads on every sector.
- **Fortress searchlight beams** — reviewed; they read as environment light
  (fixed lamp emitters, angled cones), not tracers. Kept as-is.
- **Blood fade curve** — the 8-second ×0.85 decay reviewed in live play;
  pools persist through a duel but a match ends with a clean arena. Kept.
- **Kill feed / vignette** — new HUD layers styled to the existing panel
  language (dark slab, 2px accent edge); the vignette is a soft inset glow,
  not a flat overlay.
- `docs/screenshots/` regenerated from the current build via
  `npx tsx tests/tools/refresh-screenshots.ts` (solo sectors, Fortress duel
  hero shot, four-player load frame).

## M24 scale, micro-animation and localization pass (2026-09)

Playtest-driven pass, all client-side unless noted:

- **Render scale** - the game canvas now renders at 1.3x the world resolution
  with a matching camera zoom (RENDER_SCALE in src/main.ts). The visible arena
  is unchanged at 1000x560 world units; every sprite, gun and platform draws
  ~30% larger and crisper. Physics and balance untouched. Weapons draw at an
  additional 1.35x (WEAPON_VISUAL_SCALE) so silhouettes read at a glance, and
  muzzle flashes anchor to the real barrel tips via MUZZLE_OFFSET.
- **Micro-animation** - canvas-space squash and stretch around the foot anchor
  (landings compress, rises stretch), landing dust puffs, idle breathing,
  run-cycle arm swing. All drawn from snapshot state; no new textures.
- **Weapon signatures** - sidearm ejects brass; the scatter pump slides after
  each shot; rifle barrel vents glow while hot and cool over 0.7s; Voltrail
  rail coils brighten with charge; rockets vent backblast smoke; Echo Shard
  gained its own crystal-caster silhouette (it previously shared the default
  gun shape) plus in-flight glints; the Cutter Blade swings through a real
  arc with a slash streak, and dash slashes trail fading afterimages.
- **Damage digits** - server hit events now carry an "amount" field; the
  client pools up to 24 floating numbers (white / amber / red by size),
  toggleable under FX.
- **Bilingual UI** - the interface defaults to Chinese with a header ZH/EN
  toggle (src/i18n.ts); all panels, HUD strings, map copy and kill-feed words
  are localized. Weapon names remain English proper nouns.
- docs/screenshots/ regenerated at the new scale.

## M25 cinematic light, pilot v2, destructible barrels (2026-09)

Playtest-driven pass, all original and procedural:

- **Lighting language** - strong-contrast cinematic grade per the playtest
  call. A per-map tinted veil (canopy cold storm blue 0.36, fortress graphite
  0.5, factory warm smoke 0.46) darkens the world; pooled additive lights
  punch back: every muzzle flash, rocket, flame and shard, beams, explosions,
  hit sparks, death pillars, crate pulses, and hazard warning lamps. Pilots
  carry no personal lights (M25b: the headlamp cone read as a flashlight
  strapped to the character and was removed on playtest rejection) — the
  environment lights them. Fortress sweeps two white searchlight cones that
  cast real occlusion shadows; the foundry furnace breathes from below; the
  canopy storms with 2-3 strobe lightning strikes and rolling thunder every
  6-13s. Platform caps keep a faint relight strip so the "walkable here"
  signal survives the darkness (M20 rule).
- **Pilots v2** - layered-plating bodies (dark outline, armor base, chest
  inset, bevel highlight, service stripe, belt), per-archetype gear (Breacher
  pauldrons + hazard chevron, Warden high collar + twin cloth coat tails,
  Rigger back tool pack + harness, Hunter knife sheath), domed helmets with
  emissive pilot-color visors that pulse softly, plated limbs with knee/elbow
  joints and filled boots. The rig also fixes the old +14px body offset that
  drew boots sunk inside the platform caps.
- **Explosive barrels** - rust-red drums with hazard banding on four sockets
  per map. Any damage cooks them: glowing cracks leak fire below 60% hp
  (the barrel becomes its own light), detonation deals 32 damage in a 70px
  radius with rocket-style falloff, chains into neighbours at half damage and
  respawns after 6-10s. They never block movement or sight lines.
- **Performance budget** - the whole pass is pooled textured quads (no
  per-frame RenderTexture work); an adaptive governor sheds shadow casting,
  then decorative lights, then the entire pass when the frame-time EMA
  exceeds 26ms, and restores them below 15.5ms. The FX panel toggles the
  full system ("Dynamic lighting / 动态光影").

## M26 industrial poster reset + engine lighting (2026-09)

Playtest verdict that drove this milestone: the semi-realistic "American
comic" direction was unrefined, and the M25 lighting read as pasted glow
blobs. User decisions: characters stay procedural vector with light
response; scene art drops the AI-painted plates for a flat graphic style.

- **Style pivot** - the whole game commits to the industrial-poster
  language: procedural color-field plates per map (structure at frame
  edges, calm combat band), 2-3 value steps per form, palette single
  source in `src/palette.ts` (also feeds the shell UI). The ten AI webps
  (3 environments, 4 portraits, 3 materials) and the `backgroundAsset`
  contract field were deleted — the project now ships zero image assets.
- **Real engine lighting** - scene plates and the static world plate are
  drawn with paired height fields; a Sobel pass derives normal maps at
  load. They render through `PosterLightPipeline` (Phaser Light2D
  subclass, half-lambert wrap) with per-map ambient grades. PointLights
  (pool of 16 = `maxLights`) carry the static rig anchors baked into the
  plate art, plus explosions, rocket/flame rounds, burning barrels,
  muzzle flashes of heavy weapons and lightning strokes — light splashes
  the walls per-pixel.
- **Character light response** - `sampleLight(x,y)` picks the strongest
  light near an entity; drawPlayer warms its armor palette toward it and
  strokes a rim on the key-light side of the helmet; barrels and crates
  tint toward it. No light fixture follows any entity (M25b rule).
- **Fallback ladder** - governor order is now shadows → PointLights →
  decorative tiers → off; dropping the engine lights restores the
  verified M25b additive look (veil + glow pool + shadows), so the perf
  gate survives even where Light2D is too heavy (software rasterizers).
- **Lobby** - procedural flat-vector portraits (data URLs) replace the
  AI webps; shell palette aligned to the poster palettes.

## M27 stylized shadow language + fire + wound model (2026-09)

Playtest verdict on M26: fortress was too dark, and shadows started/stopped
abruptly (binary governor tiers, hard wedge tips, no decay on transient
lights). User direction: gradient falloff everywhere, every strong light
casts, a flamethrower joins the armory, and the environment becomes more
interactive.

- **Gradient shadow vocabulary** - a shadow has NO life of its own: its
  strength is exactly the light hitting the occluder, run through the same
  smooth attenuation curve the light follows (plus an angular falloff inside
  cone beams). Walking toward a lamp deepens the shadow smoothly; leaving
  the radius dissolves it — there is no fade-in/fade-out machinery to pop.
  Each caster fills a penumbra wedge (light pushed 12px back off the edge,
  α×0.42) plus four nested umbra bands (α 1.0/0.5/0.22/0.09 out to 1.9× the
  light radius), and the whole wedge pass composites through a
  half-resolution RenderTexture that is upscaled 2× with linear filtering —
  a cheap low-pass that reads as a gaussian edge. Per-map shadow tints
  (fortress cold violet, factory soot brown, canopy storm blue) keep the
  cast shadow inside each map's grade.
- **Three-component light physics (M27b)** - every light splits into volume
  (the light pouring through the scene — lives BELOW the shadow wedges and
  is carved by them), bloom (the camera glow — rides ABOVE the shadows,
  never occluded) and core (the emitter bead — above everything, never
  darkened by its own cast). Transients die on a smoothstep envelope so
  light and shadow share one decay curve; the governor levels ease
  exponentially. No tier transition pops, and a flash's halo is never
  swallowed by the shadow it throws.
- **Everything strong casts** - every muzzle flash (strength 0.3-0.9 by
  weapon weight), explosions (1.4), barrel blasts (1.3), hit blooms (0.35),
  deaths (0.9), lightning (1.6 — the strongest caster in the game),
  searchlight cones, hazard lamps, large static lamps (r≥90) and big
  projectiles (rocket, flame, shard) all throw shadows scaled by the light
  actually arriving at each occluder. A `shadowOnly` job keeps the wedges
  alive after a flash's glow dies. Cap: 6 concurrent casters (cones outrank
  points by strength). Pilots no longer carry a painted contact shadow —
  the real cast shadow is the only grounded shadow they get.
- **Fortress brightening** - ambient 0.2→0.31, veil 0.5→0.38, one value
  step up across sky/structure, and the anchor rig grows from 2 beacons
  to 6 lamps (two gate-corridor pendants, two bastion sconces — all
  drawn into the plate art: visible lamp = lit lamp). Searchlight cones
  widened to 360px and brightened. The light-check tool measures luma:
  fortress now sits at canopy level instead of near-black.
- **Pyre Vent (slot 8)** - a cone-spray flamethrower: 0.045s fuel puffs
  (range 230) that are LIGHTER THAN AIR (−190 buoyancy vs the standard
  720 sag — the arc licks up over cover), secondary = an 8-puff wide
  burst. Flame does not chip barrels — it IGNITES them (0.8s fuse, the
  burning drum is its own flickering light + shadow caster), and barrel
  detonations now spread FIRE to neighbours (0.45-0.8s fuses) instead of
  half-damaging them: chain reactions read as an advancing fire line.
- **Wound model v2** - arm damage now widens the cone too (spread
  ×(1+0.3·sev), server-authoritative, bots included) alongside deeper
  cooldown/recoil penalties; leg damage drags movement to a ×0.4 crawl
  and halves the jump, with the client shortening the run stride to
  match. Full damage table raised ~10-25% (barrels to 46/88/330, still
  inside the rocket's envelope); cooldowns and machine cycles untouched.
- **Hero weapon visuals** - Voltrail charges a converging muzzle focus
  ring (white-hot core at full charge), Forge Rocket flies a jagged
  comet tongue, Echo Shard grows a crystal crown with every bounce.
  The rail — the strongest gun — gets the strongest light in the game
  (M27c): the biggest muzzle flash, twin tracer strokes around a white
  lightning core, a charging pilot whose glow deepens before the shot,
  and the heaviest projectile shadow. Its lance is also a STRICT LINE
  LIGHT that CASTS — dense, uniform glow points along the true shot
  geometry light the whole corridor end-to-end, and the line projects
  real shadow wedges from several sample origins along the beam, so
  anything under or behind the lance is shaded by the extended source
  itself (the held Longbeam lance works the same way; brightness tracks
  the lance's damage class). Blade swings pop a cold flashbulb at the
  pilot's feet — the dash slash at lightning brightness. Pilots wear
  emissive gear — a constant visor glow on every mech, a breathing
  chest reactor porthole, and a status LED on every gun — material
  language only; nothing enters the lighting rig (M25b holds).
