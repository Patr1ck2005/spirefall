// M28.5 结构拆分：伤害结算域——四肢损伤、伤害入口、死亡/淘汰、爆炸桶。
// 依赖方向：damage → state（叶子），所有武器/机关/弹道模块都经此结算。

import {
  LIMB_IDS,
  PLAYER_TARGET_OFFSET,
  PROP_TUNING,
  WORLD,
  clamp,
  selectLimbAtPoint,
  type CombatEvent,
  type LimbId,
  type PlayerState,
  type PropState,
  type WeaponId,
} from "../../shared/game.js";
import { emitEvent, randomBetween, statsEntry, type Room } from "../state.js";
import { sameTeam } from "./teams.js";

// Eliminated players (out of lives in a match) are frozen server-side: no
// physics, no AI inputs, no hazard or projectile interaction, no repeated
// death events. Sandbox mode never eliminates anyone.
export const isEliminated = (room: Room, player: PlayerState) => room.mode !== "sandbox" && player.lives <= 0;

export function applyLimbDamage(room: Room, player: PlayerState, limbId: LimbId, amount: number, details: Partial<CombatEvent>) {
  const before = player.limbs[limbId];
  player.limbs[limbId] = clamp(before - amount, 0, 100);
  if (before > 0 && player.limbs[limbId] === 0) emitEvent(room, "dismember", player.x, player.y - PLAYER_TARGET_OFFSET, 1, { targetId: player.id, limbId, actorId: details.actorId, weaponId: details.weaponId });
}

export function damage(
  room: Room,
  victim: PlayerState,
  amount: number,
  force: number,
  sourceX: number,
  hitX: number,
  hitY: number,
  details: { actorId?: string; weaponId?: WeaponId; secondary?: boolean; explosive?: boolean; lethal?: boolean } = {},
) {
  if (victim.invulnerable > 0 || victim.respawnTimer > 0 || isEliminated(room, victim)) return;
  // M30 friendly fire OFF: squadmates take neither damage nor knockback from
  // each other (single gate — every weapon, blast and barrel path funnels
  // through here). Falls/hazards stay unattributed and remain lethal to all.
  if (details.actorId && sameTeam(room, room.players.get(details.actorId), victim)) return;
  // M20 balance instrumentation: attribute hits/damage/kills to the weapon.
  if (room.mode === "match" && details.weaponId) {
    const entry = statsEntry(room.stats, details.weaponId);
    entry.hits += 1;
    entry.damage += amount;
  }
  victim.vx += (victim.x >= sourceX ? 1 : -1) * force;
  victim.vy -= force * 0.42;
  victim.hitFlash = 0.13;
  if (details.lethal) {
    // Execution shots (full-charge Voltrail) bypass limbs entirely.
    emitEvent(room, "hit", hitX, hitY, 1.4, { targetId: victim.id, actorId: details.actorId, weaponId: details.weaponId, secondary: details.secondary, amount: Math.round(amount) });
    loseLife(room, victim, victim.x, victim.y - PLAYER_TARGET_OFFSET, "shot", true, details.actorId, details.weaponId);
    return;
  }
  if (details.explosive) {
    for (const limbId of LIMB_IDS) applyLimbDamage(room, victim, limbId, amount * 0.5, details);
    // Explosive splash grinds all four limbs evenly — check for a bleed-out too.
    if (LIMB_IDS.every((limbId) => victim.limbs[limbId] <= 0)) {
      loseLife(room, victim, victim.x, victim.y - PLAYER_TARGET_OFFSET, "shot", true, details.actorId, details.weaponId);
      return;
    }
  } else {
    let limbId = selectLimbAtPoint(victim, hitX, hitY);
    const living = LIMB_IDS.filter((candidate) => victim.limbs[candidate] > 0);
    if (!living.length) {
      // Quad-destroy: a pilot with no intact limbs bleeds out.
      loseLife(room, victim, victim.x, victim.y - PLAYER_TARGET_OFFSET, "shot", true, details.actorId, details.weaponId);
      return;
    }
    // Destroyed-limb hits and head-zone hits (no limb resolved) carry over to
    // a living limb instead of being clamped away — no invincible stump-tanking.
    if (!limbId || victim.limbs[limbId] <= 0) {
      limbId = living[Math.floor(Math.random() * living.length)];
    }
    applyLimbDamage(room, victim, limbId, amount, details);
    if (LIMB_IDS.every((candidate) => victim.limbs[candidate] <= 0)) {
      loseLife(room, victim, victim.x, victim.y - PLAYER_TARGET_OFFSET, "shot", true, details.actorId, details.weaponId);
      return;
    }
  }
  // M24: `amount` feeds the floating damage digits (additive protocol field).
  emitEvent(room, "hit", hitX, hitY, clamp(force / 520, 0.2, 1.4), { targetId: victim.id, actorId: details.actorId, weaponId: details.weaponId, secondary: details.secondary, limbId: selectLimbAtPoint(victim, hitX, hitY), amount: Math.round(amount) });
}

export function loseLife(room: Room, player: PlayerState, x: number, y: number, cause: "fall" | "hazard" | "shot", emit = true, killerId?: string, killerWeapon?: WeaponId): boolean {
  if (player.respawnTimer > 0 || isEliminated(room, player)) return false;
  if (room.mode === "sandbox") player.lives = room.config.lives;
  else player.lives -= 1;
  player.vx = 0;
  player.vy = 0;
  player.jumpsUsed = 0;
  player.charge = 0;
  player.respawnTimer = room.mode === "sandbox" || player.lives > 0 ? 1.5 : 2.5;
  // M20 kill feed: shot deaths carry the killer as actorId; hazards and falls
  // stay unattributed (the feed reads "THE SPIRE").
  if (emit) emitEvent(room, "death", x, y, cause === "hazard" ? 1.35 : cause === "shot" ? 1.2 : 1, { targetId: player.id, actorId: cause === "shot" ? killerId : undefined });
  // M20 balance instrumentation: count an attributed kill for the weapon.
  if (room.mode === "match" && cause === "shot" && killerWeapon) statsEntry(room.stats, killerWeapon).kills += 1;
  return true;
}

// M25: a barrel's hp hit zero — explode it. Splash follows the same radial
// falloff as rockets (0.7x core → 0.2x edge); nearby barrels take half damage
// and pop on the following ticks through their own detonation calls (chain
// reaction, bounded because each barrel explodes exactly once).
export function detonateProp(room: Room, prop: PropState) {
  if (!prop.alive) return;
  prop.alive = false;
  prop.hp = 0;
  prop.burning = undefined;
  prop.nextSpawnTick = room.tick + randomBetween(PROP_TUNING.respawnMin * WORLD.tickRate, PROP_TUNING.respawnMax * WORLD.tickRate);
  prop.respawnTimer = (prop.nextSpawnTick - room.tick) / WORLD.tickRate;
  emitEvent(room, "propDestroy", prop.x, prop.y, clamp(PROP_TUNING.blastRadius / 90, 0.6, 1.2), { propId: prop.id, actorId: prop.lastActorId });
  // Player splash — attributed to the last damager so the kill feed reads
  // "X ▸ barrel ▸ Y" naturally through the existing actorId path.
  const actor = prop.lastActorId;
  for (const nearby of room.players.values()) {
    if (nearby.respawnTimer > 0 || isEliminated(room, nearby)) continue;
    const distance = Math.hypot(nearby.x - prop.x, nearby.y - PLAYER_TARGET_OFFSET - prop.y);
    if (distance >= PROP_TUNING.blastRadius) continue;
    const falloff = clamp(0.7 - 0.5 * (distance / PROP_TUNING.blastRadius), 0.2, 0.7);
    damage(room, nearby, PROP_TUNING.damage * falloff, PROP_TUNING.knockback * falloff, prop.x, nearby.x, nearby.y - PLAYER_TARGET_OFFSET, { actorId: actor, explosive: true });
  }
  // Chain: other barrels in the blast catch FIRE instead of losing hp — the
  // M27 propagation model. Fire spreads barrel-to-barrel with a per-barrel
  // fuse, so the chain reaction reads as advancing flames (each drum lights
  // up, burns visibly, then pops) rather than a same-tick detonation wave.
  // The alive-guard in detonateProp keeps the recursion bounded.
  for (const other of room.props) {
    if (!other.alive || other.id === prop.id) continue;
    const distance = Math.hypot(other.x - prop.x, other.y - prop.y);
    if (distance >= PROP_TUNING.blastRadius + PROP_TUNING.radius) continue;
    if (other.burning === undefined || other.burning <= 0) {
      other.burning = 0.45 + Math.random() * 0.35;
      other.lastActorId = actor;
    }
  }
}

// M25: apply weapon damage to a barrel. `hitX/hitY` unused for barrels (no
// limbs) — kept for call-site symmetry. Returns true when the barrel exploded.
export function damageProp(room: Room, prop: PropState, amount: number, actorId?: string): boolean {
  if (!prop.alive) return false;
  prop.hp -= amount;
  prop.lastActorId = actorId;
  if (prop.hp <= 0) {
    detonateProp(room, prop);
    return true;
  }
  return false;
}
