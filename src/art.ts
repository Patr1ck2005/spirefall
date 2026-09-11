import Phaser from "phaser";
import { MAPS, MOB_TUNING, MOVE_TUNING, PLAYER_COLORS, PLAYER_SCALE, PLAYER_TARGET_OFFSET, PROP_TUNING, WEAPONS, type HazardState, type LimbId, type MapId, type MobState, type MoverState, type PlayerState, type WeaponId } from "../shared/game";
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
  flame: 24,
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

/** M32 item-crate signal tint per pocket item (readable at a glance). */
export const ITEM_TINTS: Record<string, number> = {
  grenade: 0xd8a83e,
  flashbang: 0xdfe6ea,
  medkit: 0x4fd07a,
  shield: 0x9a5cff,
  jetpack: 0xe8632a,
};

export function drawCrate(graphics: Phaser.GameObjects.Graphics, x: number, y: number, weaponId: WeaponId, time: number, generation = 1, kind: "weapon" | "repair" | "item" = "weapon", item?: string, light?: KeyLightSample) {
  const weapon = WEAPONS[weaponId];
  const special = kind !== "weapon";
  const pulse = 0.72 + Math.sin(time * (special ? 0.008 : 0.004) + generation) * (special ? 0.22 : 0.1);
  const bob = Math.sin(time * 0.004 + x) * 3;
  const tint = kind === "repair" ? 0x4fd07a : kind === "item" ? (item && ITEM_TINTS[item] ? ITEM_TINTS[item] : 0xdfe6ea) : weapon.color;
  // M26 light response: the box face warms toward the key light.
  const baseFace = kind === "repair" ? 0x10201a : special ? 0x1d2425 : 0x242b2e;
  const face = light && light.intensity > 0.05 ? mixColor(baseFace, light.color, Math.min(0.3, light.intensity * 0.35)) : baseFace;
  // M27b: painted contact shadows are gone everywhere — the real cast
  // shadows from the lighting rig are the only shadows in the game.
  graphics.fillStyle(face, 1);
  graphics.fillRect(x - 16, y - 16 + bob, 32, 32);
  graphics.lineStyle(special ? 3 : 2, tint, pulse);
  graphics.strokeRect(x - 16, y - 16 + bob, 32, 32);
  if (kind === "repair") {
    // Green cross for the repair cell.
    graphics.fillStyle(tint, pulse);
    graphics.fillRect(x - 11, y - 3.5 + bob, 22, 7);
    graphics.fillRect(x - 3.5, y - 11 + bob, 7, 22);
  } else if (kind === "item") {
    // M32 pocket-item glyphs: grenade dot, flashbang bar, medkit cross,
    // shield chevron, jetpack flame wedge.
    graphics.fillStyle(tint, pulse);
    if (item === "grenade") {
      graphics.fillCircle(x, y + bob, 7);
      graphics.fillStyle(0xf4e1ae, 0.8);
      graphics.fillRect(x - 1.5, y - 12 + bob, 3, 5);
    } else if (item === "flashbang") {
      graphics.fillRect(x - 10, y - 4 + bob, 20, 8);
      graphics.fillStyle(0xffffff, pulse);
      graphics.fillRect(x - 2, y - 4 + bob, 4, 8);
    } else if (item === "medkit") {
      graphics.fillRect(x - 10, y - 3.5 + bob, 20, 7);
      graphics.fillRect(x - 3.5, y - 10 + bob, 7, 20);
    } else if (item === "shield") {
      graphics.fillPoints([
        { x, y: y - 12 + bob },
        { x: x + 9, y: y - 5 + bob },
        { x: x + 6, y: y + 10 + bob },
        { x: x - 6, y: y + 10 + bob },
        { x: x - 9, y: y - 5 + bob },
      ], true);
    } else {
      graphics.fillTriangle(x - 7, y + 9 + bob, x + 7, y + 9 + bob, x, y - 10 + bob);
      graphics.fillStyle(0xffe7b0, pulse * 0.9);
      graphics.fillTriangle(x - 3, y + 9 + bob, x + 3, y + 9 + bob, x, y - 2 + bob);
    }
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
export function drawProp(graphics: Phaser.GameObjects.Graphics, prop: { x: number; y: number; hp: number; burning?: number }, time: number, light?: KeyLightSample) {
  const x = prop.x;
  const groundY = prop.y;
  const damageFraction = Math.max(0, Math.min(1, prop.hp / PROP_TUNING.hp));
  // M26 light response: warm the lit band toward the key light.
  const bandLit = light && light.intensity > 0.05 ? mixColor(0x9a3a24, light.color, Math.min(0.4, light.intensity * 0.4)) : 0x9a3a24;
  // M28: the drum grew to 26×34 (the old 24px stub read as half a barrel).
  // Body: tapered drum with three shading bands (left shadow, core, right light).
  // M27b: no painted contact shadow — the lighting rig casts the real one.
  const topY = groundY - 34;
  graphics.fillStyle(0x5c1f16, 1);
  graphics.fillRect(x - 13, topY, 26, 34);
  graphics.fillStyle(0x7d2c1d, 1);
  graphics.fillRect(x - 9, topY, 13, 34);
  graphics.fillStyle(bandLit, 1);
  graphics.fillRect(x + 3, topY, 6, 34);
  // Rim rings (top lip + mid seam + foot).
  graphics.fillStyle(0x3f1610, 1);
  graphics.fillRect(x - 13, topY, 26, 3);
  graphics.fillRect(x - 13, topY + 15, 26, 3);
  graphics.fillRect(x - 14, groundY - 4, 28, 4);
  // Hazard band: diagonal warning stripes on a dark plate, drawn SYMMETRIC
  // around the drum centre (the old loop accumulated stripes rightward and
  // painted half of them outside the barrel).
  graphics.fillStyle(0x191512, 1);
  graphics.fillRect(x - 13, topY + 6, 26, 7);
  graphics.fillStyle(0xe0a43c, 0.9);
  for (let stripe = -3; stripe <= 2; stripe++) {
    const sx = x + stripe * 7;
    graphics.fillPoints([
      { x: sx, y: topY + 13 },
      { x: sx + 5, y: topY + 6 },
      { x: sx + 8, y: topY + 6 },
      { x: sx + 3, y: topY + 13 },
    ], true);
  }
  // Valve cap on top.
  graphics.fillStyle(0x8a8f92, 1);
  graphics.fillRect(x - 3.5, topY - 3.5, 7, 3.5);
  // M27 Pyre Vent: a lit drum is fully wreathed — flame licks from the valve
  // and wrap the seam, flickering hard so the light it casts visibly dances.
  if (prop.burning !== undefined && prop.burning > 0) {
    const flick = 0.75 + Math.sin(time * 0.05 + x * 2) * 0.25;
    graphics.fillStyle(0xf06b2f, 0.85 * flick);
    graphics.fillCircle(x, topY - 4, 7.5 * flick);
    graphics.fillStyle(0xffc06a, 0.95 * flick);
    graphics.fillTriangle(x - 4.5, topY, x, topY - 16 * flick, x + 4.5, topY);
    graphics.fillStyle(0xfff3d0, 0.8 * flick);
    graphics.fillCircle(x, topY - 5, 2.5);
    for (const side of [-1, 1]) {
      graphics.fillStyle(0xf06b2f, 0.5 * flick);
      graphics.fillTriangle(
        x + side * 12, topY + 6 + (side > 0 ? 6 : 0),
        x + side * 20, topY + 20 + side * 3,
        x + side * 8, topY + 23,
      );
    }
  }
  // Damage state: glowing cracks leak fire below 60% hp; below 30% they flicker hard.
  if (damageFraction < 0.6) {
    const intensity = (0.6 - damageFraction) / 0.6;
    const flicker = 0.7 + Math.sin(time * (damageFraction < 0.3 ? 0.03 : 0.012) + x) * 0.3;
    const glow = intensity * flicker;
    graphics.lineStyle(1.4, 0xffb254, glow);
    graphics.lineBetween(x - 6, topY + 9, x - 1, topY + 17);
    graphics.lineBetween(x - 1, topY + 17, x - 7, topY + 27);
    graphics.lineBetween(x + 4, topY + 11, x + 7, topY + 22);
    graphics.fillStyle(0xf0873c, glow * 0.7);
    graphics.fillCircle(x - 1, topY + 17, 2);
    // A wisp of fire escapes at high damage.
    if (damageFraction < 0.3 && flicker > 0.75) {
      graphics.fillStyle(0xffc06a, 0.55 * glow);
      graphics.fillTriangle(x - 3, topY + 8, x, topY - 5, x + 3, topY + 8);
    }
  }
}

export function drawProjectile(graphics: Phaser.GameObjects.Graphics, projectile: { weaponId: WeaponId; secondary: boolean; pattern?: string; x: number; y: number; vx: number; vy: number; radius: number; bouncesRemaining?: number }, time = 0) {
  const color = WEAPONS[projectile.weaponId].color;
  const speed = Math.hypot(projectile.vx, projectile.vy) || 1;
  const isRocket = projectile.weaponId === "rocket";
  const isFlame = (projectile.weaponId === "scatter" && projectile.secondary) || projectile.weaponId === "flame";
  const isShard = projectile.pattern === "bounce";
  const trailLength = isRocket ? 46 : isFlame ? 20 : isShard ? 26 : projectile.pattern === "cluster" ? 30 : projectile.pattern === "piercing" ? 52 : projectile.secondary ? 24 : 14;
  const trailX = projectile.x - projectile.vx / speed * trailLength;
  const trailY = projectile.y - projectile.vy / speed * trailLength;
  if (isFlame) {
    // M27: Pyre Vent puffs burn bigger and brighter than the Blaze Vent's
    // pilot dribble — a fat two-tone fireball with a white-hot heart.
    const big = projectile.weaponId === "flame";
    const core = projectile.radius + (big ? 4 : 0);
    const flick = Math.random() * (big ? 3 : 2);
    graphics.fillStyle(0xf06b2f, 0.5);
    graphics.fillCircle(projectile.x, projectile.y, core + 4 + flick);
    graphics.fillStyle(0xf0a14a, 0.85);
    graphics.fillCircle(projectile.x, projectile.y, core);
    graphics.fillStyle(0xffe7b0, big ? 0.9 : 0.5);
    graphics.fillCircle(projectile.x, projectile.y, core * 0.5);
    return;
  }
  // Echo Shard: spinning resonant shard — an elongated diamond along the
  // flight vector with twin afterimage ghosts. M27: a crystal crown of
  // light scales with remaining bounces — the shard visibly charges up as
  // it ricochets, and the crown is what the shadow rig strobes from.
  if (isShard) {
    const ux = projectile.vx / speed;
    const uy = projectile.vy / speed;
    const bounces = projectile.bouncesRemaining ?? 0;
    const glow = 0.5 + 0.14 * bounces;
    // M24: occasional crystal glint as the shard tumbles through the air.
    const glint = time > 0 && Math.sin(time * 0.02 + projectile.x * 0.7 + projectile.y) > 0.86;
    // Crown: a soft halo whose radius and intensity grow with bounces.
    graphics.fillStyle(color, 0.1 + bounces * 0.045);
    graphics.fillCircle(projectile.x, projectile.y, 11 + bounces * 3);
    graphics.fillStyle(0xeaf6ff, 0.12 + bounces * 0.05);
    graphics.fillCircle(projectile.x, projectile.y, 5 + bounces * 1.5);
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
  // M27 rocket comet: a jagged flame tongue flickers behind the body, a hot
  // tracer spine runs the tail, and two dim smoke puffs close the trail.
  if (isRocket) {
    const ux = projectile.vx / speed;
    const uy = projectile.vy / speed;
    const flick = Math.sin(time * 0.055 + projectile.x * 0.9) * 0.5 + 0.5;
    const tongue = 13 + flick * 7;
    graphics.lineStyle(2, 0xffd9a0, 0.8);
    graphics.lineBetween(projectile.x, projectile.y, projectile.x - ux * 24, projectile.y - uy * 24);
    graphics.fillStyle(0xf06b2f, 0.85);
    graphics.fillPoints([
      { x: projectile.x - ux * 3, y: projectile.y - uy * 3 },
      { x: projectile.x - ux * tongue - uy * 4.5, y: projectile.y - uy * tongue + ux * 4.5 },
      { x: projectile.x - ux * (tongue + 7 + flick * 4), y: projectile.y - uy * (tongue + 7 + flick * 4) },
      { x: projectile.x - ux * tongue + uy * 4.5, y: projectile.y - uy * tongue - ux * 4.5 },
    ], true);
    graphics.fillStyle(0xffc06a, 0.9);
    graphics.fillCircle(projectile.x - ux * 6, projectile.y - uy * 6, 3.2);
    for (let index = 2; index <= 3; index++) {
      const t = index / 3;
      graphics.fillStyle(0x5c5148, (1 - t) * 0.3);
      graphics.fillCircle(projectile.x - projectile.vx / speed * 20 * index, projectile.y - projectile.vy / speed * 20 * index, 3.4 - index * 0.7);
    }
  }
  // Piercing rounds streak with a bright afterimage line plus a twin-layer
  // glow bead at the head (M27: the rail reads as charged plasma, not a dart).
  if (projectile.pattern === "piercing") {
    graphics.fillStyle(color, 0.18);
    graphics.fillCircle(projectile.x, projectile.y, 8);
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
  /** M27: Voltrail charge fraction (0-1) — drives the muzzle focus ring. */
  charge?: number;
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
  // M27 wound feedback: the stride shortens as legs degrade — down to a crawl
  // at zero integrity (the server move penalty bottoms out at ×0.4).
  const legMin = Math.min(player.limbs.leftLeg, player.limbs.rightLeg) / 100;
  const stride = 0.45 + 0.55 * legMin;
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

  // M27b: the pilot's painted contact shadow is gone — real cast shadows
  // (attenuation-driven wedges from every shadowing light) are the only
  // grounded shadow a pilot gets now.

  // M27 self-glow halo: a pilot-tinted aura so the silhouette stays readable
  // in the darkest corners. Emissive-material language, NOT a light source —
  // nothing is added to the lighting rig (M25b: no lights follow the pilot).
  const haloIntensity = 0.16 + (light ? light.intensity * 0.1 : 0.08) + (flash ? 0.25 : 0);
  graphics.fillStyle(color, haloIntensity);
  graphics.fillCircle(x, y - 16 * s, 26 * s);
  graphics.fillStyle(0xf7f2e8, haloIntensity * 0.35);
  graphics.fillCircle(x, y - 16 * s, 15 * s);

  // M24b limb poses: a run gait (legs counter-swing with knee flexion) blends
  // into an airborne pose (tuck on the way up, reach on the way down).
  const airBlend = player.onGround ? 0 : clampAngle(Math.abs(player.vy) / 320, 0, 1);
  const rising = player.vy < 0;
  const airLeg: LegPose = rising ? { hip: 0.75, knee: 1.35 } : { hip: 0.2, knee: 0.42 };
  const leftPose = blendPose({ hip: Math.sin(gait) * 0.8 * moving * stride, knee: 0.28 + Math.max(0, Math.sin(gait + 2.2)) * 0.7 * moving * stride }, airLeg, airBlend);
  const rightPose = blendPose({ hip: Math.sin(gait + Math.PI) * 0.8 * moving * stride, knee: 0.28 + Math.max(0, Math.sin(gait + Math.PI + 2.2)) * 0.7 * moving * stride }, { hip: -airLeg.hip * 0.55, knee: airLeg.knee * 0.85 }, airBlend);

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
  // M27c: visor GLOW is a CONSTANT feature of every mech — the helmet always
  // carries a soft pilot-colored bloom around the slit (emissive material,
  // not a light source; unrelated to weapon charge per the user's note).
  const visorGlow = 0.3 * (0.85 + Math.sin(time * 0.009 + player.x * 0.7) * 0.15);
  const visorCX = bodyX + (player.archetype === 0 ? (facing > 0 ? 6 : -6) : 0) * s;
  const visorCY = headY - (player.archetype === 2 ? 1.8 : 1.2) * s;
  const visorHW = (player.archetype === 0 ? 7 : player.archetype === 3 ? 6 : 9) * s;
  graphics.fillStyle(color, visorGlow);
  graphics.fillCircle(visorCX, visorCY, visorHW * 1.15);
  graphics.fillStyle(0xffffff, visorGlow * 0.55);
  graphics.fillCircle(visorCX, visorCY, visorHW * 0.62);
  graphics.fillStyle(color, visorPulse);
  if (player.archetype === 0) graphics.fillRect(bodyX + (facing > 0 ? 1 : -11) * s, headY - 3 * s, 10 * s, 4 * s);
  else if (player.archetype === 1) graphics.fillRect(bodyX - 7 * s, headY - 3 * s, 14 * s, 3.5 * s);
  else if (player.archetype === 2) graphics.fillRect(bodyX - 7 * s, headY - 4 * s, 14 * s, 4.5 * s);
  else graphics.fillRect(bodyX + (facing > 0 ? 0 : -9) * s, headY - 2 * s, 9 * s, 3 * s);
  if (player.archetype === 2) {
    // amber goggle lenses over the visor band — with their own ember glow
    graphics.fillStyle(0xf0a24a, 0.3);
    graphics.fillCircle(bodyX - 3.5 * s, headY - 1.5 * s, 4.2 * s);
    graphics.fillCircle(bodyX + 4 * s, headY - 1.5 * s, 4.2 * s);
    graphics.fillStyle(0xf0a24a, 0.95);
    graphics.fillCircle(bodyX - 3.5 * s, headY - 1.5 * s, 2.4 * s);
    graphics.fillCircle(bodyX + 4 * s, headY - 1.5 * s, 2.4 * s);
    graphics.fillStyle(0xffe7b0, 0.8);
    graphics.fillCircle(bodyX - 3.5 * s, headY - 1.5 * s, 1.1 * s);
    graphics.fillCircle(bodyX + 4 * s, headY - 1.5 * s, 1.1 * s);
  }
  // M27c: chest core light — every mech carries a small reactor porthole on
  // the chest inset, pulsing gently in the pilot color (emissive material).
  const corePulse = 0.5 + Math.sin(time * 0.005 + player.x * 0.5) * 0.18 + (flash ? 0.4 : 0);
  graphics.fillStyle(color, corePulse * 0.35);
  graphics.fillCircle(bodyX, bodyY - 35 * s, 4.6 * s);
  graphics.fillStyle(color, corePulse);
  graphics.fillCircle(bodyX, bodyY - 35 * s, 2.6 * s);
  graphics.fillStyle(0xffffff, corePulse * 0.75);
  graphics.fillCircle(bodyX, bodyY - 35 * s, 1.1 * s);

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

  // M27 Voltrail muzzle focus-ring: while charging, a shrinking double ring
  // converges on the muzzle — the visual charge gauge, readable at a glance.
  if (player.weapon === "sniper" && (fx?.charge ?? 0) > 0.03) {
    const charge = fx!.charge!;
    const full = charge >= 1;
    const ringR = (26 - charge * 16) * s;
    const muzzleX = bodyX + facing * 34 * s;
    const muzzleY = armY + 4 * s;
    graphics.lineStyle(2 * s, full ? 0xffe6f2 : color, (0.4 + charge * 0.5) * (full ? 0.75 + Math.sin(time * 0.03) * 0.25 : 1));
    graphics.strokeCircle(muzzleX, muzzleY, ringR);
    graphics.lineStyle(1 * s, 0xffe6f2, charge * 0.5);
    graphics.strokeCircle(muzzleX, muzzleY, ringR * 0.62);
    if (full) {
      // Execution-ready: a hot white core pulses at the muzzle.
      graphics.fillStyle(0xffffff, 0.5 + Math.sin(time * 0.045) * 0.3);
      graphics.fillCircle(muzzleX, muzzleY, 3.5 * s);
    }
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
  const originX = x - facing * Math.min(8, recoil * 5) * scale;
  const px = (value: number) => originX + facing * value * scale;
  const vs = scale * WEAPON_VISUAL_SCALE; // M24: guns draw larger than hands
  // M28 ROOT FIX for the left-facing weapon misalignment: fillRect and
  // fillRoundedRect always extend SCREEN-RIGHT from their anchor, so any
  // per-part manual mirroring eventually misses a piece. Instead the whole
  // gun is drawn in RIGHT-FACING space and the canvas is mirrored around the
  // grip anchor for left-facing pilots — every part, line and particle
  // transforms together, misalignment becomes impossible by construction.
  // (Phaser Graphics scaleCanvas is the same API drawPlayer already uses.)
  if (facing < 0) {
    graphics.save();
    graphics.translateCanvas(originX, 0);
    graphics.scaleCanvas(-1, 1);
    graphics.translateCanvas(-originX, 0);
  }
  // Gun-local coordinates below are ALWAYS right-facing (muzzle = +x).
  const gx = (value: number) => originX + value * scale;
  // M27c: every gun carries a small emissive signature (status LED / energy
  // cell) — pure material language, nothing enters the lighting rig.
  const led = (gxPos: number, gy: number, r: number, alpha: number, tint: number) => {
    graphics.fillStyle(tint, alpha * 0.4);
    graphics.fillCircle(gx(gxPos * vs), y + gy * vs, r * vs * 2);
    graphics.fillStyle(tint, alpha);
    graphics.fillCircle(gx(gxPos * vs), y + gy * vs, r * vs);
    graphics.fillStyle(0xffffff, alpha * 0.7);
    graphics.fillCircle(gx(gxPos * vs), y + gy * vs, r * vs * 0.45);
  };
  const ledPulse = 0.6 + Math.sin((fx?.time ?? 0) * 0.008) * 0.3;
  graphics.lineStyle(3 * vs, 0x0b0e10, 1);
  if (weaponId === "sidearm") {
    graphics.fillStyle(0x252d2f, 1); graphics.fillRoundedRect(gx(-5 * vs), y - 3 * vs, 19 * vs, 7 * vs, 2 * vs);
    graphics.fillStyle(0x111719, 1); graphics.fillRect(gx(-2 * vs), y + 2 * vs, 5 * vs, 10 * vs);
    graphics.fillStyle(color, 0.9); graphics.fillRect(gx(10 * vs), y - 2 * vs, 6 * vs, 2 * vs);
    // M27c: loaded-chamber LED at the slide rear.
    led(-3, -1.6, 0.9, 0.5 + recoil * 0.5, 0xffd27a);
    // M24: brass ejects on recent fire — a tiny falling glint above the slide.
    if (recoil > 0.5) {
      graphics.fillStyle(0xe8c56a, 0.9);
      graphics.fillCircle(gx(-6 * vs), y - 5 * vs - (1 - recoil) * 8 * vs, 1.4 * vs);
    }
  } else if (weaponId === "scatter") {
    graphics.fillStyle(0x1c2425, 1); graphics.fillRect(gx(-8 * vs), y - 5 * vs, 22 * vs, 10 * vs);
    graphics.lineStyle(5 * vs, 0x111719, 1); graphics.lineBetween(gx(12 * vs), y, gx(31 * vs), y);
    graphics.lineStyle(1.5 * vs, color, 0.95); graphics.lineBetween(gx(17 * vs), y - 3 * vs, gx(31 * vs), y - 3 * vs);
    // M27c: shell-count LED strip on the receiver.
    led(-5, 0, 0.9, ledPulse, 0x9fc6d1);
    // M24: pump handle slides back then forward after each shot.
    if (recoil > 0) {
      const pumpBack = Math.sin(Math.min(1, (1 - recoil) * 2) * Math.PI) * 5 * vs;
      graphics.fillStyle(0x0d1214, 1);
      graphics.fillRect(gx((14 - pumpBack) * vs), y + 2.5 * vs, 6 * vs, 3.5 * vs);
    }
  } else if (weaponId === "rifle") {
    graphics.fillStyle(0x202829, 1); graphics.fillRect(gx(-10 * vs), y - 3 * vs, 38 * vs, 6 * vs);
    graphics.fillStyle(color, 0.8); graphics.fillRect(gx(2 * vs), y + 3 * vs, 5 * vs, 11 * vs);
    graphics.fillRect(gx(17 * vs), y - 6 * vs, 10 * vs, 2 * vs);
    // M27c: beam-cell indicator at the stock.
    led(-7, 0, 0.9, 0.45 + ledPulse * 0.4, 0x75c795);
    // M24 signature: cooling vents glow after sustained fire, then fade.
    const heat = fx?.heat ?? 0;
    if (heat > 0.02) {
      for (let vent = 0; vent < 3; vent++) {
        graphics.fillStyle(color, heat * (0.55 - vent * 0.12));
        graphics.fillRect(gx((6 + vent * 7) * vs), y - 1.4 * vs, 4 * vs, 2.8 * vs);
      }
    }
  } else if (weaponId === "sniper") {
    graphics.fillStyle(0x1b2224, 1); graphics.fillRect(gx(-12 * vs), y - 3 * vs, 47 * vs, 6 * vs);
    graphics.fillStyle(color, 0.95); graphics.fillRect(gx(8 * vs), y - 7 * vs, 12 * vs, 2 * vs);
    graphics.fillCircle(gx(29 * vs), y, 3 * vs);
    // M27c: capacitor cells on the rail flank — breathing even at rest.
    led(-8, -1.5, 0.9, 0.4 + ledPulse * 0.35, 0xd797c7);
    led(-4.5, -1.5, 0.9, 0.3 + ledPulse * 0.35, 0xd797c7);
    // M24 signature: charge coils along the rail brighten toward full charge.
    const charge = fx?.charge ?? 0;
    if (charge > 0.03) {
      for (let coil = 0; coil < 4; coil++) {
        const glow = clampAngle(charge * 1.4 - coil * 0.18, 0, 1);
        if (glow <= 0.02) continue;
        graphics.lineStyle(2 * vs, charge >= 1 ? 0xffe6f2 : color, glow * 0.85);
        graphics.lineBetween(gx((2 + coil * 9) * vs), y - 5.5 * vs, gx((2 + coil * 9) * vs), y + 5.5 * vs);
      }
    }
  } else if (weaponId === "rocket") {
    graphics.fillStyle(0x273033, 1); graphics.fillRect(gx(-8 * vs), y - 8 * vs, 28 * vs, 16 * vs);
    graphics.fillStyle(0x121819, 1); graphics.fillCircle(gx(21 * vs), y, 8 * vs);
    graphics.lineStyle(2 * vs, color, 0.9); graphics.strokeCircle(gx(21 * vs), y, 6 * vs);
    graphics.fillStyle(0x202829, 1); graphics.fillRect(gx(-12 * vs), y + 5 * vs, 7 * vs, 9 * vs);
  } else if (weaponId === "echo") {
    // M24: the shard gun gets its own silhouette — crystal emitter array with
    // a slow shimmer, replacing the generic default shape it used to share.
    const time = fx?.time ?? 0;
    const shimmer = 0.55 + Math.sin(time * 0.006) * 0.25;
    graphics.fillStyle(0x1a2229, 1); graphics.fillRect(gx(-9 * vs), y - 4.5 * vs, 20 * vs, 9 * vs);
    graphics.fillStyle(0x0f151c, 1); graphics.fillRect(gx(-4 * vs), y + 2 * vs, 5 * vs, 9 * vs);
    led(-7, 0, 0.9, 0.35 + shimmer * 0.45, 0x7fb8ff);
    graphics.fillStyle(color, shimmer);
    graphics.fillTriangle(gx(9 * vs), y - 5 * vs, gx(9 * vs), y + 5 * vs, gx(19 * vs), y);
    graphics.lineStyle(1.2 * vs, 0xeaf6ff, shimmer);
    graphics.lineBetween(gx(9 * vs), y - 4 * vs, gx(17 * vs), y);
    graphics.fillStyle(color, shimmer * 0.5);
    graphics.fillRect(gx(-7 * vs), y - 1.2 * vs, 13 * vs, 2.4 * vs);
  } else if (weaponId === "flame") {
    // M27 Pyre Vent: a fat industrial torch — tank drum under the barrel,
    // wide trumpet nozzle, pilot ember breathing at the mouth.
    const time = fx?.time ?? 0;
    const pilot = 0.55 + Math.sin(time * 0.03) * 0.3;
    graphics.fillStyle(0x2a2019, 1); graphics.fillCircle(gx(-4 * vs), y + 6 * vs, 6 * vs);
    graphics.fillStyle(0xe8632a, 0.9); graphics.fillCircle(gx(-4 * vs), y + 6 * vs, 2.4 * vs);
    graphics.fillStyle(0x262e30, 1); graphics.fillRect(gx(-9 * vs), y - 4 * vs, 22 * vs, 8 * vs);
    graphics.fillStyle(0x121819, 1); graphics.fillRect(gx(4 * vs), y + 4 * vs, 6 * vs, 7 * vs);
    led(-7.5, -1.5, 0.9, 0.4 + ledPulse * 0.35, 0xff7a3c);
    graphics.fillStyle(color, 0.9);
    graphics.fillPoints([
      { x: gx(13 * vs), y: y - 3.5 * vs },
      { x: gx(13 * vs), y: y + 3.5 * vs },
      { x: gx(21 * vs), y: y + 6 * vs },
      { x: gx(21 * vs), y: y - 6 * vs },
    ], true);
    graphics.lineStyle(1.4 * vs, 0x0b0e10, 1);
    graphics.strokePoints([
      { x: gx(13 * vs), y: y - 3.5 * vs },
      { x: gx(13 * vs), y: y + 3.5 * vs },
      { x: gx(21 * vs), y: y + 6 * vs },
      { x: gx(21 * vs), y: y - 6 * vs },
      { x: gx(13 * vs), y: y - 3.5 * vs },
    ], true);
    graphics.fillStyle(0xffc06a, pilot);
    graphics.fillCircle(gx(22.5 * vs), y, 1.8 * vs);
  } else {
    // Blade: the grip only — the blade itself is drawn by the swing animation
    // when active, or at rest angle when idle. In mirrored space the rest
    // angle mirrors automatically, so facing needs no branching.
    graphics.fillStyle(0x202829, 1); graphics.fillRect(gx(-6 * vs), y - 3 * vs, 15 * vs, 6 * vs);
    led(-3, 0, 0.8, 0.4 + ledPulse * 0.3, 0xbfcbd0);
    const swing = fx?.swing;
    const restAngle = -0.5;
    const from = swing ? -1.55 : restAngle;
    const to = swing ? -1.55 + 2.8 * (1 - Math.pow(1 - swing.progress, 2)) : restAngle;
    const tipX = gx(5 * vs) + Math.cos(to) * 42 * vs;
    const tipY = y + 1 * vs + Math.sin(to) * 42 * vs;
    graphics.lineStyle(5 * vs, 0x0b0e10, 1);
    graphics.lineBetween(gx(5 * vs), y + 1 * vs, tipX, tipY);
    graphics.lineStyle(3.4 * vs, 0xbfcbd0, 0.98);
    graphics.lineBetween(gx(5 * vs), y + 1 * vs, tipX, tipY);
    graphics.lineStyle(1.2 * vs, 0xf5f0dc, 0.85);
    graphics.lineBetween(gx(6 * vs), y - 0.5 * vs, gx(5 * vs) + Math.cos(to) * 40 * vs, y + 1 * vs + Math.sin(to) * 40 * vs - 2.5 * vs);
  }
  if (facing < 0) graphics.restore();
}

function clampAngle(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function colorCss(color: number) {
  return hex(color);
}

// M31 signal colors for the hostile pests (docs/DESIGN_MOBS_ITEMS_GEARS.md §1
// and §4.1). Species-constant across maps: the body borrows the host map's
// panel shades, but the signal color IS the species id.
export const MOB_SIGNALS = {
  skitterEye: 0xffb254,
  sawRim: 0xff9a4a,
  gnats: 0xb8e83c,
  ramBeacon: 0xe0455a,
} as const;

const MOB_OUTLINE = 0x0b0e10;

/**
 * M31 hostile industrial pests, drawn from the host map's panel three-shade —
 * the pests are grown from the megastructure itself (hard-edge poster fills,
 * dark outline double-pass, no bitmaps, no sampleLight warming).
 */
export function drawMob(graphics: Phaser.GameObjects.Graphics, mob: MobState, mapId: MapId, time: number) {
  const poster = POSTER[mapId];
  const flash = (mob.hitFlash ?? 0) > 0;
  const facing = mob.facing;
  if (mob.kind === "skitter") {
    const footY = mob.y;
    const cx = mob.x;
    // Locked-step legs: phase integrates from x displacement, no skating.
    const gait = Math.sin(mob.x * 0.4);
    graphics.fillStyle(MOB_OUTLINE, 1);
    for (let leg = 0; leg < 4; leg++) {
      const lx = cx - 9 + leg * 6 + (leg % 2 === 0 ? gait : -gait) * 1.5;
      graphics.fillRect(lx - 1.5, footY - 4.5, 3, 4.5);
    }
    // Low wedge hull with a 45° front slant (outline pass, then base fill).
    const hull = [
      { x: cx - 14, y: footY - 4 },
      { x: cx + 14, y: footY - 4 },
      { x: cx + 14, y: footY - 9 },
      { x: cx + 6 * facing, y: footY - 14 },
      { x: cx - 14, y: footY - 14 },
    ];
    graphics.fillStyle(MOB_OUTLINE, 1);
    graphics.fillPoints(hull, true);
    graphics.fillStyle(poster.panelBase, 1);
    graphics.fillPoints(hull.map((point) => ({ x: point.x, y: point.y - 0.8 })), true);
    graphics.fillStyle(poster.panelLit, 1);
    graphics.fillRect(cx - 10, footY - 16.5, 20, 2.5);
    graphics.fillStyle(poster.panelShade, 1);
    graphics.fillRect(cx - 12, footY - 7, 24, 3);
    // Hazard band: three short diagonal stripes on the hull side.
    graphics.fillStyle(0xe0a43c, 0.5);
    for (let stripe = -1; stripe <= 1; stripe++) {
      graphics.fillPoints([
        { x: cx + stripe * 8 - 2 * facing, y: footY - 12 },
        { x: cx + stripe * 8 + 1.5 * facing, y: footY - 12 },
        { x: cx + stripe * 8 + 3.5 * facing, y: footY - 8.5 },
        { x: cx + stripe * 8 + 0 * facing, y: footY - 8.5 },
      ], true);
    }
    // Saw disc rides the front edge: shade disc + four rim teeth spinning
    // with displacement; the rim heat ramps with the dash telegraph.
    const sawX = cx + facing * 17;
    const sawY = footY - 8;
    const spin = time * (mob.state === "dash" ? 0.06 : 0.024) * facing + mob.x * 0.05;
    graphics.fillStyle(MOB_OUTLINE, 1);
    graphics.fillCircle(sawX, sawY, 11);
    graphics.fillStyle(poster.panelShade, 1);
    graphics.fillCircle(sawX, sawY, 10);
    graphics.fillStyle(poster.panelShade, 1);
    for (let tooth = 0; tooth < 4; tooth++) {
      const angle = spin + (tooth * Math.PI) / 2;
      const tip = { x: sawX + Math.cos(angle) * 13, y: sawY + Math.sin(angle) * 13 };
      const left = { x: sawX + Math.cos(angle - 0.28) * 9, y: sawY + Math.sin(angle - 0.28) * 9 };
      const right = { x: sawX + Math.cos(angle + 0.28) * 9, y: sawY + Math.sin(angle + 0.28) * 9 };
      graphics.fillPoints([left, tip, right], true);
    }
    graphics.lineStyle(2, MOB_SIGNALS.sawRim, 0.2 + (mob.warn ?? 0) * 0.35);
    graphics.strokeCircle(sawX, sawY, 10);
    // Sensor eye slit above the hub.
    graphics.fillStyle(MOB_SIGNALS.skitterEye, 0.95);
    graphics.fillRect(cx + facing * 8 - 1.5, footY - 19, 3, 1.5);
    graphics.fillStyle(0xffffff, 0.9);
    graphics.fillRect(cx + facing * 8 - 0.5, footY - 19, 1.5, 1.5);
    if (flash) {
      graphics.fillStyle(0xffffff, 0.5);
      graphics.fillPoints(hull.map((point) => ({ x: point.x, y: point.y })), true);
    }
    return;
  }
  if (mob.kind === "gnats") {
    // One simulated swarm; the client scatters 4 bodies on orbit + bob so the
    // aggregate reads as a drone cloud. Dark outline per body (M20 echo
    // lesson: keep the silhouette against bright skies).
    const bodies = 4;
    for (let index = 0; index < bodies; index++) {
      const orbit = time * 0.0035 * (index % 2 === 0 ? 1 : -1) + index * 1.9 + mob.id;
      const radius = 9 + (index % 3) * 4;
      const bob = Math.sin(time * 0.008 + index * 1.4) * 4;
      const bx = mob.x + Math.cos(orbit) * radius;
      const by = mob.y - 14 + Math.sin(orbit) * radius * 0.5 + bob;
      const stretch = mob.state === "stun" ? 4 : 6.5;
      const diamond = [
        { x: bx + stretch * facing, y: by },
        { x: bx, y: by - 3 },
        { x: bx - stretch * facing, y: by },
        { x: bx, y: by + 3 },
      ];
      graphics.fillStyle(MOB_OUTLINE, 1);
      graphics.fillPoints(diamond.map((point) => ({ x: point.x, y: point.y - 0.5 })), true);
      graphics.fillStyle(poster.panelBase, 1);
      graphics.fillPoints(diamond.map((point) => ({ x: point.x, y: point.y })), true);
      graphics.lineStyle(1, poster.panelLit, 0.85);
      graphics.lineBetween(bx - 4 * facing, by - 1, bx + 4 * facing, by - 1);
      // Rotor: two-frame width alternation reads as spin blur.
      const rotorWide = Math.floor(time / 60 + index) % 2 === 0;
      graphics.lineStyle(1, MOB_OUTLINE, 0.8);
      graphics.lineBetween(bx - (rotorWide ? 7 : 5), by - 4.5, bx + (rotorWide ? 7 : 5), by - 4.5);
      graphics.fillStyle(MOB_SIGNALS.gnats, 0.9);
      graphics.fillCircle(bx + facing * 2, by + 0.5, 2);
      graphics.fillStyle(0xffffff, 0.8);
      graphics.fillCircle(bx + facing * 2, by + 0.5, 0.8);
      if (flash && index === 0) {
        graphics.fillStyle(0xffffff, 0.5);
        graphics.fillPoints(diamond, true);
      }
    }
    return;
  }
  // Ram Hauler: flat hauler body on two spoked wheels, wedge ram horn up
  // front, hazard skirt, and the red beacon eye blinking on a 1Hz idle.
  const footY = mob.y;
  const cx = mob.x;
  const rearUp = mob.state === "warn" ? 4 : 0;
  const wheelSpin = mob.x * 0.16 + time * (mob.state === "dash" ? 0.09 : 0.012) * facing;
  for (const wheelX of [cx - 10, cx + 10]) {
    graphics.fillStyle(MOB_OUTLINE, 1);
    graphics.fillCircle(wheelX, footY - 8, 9);
    graphics.fillStyle(poster.panelShade, 1);
    graphics.fillCircle(wheelX, footY - 8, 8);
    graphics.lineStyle(1.5, MOB_OUTLINE, 0.9);
    for (let spoke = 0; spoke < 4; spoke++) {
      const angle = wheelSpin + (spoke * Math.PI) / 2;
      graphics.lineBetween(wheelX, footY - 8, wheelX + Math.cos(angle) * 7, footY - 8 + Math.sin(angle) * 7);
    }
  }
  const nose = cx + facing * 19;
  const tail = cx - facing * 17;
  const body = [
    { x: tail, y: footY - 10 - (mob.state === "warn" ? rearUp : 0) },
    { x: nose - facing * 4, y: footY - 10 },
    { x: nose, y: footY - 13 },
    { x: nose, y: footY - 22 },
    { x: tail, y: footY - 25 - (mob.state === "warn" ? rearUp : 0) },
  ];
  graphics.fillStyle(MOB_OUTLINE, 1);
  graphics.fillPoints(body, true);
  graphics.fillStyle(poster.panelBase, 1);
  graphics.fillPoints(body.map((point) => ({ x: point.x, y: point.y - 0.8 })), true);
  graphics.fillStyle(poster.panelLit, 1);
  graphics.fillRect(Math.min(tail, nose) + 4, footY - 27 - (mob.state === "warn" ? rearUp : 0), 22, 2.5);
  graphics.fillStyle(poster.panelShade, 1);
  graphics.fillRect(Math.min(tail, nose) + 2, footY - 13, 26, 3);
  // Hazard skirt on the nose face.
  graphics.fillStyle(0xe0a43c, 0.85);
  for (let stripe = 0; stripe < 3; stripe++) {
    graphics.fillPoints([
      { x: nose - facing * (2 + stripe * 4), y: footY - 20 },
      { x: nose - facing * (4 + stripe * 4), y: footY - 20 },
      { x: nose - facing * (6 + stripe * 4), y: footY - 12 },
      { x: nose - facing * (4 + stripe * 4), y: footY - 12 },
    ], true);
  }
  // Beacon pole + blinking eye.
  const beaconY = footY - 33;
  graphics.lineStyle(2, MOB_OUTLINE, 1);
  graphics.lineBetween(cx - facing * 10, footY - 26, cx - facing * 10, beaconY);
  const blink = 0.45 + Math.max(0, Math.sin(time * 0.0063 + mob.id)) * 0.4;
  graphics.fillStyle(MOB_SIGNALS.ramBeacon, blink);
  graphics.fillCircle(cx - facing * 10, beaconY, 6);
  graphics.fillStyle(0xffffff, blink * 0.9);
  graphics.fillCircle(cx - facing * 10, beaconY, 2);
  if (flash) {
    graphics.fillStyle(0xffffff, 0.45);
    graphics.fillPoints(body.map((point) => ({ x: point.x, y: point.y })), true);
  }
}

/** M31 repair pack dropped by a dying mob: small medkit canister, expiring. */
export function drawDrop(graphics: Phaser.GameObjects.Graphics, drop: { x: number; y: number; ttl: number; generation: number }, time: number) {
  const bob = Math.sin(time * 0.005 + drop.generation) * 2;
  const urgent = drop.ttl < 2 && Math.floor(time / 150) % 2 === 0;
  const tint = 0x4fd07a;
  graphics.fillStyle(0x10201a, 1);
  graphics.fillRect(drop.x - 8, drop.y - 12 + bob, 16, 12);
  graphics.lineStyle(2, tint, urgent ? 0.25 : 0.9);
  graphics.strokeRect(drop.x - 8, drop.y - 12 + bob, 16, 12);
  graphics.fillStyle(tint, urgent ? 0.3 : 0.95);
  graphics.fillRect(drop.x - 5, drop.y - 8 + bob, 10, 4);
  graphics.fillRect(drop.x - 2, drop.y - 11 + bob, 4, 10);
}

/** M32 thrown canister mid-flight: olive grenade / grey flashbang + fuse blink. */
export function drawThrowable(graphics: Phaser.GameObjects.Graphics, throwable: { x: number; y: number; itemId: string; fuse: number }, time: number) {
  const grenade = throwable.itemId === "grenade";
  const blink = Math.floor(time / (80 + throwable.fuse * 220)) % 2 === 0;
  graphics.fillStyle(0x0b0e10, 1);
  graphics.fillEllipse(throwable.x, throwable.y, 13, 9);
  graphics.fillStyle(grenade ? 0x4a4a2c : 0x767e82, 1);
  graphics.fillEllipse(throwable.x, throwable.y, 11, 7);
  graphics.fillStyle(0x9aa4a4, 1);
  graphics.fillRect(throwable.x - 2, throwable.y - 7, 4, 3);
  graphics.fillStyle(blink ? (grenade ? 0xff6d5e : 0xffffff) : 0x545b5e, 0.95);
  graphics.fillCircle(throwable.x, throwable.y - 7, 2);
}

/**
 * M32 diffraction shield face: a tilted parallelogram in front of the holder
 * (bright capCore edge + grating lines), driven purely by the snapshot's
 * shield timer. Tint follows the spectral identity, charges read as notches.
 */
export function drawShield(graphics: Phaser.GameObjects.Graphics, holder: { x: number; y: number; facing: 1 | -1; shieldCharges?: number }, time: number) {
  const facing = holder.facing;
  const cx = holder.x + facing * 16;
  const cy = holder.y - PLAYER_TARGET_OFFSET - 2;
  const skew = 5;
  const face = [
    { x: cx - 6 * facing, y: cy - 26 },
    { x: cx + 10 * facing, y: cy - 26 },
    { x: cx + 10 * facing + skew * facing, y: cy + 22 },
    { x: cx - 6 * facing + skew * facing, y: cy + 22 },
  ];
  graphics.fillStyle(0x12161d, 0.88);
  graphics.fillPoints(face, true);
  graphics.fillStyle(0x1d2431, 0.92);
  graphics.fillPoints(face.map((point) => ({ x: point.x - facing * 1.5, y: point.y })), true);
  // Bright cap edge (the M20 cover-wall language) + grating lines.
  graphics.lineStyle(2, 0xffffff, 0.92);
  graphics.lineBetween(face[0].x, face[0].y, face[1].x, face[1].y);
  graphics.lineStyle(1, 0x9a5cff, 0.4);
  for (let line = 1; line <= 4; line++) {
    const gy = face[0].y + (line * 48) / 5;
    graphics.lineBetween(face[0].x + facing * (line * skew) / 5, gy, face[1].x + facing * (line * skew) / 5, gy);
  }
  // Charge notches: one tick per remaining block.
  const charges = holder.shieldCharges ?? 0;
  for (let notch = 0; notch < charges; notch++) {
    graphics.fillStyle(0xfff2dc, 0.95);
    graphics.fillRect(cx - facing * 3 + facing * notch * 4 - 1, cy - 31, 2.5, 3);
  }
  void time;
}
