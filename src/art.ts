import Phaser from "phaser";
import { MAPS, PLAYER_COLORS, PLAYER_SCALE, WEAPONS, type HazardState, type LimbId, type MapId, type MoverState, type PlayerState, type WeaponId } from "../shared/game";

export const PLAYER_HEX = PLAYER_COLORS.map((color) => `#${color.toString(16).padStart(6, "0")}`) as readonly string[];

export const ARCHETYPES = [
  { name: "BREACHER", role: "HEAVY ENTRY", portrait: "/assets/portraits/breacher.webp" },
  { name: "WARDEN", role: "BASTION GUARD", portrait: "/assets/portraits/warden.webp" },
  { name: "RIGGER", role: "SYSTEMS RAIDER", portrait: "/assets/portraits/rigger.webp" },
  { name: "HUNTER", role: "CROWN SCOUT", portrait: "/assets/portraits/hunter.webp" },
] as const;

export const MAP_COPY: Record<MapId, { index: string; title: string; brief: string }> = {
  canopy: { index: "SECTOR 01", title: "THE CROWN", brief: "Freight lifts drift above the storm line." },
  fortress: { index: "SECTOR 02", title: "THE BASTION", brief: "Armored shutters guard the defense spine." },
  factory: { index: "SECTOR 03", title: "THE FOUNDRY", brief: "Assembly lines feed the furnace below." },
};

const hex = (color: number) => `#${color.toString(16).padStart(6, "0")}`;

export function drawEnvironment(graphics: Phaser.GameObjects.Graphics, mapId: MapId, time: number, rasterLoaded = false) {
  const map = MAPS[mapId];
  // M15: lighter overlays keep the painted backdrop readable as backdrop —
  // the heavy dims made every map read murky and cluttered.
  graphics.fillStyle(map.color, rasterLoaded ? 0.12 : 1);
  graphics.fillRect(0, 0, 1000, 560);
  if (!rasterLoaded) {
    drawAtmosphere(graphics, mapId, time);
    drawMegastructure(graphics, mapId, time);
  }
  graphics.fillStyle(0x05090c, 0.08);
  graphics.fillRect(0, 0, 1000, 560);
  if (rasterLoaded) {
    // Per-map readability scrims: suppress painted details that compete with
    // gameplay (factory's glowing furnace reads as a fake floor; fortress's
    // white searchlight shafts read as tracers).
    if (mapId === "factory") {
      graphics.fillStyle(0x050806, 0.42);
      graphics.fillRect(0, 430, 1000, 130);
    } else if (mapId === "fortress") {
      graphics.fillStyle(0x05070a, 0.16);
      graphics.fillRect(0, 60, 1000, 340);
    }
  }
}

function drawAtmosphere(graphics: Phaser.GameObjects.Graphics, mapId: MapId, time: number) {
  const shift = Math.sin(time * 0.00011);
  if (mapId === "canopy") {
    graphics.fillStyle(0x233b43, 0.72);
    graphics.fillRect(0, 0, 1000, 210);
    graphics.fillStyle(0x6c7d7f, 0.13);
    for (let i = 0; i < 8; i++) graphics.fillEllipse(70 + i * 145 + shift * 18, 125 + (i % 3) * 34, 230, 76);
    graphics.fillStyle(0xe7c884, 0.08);
    graphics.fillRect(0, 188, 1000, 80);
  } else if (mapId === "fortress") {
    graphics.fillStyle(0x0d1115, 0.72);
    graphics.fillRect(0, 0, 1000, 560);
    graphics.fillStyle(0x8d2628, 0.09 + Math.max(0, shift) * 0.03);
    graphics.fillTriangle(120, 0, 430, 560, 620, 560);
    graphics.fillTriangle(880, 0, 580, 560, 430, 560);
  } else {
    graphics.fillStyle(0x151a17, 0.82);
    graphics.fillRect(0, 0, 1000, 560);
    graphics.fillStyle(0xe0682d, 0.12 + Math.max(0, shift) * 0.04);
    graphics.fillEllipse(500, 590, 880, 260);
    graphics.fillStyle(0x667257, 0.08);
    for (let i = 0; i < 7; i++) graphics.fillEllipse(80 + i * 170 + shift * 22, 165 + (i % 2) * 70, 250, 95);
  }
}

function drawMegastructure(graphics: Phaser.GameObjects.Graphics, mapId: MapId, time: number) {
  if (mapId === "canopy") {
    graphics.fillStyle(0x0b1418, 0.75);
    for (let i = 0; i < 6; i++) {
      const x = 35 + i * 190;
      graphics.fillRect(x, 0, 36, 560);
      graphics.fillTriangle(x - 28, 560, x + 18, 70, x + 64, 560);
      graphics.lineStyle(2, 0x75999b, 0.18);
      graphics.lineBetween(x + 18, 0, x + 18, 560);
    }
    graphics.lineStyle(3, 0x0b1013, 0.9);
    for (let i = 0; i < 8; i++) {
      const sway = Math.sin(time * 0.0007 + i) * 5;
      graphics.lineBetween(80 + i * 130, 0, 95 + i * 130 + sway, 210 + (i % 3) * 70);
    }
    graphics.fillStyle(0x50d5cf, 0.65);
    for (let i = 0; i < 5; i++) graphics.fillRect(74 + i * 214, 74 + (i % 2) * 45, 3, 18);
  } else if (mapId === "fortress") {
    graphics.fillStyle(0x111418, 0.92);
    graphics.fillRect(0, 0, 145, 560);
    graphics.fillRect(855, 0, 145, 560);
    graphics.fillRect(390, 0, 220, 560);
    graphics.fillStyle(0x343238, 0.65);
    for (let i = 0; i < 6; i++) {
      graphics.fillRect(15, 55 + i * 94, 115, 7);
      graphics.fillRect(870, 55 + i * 94, 115, 7);
    }
    graphics.fillStyle(0xd43c38, 0.65 + Math.sin(time * 0.006) * 0.18);
    for (const x of [165, 835]) graphics.fillCircle(x, 66, 5);
    graphics.lineStyle(2, 0x6f6c70, 0.25);
    for (let y = 45; y < 540; y += 48) graphics.lineBetween(400, y, 600, y + 30);
  } else {
    graphics.fillStyle(0x101412, 0.9);
    for (const x of [25, 190, 785, 950]) graphics.fillRect(x, 0, 44, 560);
    graphics.lineStyle(18, 0x151b18, 1);
    graphics.lineBetween(0, 95, 1000, 95);
    graphics.lineBetween(0, 165, 1000, 165);
    graphics.lineStyle(3, 0x566157, 0.45);
    for (let x = 10; x < 1000; x += 82) graphics.lineBetween(x, 89, x + 44, 171);
    graphics.fillStyle(0xc9582c, 0.44 + Math.sin(time * 0.004) * 0.12);
    for (const x of [135, 500, 870]) graphics.fillRect(x, 425, 78, 135);
    graphics.fillStyle(0xf4a24b, 0.16);
    for (const x of [174, 539, 909]) graphics.fillEllipse(x, 500, 130, 180);
  }
}

export function drawPlatforms(graphics: Phaser.GameObjects.Graphics, mapId: MapId) {
  drawPlatformBodies(graphics, mapId);
  drawPlatformCaps(graphics, mapId);
}

// Static platform stack split in two passes so the RenderTexture baker can
// sandwich a tiled material overlay between the body fill and the bright cap.
export function drawPlatformBodies(graphics: Phaser.GameObjects.Graphics, mapId: MapId) {
  const map = MAPS[mapId];
  for (const platform of map.platforms) {
    graphics.fillStyle(0x0b0e10, 0.72);
    graphics.fillRect(platform.x + 5, platform.y + 8, platform.width - 10, Math.max(8, platform.height + 12));
    graphics.fillStyle(platform.solid ? 0x23282b : 0x343c3f, 1);
    graphics.fillRect(platform.x, platform.y, platform.width, platform.height);
    if (platform.solid) {
      graphics.fillStyle(0x14181a, 1);
      graphics.fillRect(platform.x + platform.width * 0.18, platform.y + 4, platform.width * 0.64, Math.max(2, platform.height - 8));
    }
    for (let x = platform.x + 13; x < platform.x + platform.width - 8; x += 38) {
      graphics.fillStyle(0x090c0e, 0.8);
      graphics.fillCircle(x, platform.y + platform.height - 4, 2);
    }
  }
}

export function drawPlatformCaps(graphics: Phaser.GameObjects.Graphics, mapId: MapId) {
  const map = MAPS[mapId];
  for (const platform of map.platforms) {
    if (platform.solid) {
      // M19 cover wall readout: armor plating + hot accent edges so players
      // learn "this blocks shots" at a glance. Tall solids get rivet bands.
      graphics.fillStyle(0x2e373a, 1);
      graphics.fillRect(platform.x, platform.y, platform.width, platform.height);
      graphics.fillStyle(0x1a2124, 1);
      for (let y = platform.y + 10; y < platform.y + platform.height - 6; y += 16) {
        graphics.fillRect(platform.x + 4, y, platform.width - 8, 3);
      }
      graphics.lineStyle(2, map.accent, 0.85);
      graphics.strokeRect(platform.x + 1, platform.y + 1, platform.width - 2, platform.height - 2);
      graphics.fillStyle(0xf2f5f2, 0.5);
      graphics.fillRect(platform.x, platform.y, platform.width, 2);
      continue;
    }
    // Bright cap line is the primary "walkable here" signal — keep it loud.
    graphics.fillStyle(map.accent, platform.oneWay ? 1 : 0.95);
    graphics.fillRect(platform.x, platform.y, platform.width, 4.5);
    graphics.fillStyle(0xf2f5f2, platform.oneWay ? 0.35 : 0.2);
    graphics.fillRect(platform.x, platform.y, platform.width, 1.2);
    graphics.lineStyle(1, 0x93a0a4, 0.4);
    graphics.lineBetween(platform.x + 8, platform.y + 7, platform.x + platform.width - 8, platform.y + 7);
  }
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

export function drawCrate(graphics: Phaser.GameObjects.Graphics, x: number, y: number, weaponId: WeaponId, time: number, generation = 1, kind: "weapon" | "repair" = "weapon") {
  const weapon = WEAPONS[weaponId];
  const special = kind === "repair" || !["sidearm", "scatter", "rifle"].includes(weaponId);
  const pulse = 0.72 + Math.sin(time * (special ? 0.008 : 0.004) + generation) * (special ? 0.22 : 0.1);
  const bob = Math.sin(time * 0.004 + x) * 3;
  const tint = kind === "repair" ? 0x4fd07a : weapon.color;
  graphics.fillStyle(0x080b0d, 0.55);
  graphics.fillEllipse(x, y + 20, 38, 10);
  graphics.fillStyle(kind === "repair" ? 0x10201a : special ? 0x1d2425 : 0x242b2e, 1);
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

export function drawProjectile(graphics: Phaser.GameObjects.Graphics, projectile: { weaponId: WeaponId; secondary: boolean; pattern?: string; x: number; y: number; vx: number; vy: number; radius: number }) {
  const color = WEAPONS[projectile.weaponId].color;
  const speed = Math.hypot(projectile.vx, projectile.vy) || 1;
  const isRocket = projectile.weaponId === "rocket";
  const isFlame = projectile.weaponId === "scatter" && projectile.secondary;
  const trailLength = isRocket ? 46 : isFlame ? 20 : projectile.pattern === "cluster" ? 30 : projectile.pattern === "piercing" ? 52 : projectile.secondary ? 24 : 14;
  const trailX = projectile.x - projectile.vx / speed * trailLength;
  const trailY = projectile.y - projectile.vy / speed * trailLength;
  if (isFlame) {
    graphics.fillStyle(0xf06b2f, 0.55);
    graphics.fillCircle(projectile.x, projectile.y, projectile.radius + 3 + Math.random() * 2);
    graphics.fillStyle(0xf0a14a, 0.8);
    graphics.fillCircle(projectile.x, projectile.y, projectile.radius);
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

export function drawPlayer(
  graphics: Phaser.GameObjects.Graphics,
  player: PlayerState,
  x: number,
  y: number,
  time: number,
  isSelf: boolean,
) {
  const s = PLAYER_SCALE;
  const color = player.color;
  const moving = Math.min(1, Math.abs(player.vx) / 220);
  const stride = Math.sin(time * 0.024 + player.x * 0.02) * 8 * moving;
  const bob = player.onGround ? Math.sin(time * 0.012 + player.x) * 1.5 : -2;
  const lean = clampAngle(player.vx / 90, -5, 5);
  const bodyX = x + lean * s;
  const bodyY = y + (bob + 14) * s;
  const flash = player.hitFlash > 0;
  const armor = flash ? 0xf4f6f2 : 0x252c2f;

  graphics.fillStyle(0x050708, 0.48);
  graphics.fillEllipse(x, y + 2, 30, 7);

  drawLeg(graphics, player, "leftLeg", bodyX - 7 * s, bodyY - 12 * s, stride * s, armor, color, s);
  drawLeg(graphics, player, "rightLeg", bodyX + 7 * s, bodyY - 12 * s, -stride * s, armor, color, s);

  const torsoWidth = [28, 24, 25, 21][player.archetype];
  const shoulderWidth = [38, 31, 35, 27][player.archetype];
  graphics.fillStyle(0x101416, 1);
  graphics.fillTriangle(bodyX - shoulderWidth * s / 2, bodyY - 50 * s, bodyX + shoulderWidth * s / 2, bodyY - 50 * s, bodyX + torsoWidth * s / 2, bodyY - 15 * s);
  graphics.fillStyle(armor, 1);
  graphics.fillRect(bodyX - torsoWidth * s / 2, bodyY - 47 * s, torsoWidth * s, 31 * s);
  graphics.fillStyle(color, 0.9);
  graphics.fillRect(bodyX - torsoWidth * s / 2, bodyY - 44 * s, 4 * s, 21 * s);
  if (player.archetype === 1) {
    graphics.fillStyle(0x15191b, 1);
    graphics.fillTriangle(bodyX - 12 * s, bodyY - 18 * s, bodyX + 14 * s, bodyY - 18 * s, bodyX + 6 * s, bodyY - 4 * s);
  } else if (player.archetype === 2) {
    graphics.fillStyle(0xb8733a, 0.75);
    graphics.fillRect(bodyX + 9 * s, bodyY - 41 * s, 8 * s, 22 * s);
  }

  const recoil = Math.max(player.primaryCooldown / Math.max(0.01, WEAPONS[player.weapon].primary.cooldown), player.secondaryCooldown / Math.max(0.01, WEAPONS[player.weapon].secondary.cooldown));
  const armY = bodyY - 38 * s;
  drawArm(graphics, player, "leftArm", bodyX, armY, player.facing, recoil, armor, color, false, s);
  drawArm(graphics, player, "rightArm", bodyX, armY + 4 * s, player.facing, recoil, armor, color, true, s);

  const headY = bodyY - 58 * s;
  graphics.fillStyle(0x111618, 1);
  if (player.archetype === 0) graphics.fillRoundedRect(bodyX - 14 * s, headY - 9 * s, 28 * s, 20 * s, 3 * s);
  else if (player.archetype === 1) graphics.fillTriangle(bodyX - 11 * s, headY + 10 * s, bodyX - 8 * s, headY - 10 * s, bodyX + 12 * s, headY + 10 * s);
  else if (player.archetype === 2) graphics.fillRoundedRect(bodyX - 11 * s, headY - 10 * s, 23 * s, 21 * s, 2 * s);
  else graphics.fillTriangle(bodyX - 10 * s, headY + 10 * s, bodyX, headY - 13 * s, bodyX + 10 * s, headY + 10 * s);
  graphics.fillStyle(color, 0.95);
  graphics.fillRect(bodyX + player.facing * s - (player.facing < 0 ? 10 * s : 0), headY - 2 * s, 10 * s, 4 * s);
  graphics.fillStyle(0xf4c56a, 0.8);
  graphics.fillCircle(bodyX + player.facing * 7 * s, headY, 2 * s);

  drawWeapon(graphics, player.weapon, bodyX + player.facing * 19 * s, armY + 4 * s, player.facing, recoil, s);

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
}

function drawLeg(graphics: Phaser.GameObjects.Graphics, player: PlayerState, limb: LimbId, x: number, y: number, stride: number, armor: number, color: number, scale: number) {
  if (player.limbs[limb] <= 0) return;
  const endX = x + stride;
  const integrity = player.limbs[limb] / 100;
  graphics.lineStyle(4 * scale, armor, 1);
  graphics.lineBetween(x, y - 8 * scale, endX, y + 5 * scale);
  graphics.lineStyle(1 * scale, color, 0.45 + integrity * 0.4);
  graphics.lineBetween(x, y - 7 * scale, endX, y + 2 * scale);
  graphics.fillStyle(0x0b0f11, 1);
  graphics.fillRect(endX - 3 * scale, y + 2 * scale, 7 * scale, 3 * scale);
}

function drawArm(graphics: Phaser.GameObjects.Graphics, player: PlayerState, limb: LimbId, x: number, y: number, facing: number, recoil: number, armor: number, color: number, lower: boolean, scale: number) {
  if (player.limbs[limb] <= 0) return;
  const endX = x + facing * (lower ? 21 : 17) * scale - facing * Math.min(7, recoil * 4) * scale;
  const endY = y + (lower ? 6 : 1) * scale;
  graphics.lineStyle((lower ? 3.5 : 4) * scale, armor, 1);
  graphics.lineBetween(x + facing * 7 * scale, y, endX, endY);
  graphics.lineStyle(1 * scale, color, 0.7);
  graphics.lineBetween(x + facing * 8 * scale, y, endX, endY);
}

function drawWeapon(graphics: Phaser.GameObjects.Graphics, weaponId: WeaponId, x: number, y: number, facing: number, recoil: number, scale: number) {
  const color = WEAPONS[weaponId].color;
  const back = facing < 0;
  const originX = x - facing * Math.min(8, recoil * 5) * scale;
  const px = (value: number) => originX + facing * value * scale;
  graphics.lineStyle(3 * scale, 0x0b0e10, 1);
  if (weaponId === "sidearm") {
    graphics.fillStyle(0x252d2f, 1); graphics.fillRoundedRect(px(-5), y - 3 * scale, 19 * scale, 7 * scale, 2 * scale);
    graphics.fillStyle(0x111719, 1); graphics.fillRect(px(-2), y + 2 * scale, 5 * scale, 10 * scale);
    graphics.fillStyle(color, 0.9); graphics.fillRect(px(10), y - 2 * scale, 6 * scale, 2 * scale);
  } else if (weaponId === "scatter") {
    graphics.fillStyle(0x1c2425, 1); graphics.fillRect(px(-8), y - 5 * scale, 22 * scale, 10 * scale);
    graphics.lineStyle(5 * scale, 0x111719, 1); graphics.lineBetween(px(12), y, px(31), y);
    graphics.lineStyle(1.5 * scale, color, 0.95); graphics.lineBetween(px(17), y - 3 * scale, px(31), y - 3 * scale);
  } else if (weaponId === "rifle") {
    graphics.fillStyle(0x202829, 1); graphics.fillRect(px(-10), y - 3 * scale, 38 * scale, 6 * scale);
    graphics.fillStyle(color, 0.8); graphics.fillRect(px(2), y + 3 * scale, 5 * scale, 11 * scale);
    graphics.fillRect(px(17), y - 6 * scale, 10 * scale, 2 * scale);
  } else if (weaponId === "sniper") {
    graphics.fillStyle(0x1b2224, 1); graphics.fillRect(px(-12), y - 3 * scale, 47 * scale, 6 * scale);
    graphics.fillStyle(color, 0.95); graphics.fillRect(px(8), y - 7 * scale, 12 * scale, 2 * scale);
    graphics.fillCircle(px(29), y, 3 * scale);
  } else if (weaponId === "rocket") {
    graphics.fillStyle(0x273033, 1); graphics.fillRect(px(-8), y - 8 * scale, 28 * scale, 16 * scale);
    graphics.fillStyle(0x121819, 1); graphics.fillCircle(px(21), y, 8 * scale);
    graphics.lineStyle(2 * scale, color, 0.9); graphics.strokeCircle(px(21), y, 6 * scale);
    graphics.fillStyle(0x202829, 1); graphics.fillRect(px(-12), y + 5 * scale, 7 * scale, 9 * scale);
  } else {
    graphics.fillStyle(0x202829, 1); graphics.fillRect(px(-6), y - 3 * scale, 15 * scale, 6 * scale);
    graphics.lineStyle(4 * scale, color, 0.95); graphics.lineBetween(px(5), y + 1 * scale, px(35), y - 15 * scale);
    graphics.lineStyle(1 * scale, 0xf5f0dc, 0.8); graphics.lineBetween(px(6), y - 1 * scale, px(34), y - 16 * scale);
  }
}

function clampAngle(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function colorCss(color: number) {
  return hex(color);
}
