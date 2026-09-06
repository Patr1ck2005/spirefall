# Spirefall art direction

## Clean-room boundary

All runtime art is original. The reference SWF is used only to compare high-level play feel. Do not extract, trace, imitate, or redistribute its sprites, fonts, sound, logos, or branding.

## Visual language

- World: one vertical brutalist industrial megastructure, shown at three altitudes.
- Tone: severe decay, dense machinery, smoke, weather, oil, rust, concrete, and controlled pools of utility light.
- Combat readability: quiet activity band, bright platform caps, strong player outlines, and fixed cyan/coral/amber/violet pilot accents.
- Characters: semi-realistic comic mercenaries with a shared rig and four silhouettes: Breacher, Warden, Rigger, Hunter.
- Violence: stylized dismemberment and persistent blood decals. Gore can be disabled without changing authoritative limb state.

## Runtime assets

Final generated files belong under `public/assets/`:

- `environments/canopy.webp`, `fortress.webp`, `factory.webp`: 2048 x 1152 opaque background plates.
- `portraits/breacher.webp`, `warden.webp`, `rigger.webp`, `hunter.webp`: 1024 x 1024 opaque character portraits.
- `materials/canopy.webp`, `fortress.webp`, `factory.webp`: 1024 x 1024 seamless material references.

The current build renders a complete procedural fallback, so missing raster assets never create a blank canvas. Generated plates must sit behind gameplay geometry and must not contain apparent walkable ledges in the central combat band.

## Image generation prompts

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
