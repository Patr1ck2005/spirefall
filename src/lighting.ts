// M26 industrial-poster lighting. Two light systems cooperate:
//
// 1. Phaser Light2D (the engine's real per-pixel lighting pipeline): the
//    scene plates and the static world layer carry normal maps (Sobel of a
//    hand-drawn height field) and render through a poster-graded Light2D
//    pipeline. PointLights (pooled) pour real light onto walls: a furnace
//    glow laps up a pipe, a searchlight sweeps a hard shadow edge, a barrel
//    blast splashes the room. maxLights = 16, set in the game config.
// 2. The M25 additive glow pass (unchanged architecture): pooled radial/cone
//    quads above the world for bloom-language transients — muzzle flashes,
//    tracers, hit sparks — plus the cinematic veil and occlusion shadows.
//
// Degradation tower (frame-time EMA governor, same policy as M25):
//   shadows → PointLights off (ADD glows + veil remain = the verified
//   M25b look) → decorative tiers shed → whole system off.
// Pilots carry no personal lights (M25b): characters are lit by sampling the
// strongest nearby PointLight (sampleLight) and shading toward it in art.
import Phaser from "phaser";
import { MAPS, type MapId } from "../shared/game.js";
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
  /** Cast occlusion shadows from nearby occluders (radius ≥ 90 recommended). */
  shadow?: boolean;
  /** Cone shadow wedge half-angle — shadows stay inside the beam. */
  coneHalf?: number;
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
const LIGHT_POOL = 56;
const CONE_POOL = 10;
const POINT_POOL = 16; // must equal the game config's maxLights
const SHADOW_ALPHA = 0.22;

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
  private queue: LightRequest[] = [];
  /** Event-driven transient lights (muzzle flashes, explosions, hits). */
  private transients: TransientLight[] = [];
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
  private shadowsOn = true;
  /** M26: engine PointLights on the normal-mapped plates. */
  private lights2DOn = true;
  private frameEma = 16.7;

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
    this.darkness = scene.add.rectangle(500, 280, 1000, 560, 0x000000, 1).setDepth(2).setVisible(false);
    this.capRelight = scene.add.graphics().setDepth(2.05);
    this.shadows = scene.add.graphics().setDepth(2.2);
    for (let i = 0; i < LIGHT_POOL; i++) {
      const image = scene.add.image(0, 0, RADIAL_KEY).setDepth(2.1).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
      this.lightPool.push(image);
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
    for (const image of this.lightPool) image.setVisible(false);
    for (const image of this.conePool) image.setVisible(false);
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
    if (this.pipeline) {
      this.pipeline.set3f("uAmbientLightColor", poster.ambient[0], poster.ambient[1], poster.ambient[2]);
    }
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
    if (!this.enabled || !this.pipeline || !this.lights2DOn) return;
    if (tier > this.maxTier) return;
    this.pointQueue.push({ x, y, radius, tint, intensity });
  }

  /** Fire-and-forget transient (event-driven): decays over `life` seconds. */
  flash(x: number, y: number, radius: number, tint: number, alpha: number, life: number, grow?: number, point?: number) {
    if (!this.enabled) return;
    this.transients.push({ x, y, radius, tint, alpha, life, maxLife: life, grow, point });
    if (this.transients.length > 24) this.transients = this.transients.slice(-24);
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
    this.frameEma += (deltaMs - this.frameEma) * 0.08;
    if (this.frameEma > 26 && time - this.lastLevelChange > 900) {
      if (!this.enabled) { /* already fully off */ }
      else if (this.shadowsOn) this.shadowsOn = false;
      else if (this.lights2DOn) this.lights2DOn = false;
      else if (this.maxTier > 0) this.maxTier = (this.maxTier - 1) as 0 | 1 | 2;
      else this.setEnabled(false);
      this.frameEma = 24;
      this.lastLevelChange = time;
    } else if (this.frameEma < 15.5 && time - this.lastLevelChange > 2500) {
      if (!this.enabled) {
        this.setEnabled(true);
        this.maxTier = 0;
        this.shadowsOn = false;
        this.lights2DOn = false;
        if (this.mapId) this.setMap(this.mapId);
      } else if (this.maxTier < 2) {
        this.maxTier = (this.maxTier + 1) as 0 | 1 | 2;
      } else if (!this.lights2DOn) {
        this.lights2DOn = true;
      } else if (!this.shadowsOn) {
        this.shadowsOn = true;
      }
      this.frameEma = 18;
      this.lastLevelChange = time;
    }
    if (!this.enabled) return;
    for (const light of this.transients) light.life -= deltaMs / 1000;
    this.transients = this.transients.filter((light) => light.life > 0);
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
    const strikes = 2 + Math.floor(Math.random() * 2);
    for (let index = 0; index < strikes; index++) {
      const x = 120 + Math.random() * 760;
      this.scene.time.delayedCall(index * (90 + Math.random() * 120), () => {
        this.flash(x, -40, 780, 0xcfe4ff, 0.5, 0.16);
        this.flash(x + 30, 60, 420, 0xeaf4ff, 0.35, 0.22, undefined, 1.4);
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
    this.capRelight.setVisible(true);
    this.shadows.clear();
    this.shadows.fillStyle(0x05070c, SHADOW_ALPHA);

    // Static per-map rig (few emitters, drawn every frame from the queue).
    if (this.mapId) this.emitStaticRig(scene.time.now);

    // Resolve additive glow pool.
    let used = 0;
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
      } else {
        if (used >= LIGHT_POOL) continue;
        const image = this.lightPool[used++];
        image.setVisible(true);
        image.setPosition(light.x, light.y);
        image.setScale((light.radius * 2) / 256);
        image.setTint(light.tint);
        image.setAlpha(light.alpha);
      }
      if (this.shadowsOn && light.shadow && light.radius >= 90) shadowJobs.push({ light });
    }
    for (let i = used; i < LIGHT_POOL; i++) this.lightPool[i].setVisible(false);
    for (let i = conesUsed; i < CONE_POOL; i++) this.conePool[i].setVisible(false);
    this.queue.length = 0;

    // Resolve engine PointLights onto the pooled Light objects (16 max —
    // Phaser culls off-camera lights and caps at maxLights anyway).
    this.assigned.length = 0;
    let pointsUsed = 0;
    for (const point of this.pointQueue) {
      if (pointsUsed >= this.pointLights.length) break;
      const light = this.pointLights[pointsUsed++];
      light.x = point.x;
      light.y = point.y;
      light.radius = point.radius;
      const color = Phaser.Display.Color.IntegerToColor(point.tint);
      light.color.set(color.redGL, color.greenGL, color.blueGL);
      light.intensity = point.intensity;
      this.assigned.push(point);
    }
    for (let i = pointsUsed; i < this.pointLights.length; i++) this.pointLights[i].intensity = 0;
    this.pointQueue.length = 0;

    // Shadow projection: for each back-facing edge of each occluder near the
    // light, fill the projected wedge back down to the veil color.
    for (const { light } of shadowJobs) {
      const coneHalf = light.coneHalf;
      for (const rect of occluders) {
        const cx = rect.x + rect.width / 2;
        const cy = rect.y + rect.height / 2;
        const dx = cx - light.x;
        const dy = cy - light.y;
        if (dx * dx + dy * dy > (light.radius + Math.max(rect.width, rect.height)) ** 2) continue;
        if (coneHalf !== undefined) {
          const angle = Math.atan2(dy, dx);
          let delta = angle - (light.angle ?? 0);
          while (delta > Math.PI) delta -= Math.PI * 2;
          while (delta < -Math.PI) delta += Math.PI * 2;
          if (Math.abs(delta) > coneHalf + 0.5) continue;
        }
        this.projectOccluderShadow(light, rect);
      }
    }
    void scene;
  }

  /** Fill shadow wedges for one occluder rect relative to one light. */
  private projectOccluderShadow(light: LightRequest, rect: OccluderRect) {
    const corners = [
      { x: rect.x, y: rect.y },
      { x: rect.x + rect.width, y: rect.y },
      { x: rect.x + rect.width, y: rect.y + rect.height },
      { x: rect.x, y: rect.y + rect.height },
    ];
    const project = (corner: { x: number; y: number }) => {
      const dx = corner.x - light.x;
      const dy = corner.y - light.y;
      const distance = Math.hypot(dx, dy) || 1;
      const reach = Math.min(light.radius * 1.25, distance + light.radius);
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
      const p1 = project(c1);
      const p2 = project(c2);
      this.shadows.fillPoints([c1, c2, p2, p1], true);
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
    }
    if (this.mapId === "fortress") {
      // Sweeping white searchlight cones (the set piece): an ADD volume beam
      // plus a moving PointLight so the beam truly lights the walls it crosses.
      const sweep = Math.sin(time * 0.00042) * 0.55;
      const sweep2 = Math.sin(time * 0.00042 + Math.PI) * 0.55;
      const angleA = 0.6 + sweep;
      const angleB = Math.PI - 0.6 + sweep2;
      this.add({ x: 165, y: 66, radius: 300, tint: 0xdfe8f2, alpha: 0.36, kind: "cone", angle: angleA, shadow: true, coneHalf: 0.42 });
      this.add({ x: 835, y: 66, radius: 300, tint: 0xdfe8f2, alpha: 0.36, kind: "cone", angle: angleB, shadow: true, coneHalf: 0.42 });
      this.addPoint(165 + Math.cos(angleA) * 130, 66 + Math.sin(angleA) * 130, 170, 0xdfe8f2, 0.85);
      this.addPoint(835 + Math.cos(angleB) * 130, 66 + Math.sin(angleB) * 130, 170, 0xdfe8f2, 0.85);
    }
  }

  /** Frame-hooked transient lights (called by the scene before finish()). */
  emitTransients() {
    for (const light of this.transients) {
      const t = Math.max(0, light.life / light.maxLife);
      const radius = light.grow ? light.radius + (1 - t) * light.grow : light.radius;
      this.add({ x: light.x, y: light.y, radius, tint: light.tint, alpha: light.alpha * t });
      if (light.point && this.pipeline) {
        this.addPoint(light.x, light.y, radius * 1.05, light.tint, light.point * t, 0);
      }
    }
  }
}
