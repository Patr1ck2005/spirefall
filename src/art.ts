import Phaser from "phaser";
import { MAPS, MOVE_TUNING, PLAYER_COLORS, PLAYER_SCALE, WEAPONS, type HazardState, type LimbId, type MapId, type MoverState, type PlayerState, type WeaponId } from "../shared/game";
import { POSTER } from "./palette";
import type { KeyLightSample } from "./lighting";

export const PLAYER_HEX = PLAYER_COLORS.map((color) => `#${color.toString(16).padStart(6, "0")}`) as readonly string[];

export const ARCHETYPES = [
  { name: "BREACHER", role: "HEAVY ENTRY" },
  { name: "WARDEN", role: "BASTION GUARD" },
  { name: "RIGGER", role: "SYSTEMS RAIDER" },
  { name: "HUNTER", role: "CROWN SCOUT" },
] as const;

export const MAP_COPY: Record<MapId, { index: string; title: string; brief: string }> = {
  canopy: { index: "SECTOR 01", title: "THE CROWN", brief: "Freight lifts drift above the storm line." },
  fortress: { index: "SECTOR 02", title: "THE BASTION", brief: "Armored shutters guard the defense spine." },
  factory: { index: "SECTOR 03", title: "THE FOUNDRY", brief: "Assembly lines feed the furnace below." },
};

const hex = (color: number) => `#${color.toString(16).padStart(6, "0")}`;

// M24 weapon visual scale: guns draw 1.35× bigger relative to the pilot so
// silhouettes read at a glance. Purely cosmetic — projectile spawn and hit
// geometry are unchanged (server origin stays at player.x + facing*12).
export const WEAPON_VISUAL_SCALE = 1.35;

// M24: world-px distance from the player's center line to each muzzle tip
// with the enlarged guns (hand offset 19 + barrel length, at PLAYER_SCALE ×
// WEAPON_VISUAL_SCALE). The client anchors muzzle flashes and shifts tracer
// starts by (MUZZLE_OFFSET - 12) so effects bloom at the barrel, not inside it.
export const MUZZLE_OFFSET: Record<WeaponId, number> = {
  sidearm: 22,
  scatter: 34,
  rifle: 32,
  sniper: 36,
  rocket: 32,
  blade: 12,
  echo: 20,
};

/** Per-weapon transient draw state fed from the scene's animation maps. */
export type WeaponDrawFx = {
  /** Rifle barrel heat, 1 right after firing → 0. */
  heat?: number;
  /** Voltrail charge fraction for coil glow. */
  charge?: number;
  /** Wall-clock ms for bob/shimmer phases. */
  time?: number;
  /** Active blade swing (progress 0..1). */
  swing?: { progress: number; secondary: boolean };
};

/**
 * M26: the scene plates (sceneplate.ts) ARE the environment. This fallback
 * only paints the flat poster field while/without plates — Canvas renderers
 * and the frames before plate textures exist. Structure lives in the plates.
 */
export function drawEnvironment(graphics: Phaser.GameObjects.Graphics, mapId: MapId, _time: number, platesLoaded = false) {
  if (platesLoaded) return;
  const poster = POSTER[mapId];
  graphics.fillStyle(poster.skyTop, 1);
  graphics.fillRect(0, 0, 1000, 232);
  graphics.fillStyle(poster.sky, 1);
  graphics.fillRect(0, 232, 1000, 328);
  graphics.fillStyle(poster.fog, 0.3);
  graphics.fillRect(0, 258, 1000, 46);
}

export function drawMover(graphics: Phaser.GameObjects.Graphics, mover: MoverState, accent: number, time: number) {
  // Travel rail along the movement axis so riders can read the path.
  const def = Object.values(MAPS).flatMap((map) => map.movers).find((candidate) => candidate.id === mover.id);
  if (def) {
    const endX = def.x + (def.travelX || 0);
    const endY = def.y + (def.travelY || 0);
    graphics.lineStyle(1, accent, 0.14);
    if ((def.travelX || 0) !== 0) graphics.lineBetween(Math.min(def.x, endX), def.y + def.height / 2, Math.max(def.x, endX) + def.width, def.y + def.height / 2);
    else graphics.lineBetween(def.x + def.width / 2, Math.min(def.y, endY), def.x + def.width / 2, Math.max(def.y, endY) + def.height);
  }
  const pulse = 0.6 + Math.sin(time * 0.005 + mover.x * 0.01) * 0.16;
  graphics.fillStyle(0x0b0e10, 0.66);
  graphics.fillRect(mover.x + 4, mover.y + 7, mover.width - 8, Math.max(8, mover.height + 9));
  graphics.fillStyle(0x3d4548, 1);
  graphics.fillRect(mover.x, mover.y, mover.width, mover.height);
  for (let x = mover.x + 10; x < mover.x + mover.width - 8; x += 22) {
    graphics.fillStyle(accent, pulse);
    graphics.fillRect(x, mover.y + mover.height / 2 - 1, 10, 2);
  }
  graphics.fillStyle(accent, 0.85);
  graphics.fillRect(mover.x, mover.y, mover.width, 2);
}

export function drawHazard(graphics: Phaser.GameObjects.Graphics, hazard: HazardState, accent: number, time: number) {
  if (hazard.kind === "cargoLift") {
    graphics.lineStyle(2, 0x111619, 0.9);
    graphics.lineBetween(hazard.x + 12, 0, hazard.x + 12, hazard.y);
    graphics.lineBetween(hazard.x + hazard.width - 12, 0, hazard.x + hazard.width - 12, hazard.y);
    graphics.fillStyle(0x242c2f, 1);
    graphics.fillRect(hazard.x, hazard.y, hazard.width, hazard.height);
    graphics.fillStyle(accent, 0.85);
    graphics.fillRect(hazard.x, hazard.y, hazard.width, 3);
    for (let x = hazard.x + 8; x < hazard.x + hazard.width; x += 20) {
      graphics.fillStyle(x % 40 < 20 ? 0xd8a83e : 0x1a1d1e, 0.8);
      graphics.fillTriangle(x, hazard.y + 5, x + 12, hazard.y + 5, x + 6, hazard.y + 13);
    }
    return;
  }
  if (hazard.kind === "conveyor") {
    graphics.fillStyle(0x171b19, 1);
    graphics.fillRect(hazard.x, hazard.y - 4, hazard.width, 11);
    const offset = (time * 0.08) % 32;
    for (let x = hazard.x - 32 + offset; x < hazard.x + hazard.width; x += 32) {
      graphics.fillStyle(0xd27b36, 0.85);
      graphics.fillRect(x, hazard.y - 2, 18, 3);
    }
    return;
  }
  const warning = hazard.phase === "warning";
  const active = hazard.phase === "active";
  graphics.fillStyle(0x171a1b, 1);
  graphics.fillRect(hazard.x, hazard.y, hazard.width, hazard.height);
  graphics.fillStyle(active ? 0xc13b34 : warning ? 0xe0a43c : 0x42494b, active ? 0.9 : 0.65);
  graphics.fillRect(hazard.x, hazard.y + hazard.height - 8, hazard.width, 8);
  graphics.lineStyle(2, 0x9ba2a3, 0.25);
  for (let y = hazard.y + 12; y < hazard.y + hazard.height - 10; y += 22) graphics.lineBetween(hazard.x + 8, y, hazard.x + hazard.width - 8, y);
  if (warning) {
    graphics.fillStyle(0xf0b342, 0.25 + Math.sin(time * 0.02) * 0.18);
    graphics.fillRect(hazard.x - 8, hazard.y + hazard.height, hazard.width + 16, 42);
  }
}

export function drawCrate(graphics: Phaser.GameObjects.Graphics, x: number, y: number, weaponId: WeaponId, time: number, generation = 1, kind: "weapon" | "repair" = "weapon", light?: KeyLightSample) {
  const weapon = WEAPONS[weaponId];
  const special = kind === "repair" || !["sidearm", "scatter", "rifle"].includes(weaponId);
  const pulse = 0.72 + Math.sin(time * (special ? 0.008 : 0.004) + generation) * (special ? 0.22 : 0.1);
  const bob = Math.sin(time * 0.004 + x) * 3;
  const tint = kind === "repair" ? 0x4fd07a : weapon.color;
  // M26 light response: the box face warms toward the key light.
  const face = light && light.intensity > 0.05 ? mixColor(kind === "repair" ? 0x10201a : special ? 0x1d2425 : 0x242b2e, light.color, Math.min(0.3, light.intensity * 0.35)) : kind === "repair" ? 0x10201a : special ? 0x1d2425 : 0x242b2e;
  graphics.fillStyle(0x080b0d, 0.55);
  graphics.fillEllipse(x, y + 20, 38, 10);
  graphics.fillStyle(face, 1);
  graphics.fillRect(x - 16, y - 16 + bob, 32, 32);
  graphics.lineStyle(special ? 3 : 2, tint, pulse);
  graphics.strokeRect(x - 16, y - 16 + bob, 32, 32);
  if (kind === "repair") {
    // Green cross for the repair cell.
    graphics.fillStyle(tint, pulse);
    graphics.fillRect(x - 11, y - 3.5 + bob, 22, 7);
    graphics.fillRect(x - 3.5, y - 11 + bob, 7, 22);
  } else {
    graphics.fillStyle(weapon.color, pulse);
    graphics.fillRect(x - 12, y - 4 + bob, 24, 8);
    graphics.fillRect(x - 4, y - 12 + bob, 8, 24);
  }
  graphics.fillStyle(0xf4e1ae, special ? 0.85 : 0.55);
  graphics.fillCircle(x, y + bob, special ? 4 : 2.5);
  if (special) {
    graphics.lineStyle(1, tint, 0.55);
    graphics.lineBetween(x, y - 24 + bob, x, y - 36 + bob);
    graphics.fillStyle(tint, 0.28 * pulse);
    graphics.fillTriangle(x, y - 36 + bob, x - 5, y - 24 + bob, x + 5, y - 24 + bob);
  }
}

/**
 * M25: an explosive barrel. Cylindrical rust-red drum, hazard band, valve cap.
 * As HP grinds down, glowing cracks leak fire light — damaged barrels become
 * visible targets. `y` is the platform surface the barrel sits on.
 */
export function drawProp(graphics: Phaser.GameObjects.Graphics, prop: { x: number; y: number; hp: number }, time: number, light?: KeyLightSample) {
  const x = prop.x;
  const groundY = prop.y;
  const damageFraction = Math.max(0, Math.min(1, prop.hp / 30));
  // M26 light response: warm the lit band toward the key light.
  const bandLit = light && light.intensity > 0.05 ? mixColor(0x9a3a24, light.color, Math.min(0.4, light.intensity * 0.4)) : 0x9a3a24;
  // Body: tapered drum with three shading bands (left shadow, core, right light).
  graphics.fillStyle(0x080b0d, 0.5);
  graphics.fillEllipse(x, groundY + 1, 26, 6);
  const topY = groundY - 24;
  graphics.fillStyle(0x5c1f16, 1);
  graphics.fillRect(x - 9, topY, 18, 24);
  graphics.fillStyle(0x7d2c1d, 1);
  graphics.fillRect(x - 6, topY, 9, 24);
  graphics.fillStyle(bandLit, 1);
  graphics.fillRect(x + 2, topY, 4, 24);
  // Rim rings (top lip + mid seam + foot).
  graphics.fillStyle(0x3f1610, 1);
  graphics.fillRect(x - 9, topY, 18, 2);
  graphics.fillRect(x - 9, topY + 11, 18, 2);
  graphics.fillRect(x - 10, groundY - 3, 20, 3);
  // Hazard band: diagonal warning stripes on a dark plate.
  graphics.fillStyle(0x191512, 1);
  graphics.fillRect(x - 9, topY + 4, 18, 5);
  graphics.fillStyle(0xe0a43c, 0.9);
  for (let stripe = -1; stripe < 3; stripe++) {
    graphics.fillPoints([
      { x: x + stripe * 6 + 1, y: topY + 9 },
      { x: x + stripe * 6 + 4, y: topY + 4 },
      { x: x + stripe * 6 + 6, y: topY + 4 },
      { x: x + stripe * 6 + 3, y: topY + 9 },
    ], true);
  }
  // Valve cap on top.
  graphics.fillStyle(0x8a8f92, 1);
  graphics.fillRect(x - 2.5, topY - 2.5, 5, 2.5);
  // Damage state: glowing cracks leak fire below 60% hp; below 30% they flicker hard.
  if (damageFraction < 0.6) {
    const intensity = (0.6 - damageFraction) / 0.6;
    const flicker = 0.7 + Math.sin(time * (damageFraction < 0.3 ? 0.03 : 0.012) + x) * 0.3;
    const glow = intensity * flicker;
    graphics.lineStyle(1.2, 0xffb254, glow);
    graphics.lineBetween(x - 4, topY + 6, x - 1, topY + 12);
    graphics.lineBetween(x - 1, topY + 12, x - 5, topY + 19);
    graphics.lineBetween(x + 3, topY + 8, x + 5, topY + 16);
    graphics.fillStyle(0xf0873c, glow * 0.7);
    graphics.fillCircle(x - 1, topY + 12, 1.6);
    // A wisp of fire escapes at high damage.
    if (damageFraction < 0.3 && flicker > 0.75) {
      graphics.fillStyle(0xffc06a, 0.55 * glow);
      graphics.fillTriangle(x - 2, topY + 6, x, topY - 4, x + 2, topY + 6);
    }
  }
}

export function drawProjectile(graphics: Phaser.GameObjects.Graphics, projectile: { weaponId: WeaponId; secondary: boolean; pattern?: string; x: number; y: number; vx: number; vy: number; radius: number; bouncesRemaining?: number }, time = 0) {
  const color = WEAPONS[projectile.weaponId].color;
  const speed = Math.hypot(projectile.vx, projectile.vy) || 1;
  const isRocket = projectile.weaponId === "rocket";
  const isFlame = projectile.weaponId === "scatter" && projectile.secondary;
  const isShard = projectile.pattern === "bounce";
  const trailLength = isRocket ? 46 : isFlame ? 20 : isShard ? 26 : projectile.pattern === "cluster" ? 30 : projectile.pattern === "piercing" ? 52 : projectile.secondary ? 24 : 14;
  const trailX = projectile.x - projectile.vx / speed * trailLength;
  const trailY = projectile.y - projectile.vy / speed * trailLength;
  if (isFlame) {
    graphics.fillStyle(0xf06b2f, 0.55);
    graphics.fillCircle(projectile.x, projectile.y, projectile.radius + 3 + Math.random() * 2);
    graphics.fillStyle(0xf0a14a, 0.8);
    graphics.fillCircle(projectile.x, projectile.y, projectile.radius);
    return;
  }
  // Echo Shard: spinning resonant shard — an elongated diamond along the
  // flight vector with twin afterimage ghosts; remaining bounces brighten it.
  if (isShard) {
    const ux = projectile.vx / speed;
    const uy = projectile.vy / speed;
    const glow = 0.5 + 0.14 * (projectile.bouncesRemaining ?? 0);
    // M24: occasional crystal glint as the shard tumbles through the air.
    const glint = time > 0 && Math.sin(time * 0.02 + projectile.x * 0.7 + projectile.y) > 0.86;
    for (let ghost = 2; ghost >= 1; ghost--) {
      const gx = projectile.x - ux * 9 * ghost;
      const gy = projectile.y - uy * 9 * ghost;
      graphics.fillStyle(color, 0.16 * ghost);
      graphics.fillCircle(gx, gy, projectile.radius + 1);
    }
    graphics.fillStyle(color, glow);
    graphics.fillPoints([
      { x: projectile.x + ux * 7, y: projectile.y + uy * 7 },
      { x: projectile.x - uy * 3, y: projectile.y + ux * 3 },
      { x: projectile.x - ux * 7, y: projectile.y - uy * 7 },
      { x: projectile.x + uy * 3, y: projectile.y - ux * 3 },
    ], true);
    // Dark under-stroke first: the light-blue shard must hold its silhouette
    // against Canopy's bright cloud band, not just the dark factory.
    graphics.lineStyle(2.5, 0x12181c, 0.9);
    graphics.strokePoints([
      { x: projectile.x + ux * 7, y: projectile.y + uy * 7 },
      { x: projectile.x - uy * 3, y: projectile.y + ux * 3 },
      { x: projectile.x - ux * 7, y: projectile.y - uy * 7 },
      { x: projectile.x + uy * 3, y: projectile.y - ux * 3 },
    ], true);
    graphics.lineStyle(1.5, glint ? 0xffffff : 0xeaf6ff, glint ? 1 : 0.85);
    graphics.strokePoints([
      { x: projectile.x + ux * 7, y: projectile.y + uy * 7 },
      { x: projectile.x - uy * 3, y: projectile.y + ux * 3 },
      { x: projectile.x - ux * 7, y: projectile.y - uy * 7 },
      { x: projectile.x + uy * 3, y: projectile.y - ux * 3 },
    ], true);
    return;
  }
  // Rocket exhaust: hot core then fading smoke puffs along the tail.
  if (isRocket) {
    for (let index = 1; index <= 3; index++) {
      const t = index / 3;
      graphics.fillStyle(index === 1 ? 0xffc06a : 0x5c5148, (1 - t) * (index === 1 ? 0.8 : 0.3));
      graphics.fillCircle(projectile.x - projectile.vx / speed * 14 * index, projectile.y - projectile.vy / speed * 14 * index, 4 - index * 0.8);
    }
  }
  // Piercing rounds streak with a bright afterimage line plus a soft glow bead.
  if (projectile.pattern === "piercing") {
    graphics.fillStyle(color, 0.35);
    graphics.fillCircle(trailX, trailY, 3.5);
    graphics.lineStyle(1.5, 0xffefc3, 0.5);
    graphics.lineBetween(projectile.x, projectile.y, trailX, trailY);
  }
  graphics.lineStyle(isRocket ? 7 : projectile.pattern === "piercing" ? 4 : projectile.secondary ? 5 : 3, isRocket ? 0xf06b2f : color, 0.34);
  graphics.lineBetween(projectile.x, projectile.y, trailX, trailY);
  graphics.fillStyle(isRocket ? 0xffc06a : projectile.pattern === "cluster" ? 0xffc06a : 0xf7e7bd, 1);
  if (projectile.pattern === "piercing") {
    graphics.fillTriangle(projectile.x + projectile.vx / speed * 5, projectile.y + projectile.vy / speed * 5, trailX, trailY + 3, trailX, trailY - 3);
  } else {
    graphics.fillCircle(projectile.x, projectile.y, Math.max(2, projectile.radius));
  }
  graphics.lineStyle(2, color, 0.9);
  graphics.strokeCircle(projectile.x, projectile.y, projectile.radius + 2);
}

/** M25 armor palette: value-structured plating — bright enough to hold the
 * silhouette against Canopy's bright sky and Fortress's graphite dark. */
type ArmorPalette = { base: number; mid: number; hi: number; dark: number };
const armorPalette = (flash: boolean): ArmorPalette =>
  flash
    ? { base: 0xf4f6f2, mid: 0xffffff, hi: 0xffffff, dark: 0xd9dfdc }
    : { base: 0x46525a, mid: 0x5d6c75, hi: 0x84969f, dark: 0x242d31 };

/** Channel mix between two 0xRRGGBB colors. */
export function mixColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

/**
 * M26 light response: warm the armor set toward the sampled key light (and
 * cool the shadows). No light → the neutral set (identical to pre-M26 look).
 */
function lightShades(armor: ArmorPalette, light?: KeyLightSample): ArmorPalette {
  if (!light || light.intensity <= 0.02) return armor;
  const c = light.color;
  const k = Math.min(0.5, light.intensity * 0.42);
  return {
    base: mixColor(armor.base, c, k * 0.8),
    mid: mixColor(armor.mid, c, k),
    hi: mixColor(armor.hi, c, k * 0.9),
    dark: mixColor(armor.dark, 0x05070a, Math.min(0.35, light.intensity * 0.3)),
  };
}

/** M25: a plated limb segment — dark underlay + base fill (perf: 2 passes). */
function limbSegment(
  graphics: Phaser.GameObjects.Graphics,
  x1: number, y1: number, x2: number, y2: number,
  width: number, outline: number, base: number,
) {
  graphics.lineStyle(width + 1.3, outline, 1);
  graphics.lineBetween(x1, y1, x2, y2);
  graphics.lineStyle(width, base, 1);
  graphics.lineBetween(x1, y1, x2, y2);
}

export type PlayerDrawFx = {
  /** Squash/stretch factor: 1 = neutral, >1 stretched (rising), <1 squashed (landing). */
  squash?: number;
  /** Active blade swing state. */
  swing?: { progress: number; secondary: boolean };
  /** Dash afterimages live in the scene; art draws the elongated blade slash when set. */
  dashSlash?: boolean;
};

export function drawPlayer(
  graphics: Phaser.GameObjects.Graphics,
  player: PlayerState,
  x: number,
  y: number,
  time: number,
  isSelf: boolean,
  fx?: PlayerDrawFx,
  light?: KeyLightSample,
) {
  const s = PLAYER_SCALE;
  const color = player.color;
  const facing = player.facing;
  // M24b: animation speed normalization against the real equilibrium speed —
  // the old /220 divisor meant the run cycle never reached full amplitude.
  const moving = Math.min(1, Math.abs(player.vx) / (MOVE_TUNING.maxSpeed * 0.97));
  // M24b: distance-locked gait phase (feet plant where they touch, no
  // moonwalking) — phase advances with x, not the wall clock.
  const gait = player.x * 0.085;
  // M24: idle breathing — a slow 1px lift when standing still keeps pilots
  // alive on screen even before they move.
  const breathing = moving < 0.05 && player.onGround ? Math.sin(time * 0.0035 + player.x) * 0.9 : 0;
  const bob = (player.onGround ? Math.abs(Math.sin(gait)) * -1.8 * moving : -2) + breathing;
  const lean = clampAngle(player.vx / 55, -6, 6);
  // M24 squash & stretch: a canvas-space scale around the foot anchor —
  // rising stretches (fast vertical speed), landing squashes. The whole
  // silhouette keeps its mass via the reciprocal horizontal scale.
  const squash = clampAngle(fx?.squash ?? 1, 0.82, 1.18);
  const flash = player.hitFlash > 0;
  // M25 armor palette: dark industrial base with bevel steps so plating reads.
  // M26: the set warms toward the strongest nearby light (sampleLight) — the
  // pilot visibly reacts to the environment without carrying a light.
  const armor = lightShades(armorPalette(flash), light);
  const keySide = light ? (light.dirX >= 0 ? 1 : -1) : 0;
  const bodyX = x + lean * s;
  // M25 anchor fix: boots rest ON the platform surface. The old +14 body
  // offset put the boot line ~7px below the walkable cap — the rig visibly
  // sank into the floor. Derived: boot bottom = 0.5·C + 3.85 → C = 2.5 puts
  // it at PLAYER_FOOT_OFFSET + 1 (1px bite into the cap for contact feel).
  const bodyY = y + (bob + 2.5) * s;

  graphics.save();
  graphics.translateCanvas(x, y);
  graphics.scaleCanvas(1 / Math.sqrt(squash), squash);
  graphics.translateCanvas(-x, -y);

  // Contact shadow: one soft ellipse (perf: the halo variant cost a fill per
  // frame per pilot for ~2px of visible spread).
  graphics.fillStyle(0x050708, 0.45);
  graphics.fillEllipse(x, y + 3, 34, 7);

  // M24b limb poses: a run gait (legs counter-swing with knee flexion) blends
  // into an airborne pose (tuck on the way up, reach on the way down).
  const airBlend = player.onGround ? 0 : clampAngle(Math.abs(player.vy) / 320, 0, 1);
  const rising = player.vy < 0;
  const airLeg: LegPose = rising ? { hip: 0.75, knee: 1.35 } : { hip: 0.2, knee: 0.42 };
  const leftPose = blendPose({ hip: Math.sin(gait) * 0.8 * moving, knee: 0.28 + Math.max(0, Math.sin(gait + 2.2)) * 0.7 * moving }, airLeg, airBlend);
  const rightPose = blendPose({ hip: Math.sin(gait + Math.PI) * 0.8 * moving, knee: 0.28 + Math.max(0, Math.sin(gait + Math.PI + 2.2)) * 0.7 * moving }, { hip: -airLeg.hip * 0.55, knee: airLeg.knee * 0.85 }, airBlend);

  // --- M25 behind-torso layer: Warden coat flaps + Rigger backpack ---
  if (player.archetype === 1) {
    // Twin coat tails swing against the motion (cloth drag) and with the
    // gait — the Warden's signature silhouette from behind.
    const sway = clampAngle(-player.vx / 420, -0.55, 0.55) + Math.sin(gait) * 0.14 * moving;
    for (const side of [-1, 1]) {
      const topX = bodyX + side * 4.5 * s;
      const topY = bodyY - 14 * s;
      const hang = (15 + (side === -1 ? 3 : 0)) * s;
      const tipX = topX + sway * 14 * s + side * 1.5 * s;
      const tipY = topY + hang;
      graphics.fillStyle(0x20282c, 0.96);
      graphics.fillPoints([
        { x: topX - 3.5 * s, y: topY },
        { x: topX + 3.5 * s, y: topY },
        { x: tipX + 2.2 * s, y: tipY },
        { x: tipX - 2.2 * s, y: tipY },
      ], true);
      graphics.lineStyle(1 * s, color, 0.4);
      graphics.lineBetween(topX, topY + 2 * s, tipX, tipY - 1.5 * s);
    }
  }
  if (player.archetype === 2) {
    // Systems raider: tool pack rides the back with a wrench handle above it.
    const backX = bodyX - facing * (28 * s / 2 + 3 * s);
    graphics.fillStyle(0x1a2124, 1);
    graphics.fillRect(backX - 5 * s, bodyY - 44 * s, 10 * s, 16 * s);
    graphics.fillStyle(0x30393e, 1);
    graphics.fillRect(backX - 3.5 * s, bodyY - 42 * s, 7 * s, 5 * s);
    graphics.lineStyle(1.6 * s, 0xb8733a, 0.95);
    graphics.lineBetween(backX, bodyY - 44 * s, backX + 2 * s, bodyY - 51 * s);
  }

  const shoulderWidth = [38, 31, 35, 27][player.archetype];
  const torsoWidth = [28, 24, 25, 21][player.archetype];
  const tw = torsoWidth * s;
  const armY = bodyY - 38 * s;
  // M25: the far-side arm is dropped — at 0.5× scale it hides behind the
  // torso and cost 5 draws per pilot per frame. The weapon arm carries the
  // pose; the run cycle reads through legs + torso bob.
  const recoil = Math.max(player.primaryCooldown / Math.max(0.01, WEAPONS[player.weapon].primary.cooldown), player.secondaryCooldown / Math.max(0.01, WEAPONS[player.weapon].secondary.cooldown));
  const gunKick = Math.min(8, recoil * 5) * s;
  const gripX = bodyX + facing * (19 * s) - facing * gunKick;
  const gripY = armY + 4 * s;

  drawLeg(graphics, player, "leftLeg", bodyX - 6 * s, bodyY - 12 * s, leftPose, armor, color, s, false);
  drawLeg(graphics, player, "rightLeg", bodyX + 6 * s, bodyY - 12 * s, rightPose, armor, color, s, true);

  // --- M25 torso: layered plating (pelvis, outline slab, base, chest inset,
  // top bevel highlight, service stripe, belt + buckle). Flat rects — at 0.5×
  // player scale the rounded corners cost more than they show.
  graphics.fillStyle(armor.dark, 1);
  graphics.fillRect(bodyX - tw * 0.42, bodyY - 18 * s, tw * 0.84, 9 * s);
  graphics.fillRect(bodyX - tw / 2 - 1.2 * s, bodyY - 48.2 * s, tw + 2.4 * s, 33.4 * s);
  graphics.fillStyle(armor.base, 1);
  graphics.fillRect(bodyX - tw / 2, bodyY - 47 * s, tw, 31 * s);
  graphics.fillStyle(armor.mid, 1);
  graphics.fillRect(bodyX - tw * 0.36, bodyY - 44 * s, tw * 0.72, 19 * s);
  graphics.fillStyle(armor.hi, 0.85);
  graphics.fillRect(bodyX - tw * 0.4, bodyY - 47 * s, tw * 0.8, 2.2 * s);
  graphics.fillStyle(color, 0.95);
  graphics.fillRect(bodyX - tw / 2, bodyY - 43.5 * s, 3.6 * s, 17 * s);
  graphics.fillStyle(0x101517, 1);
  graphics.fillRect(bodyX - tw / 2, bodyY - 18 * s, tw, 3.6 * s);
  graphics.fillStyle(color, 0.6);
  graphics.fillRect(bodyX - 2 * s, bodyY - 17.4 * s, 4 * s, 2.4 * s);

  // --- M25 archetype gear (front layer) ---
  if (player.archetype === 0) {
    // Heavy entry: twin pauldrons with color trim + hazard chevron plate.
    for (const side of [-1, 1]) {
      const padX = bodyX + side * (shoulderWidth * s / 2) - 5 * s;
      graphics.fillStyle(armor.dark, 1);
      graphics.fillRect(padX, bodyY - 51 * s, 10 * s, 6.5 * s);
      graphics.lineStyle(1.2 * s, color, 0.8);
      graphics.lineBetween(padX + 1 * s, bodyY - 45.5 * s, padX + 9 * s, bodyY - 45.5 * s);
    }
    graphics.fillStyle(0xe0a43c, 0.75);
    graphics.fillTriangle(bodyX + tw * 0.1, bodyY - 34 * s, bodyX + tw * 0.42, bodyY - 30 * s, bodyX + tw * 0.1, bodyY - 26 * s);
  } else if (player.archetype === 1) {
    // Bastion guard: high collar above the chest line.
    graphics.fillStyle(armor.mid, 1);
    graphics.fillPoints([
      { x: bodyX - 8 * s, y: bodyY - 46 * s },
      { x: bodyX + 8 * s, y: bodyY - 46 * s },
      { x: bodyX + 5 * s, y: bodyY - 52 * s },
      { x: bodyX - 5 * s, y: bodyY - 52 * s },
    ], true);
    graphics.fillStyle(armor.hi, 0.7);
    graphics.fillRect(bodyX - 5 * s, bodyY - 52 * s, 10 * s, 1.4 * s);
  } else if (player.archetype === 2) {
    // Systems raider: asymmetric harness strap across the chest.
    graphics.lineStyle(2.4 * s, 0x15191c, 1);
    graphics.lineBetween(bodyX + tw * 0.3, bodyY - 47 * s, bodyX - tw * 0.25, bodyY - 26 * s);
    graphics.fillStyle(0xb8733a, 0.9);
    graphics.fillCircle(bodyX + tw * 0.02, bodyY - 36 * s, 1.6 * s);
  } else {
    // Crown scout: knife sheath on the rear hip.
    const sheathX = bodyX - facing * tw * 0.5;
    graphics.fillStyle(0x39434a, 1);
    graphics.fillRect(sheathX - 2 * s, bodyY - 22 * s, 4.5 * s, 8 * s);
    graphics.fillStyle(0xbfcbd0, 0.9);
    graphics.fillRect(sheathX - 1.2 * s, bodyY - 15.5 * s, 3 * s, 1.2 * s);
  }

  // --- M25 head: archetype helmet shell (outline → base → crown rim light)
  // with an emissive pilot-color visor that doubles as a tiny light source.
  // Flat rects/quads — rounded corners are invisible at 0.5× scale.
  const headY = bodyY - 58 * s;
  graphics.fillStyle(armor.dark, 1);
  if (player.archetype === 0) {
    graphics.fillRect(bodyX - 15 * s, headY - 10 * s, 30 * s, 21.5 * s);
  } else if (player.archetype === 1) {
    graphics.fillRect(bodyX - 12 * s, headY - 11 * s, 24 * s, 22.5 * s);
    // collar spike crest
    graphics.fillTriangle(bodyX - 3 * s, headY - 10.5 * s, bodyX + 3 * s, headY - 10.5 * s, bodyX + 1 * s, headY - 16 * s);
  } else if (player.archetype === 2) {
    graphics.fillRect(bodyX - 12 * s, headY - 11 * s, 25 * s, 22.5 * s);
    // radio antenna with a color beacon tip
    graphics.lineStyle(1 * s, armor.mid, 1);
    graphics.lineBetween(bodyX - facing * 8 * s, headY - 8 * s, bodyX - facing * 12 * s, headY - 16 * s);
    graphics.fillStyle(color, 0.9);
    graphics.fillCircle(bodyX - facing * 12 * s, headY - 16 * s, 1.2 * s);
  } else {
    graphics.fillPoints([
      { x: bodyX - 10.5 * s, y: headY + 10.5 * s },
      { x: bodyX - 8.5 * s, y: headY - 8.5 * s },
      { x: bodyX + 6.5 * s, y: headY - 10.5 * s },
      { x: bodyX + 10.5 * s, y: headY + 10.5 * s },
    ], true);
  }
  graphics.fillStyle(armor.base, 1);
  if (player.archetype === 0) graphics.fillRect(bodyX - 14 * s, headY - 9 * s, 28 * s, 20 * s);
  else if (player.archetype === 1) graphics.fillRect(bodyX - 11 * s, headY - 10 * s, 22 * s, 21 * s);
  else if (player.archetype === 2) graphics.fillRect(bodyX - 11 * s, headY - 10 * s, 23 * s, 21 * s);
  else graphics.fillPoints([
    { x: bodyX - 10 * s, y: headY + 10 * s },
    { x: bodyX - 8 * s, y: headY - 8 * s },
    { x: bodyX + 6 * s, y: headY - 10 * s },
    { x: bodyX + 10 * s, y: headY + 10 * s },
  ], true);
  // crown rim light from above
  graphics.lineStyle(1.1 * s, armor.hi, 0.8);
  graphics.lineBetween(bodyX - 6 * s, headY - 8.2 * s, bodyX + 5 * s, headY - 8.6 * s);
  // M26 key-light rim: a single accent stroke on the lit side of the helmet.
  if (light && light.intensity > 0.18 && keySide !== 0) {
    graphics.lineStyle(1.4 * s, mixColor(armor.hi, light.color, 0.55), Math.min(0.95, light.intensity));
    if (keySide > 0) graphics.lineBetween(bodyX + 2 * s, headY - 8.8 * s, bodyX + 10 * s, headY - 7 * s);
    else graphics.lineBetween(bodyX - 10 * s, headY - 7 * s, bodyX - 2 * s, headY - 8.8 * s);
  }
  // emissive visor slit with a soft pulse
  const visorPulse = 0.82 + Math.sin(time * 0.006 + player.x) * 0.12;
  graphics.fillStyle(color, visorPulse);
  if (player.archetype === 0) graphics.fillRect(bodyX + (facing > 0 ? 1 : -11) * s, headY - 3 * s, 10 * s, 4 * s);
  else if (player.archetype === 1) graphics.fillRect(bodyX - 7 * s, headY - 3 * s, 14 * s, 3.5 * s);
  else if (player.archetype === 2) graphics.fillRect(bodyX - 7 * s, headY - 4 * s, 14 * s, 4.5 * s);
  else graphics.fillRect(bodyX + (facing > 0 ? 0 : -9) * s, headY - 2 * s, 9 * s, 3 * s);
  if (player.archetype === 2) {
    // amber goggle lenses over the visor band
    graphics.fillStyle(0xf0a24a, 0.95);
    graphics.fillCircle(bodyX - 3.5 * s, headY - 1.5 * s, 2.4 * s);
    graphics.fillCircle(bodyX + 4 * s, headY - 1.5 * s, 2.4 * s);
  }

  // --- M25 weapon arm (front layer, tracks the grip incl. recoil kick) ---
  drawArm(graphics, player, "rightArm", bodyX + facing * 3 * s, armY + 2 * s, gripX - facing * 3 * s, gripY - 1 * s, armor, color, s, false);

  // M24b: the gun bobs subtly with the gait while running.
  const gunBob = Math.sin(gait * 2) * 1.1 * moving * s;
  drawWeapon(graphics, player.weapon, bodyX + facing * 19 * s, armY + 4 * s + gunBob, facing, recoil, s, fx);

  // M24: active dash slash leaves an arc slash streak along the dash line.
  if (fx?.dashSlash) {
    const t = fx.swing ? fx.swing.progress : 0;
    const alpha = 1 - t;
    graphics.lineStyle(5 * (1 - t * 0.5), 0xf5f0dc, alpha * 0.8);
    graphics.lineBetween(bodyX - facing * 26 * s, armY + 8 * s, bodyX + facing * 46 * s, armY - 6 * s);
    graphics.lineStyle(2, color, alpha * 0.9);
    graphics.lineBetween(bodyX - facing * 22 * s, armY + 12 * s, bodyX + facing * 42 * s, armY - 2 * s);
  }

  if (player.invulnerable > 0) {
    graphics.lineStyle(1, color, 0.28 + Math.sin(time * 0.024) * 0.16);
    graphics.strokeCircle(bodyX, bodyY - 31 * s, 31 * s);
  }
  if (isSelf) {
    graphics.lineStyle(1, 0xf2f5ed, 0.85);
    graphics.strokeCircle(bodyX, bodyY - 31 * s, 35 * s);
    graphics.fillStyle(color, 0.95);
    graphics.fillTriangle(bodyX - 5 * s, bodyY - 75 * s, bodyX + 5 * s, bodyY - 75 * s, bodyX, bodyY - 68 * s);
  }
  graphics.restore();
}

/** M24b: one limb pose — angles in radians, hip measured off straight-down. */
type LegPose = { hip: number; knee: number };

const blendPose = (a: LegPose, b: LegPose, t: number): LegPose => ({
  hip: a.hip + (b.hip - a.hip) * t,
  knee: a.knee + (b.knee - a.knee) * t,
});

function drawLeg(
  graphics: Phaser.GameObjects.Graphics,
  player: PlayerState,
  limb: LimbId,
  hipX: number, hipY: number,
  pose: LegPose,
  armor: ArmorPalette,
  color: number,
  scale: number,
  isBack: boolean,
) {
  if (player.limbs[limb] <= 0) return;
  const integrity = player.limbs[limb] / 100;
  // Two-segment leg: thigh down to a flexed knee, shin down to the boot. The
  // knee always bends backward so the gait reads as joints, not a rubber line.
  const thigh = 9.5 * scale;
  const shin = 8.5 * scale;
  const kneeX = hipX + Math.sin(pose.hip) * thigh;
  const kneeY = hipY + Math.cos(pose.hip) * thigh;
  const shinAngle = pose.hip - pose.knee;
  const footX = kneeX + Math.sin(shinAngle) * shin;
  const footY = kneeY + Math.cos(shinAngle) * shin;
  const base = isBack ? armor.dark : armor.base;
  limbSegment(graphics, hipX, hipY, kneeX, kneeY, 4.8 * scale, armor.dark, base);
  limbSegment(graphics, kneeX, kneeY, footX, footY, 3.9 * scale, armor.dark, base);
  // Knee plate with a player-color ring that fades as the leg grinds down.
  graphics.fillStyle(armor.dark, 1);
  graphics.fillCircle(kneeX, kneeY, 2.7 * scale);
  graphics.lineStyle(1 * scale, color, 0.3 + integrity * 0.45);
  graphics.strokeCircle(kneeX, kneeY, 2.7 * scale);
  // Filled boot (flat quad — rounded rect cost is not worth 1px of radius).
  const toeX = footX + player.facing * 2.2 * scale;
  graphics.fillStyle(0x0e1214, 1);
  graphics.fillRect(Math.min(footX, toeX) - 1.2 * scale, footY - 2.2 * scale, 7.6 * scale, 3.2 * scale);
}

function drawArm(
  graphics: Phaser.GameObjects.Graphics,
  player: PlayerState,
  limb: LimbId,
  shoulderX: number, shoulderY: number,
  handX: number, handY: number,
  armor: ArmorPalette,
  color: number,
  scale: number,
  isBack: boolean,
) {
  if (player.limbs[limb] <= 0) return;
  // Two-segment arm: shoulder -> elbow -> hand with a sagging elbow so arms
  // read as bent joints. The weapon arm's hand target tracks the gun grip
  // (including its recoil kick), so aim and body stay connected.
  const elbowX = (shoulderX + handX) / 2;
  const elbowY = (shoulderY + handY) / 2 + 2.2 * scale;
  const base = isBack ? armor.dark : armor.base;
  limbSegment(graphics, shoulderX, shoulderY, elbowX, elbowY, 4.2 * scale, armor.dark, base);
  limbSegment(graphics, elbowX, elbowY, handX, handY, 3.4 * scale, armor.dark, base);
  // Elbow pad + glove.
  graphics.fillStyle(armor.mid, 1);
  graphics.fillCircle(elbowX, elbowY, 2.2 * scale);
  graphics.fillStyle(0x101517, 1);
  graphics.fillCircle(handX, handY, 2.1 * scale);
}

function drawWeapon(
  graphics: Phaser.GameObjects.Graphics,
  weaponId: WeaponId,
  x: number,
  y: number,
  facing: number,
  recoil: number,
  scale: number,
  fx?: WeaponDrawFx,
) {
  const color = WEAPONS[weaponId].color;
  const back = facing < 0;
  const originX = x - facing * Math.min(8, recoil * 5) * scale;
  const px = (value: number) => originX + facing * value * scale;
  const vs = scale * WEAPON_VISUAL_SCALE; // M24: guns draw larger than hands
  graphics.lineStyle(3 * vs, 0x0b0e10, 1);
  if (weaponId === "sidearm") {
    graphics.fillStyle(0x252d2f, 1); graphics.fillRoundedRect(px(-5 * vs), y - 3 * vs, 19 * vs, 7 * vs, 2 * vs);
    graphics.fillStyle(0x111719, 1); graphics.fillRect(px(-2 * vs), y + 2 * vs, 5 * vs, 10 * vs);
    graphics.fillStyle(color, 0.9); graphics.fillRect(px(10 * vs), y - 2 * vs, 6 * vs, 2 * vs);
    // M24: brass ejects on recent fire — a tiny falling glint above the slide.
    if (recoil > 0.5) {
      graphics.fillStyle(0xe8c56a, 0.9);
      graphics.fillCircle(px(-6 * vs), y - 5 * vs - (1 - recoil) * 8 * vs, 1.4 * vs);
    }
  } else if (weaponId === "scatter") {
    graphics.fillStyle(0x1c2425, 1); graphics.fillRect(px(-8 * vs), y - 5 * vs, 22 * vs, 10 * vs);
    graphics.lineStyle(5 * vs, 0x111719, 1); graphics.lineBetween(px(12 * vs), y, px(31 * vs), y);
    graphics.lineStyle(1.5 * vs, color, 0.95); graphics.lineBetween(px(17 * vs), y - 3 * vs, px(31 * vs), y - 3 * vs);
    // M24: pump handle slides back then forward after each shot.
    if (recoil > 0) {
      const pumpBack = Math.sin(Math.min(1, (1 - recoil) * 2) * Math.PI) * 5 * vs;
      graphics.fillStyle(0x0d1214, 1);
      graphics.fillRect(px((14 - pumpBack) * vs), y + 2.5 * vs, 6 * vs, 3.5 * vs);
    }
  } else if (weaponId === "rifle") {
    graphics.fillStyle(0x202829, 1); graphics.fillRect(px(-10 * vs), y - 3 * vs, 38 * vs, 6 * vs);
    graphics.fillStyle(color, 0.8); graphics.fillRect(px(2 * vs), y + 3 * vs, 5 * vs, 11 * vs);
    graphics.fillRect(px(17 * vs), y - 6 * vs, 10 * vs, 2 * vs);
    // M24 signature: cooling vents glow after sustained fire, then fade.
    const heat = fx?.heat ?? 0;
    if (heat > 0.02) {
      for (let vent = 0; vent < 3; vent++) {
        graphics.fillStyle(color, heat * (0.55 - vent * 0.12));
        graphics.fillRect(px((6 + vent * 7) * vs), y - 1.4 * vs, 4 * vs, 2.8 * vs);
      }
    }
  } else if (weaponId === "sniper") {
    graphics.fillStyle(0x1b2224, 1); graphics.fillRect(px(-12 * vs), y - 3 * vs, 47 * vs, 6 * vs);
    graphics.fillStyle(color, 0.95); graphics.fillRect(px(8 * vs), y - 7 * vs, 12 * vs, 2 * vs);
    graphics.fillCircle(px(29 * vs), y, 3 * vs);
    // M24 signature: charge coils along the rail brighten toward full charge.
    const charge = fx?.charge ?? 0;
    if (charge > 0.03) {
      for (let coil = 0; coil < 4; coil++) {
        const glow = clampAngle(charge * 1.4 - coil * 0.18, 0, 1);
        if (glow <= 0.02) continue;
        graphics.lineStyle(2 * vs, charge >= 1 ? 0xffe6f2 : color, glow * 0.85);
        graphics.lineBetween(px((2 + coil * 9) * vs), y - 5.5 * vs, px((2 + coil * 9) * vs), y + 5.5 * vs);
      }
    }
  } else if (weaponId === "rocket") {
    graphics.fillStyle(0x273033, 1); graphics.fillRect(px(-8 * vs), y - 8 * vs, 28 * vs, 16 * vs);
    graphics.fillStyle(0x121819, 1); graphics.fillCircle(px(21 * vs), y, 8 * vs);
    graphics.lineStyle(2 * vs, color, 0.9); graphics.strokeCircle(px(21 * vs), y, 6 * vs);
    graphics.fillStyle(0x202829, 1); graphics.fillRect(px(-12 * vs), y + 5 * vs, 7 * vs, 9 * vs);
  } else if (weaponId === "echo") {
    // M24: the shard gun gets its own silhouette — crystal emitter array with
    // a slow shimmer, replacing the generic default shape it used to share.
    const time = fx?.time ?? 0;
    const shimmer = 0.55 + Math.sin(time * 0.006) * 0.25;
    graphics.fillStyle(0x1a2229, 1); graphics.fillRect(px(-9 * vs), y - 4.5 * vs, 20 * vs, 9 * vs);
    graphics.fillStyle(0x0f151c, 1); graphics.fillRect(px(-4 * vs), y + 2 * vs, 5 * vs, 9 * vs);
    graphics.fillStyle(color, shimmer);
    graphics.fillTriangle(px(9 * vs), y - 5 * vs, px(9 * vs), y + 5 * vs, px(19 * vs), y);
    graphics.lineStyle(1.2 * vs, 0xeaf6ff, shimmer);
    graphics.lineBetween(px(9 * vs), y - 4 * vs, px(17 * vs), y);
    graphics.fillStyle(color, shimmer * 0.5);
    graphics.fillRect(px(-7 * vs), y - 1.2 * vs, 13 * vs, 2.4 * vs);
  } else {
    // Blade: the grip only — the blade itself is drawn by the swing animation
    // when active, or at rest angle when idle.
    graphics.fillStyle(0x202829, 1); graphics.fillRect(px(-6 * vs), y - 3 * vs, 15 * vs, 6 * vs);
    const swing = fx?.swing;
    const restAngle = -0.5;
    const from = swing ? -1.55 : restAngle;
    const to = swing ? -1.55 + 2.8 * (1 - Math.pow(1 - swing.progress, 2)) : restAngle;
    const angle = facing > 0 ? to : Math.PI - to;
    const tipX = px(5 * vs) + Math.cos(angle) * 42 * vs;
    const tipY = y + 1 * vs + Math.sin(angle) * 42 * vs;
    graphics.lineStyle(5 * vs, 0x0b0e10, 1);
    graphics.lineBetween(px(5 * vs), y + 1 * vs, tipX, tipY);
    graphics.lineStyle(3.4 * vs, 0xbfcbd0, 0.98);
    graphics.lineBetween(px(5 * vs), y + 1 * vs, tipX, tipY);
    graphics.lineStyle(1.2 * vs, 0xf5f0dc, 0.85);
    graphics.lineBetween(px(6 * vs), y - 0.5 * vs, px(5 * vs) + Math.cos(angle) * 40 * vs, y + 1 * vs + Math.sin(angle) * 40 * vs - 2.5 * vs);
  }
}

function clampAngle(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function colorCss(color: number) {
  return hex(color);
}
