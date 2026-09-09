import type { MapId } from "../shared/game";

/**
 * M26 industrial-poster palettes — the single source of truth for scene
 * plates, platform art, lighting tints and UI accents. The style rules:
 *
 *  - every form gets 2-3 value steps (shade / base / lit), hard edges only;
 *  - no airbrush gradients, no noise, no painted texture — depth comes from
 *    real Light2D lighting, not baked rendering;
 *  - the walkable cap strip stays the loudest bright signal on every map
 *    (the M20 readability rule), everything else stays quieter.
 *
 * `ambient` feeds the Light2D pipeline (texel × (ambient + Σ lights)), so it
 * doubles as the per-map cinematic grade: canopy gets a cold storm wash,
 * fortress a graphite void, factory a warm foundry murk.
 */
export type PosterPalette = {
  /** Deep field of the backdrop. */
  sky: number;
  /** Upper sky band (poster two-tone split). */
  skyTop: number;
  /** Far silhouette structures. */
  far: number;
  /** Mid-distance structures. */
  mid: number;
  /** Near framing structures (edges, stacks). */
  near: number;
  /** Haze band color. */
  fog: number;
  /** Platform body base. */
  panelBase: number;
  /** Platform underside / dark faces. */
  panelShade: number;
  /** Platform top face (lit tone). */
  panelLit: number;
  /** Walkable cap strip (loud, M20 rule). */
  cap: number;
  /** Hot core line inside the cap. */
  capCore: number;
  /** Sector accent (nav cyan / beacon red / furnace orange). */
  accent: number;
  /** Warm emissive (furnace, warning lamps). */
  glowWarm: number;
  /** Light2D ambient color, 0..1 floats. */
  ambient: [number, number, number];
  /** Ambient veil tint for the additive-fallback lighting tier. */
  veilColor: number;
  veilAlpha: number;
  /** M27 stylized shadow pass: per-map tinted shadow fill + base opacity. */
  shadowColor: number;
  shadowAlpha: number;
};

export const POSTER: Record<MapId, PosterPalette> = {
  canopy: {
    sky: 0x1b2b3a,
    skyTop: 0x22374a,
    far: 0x24384a,
    mid: 0x2c4457,
    near: 0x16242f,
    fog: 0x2e4a5e,
    panelBase: 0x3d566b,
    panelShade: 0x28394a,
    panelLit: 0x557186,
    cap: 0x43d3e0,
    capCore: 0xd8f4fa,
    accent: 0x43d3e0,
    glowWarm: 0xe7c884,
    ambient: [0.36, 0.42, 0.5],
    veilColor: 0x14263c,
    veilAlpha: 0.36,
    shadowColor: 0x101c2a,
    shadowAlpha: 0.26,
  },
  fortress: {
    // M27 brightening pass: the graphite void was crushing the mid-band to
    // near-black. One value step up across sky/structure (the two-tone poster
    // split survives), ambient raised 0.2→0.31, veil 0.5→0.38, plus four new
    // static lamps in the combat band (sceneplate PLATE_ANCHORS).
    sky: 0x1b1e28,
    skyTop: 0x21252f,
    far: 0x232838,
    mid: 0x2c3142,
    near: 0x12151c,
    fog: 0x2b3046,
    panelBase: 0x363c4c,
    panelShade: 0x242936,
    panelLit: 0x4a5164,
    cap: 0xd8dee9,
    capCore: 0xffffff,
    accent: 0xe0455a,
    glowWarm: 0xff9a6a,
    ambient: [0.3, 0.31, 0.37],
    veilColor: 0x0a0d18,
    veilAlpha: 0.38,
    // Cold violet-tinted shadows — the fortress signature hue.
    shadowColor: 0x1a2036,
    shadowAlpha: 0.3,
  },
  factory: {
    sky: 0x1a1512,
    skyTop: 0x211a14,
    far: 0x261e16,
    mid: 0x322619,
    near: 0x130f0b,
    fog: 0x33402c,
    panelBase: 0x4a3f36,
    panelShade: 0x322a23,
    panelLit: 0x655748,
    cap: 0xf0d9a8,
    capCore: 0xfff3d8,
    accent: 0xe8632a,
    glowWarm: 0xff9a4a,
    ambient: [0.3, 0.24, 0.18],
    veilColor: 0x1d130a,
    veilAlpha: 0.46,
    // Warm soot-brown shadows near the furnace band.
    shadowColor: 0x2a1c10,
    shadowAlpha: 0.3,
  },
};
