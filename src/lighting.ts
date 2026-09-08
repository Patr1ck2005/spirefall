// M25 cinematic lighting: a strong-contrast 2D light pass built entirely from
// pooled textured quads (no per-frame RenderTexture ops — those melted the
// headless perf gate when prototyped).
//
// Stack (all in world space, static camera):
//   depth 2.0  darkness  — a per-map tinted translucent veil (cinematic grade)
//   depth 2.05 capRelight — thin bright strips over platform caps so the
//               "walkable here" signal survives the darkness (M20 readability)
//   depth 2.1  lights    — pooled radial/cone Images, ADD blend, punched
//               through the veil by every emitter (muzzle, projectiles,
//               explosions, pilot headlamps, static rigs)
//   depth 2.2  shadows   — one Graphics projecting back-facing occluder edges
//               away from shadow-casting lights (real occlusion shadows)
//
// The veil darkens; ADD lights restore brightness and color; shadow polygons
// re-darken the veil inside occluded wedges. Everything degrades to the
// pre-M25 look when the FX toggle is off.
import Phaser from "phaser";
import { MAPS, type MapId } from "../shared/game.js";

/** A queued light for the current frame. */
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
   * 1 = nice (headlamps, projectile glows), 2 = luxury (pulses).
   * The adaptive governor drops tiers above its current level.
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
};

export type OccluderRect = { x: number; y: number; width: number; height: number };

/** Per-map cinematic grade: veil color/strength + static rig definitions. */
const MAP_GRADE: Record<MapId, { veil: number; veilAlpha: number }> = {
  canopy: { veil: 0x14263c, veilAlpha: 0.36 },
  fortress: { veil: 0x0a0d18, veilAlpha: 0.5 },
  factory: { veil: 0x1d130a, veilAlpha: 0.46 },
};

const RADIAL_KEY = "light-radial";
const CONE_KEY = "light-cone";
const LIGHT_POOL = 56;
const CONE_POOL = 10;
const SHADOW_ALPHA = 0.22;

/** Deterministic two-frequency flicker in [0.72, 1]. */
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
  private lightningBurst = 0;
  private fortressSweep = 0;
  /** Fire-and-forget hook: the scene plays thunder when lightning strikes. */
  onStrike?: () => void;
  /**
   * Adaptive governor: the max light tier currently admitted. Starts full;
   * a slow frame-time EMA walks it down (shadows off → tier ≤1 → tier ≤0)
   * and recovery walks it back up. Software rasterizers under CI load
   * auto-degrade; real GPUs keep every light.
   */
  private maxTier: 0 | 1 | 2 = 2;
  private shadowsOn = true;
  private frameEma = 16.7;

  constructor(scene: Phaser.Scene) {
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
  }

  /** Re-grade the veil + rebuild static rig state when the map changes. */
  setMap(mapId: MapId) {
    if (this.mapId === mapId) return;
    this.mapId = mapId;
    const grade = MAP_GRADE[mapId];
    this.darkness.setFillStyle(grade.veil, grade.veilAlpha);
    // Platform-cap visibility strips: the walkable signal must survive the
    // cinematic darkness (M20 rule). Brightened accent, one thin strip each.
    const map = MAPS[mapId];
    this.capRelight.clear();
    this.capRelight.fillStyle(0xf2f7f4, 0.2);
    for (const platform of map.platforms) {
      this.capRelight.fillRect(platform.x - 2, platform.y - 1.5, platform.width + 4, 8);
    }
  }

  /** Queue a light for this frame. Cheap — resolved in finish(). */
  add(request: LightRequest) {
    if (!this.enabled) return;
    if ((request.tier ?? 2) > this.maxTier) return;
    this.queue.push(request);
  }

  /** Fire-and-forget transient (event-driven): decays over `life` seconds. */
  flash(x: number, y: number, radius: number, tint: number, alpha: number, life: number, grow?: number) {
    if (!this.enabled) return;
    this.transients.push({ x, y, radius, tint, alpha, life, maxLife: life, grow });
    if (this.transients.length > 24) this.transients = this.transients.slice(-24);
  }

  /** Advance transient decay + governor + map ambience. Call every frame. */
  update(time: number, deltaMs: number) {
    if (!this.mapId) return;
    // Governor: slow EMA of frame time with hysteresis — degrade fast
    // (~0.9s per step) so weak machines shed cost within ~3s, recover slowly
    // (2.5s per step) so the pass never flaps. Runs even when fully off so
    // heavy machines re-enable it once load clears.
    this.frameEma += (deltaMs - this.frameEma) * 0.08;
    if (this.frameEma > 26 && time - this.lastLevelChange > 900) {
      if (!this.enabled) { /* already fully off */ }
      else if (this.shadowsOn) this.shadowsOn = false;
      else if (this.maxTier > 0) this.maxTier = (this.maxTier - 1) as 0 | 1 | 2;
      else this.setEnabled(false);
      this.frameEma = 24;
      this.lastLevelChange = time;
    } else if (this.frameEma < 15.5 && time - this.lastLevelChange > 2500) {
      if (!this.enabled) {
        this.setEnabled(true);
        this.maxTier = 0;
        this.shadowsOn = false;
        if (this.mapId) this.setMap(this.mapId);
      } else if (!this.shadowsOn && this.maxTier === 2) {
        this.shadowsOn = true;
      } else if (this.maxTier < 2) {
        this.maxTier = (this.maxTier + 1) as 0 | 1 | 2;
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
        this.flash(x + 30, 60, 420, 0xeaf4ff, 0.35, 0.22);
      });
    }
    this.onStrike?.();
    this.nextLightning = time + 6000 + Math.random() * 7000;
  }

  /**
   * Resolve the frame: static rig + queued lights onto the pools, then shadow
   * projection for the lights that asked for it. `occluders` are world-space
   * rects (platforms, solids, movers, crates, pilots).
   */
  finish(occluders: OccluderRect[]) {
    const scene = this.scene;
    if (!this.enabled) {
      this.queue.length = 0;
      return;
    }
    this.darkness.setVisible(true);
    this.capRelight.setVisible(true);
    this.shadows.clear();
    this.shadows.fillStyle(0x05070c, SHADOW_ALPHA);

    // Static per-map rig (few emitters, drawn every frame from the queue).
    if (this.mapId) this.emitStaticRig();

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

  /** Per-map set-piece emitters (few, cheap, drawn every frame). */
  private emitStaticRig() {
    const time = this.scene.time.now;
    if (this.mapId === "canopy") {
      // Cyan navigation lamps on the pylons + amber sodium accents.
      for (let index = 0; index < 5; index++) {
        const x = 74 + index * 214;
        const y = 74 + (index % 2) * 45;
        this.add({ x, y, radius: 46, tint: 0x50d5cf, alpha: 0.4 * flicker(time, index * 3.1) });
      }
      this.add({ x: 150, y: 250, radius: 60, tint: 0xe7c884, alpha: 0.16 });
      this.add({ x: 840, y: 300, radius: 60, tint: 0xe7c884, alpha: 0.14 });
    } else if (this.mapId === "fortress") {
      // Twin red beacons + sweeping white searchlight cones (the set piece).
      // Radii are fill-rate budgeted: a software rasterizer pays for every
      // covered pixel, so the cones stay under ~600 screen px.
      const pulse = 0.5 + Math.sin(time * 0.006) * 0.25;
      this.add({ x: 165, y: 66, radius: 70, tint: 0xd43c38, alpha: 0.35 + pulse * 0.3 });
      this.add({ x: 835, y: 66, radius: 70, tint: 0xd43c38, alpha: 0.35 + (1 - pulse) * 0.3 });
      const sweep = Math.sin(time * 0.00042) * 0.55;
      const sweep2 = Math.sin(time * 0.00042 + Math.PI) * 0.55;
      this.add({ x: 165, y: 66, radius: 300, tint: 0xdfe8f2, alpha: 0.36, kind: "cone", angle: 0.6 + sweep, shadow: true, coneHalf: 0.42 });
      this.add({ x: 835, y: 66, radius: 300, tint: 0xdfe8f2, alpha: 0.36, kind: "cone", angle: Math.PI - 0.6 + sweep2, shadow: true, coneHalf: 0.42 });
    } else {
      // Foundry: furnace mouth breathing from below + molten duct glows.
      const breathe = flicker(time, 0) * (0.8 + Math.sin(time * 0.0017) * 0.2);
      this.add({ x: 500, y: 600, radius: 240, tint: 0xf07a2e, alpha: 0.55 * breathe });
      this.add({ x: 174, y: 512, radius: 70, tint: 0xf4a24b, alpha: 0.4 * flicker(time, 5.2) });
      this.add({ x: 539, y: 516, radius: 70, tint: 0xf4a24b, alpha: 0.4 * flicker(time, 2.7) });
      this.add({ x: 909, y: 516, radius: 70, tint: 0xf4a24b, alpha: 0.4 * flicker(time, 8.1) });
    }
  }

  /** Frame-hooked transient lights (called by the scene before finish()). */
  emitTransients() {
    for (const light of this.transients) {
      const t = Math.max(0, light.life / light.maxLife);
      const radius = light.grow ? light.radius + (1 - t) * light.grow : light.radius;
      this.add({ x: light.x, y: light.y, radius, tint: light.tint, alpha: light.alpha * t });
    }
  }
}
