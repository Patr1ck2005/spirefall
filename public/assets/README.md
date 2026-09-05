# Generated runtime art

Original Spirefall runtime art described in `docs/ART_DIRECTION.md`. All images here are original generations produced from the clean-room prompts in that document (Volcengine Ark / doubao-seedream-5.0-lite); nothing was extracted or traced from the reference SWF.

Contents:

- `environments/canopy.webp`, `fortress.webp`, `factory.webp`: 2048 x 1152 background plates (generated at 2560 x 1440, downsampled). Regenerated 2026-09 with open compositions — structure at the edges, calm centers.
- `portraits/breacher.webp`, `warden.webp`, `rigger.webp`, `hunter.webp`: 1024 x 1024 lobby portraits (generated at 1920 x 1920, downsampled).
- `materials/canopy.webp`, `fortress.webp`, `factory.webp`: 1024 x 1024 seamless textures, loaded by the client and baked as low-alpha overlays on platform bodies.

The procedural renderer remains the required fallback whenever a file is missing or fails to load. Regenerate any plate by re-running its prompt from `docs/ART_DIRECTION.md`; never place extracted or traced SWF resources here.
