// M27 industrial-poster lighting. Two light systems cooperate:
//
// 1. Phaser Light2D (the engine's real per-pixel lighting pipeline): the
//    scene plates and the static world layer carry normal maps (Sobel of a
//    hand-drawn height field) and render through a poster-graded Light2D
//    pipeline. PointLights (pooled) pour real light onto walls: a furnace
//    glow laps up a pipe, a searchlight sweeps a hard shadow edge, a barrel
//    blast splashes the room. maxLights = 20, set in the game config.
// 2. The M25 additive glow pass (unchanged architecture): pooled radial/cone
//    quads above the world for bloom-language transients — muzzle flashes,
//    tracers, hit sparks — plus the cinematic veil and occlusion shadows.
//
// M27 stylized shadows: every shadow-casting light fills TWO wedges per
// back-facing edge — a wide faint penumbra projected from a light pushed
// back off the edge, then the hard umbra on top. Flat fills, poster hard
// edges, but the boundary now reads as a soft falloff instead of a pop.
// Per-map shadow tint (palette.shadowColor) and opacity keep the shadows in
// each map's grade. Transient lights (muzzle, explosions, lightning) carry a
// strength-scaled shadow that decays with the flash envelope.
//
// Degradation tower (frame-time EMA governor, same policy as M25) — M27 made
// it CONTINUOUS: the ladder still steps targets down/up, but the rendered
// shadow and Light2D strengths ease toward the targets (~0.55s), so no tier
// transition ever pops:
//   shadows → PointLights off (ADD glows + veil remain = the verified
//   M25b look) → decorative tiers shed → whole system off.
// Pilots carry no personal lights (M25b): characters are lit by sampling the
// strongest nearby PointLight (sampleLight) and shading toward it in art.
import Phaser from "phaser";
import { MAPS, WORLD, type MapId } from "../shared/game.js";
import { POSTER } from "./palette";
import { PLATE_ANCHORS } from "./sceneplate";

/** A queued glow for the current frame. */
export type LightRequest = {
  x: number;
  y: number;
  /** World-space radius of the glow (px). */
  radius: number;
  tint: number;
  /** Peak alpha at the core (0-1). */
  alpha: number;
  /** Cone lights sweep from `angle` (radians, 0 = +x) with `coneWidth` radians. */
  kind?: "cone";
  angle?: number;
  /**
   * Cast stylized shadows from nearby occluders: strength 0-1.5 scales the
   * fill alpha (undefined/0 = none). Only applies at radius ≥ 90.
   */
  shadow?: number;
  /** Cone shadow wedge half-angle — shadows stay inside the beam. */
  coneHalf?: number;
  /**
   * Glow-only job with zero alpha: exists purely to drive its shadow wedges
   * after the visible flash has died (transient decay tail).
   */
  shadowOnly?: boolean;
  /**
   * Line-light marker: skip the bloom/core layers (the tracer itself is the
   * line's visual core) — used by flashLine chains.
   */
  volumeOnly?: boolean;
  /**
   * Degradation tier: 0 = essential (explosions, muzzle, static rigs),
   * 1 = nice (projectile glows, fire), 2 = luxury (pulses).
   */
  tier?: 0 | 1 | 2;
};

type TransientLight = {
  x: number;
  y: number;
  radius: number;
  tint: number;
  alpha: number;
  life: number;
  maxLife: number;
  grow?: number;
  /** Emit a real Light2D PointLight alongside the glow (intensity at spawn). */
  point?: number;
  /** Shadow strength at spawn; decays with the flash envelope. */
  shadow?: number;
  /** Line-light marker: skip the bloom/core layers (the tracer is the core). */
  volumeOnly?: boolean;
};

export type OccluderRect = { x: number; y: number; width: number; height: number };
/** Directional light sample fed to entity art (rim + key shading). */
export type KeyLightSample = {
  dirX: number;
  dirY: number;
  color: number;
  intensity: number;
};

const RADIAL_KEY = "light-radial";
const CONE_KEY = "light-cone";
const BLOOM_KEY = "light-bloom";
const CORE_KEY = "light-core";
const LIGHT_POOL = 72;
const BLOOM_POOL = 40;
const CORE_POOL = 40;
const CONE_POOL = 10;
const POINT_POOL = 20; // must equal the game config's maxLights
/** Concurrent shadow-casting lights per frame (sorted by strength, rest skip). */
const SHADOW_JOBS_MAX = 6;
/** Governor level ease rate (1/s, exponential) — no tier transition pops. */
const LEVEL_EASE_PER_SECOND = 3;
/** Veil fade rate on match start / map switch (1/s exponential). */
const VEIL_EASE_PER_SECOND = 2.4;
/** Penumbra wedge: projected from the light pushed back this far off the edge. */
const PENUMBRA_PUSH = 12;
/** Penumbra alpha as a fraction of the umbra alpha. */
const PENUMBRA_ALPHA = 0.42;
/**
 * M27 gradient falloff: the umbra reaches 1.25× the light radius, then five
 * progressively fainter bands extend the tail out to 2.75×. The shadow
 * doesn't chop off — it trails away in poster-flat steps, further softened
 * by the downscale/upscale channel below.
 */
const SHADOW_BANDS: Array<{ reach: number; alpha: number }> = [
  { reach: 1.25, alpha: 1.0 },
  { reach: 1.55, alpha: 0.72 },
  { reach: 1.85, alpha: 0.52 },
  { reach: 2.15, alpha: 0.37 },
  { reach: 2.45, alpha: 0.26 },
  { reach: 2.75, alpha: 0.18 },
  { reach: 3.05, alpha: 0.12 },
  { reach: 3.35, alpha: 0.08 },
];
/**
 * M27b soft shadow channel: wedges render into a half-resolution
 * RenderTexture, then ping-pong down a quarter- and an eighth-resolution
 * buffer and back up — a Kawase-style chain. Bilinear sampling at each hop
 * melts the flat bands into one perfectly smooth gradient (the user bar:
 * NO visible color-block stitching, ever). The small buffers make the chain
 * effectively free (500×280 → 250×140 → 125×70).
 */
const SHADOW_RT_SCALE = 0.5;
/** Compensates the slight peak loss the blur chain applies to wedge cores. */
const SHADOW_CHAIN_GAIN = 1.14;

/** Smooth 0..1 ease shared by light falloff, shadow strength and envelopes. */
const smooth01 = (t: number) => {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
};

/** Deterministic two-frequency flicker in ~[0.76, 0.96]. */
const flicker = (time: number, seed: number) => 0.86 + 0.1 * Math.sin(time * 0.013 + seed) * Math.sin(time * 0.0071 + seed * 1.7);

function makeRadialTexture(scene: Phaser.Scene, key: string) {
  if (scene.textures.exists(key)) return;
  const texture = scene.textures.createCanvas(key, 256, 256);
  if (!texture) return;
  const ctx = texture.getContext();
  const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.22, "rgba(255,255,255,0.62)");
  gradient.addColorStop(0.55, "rgba(255,255,255,0.22)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);
  texture.refresh();
}

/** M27 bloom layer: a mid-radius soft halo — the "camera" glow that rides
 * ABOVE the shadow channel (bloom is a lens phenomenon, never occluded). */
function makeBloomTexture(scene: Phaser.Scene, key: string) {
  if (scene.textures.exists(key)) return;
  const texture = scene.textures.createCanvas(key, 128, 128);
  if (!texture) return;
  const ctx = texture.getContext();
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, "rgba(255,255,255,0.85)");
  gradient.addColorStop(0.35, "rgba(255,255,255,0.4)");
  gradient.addColorStop(0.7, "rgba(255,255,255,0.1)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  texture.refresh();
}

/** M27 core layer: a small white-hot bead — the emitter itself, never darkened
 * by the shadows it casts. */
function makeCoreTexture(scene: Phaser.Scene, key: string) {
  if (scene.textures.exists(key)) return;
  const texture = scene.textures.createCanvas(key, 64, 64);
  if (!texture) return;
  const ctx = texture.getContext();
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.45, "rgba(255,255,255,0.75)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  texture.refresh();
}

function makeConeTexture(scene: Phaser.Scene, key: string) {
  if (scene.textures.exists(key)) return;
  const texture = scene.textures.createCanvas(key, 256, 256);
  if (!texture) return;
  const ctx = texture.getContext();
  // Beam points UP from the bottom-center apex, fading with distance and
  // toward the edges (three nested wedges fake the soft penumbra).
  for (const [spread, alpha] of [[128, 0.24], [86, 0.4], [46, 0.85]] as const) {
    const gradient = ctx.createLinearGradient(0, 256, 0, 0);
    gradient.addColorStop(0, `rgba(255,255,255,${alpha})`);
    gradient.addColorStop(0.75, `rgba(255,255,255,${alpha * 0.35})`);
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(128 - spread / 3, 256);
    ctx.lineTo(128 + spread / 3, 256);
    ctx.lineTo(128 + spread, 0);
    ctx.lineTo(128 - spread, 0);
    ctx.closePath();
    ctx.fill();
  }
  texture.refresh();
}

export class LightingSystem {
  private scene: Phaser.Scene;
  private enabled = true;
  private mapId: MapId | "" = "";
  private darkness!: Phaser.GameObjects.Rectangle;
  private capRelight!: Phaser.GameObjects.Graphics;
  private shadows!: Phaser.GameObjects.Graphics;
  private lightPool: Phaser.GameObjects.Image[] = [];
  private conePool: Phaser.GameObjects.Image[] = [];
  private bloomPool: Phaser.GameObjects.Image[] = [];
  private corePool: Phaser.GameObjects.Image[] = [];
  private shadowRt?: Phaser.GameObjects.RenderTexture;
  private shadowRtB?: Phaser.GameObjects.RenderTexture;
  private shadowRtC?: Phaser.GameObjects.RenderTexture;
  private queue: LightRequest[] = [];
  /** Event-driven transient lights (muzzle flashes, explosions, hits). */
  private transients: TransientLight[] = [];
  /**
   * M27c line-light jobs: one entry per flashLine call. The chain's beads
   * render the glow; THIS entry owns the line's shadow casting — projected
   * from several sample points along the segment so the line blocks like a
   * real extended source.
   */
  private lineTransients: Array<{ x0: number; y0: number; x1: number; y1: number; radius: number; tint: number; alpha: number; life: number; maxLife: number; shadow: number }> = [];
  /** Canopy storm clock: next lightning strike (ms timestamp). */
  private nextLightning = 0;
  private fortressSweep = 0;
  /** Fire-and-forget hook: the scene plays thunder when lightning strikes. */
  onStrike?: () => void;
  /**
   * Adaptive governor: the max light tier currently admitted. Starts full;
   * a slow frame-time EMA walks it down (shadows off → PointLights off →
   * tier ≤1 → tier ≤0 → all off) and recovery walks it back up.
   */
  private maxTier: 0 | 1 | 2 = 2;
  /** M27 continuous shadow strength (0-1): eases toward the ladder target. */
  shadowLevel = 1;
  /** M27 continuous Light2D strength (0-1): eases toward the ladder target. */
  light2DLevel = 1;
  private shadowTarget = 1;
  private light2DTarget = 1;
  /** Veil brightness 0-1 (fades in on match start / map switch — no pop). */
  private veilLevel = 0;
  /** True once the veil has completed its initial fade-in. */
  veilSettled = false;
  private frameEma = 16.7;
  /** Per-map stylized shadow fill (from palette). */
  private shadowFill = 0x1a2036;
  private shadowBaseAlpha = 0.3;

  // --- Light2D state ---
  private pipeline: Phaser.Renderer.WebGL.Pipelines.LightPipeline | undefined;
  private pointLights: Phaser.GameObjects.Light[] = [];
  private pointQueue: Array<{ x: number; y: number; radius: number; tint: number; intensity: number }> = [];
  /** Lights resolved for the current frame (sampleLight source). */
  private assigned: Array<{ x: number; y: number; radius: number; tint: number; intensity: number }> = [];

  constructor(scene: Phaser.Scene, pipeline?: Phaser.Renderer.WebGL.Pipelines.LightPipeline) {
    this.scene = scene;
    makeRadialTexture(scene, RADIAL_KEY);
    makeConeTexture(scene, CONE_KEY);
    makeBloomTexture(scene, BLOOM_KEY);
    makeCoreTexture(scene, CORE_KEY);
    // M29: darkness/veil covers the whole 1500×840 world (world-space rect —
    // it scrolls with the camera and only ever shows through the viewport).
    this.darkness = scene.add.rectangle(WORLD.width / 2, WORLD.height / 2, WORLD.width, WORLD.height, 0x000000, 1).setDepth(2).setVisible(false);
    this.capRelight = scene.add.graphics().setDepth(2.05);
    // M27b: wedges render into this off-screen graphics, get composited into
    // a half-resolution RenderTexture, ping-pong through two smaller buffers
    // (Kawase-style blur), and the base RT is the visible layer (2× upscale).
    this.shadows = scene.add.graphics().setVisible(false);
    if (scene.sys.game.renderer.type === Phaser.WEBGL) {
      // M29: buffer sizes derive from WORLD (750/375/188 at the new 1500×840;
      // the eighth-res buffer rounds 187.5 — the blur chain is insensitive).
      // The RT sits at world origin and scrolls with the camera; wedge draws
      // are pre-scaled world coordinates, so shadows stay world-locked.
      this.shadowRt = scene.add.renderTexture(0, 0, Math.round(WORLD.width * SHADOW_RT_SCALE), Math.round(WORLD.height * SHADOW_RT_SCALE)).setOrigin(0, 0).setDepth(2.2);
      this.shadowRt.setScale(1 / SHADOW_RT_SCALE);
      this.shadowRtB = scene.add.renderTexture(0, 0, Math.round(WORLD.width * SHADOW_RT_SCALE * 0.5), Math.round(WORLD.height * SHADOW_RT_SCALE * 0.5)).setOrigin(0, 0).setVisible(false);
      this.shadowRtC = scene.add.renderTexture(0, 0, Math.round(WORLD.width * SHADOW_RT_SCALE * 0.25), Math.round(WORLD.height * SHADOW_RT_SCALE * 0.25)).setOrigin(0, 0).setVisible(false);
    }
    for (let i = 0; i < LIGHT_POOL; i++) {
      const image = scene.add.image(0, 0, RADIAL_KEY).setDepth(2.1).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
      this.lightPool.push(image);
    }
    // M27b bloom + core pools: the emitter's own light layers, riding ABOVE
    // the shadow channel so a flash is never darkened by its own cast.
    for (let i = 0; i < BLOOM_POOL; i++) {
      const image = scene.add.image(0, 0, BLOOM_KEY).setDepth(2.3).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
      this.bloomPool.push(image);
    }
    for (let i = 0; i < CORE_POOL; i++) {
      const image = scene.add.image(0, 0, CORE_KEY).setDepth(2.31).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
      this.corePool.push(image);
    }
    for (let i = 0; i < CONE_POOL; i++) {
      const image = scene.add.image(0, 0, CONE_KEY).setDepth(2.09).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
      this.conePool.push(image);
    }
    if (pipeline) {
      this.pipeline = pipeline;
      scene.lights.enable().setAmbientColor(0xffffff);
      for (let i = 0; i < POINT_POOL; i++) {
        this.pointLights.push(scene.lights.addLight(0, 0, 100, 0xffffff, 0));
      }
    }
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) this.hideAll();
  }

  private hideAll() {
    this.darkness.setVisible(false);
    this.capRelight.setVisible(false);
    this.shadows.setVisible(false);
    this.shadowRt?.setVisible(false);
    this.shadowRtB?.setVisible(false);
    this.shadowRtC?.setVisible(false);
    for (const image of this.lightPool) image.setVisible(false);
    for (const image of this.conePool) image.setVisible(false);
    for (const image of this.bloomPool) image.setVisible(false);
    for (const image of this.corePool) image.setVisible(false);
    this.lineTransients.length = 0;
    this.assigned.length = 0;
    for (let i = 0; i < this.pointLights.length; i++) {
      this.pointLights[i].intensity = 0;
    }
  }

  /** Re-grade the veil + ambient + static rig state when the map changes. */
  setMap(mapId: MapId) {
    if (this.mapId === mapId) return;
    this.mapId = mapId;
    const poster = POSTER[mapId];
    this.darkness.setFillStyle(poster.veilColor, poster.veilAlpha);
    this.shadowFill = poster.shadowColor;
    this.shadowBaseAlpha = poster.shadowAlpha;
    if (this.pipeline) {
      this.pipeline.set3f("uAmbientLightColor", poster.ambient[0], poster.ambient[1], poster.ambient[2]);
    }
    // M27: a map switch restarts the cinematic fade so the grade arrives as
    // a rise, never as a hard swap.
    this.veilLevel = 0;
    this.veilSettled = false;
    // Platform-cap visibility strips: the walkable signal must survive the
    // cinematic darkness (M20 rule).
    const map = MAPS[mapId];
    this.capRelight.clear();
    this.capRelight.fillStyle(0xf2f7f4, 0.2);
    for (const platform of map.platforms) {
      this.capRelight.fillRect(platform.x - 2, platform.y - 1.5, platform.width + 4, 8);
    }
  }

  /** Queue a glow for this frame. Cheap — resolved in finish(). */
  add(request: LightRequest) {
    if (!this.enabled) return;
    if ((request.tier ?? 2) > this.maxTier) return;
    this.queue.push(request);
  }

  /** Queue a real PointLight for this frame (normal-mapped surfaces only). */
  addPoint(x: number, y: number, radius: number, tint: number, intensity: number, tier: 0 | 1 | 2 = 0) {
    if (!this.enabled || !this.pipeline) return;
    if (tier > this.maxTier) return;
    if (this.light2DTarget <= 0 && this.light2DLevel <= 0.01) return;
    this.pointQueue.push({ x, y, radius, tint, intensity });
  }

  /** Fire-and-forget transient (event-driven): decays over `life` seconds. */
  flash(x: number, y: number, radius: number, tint: number, alpha: number, life: number, grow?: number, point?: number, shadow?: number, volumeOnly?: boolean) {
    if (!this.enabled) return;
    this.transients.push({ x, y, radius, tint, alpha, life, maxLife: life, grow, point, shadow, volumeOnly });
    if (this.transients.length > 90) this.transients = this.transients.slice(-90);
  }

  /**
   * M27c line light: a hitscan lance (charged rail, beam) is a LIGHT SOURCE
   * along its whole length, not just at the muzzle. Two registrations happen:
   * 1) a chain of glow beads along the segment (volume only — the tracer is
   * the visual core; bead spacing never undershoots radius×0.85 so the chain
   * reads as a luminous tube instead of an additive white blob), and 2) ONE
   * line-shadow job — `lineShadow` is an EXPLICIT strength (it must not
   * shrink with charge state or the cast shadows vanish) projected from up
   * to 8 sample origins along the segment.
   */
  flashLine(x0: number, y0: number, x1: number, y1: number, step: number, radius: number, tint: number, alpha: number, life: number, pointIntensity = 0, lineShadow = 0.9) {
    const length = Math.hypot(x1 - x0, y1 - y0);
    const spacing = Math.max(step, radius * 0.85);
    const n = Math.max(1, Math.ceil(length / spacing));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const falloff = 1 - 0.12 * t;
      this.flash(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, radius, tint, alpha * falloff, life, undefined, pointIntensity > 0 ? pointIntensity * falloff : undefined, undefined, true);
    }
    this.lineTransients.push({ x0, y0, x1, y1, radius, tint, alpha, life, maxLife: life, shadow: lineShadow });
    // M32: raised 6 -> 10 while the shield's diffraction fan shares the line
    // (7 beams + the pilot's own rail/beam lights); the analytic line-shadow
    // pass (M34) recovers the headroom.
    if (this.lineTransients.length > 10) this.lineTransients = this.lineTransients.slice(-10);
  }

  /**
   * Strongest light sample near a world point (one frame stale — called
   * during entity draw, resolved last frame). Drives character rim lighting.
   */
  sampleLight(x: number, y: number): KeyLightSample | undefined {
    let best: { d: number; weight: number; x: number; y: number; tint: number; intensity: number; radius: number } | undefined;
    for (const light of this.assigned) {
      const dx = light.x - x;
      const dy = light.y - y;
      const d = Math.hypot(dx, dy);
      if (d > light.radius) continue;
      const weight = light.intensity * (1 - d / light.radius);
      if (!best || weight > best.weight) best = { d, weight, x: light.x, y: light.y, tint: light.tint, intensity: light.intensity, radius: light.radius };
    }
    if (!best || best.weight < 0.05) return undefined;
    return {
      dirX: (best.x - x) / (best.d || 1),
      dirY: (best.y - y) / (best.d || 1),
      color: best.tint,
      intensity: Math.min(1, best.weight * 1.4),
    };
  }

  /** Advance transient decay + governor + map ambience. Call every frame. */
  update(time: number, deltaMs: number) {
    if (!this.mapId) return;
    const dt = deltaMs / 1000;
    // M27: the governor's boolean ladder became a target selector; the actual
    // rendered strengths ease toward it so no transition ever pops.
    this.frameEma += (deltaMs - this.frameEma) * 0.08;
    if (this.frameEma > 26 && time - this.lastLevelChange > 900) {
      if (this.enabled) {
        if (this.shadowTarget > 0) this.shadowTarget = 0;
        else if (this.light2DTarget > 0) this.light2DTarget = 0;
        else if (this.maxTier > 0) this.maxTier = (this.maxTier - 1) as 0 | 1 | 2;
        else this.setEnabled(false);
      }
      this.frameEma = 24;
      this.lastLevelChange = time;
    } else if (this.frameEma < 15.5 && time - this.lastLevelChange > 2500) {
      if (!this.enabled) {
        this.setEnabled(true);
        this.maxTier = 0;
        this.shadowTarget = 0;
        this.light2DTarget = 0;
        if (this.mapId) this.setMap(this.mapId);
      } else if (this.maxTier < 2) {
        this.maxTier = (this.maxTier + 1) as 0 | 1 | 2;
      } else if (this.light2DTarget < 1) {
        this.light2DTarget = 1;
      } else if (this.shadowTarget < 1) {
        this.shadowTarget = 1;
      }
      this.frameEma = 18;
      this.lastLevelChange = time;
    }
    // M27b: the governor levels ease EXPONENTIALLY toward their targets —
    // fast at first, settling gently, never a linear ramp.
    const ease = Math.min(1, LEVEL_EASE_PER_SECOND * dt);
    this.shadowLevel += (this.shadowTarget - this.shadowLevel) * ease;
    this.light2DLevel += (this.light2DTarget - this.light2DLevel) * ease;
    // Cinematic veil fades in on start / map switch (exponential ease-out).
    if (!this.veilSettled) {
      this.veilLevel += (1 - this.veilLevel) * Math.min(1, VEIL_EASE_PER_SECOND * dt);
      if (this.veilLevel > 0.995) {
        this.veilLevel = 1;
        this.veilSettled = true;
      }
    }
    if (!this.enabled) return;
    for (const light of this.transients) light.life -= deltaMs / 1000;
    this.transients = this.transients.filter((light) => light.life > 0);
    for (const line of this.lineTransients) line.life -= deltaMs / 1000;
    this.lineTransients = this.lineTransients.filter((line) => line.life > 0);
    if (this.mapId === "canopy") this.stepLightning(time);
    if (this.mapId === "fortress") this.fortressSweep = time;
  }

  private lastLevelChange = 0;

  private stepLightning(time: number) {
    if (time < this.nextLightning) return;
    if (this.nextLightning === 0) {
      this.nextLightning = time + 4000 + Math.random() * 6000;
      return;
    }
    // 2-3 strobe strikes: a huge sky flash that briefly fights the veil.
    // M27: the sky flash is the strongest shadow caster in the game — for a
    // few frames the whole arena's silhouettes snap out in hard wedges.
    const strikes = 2 + Math.floor(Math.random() * 2);
    for (let index = 0; index < strikes; index++) {
      const x = 120 + Math.random() * 760;
      this.scene.time.delayedCall(index * (90 + Math.random() * 120), () => {
        this.flash(x, -40, 780, 0xcfe4ff, 0.5, 0.16, undefined, undefined, 1.6);
        this.flash(x + 30, 60, 420, 0xeaf4ff, 0.35, 0.22, undefined, 1.4, 1.0);
      });
    }
    this.onStrike?.();
    this.nextLightning = time + 6000 + Math.random() * 7000;
  }

  /**
   * Resolve the frame: static rig + queued glows onto the pools, PointLights
   * onto the Light2D pool, then shadow projection for the lights that asked.
   */
  finish(occluders: OccluderRect[]) {
    const scene = this.scene;
    if (!this.enabled) {
      this.queue.length = 0;
      this.pointQueue.length = 0;
      return;
    }
    this.darkness.setVisible(true);
    // M27 cinematic fade: the veil object alpha scales with the eased level
    // so a match start / map switch raises the grade instead of hard-cutting.
    const poster = this.mapId ? POSTER[this.mapId] : undefined;
    if (poster) this.darkness.setFillStyle(poster.veilColor, poster.veilAlpha);
    this.darkness.setAlpha(Math.max(0.001, this.veilLevel));
    this.capRelight.setVisible(true);
    this.capRelight.setAlpha(this.veilLevel);
    this.shadows.clear();
    this.shadowRt?.clear();
    this.shadowRtB?.clear();
    this.shadowRtC?.clear();

    // Static per-map rig (few emitters, drawn every frame from the queue).
    if (this.mapId) this.emitStaticRig(scene.time.now);

    // Resolve the three light layers. M27b split: volume (the light pouring
    // through the scene, shadowable, below the shadow channel), bloom (the
    // camera glow, never occluded) and core (the emitter bead, never occluded).
    let used = 0;
    let bloomsUsed = 0;
    let coresUsed = 0;
    let conesUsed = 0;
    const shadowJobs: Array<{ light: LightRequest }> = [];
    for (const light of this.queue) {
      if (light.kind === "cone") {
        if (conesUsed >= CONE_POOL) continue;
        const image = this.conePool[conesUsed++];
        image.setVisible(true);
        image.setPosition(light.x, light.y);
        image.setRotation((light.angle ?? 0) + Math.PI / 2); // texture points up
        image.setScale((light.radius * 2) / 256, (light.radius * 2) / 256);
        image.setTint(light.tint);
        image.setAlpha(light.alpha);
      } else if (!light.shadowOnly) {
        // Volume: the big soft pool that lives UNDER the shadow wedges.
        if (used >= LIGHT_POOL) continue;
        const image = this.lightPool[used++];
        image.setVisible(true);
        image.setPosition(light.x, light.y);
        image.setScale((light.radius * 2) / 256);
        image.setTint(light.tint);
        image.setAlpha(light.alpha);
        // Bloom + core: the lens layers ABOVE the shadows. Brighten with the
        // request's own alpha so a dying flash dies on all three layers.
        // Line-light chains skip both (the tracer IS the line's core).
        if (light.alpha > 0.02 && !light.volumeOnly) {
          if (bloomsUsed < BLOOM_POOL) {
            const bloom = this.bloomPool[bloomsUsed++];
            bloom.setVisible(true);
            bloom.setPosition(light.x, light.y);
            bloom.setScale((light.radius * 1.4) / 128);
            bloom.setTint(light.tint);
            bloom.setAlpha(light.alpha * 0.42);
          }
          if (coresUsed < CORE_POOL) {
            const core = this.corePool[coresUsed++];
            core.setVisible(true);
            core.setPosition(light.x, light.y);
            core.setScale((light.radius * 0.76) / 64);
            core.setTint(Phaser.Display.Color.IntegerToColor(light.tint).lighten(35).color);
            core.setAlpha(light.alpha * 0.85);
          }
        }
      }
      // M27c: line-light beads do NOT cast as individuals — the line's
      // shadow is owned by its lineTransients job (below), so a 40-bead
      // chain can't crowd the caster budget.
      if (!light.volumeOnly && (this.shadowLevel > 0.02 || this.shadowTarget > 0)) shadowJobs.push({ light });
    }
    for (let i = used; i < LIGHT_POOL; i++) this.lightPool[i].setVisible(false);
    for (let i = bloomsUsed; i < BLOOM_POOL; i++) this.bloomPool[i].setVisible(false);
    for (let i = coresUsed; i < CORE_POOL; i++) this.corePool[i].setVisible(false);
    for (let i = conesUsed; i < CONE_POOL; i++) this.conePool[i].setVisible(false);
    this.queue.length = 0;

    // M27b: EVERY glow casts — a shadow's strength is its light's glow
    // intensity (explicit `shadow` overrides for set pieces like cones and
    // static lamps). Dim glows cast faint shadows; attenuation does the
    // rest. M27c: a line-light chain shares ONE caster slot (its beads
    // would otherwise crowd out every other caster) — the chain's beads are
    // merged into the strongest bead's job with the chain-average strength.
    if (shadowJobs.length > SHADOW_JOBS_MAX) {
      shadowJobs.sort((a, b) => (b.light.shadow ?? b.light.alpha) - (a.light.shadow ?? a.light.alpha));
      shadowJobs.length = SHADOW_JOBS_MAX;
    }

    // Resolve engine PointLights onto the pooled Light objects (20 max —
    // Phaser culls off-camera lights and caps at maxLights anyway). The
    // governor's light2D level scales every intensity so the tier transition
    // eases in instead of popping.
    this.assigned.length = 0;
    let pointsUsed = 0;
    const pointScale = this.light2DLevel;
    if (pointScale > 0.01) {
      for (const point of this.pointQueue) {
        if (pointsUsed >= this.pointLights.length) break;
        const light = this.pointLights[pointsUsed++];
        light.x = point.x;
        light.y = point.y;
        light.radius = point.radius;
        const color = Phaser.Display.Color.IntegerToColor(point.tint);
        light.color.set(color.redGL, color.greenGL, color.blueGL);
        light.intensity = point.intensity * pointScale;
        this.assigned.push(point);
      }
    }
    for (let i = pointsUsed; i < this.pointLights.length; i++) this.pointLights[i].intensity = 0;
    this.pointQueue.length = 0;

    // Shadow projection. M27b physics: a shadow's strength IS the light at
    // the occluder — no state, no fade machinery. Each (caster × occluder)
    // pair scales its wedge by the same smooth attenuation curve the light
    // itself follows, so walking toward a lamp deepens the shadow smoothly
    // and leaving the radius dissolves it to nothing. Cone casters add an
    // angular falloff off the beam axis.
    if (this.shadowLevel > 0.02) {
      for (const { light } of shadowJobs) {
        const coneHalf = light.coneHalf;
        // Explicit shadow strength wins (searchlights, set pieces); otherwise
        // the glow's own alpha IS the shadow strength — bright glow, strong
        // shadow; dim glow, faint shadow; distance attenuation does the rest.
        const strength = Math.min(1.5, light.shadow ?? Math.min(0.9, light.alpha * 2.2)) * this.shadowLevel;
        // The blur chain shaves the wedge peaks slightly — compensate.
        const baseAlpha = this.shadowBaseAlpha * strength * (this.shadowRt ? SHADOW_CHAIN_GAIN : 1);
        if (baseAlpha < 0.015) continue;
        for (const rect of occluders) {
          const cx = rect.x + rect.width / 2;
          const cy = rect.y + rect.height / 2;
          const dx = cx - light.x;
          const dy = cy - light.y;
          const distance = Math.hypot(dx, dy);
          if (distance > light.radius + Math.max(rect.width, rect.height)) continue;
          // Distance falloff: full strength under the light, easing to zero
          // at the radius edge (the same curve the visible light follows).
          const atten = smooth01(1 - distance / light.radius);
          if (coneHalf !== undefined) {
            const angle = Math.atan2(dy, dx);
            let delta = angle - (light.angle ?? 0);
            while (delta > Math.PI) delta -= Math.PI * 2;
            while (delta < -Math.PI) delta += Math.PI * 2;
            if (Math.abs(delta) > coneHalf) continue;
            // Angular falloff inside the beam: dimmest at the beam edge.
            const coneAtten = 1 - Math.abs(delta) / coneHalf;
            const alpha = baseAlpha * atten * coneAtten;
            if (alpha > 0.015) this.projectOccluderShadow(light, rect, alpha);
          } else {
            const alpha = baseAlpha * atten;
            if (alpha > 0.015) this.projectOccluderShadow(light, rect, alpha);
          }
        }
      }
      // M27c line shadows: each flashLine job projects wedges from several
      // sample origins along the segment — the lance blocks light like the
      // EXTENDED source it is (a single origin would read as a torch, not a
      // beam). M28: strength uses the EXPLICIT lineShadow (charge-state
      // independent), scaled only by the smoothstep envelope and a gentle
      // far-end fade — the double alpha-attenuation multiply that kept
      // eating the wedges below the visibility floor is gone.
      for (const line of this.lineTransients) {
        const t = smooth01(Math.max(0, line.life / line.maxLife));
        const baseAlpha = this.shadowBaseAlpha * Math.min(1.5, line.shadow) * this.shadowLevel * t * (this.shadowRt ? SHADOW_CHAIN_GAIN : 1);
        if (baseAlpha < 0.015) continue;
        const len = Math.hypot(line.x1 - line.x0, line.y1 - line.y0);
        const samples = Math.min(8, Math.max(3, Math.ceil(len / 150)));
        for (let s = 0; s <= samples; s++) {
          const tt = s / samples;
          const origin = { x: line.x0 + (line.x1 - line.x0) * tt, y: line.y0 + (line.y1 - line.y0) * tt, radius: line.radius } as LightRequest;
          const sampleAlpha = baseAlpha * (1 - 0.25 * tt);
          for (const rect of occluders) {
            const cx = rect.x + rect.width / 2;
            const cy = rect.y + rect.height / 2;
            const distance = Math.hypot(cx - origin.x, cy - origin.y);
            if (distance > line.radius * 2.2 + Math.max(rect.width, rect.height)) continue;
            const alpha = sampleAlpha * smooth01(1 - distance / (line.radius * 2.2));
            if (alpha > 0.015) this.projectOccluderShadow(origin, rect, alpha);
          }
        }
      }
    }
    // Composite the wedge pass through the blur chain: downsample to ¼ and
    // ⅛ resolution, then back up — bilinear sampling at each hop melts the
    // flat bands into one perfectly smooth gradient (no color-block
    // stitching anywhere). Wedges are drawn ALREADY SCALED by
    // SHADOW_RT_SCALE so world coordinates map 1:1 onto the base-RT texels
    // (drawing them at world scale inside a half-sized RT was the cause of
    // the "fixed offset shadow" bug). Canvas renderers skip the channel and
    // draw the raw graphics directly.
    if (this.shadowRt && this.shadowRtB && this.shadowRtC) {
      const rtA = this.shadowRt;
      const rtB = this.shadowRtB;
      const rtC = this.shadowRtC;
      rtA.draw(this.shadows);
      // down: A(½) → B(¼) → C(⅛)
      rtA.setScale(0.5);
      rtB.clear();
      rtB.draw(rtA);
      rtB.setScale(0.5);
      rtC.clear();
      rtC.draw(rtB);
      // up: C(⅛) → B(¼) → A(½)
      rtC.setScale(2);
      rtB.clear();
      rtB.draw(rtC);
      rtB.setScale(1);
      rtC.setScale(1);
      rtA.clear();
      rtB.setScale(2);
      rtA.draw(rtB);
      rtB.setScale(1);
      rtA.setScale(1 / SHADOW_RT_SCALE); // display scale
      rtA.setVisible(true);
    } else {
      this.shadows.setDepth(2.2).setVisible(true);
    }
    void scene;
  }

  /** Fill shadow wedges for one occluder rect relative to one light. */
  private projectOccluderShadow(light: LightRequest, rect: OccluderRect, baseAlpha: number) {
    const rtScale = this.shadowRt ? SHADOW_RT_SCALE : 1;
    if (rtScale !== 1) {
      // Halve-resolution channel active: draw every point in RT space.
      const scaled: LightRequest = { ...light, x: light.x * rtScale, y: light.y * rtScale, radius: light.radius * rtScale };
      const rectScaled = { x: rect.x * rtScale, y: rect.y * rtScale, width: rect.width * rtScale, height: rect.height * rtScale };
      this.drawShadowWedges(scaled, rectScaled, baseAlpha);
    } else {
      this.drawShadowWedges(light, rect, baseAlpha);
    }
  }

  /** The wedge geometry itself — pure function of light, rect, alpha. */
  private drawShadowWedges(light: LightRequest, rect: OccluderRect, baseAlpha: number) {
    const corners = [
      { x: rect.x, y: rect.y },
      { x: rect.x + rect.width, y: rect.y },
      { x: rect.x + rect.width, y: rect.y + rect.height },
      { x: rect.x, y: rect.y + rect.height },
    ];
    // Cast a ray from origin `ox,oy` through the corner to the reach of the
    // given band (band 0 = the hard umbra; wider bands continue the same ray
    // with fainter fills so the shadow dissolves instead of chopping off).
    const projectFrom = (ox: number, oy: number, corner: { x: number; y: number }, reachScale: number) => {
      const dx = corner.x - ox;
      const dy = corner.y - oy;
      const distance = Math.hypot(dx, dy) || 1;
      const reach = Math.min(light.radius * reachScale, distance + light.radius * reachScale);
      return { x: corner.x + (dx / distance) * reach, y: corner.y + (dy / distance) * reach };
    };
    for (let index = 0; index < 4; index++) {
      const c1 = corners[index];
      const c2 = corners[(index + 1) % 4];
      // Back-facing test: edge normal points away from the light.
      const ex = c2.x - c1.x;
      const ey = c2.y - c1.y;
      const mx = (c1.x + c2.x) / 2 - light.x;
      const my = (c1.y + c2.y) / 2 - light.y;
      if (ex * my - ey * mx <= 0) continue;
      // Penumbra: a wider wedge projected from the light pushed back along
      // the edge-midpoint direction — geometrically fakes a spread source.
      const midX = (c1.x + c2.x) / 2;
      const midY = (c1.y + c2.y) / 2;
      const toMid = Math.hypot(midX - light.x, midY - light.y) || 1;
      const backX = light.x + ((light.x - midX) / toMid) * PENUMBRA_PUSH;
      const backY = light.y + ((light.y - midY) / toMid) * PENUMBRA_PUSH;
      const px1 = projectFrom(backX, backY, c1, SHADOW_BANDS[0].reach);
      const px2 = projectFrom(backX, backY, c2, SHADOW_BANDS[0].reach);
      this.shadows.fillStyle(this.shadowFill, baseAlpha * PENUMBRA_ALPHA);
      this.shadows.fillPoints([c1, c2, px2, px1], true);
      // M27 gradient falloff: the umbra plus two fainter extension bands.
      // Painting outer bands FIRST and the core last keeps the final value
      // at the band-edge exactly alpha·1.0 (core overpaints the steps).
      for (let band = SHADOW_BANDS.length - 1; band >= 0; band--) {
        const spec = SHADOW_BANDS[band];
        const b1 = projectFrom(light.x, light.y, c1, spec.reach);
        const b2 = projectFrom(light.x, light.y, c2, spec.reach);
        this.shadows.fillStyle(this.shadowFill, baseAlpha * spec.alpha);
        this.shadows.fillPoints([c1, c2, b2, b1], true);
      }
    }
  }

  /**
   * Per-map set-piece emitters, now sourced from the plate anchors baked into
   * the scene art (the lamps you can see are the lamps that light). Static
   * anchors are tier 0 — the world's base light, never decorative-gated.
   */
  private emitStaticRig(time: number) {
    if (!this.mapId) return;
    const anchors = PLATE_ANCHORS[this.mapId];
    for (let index = 0; index < anchors.length; index++) {
      const anchor = anchors[index];
      let intensity = anchor.intensity;
      if (this.mapId === "factory" && index === 0) {
        // Furnace mouth breathes: slow swell + two-frequency flicker.
        intensity *= flicker(time, 0) * (0.8 + Math.sin(time * 0.0017) * 0.2);
      } else if (this.mapId === "fortress") {
        // Beacons counter-pulse like alarm alternators.
        intensity *= 0.75 + Math.sin(time * 0.006 + index * Math.PI) * 0.25;
      } else {
        intensity *= flicker(time, index * 3.1);
      }
      this.addPoint(anchor.x, anchor.y, anchor.radius, anchor.color, intensity * 1.3);
      // A faint additive core keeps the lamp itself visibly hot.
      this.add({ x: anchor.x, y: anchor.y, radius: anchor.radius * 0.4, tint: anchor.color, alpha: 0.16 * intensity, tier: 0 });
      // M27: big lamps cast their own soft anchor shadows (pillars, pipes and
      // pilots cross the light pool and sketch wedges onto the walls).
      if (anchor.radius >= 90) {
        this.add({ x: anchor.x, y: anchor.y, radius: anchor.radius, tint: anchor.color, alpha: 0, shadow: 0.4, shadowOnly: true, tier: 0 });
      }
    }
    if (this.mapId === "fortress") {
      // Sweeping white searchlight cones (the set piece): an ADD volume beam
      // plus a moving PointLight so the beam truly lights the walls it
      // crosses. M27: wider reach, hotter core, and everything caught in the
      // beam — pilots, barrels, cover — casts a stylized penumbra shadow.
      const sweep = Math.sin(time * 0.00042) * 0.55;
      const sweep2 = Math.sin(time * 0.00042 + Math.PI) * 0.55;
      const angleA = 0.6 + sweep;
      const angleB = Math.PI - 0.6 + sweep2;
      this.add({ x: 165, y: 66, radius: 360, tint: 0xdfe8f2, alpha: 0.44, kind: "cone", angle: angleA, shadow: 1.1, coneHalf: 0.42 });
      this.add({ x: 835, y: 66, radius: 360, tint: 0xdfe8f2, alpha: 0.44, kind: "cone", angle: angleB, shadow: 1.1, coneHalf: 0.42 });
      this.addPoint(165 + Math.cos(angleA) * 150, 66 + Math.sin(angleA) * 150, 200, 0xdfe8f2, 1.0);
      this.addPoint(835 + Math.cos(angleB) * 150, 66 + Math.sin(angleB) * 150, 200, 0xdfe8f2, 1.0);
    }
  }

  /** Frame-hooked transient lights (called by the scene before finish()). */
  emitTransients() {
    for (const light of this.transients) {
      // M27b smoothstep envelope: the flash starts at full brightness and
      // eases out (t²(3−2t)) — light and its shadow die on the same curve.
      const t = smooth01(Math.max(0, light.life / light.maxLife));
      const radius = light.grow ? light.radius + (1 - t) * light.grow : light.radius;
      const glowAlpha = light.alpha * t;
      const shadow = light.shadow ? light.shadow * t : undefined;
      if (shadow && glowAlpha < 0.02) {
        // Glow already faded — keep only the decaying shadow job alive so
        // the cast shadows die WITH the flash instead of popping off.
        this.add({ x: light.x, y: light.y, radius: Math.max(90, radius), tint: light.tint, alpha: 0, shadow, shadowOnly: true, tier: 0 });
      } else {
        this.add({ x: light.x, y: light.y, radius, tint: light.tint, alpha: glowAlpha, shadow, tier: 0 });
      }
      if (light.point && this.pipeline) {
        this.addPoint(light.x, light.y, radius * 1.05, light.tint, light.point * t, 0);
      }
    }
  }
}
