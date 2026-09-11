// M32 道具域：G 槽道具使用分发、投掷物步进（手雷/闪光弹）、爆盲数学、
// 衍射盾格挡判定与 7 束谱色反射结算。依赖方向：items → damage → state；
// 被 players（使用/近战闪光/盾格挡）、world（道具箱拾取）、tick（投掷物）、
// bots（bot 道具逻辑）消费。
import {
  ITEM_TUNING,
  PLAYER_TARGET_OFFSET,
  PROP_TUNING,
  SHIELD_BEAMS,
  WORLD,
  clamp,
  mobRadius,
  pointSegmentClosest,
  raycastSolids,
  segmentHitsPlayer,
  segmentImpactPoint,
  type ItemId,
  type MapDef,
  type PlayerState,
  type ThrowableState,
} from "../../shared/game.js";
import { emitEvent, randomBetween, type Room } from "../state.js";
import { damage, damageMob, damageProp } from "./damage.js";

// ---- Blind math (pure, test-pinned) ----------------------------------------

/**
 * Blind seconds for a pilot at `distance` from the burst, given whether the
 * pilot FACES the flash (+1), stands side-on (0) or looks away (-1). Distance
 * falls off linearly to zero at the radius; the facing ladder is 1.0 / 0.75 /
 * 0.5 — looking away stings, staring at it zeroes you.
 */
export const blindSeconds = (distance: number, radius: number, facingToward: number, maxBlind: number, minBlind: number): number => {
  if (distance >= radius) return 0;
  const falloff = clamp(1 - distance / radius, 0, 1);
  const angleFactor = 0.5 + 0.25 * (clamp(facingToward, -1, 1) + 1);
  return Math.max(0, maxBlind * falloff * angleFactor - (falloff < 0.12 ? minBlind * (1 - falloff / 0.12) : 0));
};

const facingTowardOf = (victim: PlayerState, burstX: number): number => Math.sign(burstX - victim.x) === victim.facing ? 1 : -1;

/**
 * Apply a flash burst: every live pilot with a clear line to the burst point
 * (except the immune origin) is blinded by the distance/facing math above.
 * Server-authoritative — the sim itself is untouched; blindness is purely a
 * human-vision overlay (bots keep their public-state perception).
 */
export function applyFlash(room: Room, map: MapDef, burstX: number, burstY: number, itemId: "flashbang" | "medkit" | "shield" | "grenade" | "jetpack" | "melee", immuneId?: string) {
  const radius = itemId === "melee" ? ITEM_TUNING.meleeFlash.radius : ITEM_TUNING.flashbang.radius;
  const maxBlind = itemId === "melee" ? ITEM_TUNING.meleeFlash.maxBlind : ITEM_TUNING.flashbang.maxBlind;
  emitEvent(room, "blind", burstX, burstY, itemId === "melee" ? 1.1 : 1.3, { itemId: itemId === "melee" ? undefined : "flashbang", actorId: immuneId });
  for (const victim of room.players.values()) {
    if (victim.id === immuneId || victim.respawnTimer > 0 || (room.mode !== "sandbox" && victim.lives <= 0)) continue;
    const eyeY = victim.y - PLAYER_TARGET_OFFSET - 8;
    // Solid cover between the pilot's eyes and the burst blocks the flash.
    if (raycastSolids(map.platforms, victim.x, eyeY, burstX, burstY) !== undefined) continue;
    const distance = Math.hypot(victim.x - burstX, eyeY - burstY);
    const seconds = blindSeconds(distance, radius, facingTowardOf(victim, burstX), maxBlind, ITEM_TUNING.flashbang.minBlind);
    if (seconds <= 0.15) continue;
    victim.blind = Math.max(victim.blind ?? 0, seconds);
    victim.blindDuration = Math.max(victim.blindDuration ?? 0, seconds);
    victim.blindIntensity = Math.max(victim.blindIntensity ?? 0, clamp(seconds / maxBlind, 0.25, 1));
  }
}

// ---- Use dispatch -----------------------------------------------------------

/** Weighted lottery for item crates. */
const ITEM_KINDS: ItemId[] = Object.entries(ITEM_TUNING.weights).flatMap(([item, weight]) => Array.from({ length: weight }, () => item as ItemId));

export const rollItem = (): ItemId => ITEM_KINDS[randomBetween(0, ITEM_KINDS.length - 1)];

/**
 * Consume the pocket item (G key edge). Thrown items spawn a throwable with a
 * flat toss arc from the muzzle; medkits restore every limb instantly; the
 * shield activates on the spot; the jetpack is fuel-managed in stepPlayer.
 */
export function useItem(room: Room, map: MapDef, player: PlayerState) {
  const item = player.item;
  if (!item) return;
  if (item === "grenade" || item === "flashbang") {
    const tuning = item === "grenade" ? ITEM_TUNING.grenade : ITEM_TUNING.flashbang;
    room.throwables.push({
      id: room.nextThrowableId++,
      itemId: item,
      ownerId: player.id,
      x: player.x + player.facing * 12,
      y: player.y - PLAYER_TARGET_OFFSET,
      vx: player.facing * tuning.throwSpeed,
      vy: -tuning.throwLift,
      fuse: tuning.fuse,
    });
    player.item = undefined;
    emitEvent(room, "itemUse", player.x, player.y - PLAYER_TARGET_OFFSET, 0.7, { actorId: player.id, itemId: item });
    return;
  }
  if (item === "medkit") {
    player.limbs = { leftArm: 100, rightArm: 100, leftLeg: 100, rightLeg: 100 };
    player.item = undefined;
    emitEvent(room, "itemUse", player.x, player.y - PLAYER_TARGET_OFFSET, 0.9, { actorId: player.id, itemId: "medkit" });
    return;
  }
  if (item === "shield") {
    player.shield = ITEM_TUNING.shield.duration;
    player.shieldCharges = ITEM_TUNING.shield.charges;
    emitEvent(room, "itemUse", player.x, player.y - PLAYER_TARGET_OFFSET, 0.8, { actorId: player.id, itemId: "shield" });
    // The shield stays in the slot until it burns out (time or charges) —
    // carrying a fresh item while the shield is up is not a thing.
  }
  // jetpack: activated by holding Shift in stepPlayer, not by the G key.
}

/**
 * M32 shield gate: lasers only (beam / piercing — the flashLine family), and
 * only from the front arc the wielder is facing. Non-laser weapons and back
 * shots connect normally.
 */
export const shieldBlocks = (victim: PlayerState, shooterX: number, laser: boolean): boolean => {
  if (!laser || (victim.shield ?? 0) <= 0 || (victim.shieldCharges ?? 0) <= 0) return false;
  return (shooterX - victim.x) * victim.facing > 0;
};

/**
 * Spend one shield charge and resolve the diffraction fan: 7 hitscan rays
 * (0-level mirror + ±1/±2/±3 spectral orders) split the incoming damage
 * evenly. Every ray is a real line — it can hit any pilot (including the
 * attacker, straight back down the mirror beam), any mob, and pop barrels.
 * Reflected rays do not re-reflect (single-level, documented).
 */
export function reflectBeams(room: Room, map: MapDef, holder: PlayerState, originX: number, originY: number, incomingAngle: number, incomingDamage: number, attacker: PlayerState | undefined) {
  // Mirror reflection flips the ray's normal component: θ0 = 2θn + π − θi
  // (an eastward shot into an east-facing shield travels straight back).
  const normalAngle = holder.facing === 1 ? 0 : Math.PI;
  const mirror = 2 * normalAngle + Math.PI - incomingAngle;
  holder.shieldCharges = Math.max(0, (holder.shieldCharges ?? 0) - 1);
  if ((holder.shieldCharges ?? 0) <= 0) {
    holder.shield = 0;
    holder.item = undefined;
  }
  for (const beam of SHIELD_BEAMS) {
    const angle = mirror + (beam.offsetDeg * Math.PI) / 180;
    const directionX = Math.cos(angle);
    const directionY = Math.sin(angle);
    const endX = originX + directionX * beam.length;
    const endY = originY + directionY * beam.length;
    const wallDistance = raycastSolids(map.platforms, originX, originY, endX, endY) ?? beam.length;
    const perBeam = incomingDamage / SHIELD_BEAMS.length;
    // Pilots: swept capsule along the reflected ray; the nearest body soaks.
    const targets = [...room.players.values()]
      .map((other) => {
        const dx = other.x - originX;
        const dy = other.y - PLAYER_TARGET_OFFSET - originY;
        return { other, along: directionX * dx + directionY * dy };
      })
      .filter(({ other, along }) => other.id !== holder.id && along > 0 && along <= wallDistance && segmentHitsPlayer(other, originX, originY, endX, endY, 3))
      .sort((a, b) => a.along - b.along);
    const victim = targets[0];
    let cutDistance = victim ? victim.along : wallDistance;
    // Mobs and barrels within the surviving ray also take their share.
    for (const mob of [...room.mobs]) {
      const closest = pointSegmentClosest(mob.x, mob.y - 8, originX, originY, originX + directionX * cutDistance, originY + directionY * cutDistance);
      if (closest.distance > mobRadius(mob.kind) + 2) continue;
      damageMob(room, mob, perBeam, originX, 0);
      cutDistance = Math.min(cutDistance, Math.max(8, closest.t * cutDistance));
      break;
    }
    for (const prop of room.props) {
      if (!prop.alive) continue;
      const dx = prop.x - originX;
      const dy = prop.y - originY;
      const along = directionX * dx + directionY * dy;
      if (along <= 0 || along > cutDistance) continue;
      if (Math.hypot(dx - directionX * along, dy - directionY * along) > PROP_TUNING.radius + 4) continue;
      damageProp(room, prop, perBeam, attacker?.id);
      break;
    }
    if (victim && targets[0].along <= cutDistance) {
      const impact = segmentImpactPoint(victim.other, originX, originY, endX, endY) ?? { x: victim.other.x, y: victim.other.y - PLAYER_TARGET_OFFSET };
      damage(room, victim.other, perBeam, 120, originX, impact.x, impact.y, { actorId: attacker?.id, weaponId: attacker?.weapon });
    }
    emitEvent(room, "impact", originX + directionX * cutDistance, originY + directionY * cutDistance, 0.5, { pattern: "beam", surface: true });
  }
  emitEvent(room, "shieldReflect", originX, originY, 1.2, { itemId: "shield", actorId: attacker?.id, targetId: holder.id, angle: incomingAngle, direction: holder.facing, count: SHIELD_BEAMS.length, weaponId: attacker?.weapon });
}

// ---- Throwable stepping ------------------------------------------------------

function explodeThrowable(room: Room, map: MapDef, throwable: ThrowableState) {
  if (throwable.itemId === "grenade") {
    const tuning = ITEM_TUNING.grenade;
    emitEvent(room, "explosion", throwable.x, throwable.y, clamp(tuning.blastRadius / 90, 0.6, 1.2), { actorId: throwable.ownerId, itemId: "grenade" });
    for (const nearby of room.players.values()) {
      if (nearby.id === throwable.ownerId || nearby.respawnTimer > 0 || (room.mode !== "sandbox" && nearby.lives <= 0)) continue;
      const distance = Math.hypot(nearby.x - throwable.x, nearby.y - PLAYER_TARGET_OFFSET - throwable.y);
      if (distance >= tuning.blastRadius) continue;
      const falloff = clamp(0.7 - 0.5 * (distance / tuning.blastRadius), 0.2, 0.7);
      damage(room, nearby, tuning.damage * falloff, tuning.knockback * falloff, throwable.x, nearby.x, nearby.y - PLAYER_TARGET_OFFSET, { actorId: throwable.ownerId, explosive: true });
    }
    // Grenades pop barrels and grind mobs like blasts do.
    for (const prop of room.props) {
      if (!prop.alive) continue;
      if (Math.hypot(prop.x - throwable.x, prop.y - throwable.y) >= tuning.blastRadius + PROP_TUNING.radius) continue;
      damageProp(room, prop, tuning.damage * 0.5, throwable.ownerId);
    }
    for (const mob of [...room.mobs]) {
      const distance = Math.hypot(mob.x - throwable.x, mob.y - 8 - throwable.y);
      if (distance >= tuning.blastRadius) continue;
      const falloff = clamp(0.7 - 0.5 * (distance / tuning.blastRadius), 0.2, 0.7);
      damageMob(room, mob, tuning.damage * falloff, throwable.x, tuning.knockback * falloff);
    }
    return;
  }
  // Flashbang: no damage — a blinding burst (the thrower is immune).
  emitEvent(room, "explosion", throwable.x, throwable.y, 0.8, { actorId: throwable.ownerId, itemId: "flashbang" });
  applyFlash(room, map, throwable.x, throwable.y, "flashbang", throwable.ownerId);
}

/** Per-tick throwable physics: gravity arc, platform bounces, fuse, detonation. */
export function stepThrowables(room: Room, map: MapDef, dt: number) {
  for (const throwable of [...room.throwables]) {
    throwable.vy += 720 * dt;
    const prevY = throwable.y;
    throwable.x = clamp(throwable.x + throwable.vx * dt, 6, WORLD.width - 6);
    throwable.y += throwable.vy * dt;
    // Platform tops: bounce with heavy damping (the canister tumbles, rolls a
    // beat, settles). Solid faces bounce it back horizontally.
    for (const platform of map.platforms) {
      const crossed = prevY <= platform.y && throwable.y >= platform.y;
      if (throwable.vy > 0 && crossed && throwable.x > platform.x - 4 && throwable.x < platform.x + platform.width + 4) {
        throwable.y = platform.y;
        throwable.vy *= -0.35;
        throwable.vx *= 0.7;
        if (Math.abs(throwable.vy) < 40) throwable.vy = 0;
      }
      if (!platform.solid) continue;
      if (throwable.y > platform.y && throwable.y - 8 < platform.y + platform.height && throwable.x > platform.x - 4 && throwable.x < platform.x + platform.width + 4) {
        const fromLeft = throwable.vx > 0;
        throwable.x = fromLeft ? platform.x - 4 : platform.x + platform.width + 4;
        throwable.vx *= -0.5;
      }
    }
    throwable.fuse -= dt;
    if (throwable.fuse <= 0) {
      room.throwables = room.throwables.filter((candidate) => candidate.id !== throwable.id);
      explodeThrowable(room, map, throwable);
    }
  }
  room.throwables = room.throwables.filter((throwable) => throwable.x > -60 && throwable.x < WORLD.width + 60 && throwable.y < WORLD.height + 150);
}

/** M32 melee flash: a dashSlash connect bursts lightning-bright at the impact. */
export function applyMeleeFlash(room: Room, map: MapDef, wielder: PlayerState, x: number, y: number) {
  applyFlash(room, map, x, y, "melee", wielder.id);
}
