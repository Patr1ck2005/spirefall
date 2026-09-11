// M31 群怪域：波次调度（最远锚点 + 1s 光柱预警）、三兽行为步进（Skitter Saw
// 蓄势冲刺 / Ion Gnat Swarm 悬浮啃咬 / Ram Hauler 后倾冲撞）、受击/死亡结算与
// 8s 限时修复包。依赖方向：mobs → damage → state（叶子）；被 tick / players /
// projectiles / world 消费。群怪对所有机师（含 bot）敌对，不参与胜负判定。
import {
  MOB_TUNING,
  MOVE_TUNING,
  PLAYER_TARGET_OFFSET,
  WORLD,
  clamp,
  freshLimbs,
  surfaceBelow,
  type MapDef,
  type MobKind,
  type MobState,
  type PlayerState,
} from "../../shared/game.js";
import { mobRadius } from "../../shared/util.js";
import { emitEvent, randomBetween, type Room } from "../state.js";
import { damage, killMob } from "./damage.js";

const TICKS = (seconds: number) => Math.round(seconds * WORLD.tickRate);
const MOB_FOOT = 4;

// Kind lottery: crawlers dominate, chargers are rarer (weights in MOB_TUNING).
const WEIGHTED_KINDS: MobKind[] = Object.entries(MOB_TUNING.weights).flatMap(([kind, weight]) => Array.from({ length: weight }, () => kind as MobKind));

const mobAliveCheck = (room: Room, player: PlayerState) => player.respawnTimer <= 0 && (room.mode === "sandbox" || player.lives > 0);

const nearestPilot = (room: Room, mob: MobState): PlayerState | undefined => {
  let best: PlayerState | undefined;
  let bestDistance = Infinity;
  for (const player of room.players.values()) {
    if (!mobAliveCheck(room, player)) continue;
    const distance = Math.hypot(player.x - mob.x, player.y - mob.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = player;
    }
  }
  return best;
};

const floorAhead = (map: MapDef, mob: MobState): boolean =>
  surfaceBelow(map, mob.x + mob.facing * 14, mob.y + MOB_FOOT + 2) !== undefined;

/**
 * One spawn wave: pick the mobSpawns anchor farthest from the nearest live
 * pilot (mobs enter away from the fight), emit the 1s light-pillar telegraph
 * and queue the actual entry. No-op on maps without anchors.
 */
export function queueMobWave(room: Room, map: MapDef) {
  const anchors = map.mobSpawns ?? [];
  if (!anchors.length) return;
  let best = anchors[0];
  let bestNearest = -1;
  for (const anchor of anchors) {
    let nearest = Infinity;
    for (const player of room.players.values()) {
      if (!mobAliveCheck(room, player)) continue;
      nearest = Math.min(nearest, Math.hypot(player.x - anchor.x, player.y - anchor.y));
    }
    if (nearest === Infinity) nearest = 0;
    if (nearest > bestNearest) {
      bestNearest = nearest;
      best = anchor;
    }
  }
  const kind = WEIGHTED_KINDS[randomBetween(0, WEIGHTED_KINDS.length - 1)];
  room.mobQueue.push({ tick: room.tick + TICKS(MOB_TUNING.telegraph), x: best.x, y: best.y, kind });
  emitEvent(room, "mobSpawn", best.x, best.y, 1, { mobKind: kind });
}

/**
 * Per-tick mob orchestration: promote telegraphs into mobs, fire the wave
 * cadence under the concurrency cap, step every mob, then update drops.
 */
export function updateMobs(room: Room, map: MapDef, dt: number) {
  if (!room.config.mobs) return;
  for (let index = room.mobQueue.length - 1; index >= 0; index--) {
    const pending = room.mobQueue[index];
    if (room.tick < pending.tick) continue;
    room.mobQueue.splice(index, 1);
    room.mobs.push({
      id: room.nextMobId++,
      kind: pending.kind,
      x: pending.x,
      y: pending.y,
      vx: 0,
      vy: 0,
      hp: MOB_TUNING.hp[pending.kind],
      facing: Math.random() < 0.5 ? 1 : -1,
      state: "stalk",
      phaseTimer: 0,
      warn: 0,
      hitFlash: 0,
      onGround: false,
    });
  }
  if (room.nextMobWaveTick > 0 && room.tick >= room.nextMobWaveTick) {
    room.nextMobWaveTick = room.tick + TICKS(MOB_TUNING.waveInterval);
    if (room.mobs.length + room.mobQueue.length < MOB_TUNING.cap) queueMobWave(room, map);
  }
  for (const mob of [...room.mobs]) {
    if (mob.kind === "gnats") stepGnats(room, mob, dt);
    else stepGroundMob(room, map, mob, dt);
    if (mob.hitFlash) mob.hitFlash = Math.max(0, mob.hitFlash - dt);
    // Knockback can shove a crawler off the edge — the pit kills like it kills
    // pilots (no repair pack where nobody can reach it).
    if (mob.y > WORLD.height + 80) killMob(room, mob, false);
  }
  updateDrops(room, dt);
}

/** Ground physics shared by the crawler and the charger (landing + solid pushout). */
function groundStep(map: MapDef, mob: MobState, dt: number): { grounded: boolean; wallHit: boolean } {
  mob.vy = Math.min(mob.vy + MOVE_TUNING.gravity * dt, 900);
  const oldY = mob.y;
  mob.x = clamp(mob.x + mob.vx * dt, 8, WORLD.width - 8);
  mob.y += mob.vy * dt;
  let grounded = false;
  let wallHit = false;
  for (const platform of map.platforms) {
    const crossed = oldY + MOB_FOOT <= platform.y && mob.y + MOB_FOOT >= platform.y;
    if (mob.vy >= 0 && crossed && mob.x > platform.x - 8 && mob.x < platform.x + platform.width + 8) {
      mob.y = platform.y - MOB_FOOT;
      mob.vy = 0;
      grounded = true;
    }
  }
  for (const platform of map.platforms) {
    if (!platform.solid) continue;
    const overlapping = mob.x + 8 > platform.x && mob.x - 8 < platform.x + platform.width && mob.y + MOB_FOOT > platform.y && mob.y - 20 < platform.y + platform.height;
    if (!overlapping) continue;
    const overlapLeft = mob.x + 8 - platform.x;
    const overlapRight = platform.x + platform.width - (mob.x - 8);
    const overlapTop = mob.y + MOB_FOOT - platform.y;
    const overlapBottom = platform.y + platform.height - (mob.y - 20);
    if (Math.min(overlapLeft, overlapRight) <= Math.min(overlapTop, overlapBottom)) {
      if (overlapLeft < overlapRight) mob.x -= overlapLeft;
      else mob.x += overlapRight;
      if (mob.vx !== 0) wallHit = true;
      mob.vx = 0;
    } else if (overlapTop < overlapBottom && mob.vy > 0) {
      mob.y = platform.y - MOB_FOOT;
      mob.vy = 0;
      grounded = true;
    }
  }
  mob.onGround = grounded;
  return { grounded, wallHit };
}

/** Contact resolution: mob body vs every live pilot (bite/dash/charge connect). */
function connectPilots(room: Room, mob: MobState): boolean {
  const radius = mobRadius(mob.kind) + 13;
  for (const player of room.players.values()) {
    if (!mobAliveCheck(room, player)) continue;
    const dx = player.x - mob.x;
    const dy = player.y - PLAYER_TARGET_OFFSET - (mob.y - 8);
    if (dx * dx + dy * dy > radius * radius) continue;
    // Mob kills carry no actorId: the feed reads THE SPIRE, weapon stats stay
    // pilot-only, and the friendly-fire gate simply does not apply.
    damage(room, player, MOB_TUNING.damage[mob.kind], MOB_TUNING.knockback, mob.x, player.x, player.y - PLAYER_TARGET_OFFSET, {});
    mob.state = "stun";
    mob.phaseTimer = MOB_TUNING.stunTime[mob.kind];
    mob.warn = 0;
    mob.vx = -(Math.sign(dx) || 1) * 60;
    return true;
  }
  return false;
}

function stepGroundMob(room: Room, map: MapDef, mob: MobState, dt: number) {
  const warnTime = MOB_TUNING.warnTime[mob.kind];
  const dashTime = MOB_TUNING.dashTime[mob.kind];
  const isRam = mob.kind === "ram";
  if (mob.state === "dash") {
    const { wallHit } = groundStep(map, mob, dt);
    mob.phaseTimer -= dt;
    connectPilots(room, mob);
    if (mob.state !== "dash") return;
    // The charge ends on schedule or the moment it slams a wall (the wall hit
    // is the Ram Hauler's own hard-stop cue).
    if (mob.phaseTimer <= 0 || (isRam && wallHit)) {
      mob.state = "stun";
      mob.phaseTimer = MOB_TUNING.stunTime[mob.kind];
      mob.vx = 0;
    }
    return;
  }
  if (mob.state === "warn") {
    mob.vx = 0;
    groundStep(map, mob, dt);
    mob.phaseTimer -= dt;
    mob.warn = clamp(1 - mob.phaseTimer / warnTime, 0, 1);
    if (mob.phaseTimer <= 0) {
      mob.state = "dash";
      mob.warn = 0;
      mob.phaseTimer = dashTime;
      mob.vx = mob.facing * MOB_TUNING.dashSpeed[mob.kind];
    }
    return;
  }
  if (mob.state === "stun") {
    mob.vx *= 0.86;
    groundStep(map, mob, dt);
    mob.phaseTimer -= dt;
    if (mob.phaseTimer <= 0) mob.state = "stalk";
    return;
  }
  // Stalk: close on the nearest pilot along the current shelf, then wind up.
  const target = nearestPilot(room, mob);
  const speed = MOB_TUNING.stalkSpeed[mob.kind];
  if (target) {
    mob.targetId = target.id;
    const dx = target.x - mob.x;
    const sameShelf = Math.abs(target.y - mob.y) < (isRam ? 40 : 48);
    mob.facing = dx >= 0 ? 1 : -1;
    const engageFrom = isRam ? 40 : 24;
    const engageTo = isRam ? 230 : 150;
    const flat = Math.abs(dx);
    if (sameShelf && flat > engageFrom && floorAhead(map, mob)) mob.vx = mob.facing * speed;
    else mob.vx = 0;
    if (sameShelf && flat > engageFrom && flat < engageTo && floorAhead(map, mob)) {
      // Never wind up into a pit: the dash has no edge brake by design.
      mob.state = "warn";
      mob.phaseTimer = warnTime;
      mob.vx = 0;
      return;
    }
  } else {
    mob.vx = 0;
  }
  groundStep(map, mob, dt);
}

/** Ion Gnat Swarm: gravity-free drift with an orbit wobble, nibble on touch. */
function stepGnats(room: Room, mob: MobState, dt: number) {
  if (mob.state === "stun") {
    mob.phaseTimer -= dt;
    mob.x = clamp(mob.x + mob.vx * dt, 8, WORLD.width - 8);
    mob.y = clamp(mob.y + mob.vy * dt, 40, WORLD.height - 30);
    mob.vx *= 0.9;
    mob.vy *= 0.9;
    if (mob.phaseTimer <= 0) mob.state = "stalk";
    return;
  }
  const target = nearestPilot(room, mob);
  const speed = MOB_TUNING.stalkSpeed.gnats;
  if (target) {
    mob.targetId = target.id;
    const dx = target.x - mob.x;
    const dy = target.y - PLAYER_TARGET_OFFSET - (mob.y - 10);
    const distance = Math.hypot(dx, dy) || 1;
    // Approach until hover range, then orbit on a per-mob phase offset.
    const desired = distance > 90 ? 1 : distance < 60 ? -0.5 : 0;
    const wobble = Math.sin(mob.id * 2.1 + room.tick * 0.05) * 0.35;
    mob.vx = (dx / distance) * speed * desired - (dy / distance) * speed * wobble;
    mob.vy = (dy / distance) * speed * desired + (dx / distance) * speed * wobble;
    mob.facing = dx >= 0 ? 1 : -1;
  } else {
    mob.vx *= 0.95;
    mob.vy *= 0.95;
  }
  mob.x = clamp(mob.x + mob.vx * dt, 8, WORLD.width - 8);
  mob.y = clamp(mob.y + mob.vy * dt, 40, WORLD.height - 30);
  connectPilots(room, mob);
}

/**
 * Repair packs expire after MOB_TUNING.dropTtl; a touch restores every limb.
 */
function updateDrops(room: Room, dt: number) {
  for (const drop of room.drops) drop.ttl -= dt;
  room.drops = room.drops.filter((drop) => {
    if (drop.ttl <= 0) return false;
    for (const player of room.players.values()) {
      if (!mobAliveCheck(room, player)) continue;
      if (Math.hypot(player.x - drop.x, player.y - drop.y) < 24) {
        player.limbs = freshLimbs();
        emitEvent(room, "cratePickup", drop.x, drop.y, 1, { actorId: player.id, crateKind: "repair" });
        return false;
      }
    }
    return true;
  });
}
