# Mayhem Circuit art direction

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

Generation pipeline (2026-08-23): Volcengine Ark `doubao-seedream-5.0-lite` via the local `~/.claude/scripts/genimg.sh` helper, opaque output, then converted to WebP at spec size with Pillow (environments generated 2560 x 1440 -> downsampled to 2048 x 1152; portraits and materials 1920 x 1920 -> 1024 x 1024). The earlier `gpt-image-2` plan was superseded when the local key proved invalid against the official API. Portrait equipment-light colors follow the fixed pilot accents (Breacher cyan, Warden coral, Rigger amber, Hunter violet). Generate each asset as a distinct job. No prompt may use the original game or Armor Games as a style reference.

### Canopy environment

```text
Use case: stylized-concept
Asset type: 2D arena game environment background plate
Primary request: the upper maintenance crown of an immense abandoned brutalist industrial megastructure above a violent storm layer
Scene/backdrop: colossal concrete load-bearing pylons, suspended freight lift cables, antenna forests, distant maintenance trains, cloud ocean and severe altitude
Style/medium: semi-realistic comic concept art with crisp industrial shapes and restrained painterly texture
Composition/framing: orthographic-like wide side view, 16:9; deep scale; keep the central gameplay band visually quiet and free of horizontal structures that could look walkable
Lighting/mood: cold storm daylight, cyan navigation lights, small sodium amber accents, oppressive and weathered
Materials/textures: wet concrete, oxidized steel, cable bundles, chipped paint, distant fog
Constraints: original design; no people; no text; no logos; no trademarks; no watermark; no foreground platforms
```

### Fortress environment

```text
Use case: stylized-concept
Asset type: 2D arena game environment background plate
Primary request: the armored defense spine inside an immense abandoned brutalist industrial megastructure
Scene/backdrop: monolithic concrete bastions, recessed blast shutters, deep service voids, searchlights, armored conduits and distant defensive machinery
Style/medium: semi-realistic comic concept art with crisp industrial shapes and restrained painterly texture
Composition/framing: orthographic-like wide side view, 16:9; symmetrical oppressive depth; keep the central gameplay band dark, quiet and free of false platforms
Lighting/mood: graphite darkness, emergency red beacons, narrow white searchlights, old dust and smoke
Materials/textures: scarred concrete, blackened armor plate, worn warning paint, soot
Constraints: original design; no people; no text; no logos; no trademarks; no watermark; no foreground platforms
```

### Factory environment

```text
Use case: stylized-concept
Asset type: 2D arena game environment background plate
Primary request: the foundry and assembly gut deep inside an immense abandoned brutalist industrial megastructure
Scene/backdrop: furnace mouths, endless conveyor lines, huge pistons, molten ducts, pressure pipes and distant mechanical silhouettes
Style/medium: semi-realistic comic concept art with crisp industrial shapes and restrained painterly texture
Composition/framing: orthographic-like wide side view, 16:9; strong vertical depth; keep the central gameplay band low contrast and free of false walkable ledges
Lighting/mood: furnace orange from below, petroleum green haze, black iron shadows, dirty heat shimmer
Materials/textures: burned steel, oily machinery, ceramic furnace brick, corrosion and smoke
Constraints: original design; no people; no text; no logos; no trademarks; no watermark; no foreground platforms
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

### Far-parallax layer template

Generated 2026-08-23 (Volcengine Seedream 5.0 lite, 2560x1440 -> 2048x1152 webp q88) into `public/assets/environments/<map>-far.webp`. Render order: far plate (depth -3) -> environment plate (-2) -> baked platform layer (-1).

```text
Use case: stylized-concept
Asset type: 2D arena game far-parallax background layer
Primary request: <the most distant silhouette of the megastructure above a violent storm layer, seen from the upper maintenance crown | the deepest interior void of the defense spine receding into darkness | the far reaches of the foundry dissolving into smoke and furnace glow>
Scene/backdrop: layered atmospheric depth fading toward the horizon; faint structural silhouettes only
Style/medium: semi-realistic comic concept art, heavily atmospheric
Composition/framing: orthographic-like wide side view, 16:9; darkest background layer behind everything else; keep the entire central gameplay band low contrast and free of walkable-looking horizontal structures
Lighting/mood: <cold storm haze, muted cyan-grey | graphite darkness with sparse deep-red pinpoints | dim petroleum green haze over faint orange glow from below>
Constraints: original design; no people; no text; no logos; no trademarks; no watermark; no foreground platforms
```

## UI and effect limits

- Camera shake: at most 12 px for 250 ms.
- Live particles: at most 200.
- Blood decals: at most 48.
- Detached visual parts: at most 16, recycled after 5 seconds.
- The Gore and Camera shake preferences are local-only and default to enabled.
