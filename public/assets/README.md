# Runtime art

**Since M26 there are no image assets.** All runtime art is procedural:

- Scene plates, platforms and the walkable cap strips are drawn in code at
  load time (`src/sceneplate.ts`) with Sobel-derived normal maps for the
  Light2D pipeline.
- Lobby portraits are flat-vector canvas busts generated on the fly
  (`src/portrait.ts`, cached data URLs).
- Every glow, cone and shadow texture is canvas-generated at boot
  (`src/lighting.ts`).

Do not add raster art here. The AI-generated plates/portraits that used to
live in this folder were retired in M26 when the project committed to the
industrial-poster style (see `docs/ART_DIRECTION.md`).
