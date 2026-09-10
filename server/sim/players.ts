// M28.5 结构拆分：机师模拟域——碰撞推挤、实体墙解析、武器开火（attack）、
// 每帧玩家步进（stepPlayer，含跳跃/弹药再生/蓄能/坠落救援）。
// 依赖方向：players → damage → state。
import {
  AMMO_REGEN_INTERVAL_TICKS,
  MAPS,
  MAX_JUMPS,
  MOVE_TUNING,
  PLAYER_BODY_HEIGHT,
  PLAYER_FOOT_OFFSET,
  PLAYER_HALF_WIDTH,
  PLAYER_TARGET_OFFSET,
  WEAPONS,
  WORLD,
  calculateLimbModifiers,
  clamp,
  freshLimbs,
  rangeFalloff,
  raycastSolids,
  segmentHitsPlayer,
  segmentHitsProp,
  segmentImpactPoint,
  type ClientInput,
  type MapDef,
  type Platform,
  type PlayerState,
} from "../../shared/game.js";
import { emitEvent, statsEntry, type Room } from "../state.js";
import { damage, damageProp, isEliminated, loseLife } from "./damage.js";

export function intersectsPlayerRect(player: PlayerState, rect: { x: number; y: number; width: number; height: number }) {
  return player.x + PLAYER_HALF_WIDTH > rect.x && player.x - PLAYER_HALF_WIDTH < rect.x + rect.width && player.y + PLAYER_FOOT_OFFSET > rect.y && player.y - PLAYER_BODY_HEIGHT < rect.y + rect.height;
}

// Solid platforms block from every side: push out along the least-penetration
// axis, stop upward motion at ceilings. Solids are thick (>=24px) versus the
// ~10px/tick worst-case knockback displacement, so tunneling is not a concern.
export function resolveSolids(player: PlayerState, platforms: Platform[]) {
  for (const solid of platforms) {
    if (!solid.solid) continue;
    if (!intersectsPlayerRect(player, solid)) continue;
    const overlapLeft = player.x + PLAYER_HALF_WIDTH - solid.x;
    const overlapRight = solid.x + solid.width - (player.x - PLAYER_HALF_WIDTH);
    const overlapTop = player.y + PLAYER_FOOT_OFFSET - solid.y;
    const overlapBottom = solid.y + solid.height - (player.y - PLAYER_BODY_HEIGHT);
    const minHorizontal = Math.min(overlapLeft, overlapRight);
    const minVertical = Math.min(overlapTop, overlapBottom);
    if (minHorizontal <= minVertical) {
      if (overlapLeft < overlapRight) player.x -= overlapLeft;
      else player.x += overlapRight;
      player.vx = 0;
    } else {
      if (overlapTop < overlapBottom) {
        player.y = solid.y - PLAYER_FOOT_OFFSET;
        if (player.vy > 0) { player.vy = 0; player.onGround = true; player.jumpsUsed = 0; }
      } else {
        player.y = solid.y + solid.height + PLAYER_BODY_HEIGHT;
        if (player.vy < 0) player.vy = 0;
      }
    }
  }
}

export function attack(room: Room, player: PlayerState, secondary: boolean, chargeFraction = 0) {
  const weapon = WEAPONS[player.weapon];
  const def = secondary ? weapon.secondary : weapon.primary;
  const cooldownKey = secondary ? "secondaryCooldown" : "primaryCooldown";
  if (player[cooldownKey] > 0 || player.respawnTimer > 0 || player.ammo < def.ammoCost) return;
  // Charge releases below the minimum fraction fizzle (stepPlayer owns charge state).
  if (!secondary && def.chargeMax !== undefined && chargeFraction < (def.chargeMin ?? 0.25)) return;
  const chargeScale = !secondary && def.chargeMax !== undefined ? 1 + chargeFraction * 1.6 : 1;
  // M27: wounded arms widen the cone (server-authoritative — bots suffer too).
  const modifiers = calculateLimbModifiers(player.limbs);
  const spread = def.spread * modifiers.spread;
  player[cooldownKey] = def.cooldown * modifiers.cooldown;
  player.ammo -= def.ammoCost;
  player.ammoByWeapon[player.weapon] = player.ammo;
  player.vx -= player.facing * def.recoil * chargeScale * modifiers.recoil;
  const range = def.range * (1 + chargeFraction * 0.25);
  const originX = player.x + player.facing * 12;
  const originY = player.y - PLAYER_TARGET_OFFSET;
  emitEvent(room, "attack", originX, originY, secondary ? 1 : 0.7 * chargeScale, {
    actorId: player.id,
    weaponId: player.weapon,
    secondary,
    pattern: def.pattern,
    direction: player.facing,
    count: def.count,
    charge: def.chargeMax !== undefined ? chargeFraction : undefined,
  });
  // M20 balance instrumentation: one shot per trigger pull (projectiles keep
  // per-round resolution below, hits are counted in damage()).
  if (room.mode === "match") {
    const entry = statsEntry(room.stats, player.weapon);
    entry.shots += def.kind === "hitscan" && def.pattern === "burst" ? def.count : 1;
  }

  if (def.kind === "melee") {
    if (def.pattern === "dashSlash") {
      player.x = clamp(player.x + player.facing * def.dashDistance, PLAYER_HALF_WIDTH, WORLD.width - PLAYER_HALF_WIDTH);
      player.vx = player.facing * def.dashSpeed;
      resolveSolids(player, MAPS[room.config.mapId].platforms);
    }
    // M24: melee resolves as a capsule sweep along the actual swing arc
    // (origin -> origin + facing*range). The old midpoint-circle test used a
    // circle of radius range/2 centered ahead — it hit people BEHIND the
    // muzzle and whiffed on the tip. Segment test matches the swing shape.
    for (const other of room.players.values()) {
      if (other.id === player.id) continue;
      const tipX = originX + player.facing * def.range;
      if (!segmentHitsPlayer(other, originX, originY, tipX, originY)) continue;
      const impact = segmentImpactPoint(other, originX, originY, tipX, originY) ?? { x: other.x, y: other.y - PLAYER_TARGET_OFFSET };
      damage(room, other, def.damage, def.knockback, player.x, impact.x, impact.y, { actorId: player.id, weaponId: player.weapon, secondary });
    }
    // M25: melee cleaves barrels too — the swing arc doubles as a demolition
    // tool when a barrel sits inside the range.
    for (const prop of room.props) {
      if (!prop.alive) continue;
      const tipX = originX + player.facing * def.range;
      if (!segmentHitsProp(prop, originX, originY, tipX, originY, 4)) continue;
      damageProp(room, prop, def.damage, player.id);
    }
    return;
  }

  if (def.kind === "hitscan") {
    const platforms = MAPS[room.config.mapId].platforms;
    const shots = def.pattern === "burst" ? def.count : 1;
    for (let shot = 0; shot < shots; shot++) {
      const angle = (shot - (shots - 1) / 2) * spread;
      const directionX = Math.cos(angle) * player.facing;
      const directionY = Math.sin(angle);
      // M19: the ray stops at the first solid cover — lasers and bullets no
      // longer reach (or damage) anything behind a wall.
      const rayEndX = originX + directionX * range;
      const rayEndY = originY + directionY * range;
      const wallDistance = raycastSolids(platforms, originX, originY, rayEndX, rayEndY) ?? range;
      // M25: a live barrel in the ray's path soaks the shot. The ray terminates
      // at the barrel (same visual read as hitting cover): full damage to the
      // barrel, impact sparks client-side, and nothing behind it is hit.
      const barrelHit = [...room.props.values()]
        .filter((prop) => prop.alive && segmentHitsProp(prop, originX, originY, rayEndX, rayEndY))
        .map((prop) => {
          const dx = prop.x - originX;
          const dy = prop.y - originY;
          return { prop, along: directionX * dx + directionY * dy };
        })
        .filter(({ along }) => along > 0 && along <= wallDistance)
        .sort((a, b) => a.along - b.along)[0];
      if (barrelHit) {
        damageProp(room, barrelHit.prop, def.damage * chargeScale, player.id);
        emitEvent(room, "impact", barrelHit.prop.x, barrelHit.prop.y, 0.8, { weaponId: player.weapon, secondary, pattern: def.pattern, surface: true });
      }
      // M24: targets are resolved against the full hit capsule, not a single
      // chest point — head-height and knee-height rays now land where they
      // visually should. The ray is treated as a segment so the test is the
      // same swept geometry projectiles use.
      const targets = [...room.players.values()]
        .map((other) => {
          const dx = other.x - originX;
          const dy = other.y - PLAYER_TARGET_OFFSET - originY;
          const along = directionX * dx + directionY * dy;
          return { other, along };
        })
        .filter(({ other, along }) => other.id !== player.id && along > 0 && along <= wallDistance && segmentHitsPlayer(other, originX, originY, rayEndX, rayEndY, 3))
        .sort((a, b) => a.along - b.along);
      const limit = def.pattern === "piercing" || def.pattern === "beam" ? (def.pattern === "beam" ? targets.length : def.pierce + 1) : 1;
      // Charged Voltrail rails (>=0.8) are executions: pierce the whole line.
      const lethal = !secondary && def.chargeMax !== undefined && chargeFraction >= 0.8;
      for (const { other, along } of targets.slice(0, limit)) {
        const falloff = rangeFalloff(along, range);
        damage(room, other, def.damage * chargeScale * falloff, def.knockback * chargeScale, player.x, other.x - player.facing * 7, other.y - PLAYER_TARGET_OFFSET, { actorId: player.id, weaponId: player.weapon, secondary, lethal });
      }
    }
    return;
  }

  const count = def.pattern === "pellet" || def.pattern === "cluster" ? def.count : 1;
  for (let index = 0; index < count; index++) {
    const arc = def.pattern === "pellet"
      ? (index - (count - 1) / 2) * (spread / Math.max(1, count - 1))
      : def.pattern === "cluster" ? (index - 1) * spread : (Math.random() - 0.5) * spread;
    room.projectiles.push({
      id: room.nextProjectile++,
      ownerId: player.id,
      weaponId: player.weapon,
      secondary,
      x: originX,
      y: originY,
      vx: Math.cos(arc) * player.facing * def.speed,
      vy: Math.sin(arc) * def.speed,
      radius: def.radius,
      damage: def.damage * chargeScale,
      knockback: def.knockback * chargeScale,
      explosiveRadius: def.explosiveRadius,
      pierceRemaining: def.pierce,
      pattern: def.pattern,
      hitIds: [],
      ttl: 2.4,
      originX,
      originY,
      travelled: 0,
      bouncesRemaining: def.bounces ?? 0,
    });
  }
}

export function stepPlayer(room: Room, map: MapDef, player: PlayerState, input: ClientInput, dt: number) {
  player.primaryCooldown = Math.max(0, player.primaryCooldown - dt);
  player.secondaryCooldown = Math.max(0, player.secondaryCooldown - dt);
  player.invulnerable = Math.max(0, player.invulnerable - dt);
  player.hitFlash = Math.max(0, player.hitFlash - dt);

  if (isEliminated(room, player)) {
    room.jumpHeld.set(player.id, false);
    return;
  }
  if (player.respawnTimer > 0) {
    room.jumpHeld.set(player.id, input.jump);
    player.respawnTimer -= dt;
    if (player.respawnTimer <= 0 && player.lives > 0) {
      const index = [...room.players.keys()].indexOf(player.id);
      const spawn = map.spawns[index % 4];
      player.x = spawn.x;
      player.y = spawn.y;
      player.vx = 0;
      player.vy = 0;
      player.limbs = freshLimbs();
      player.weapon = "sidearm";
      player.ammo = player.ammoByWeapon.sidearm = WEAPONS.sidearm.ammo;
      player.charge = 0;
      player.invulnerable = 1.4;
      emitEvent(room, "respawn", player.x, player.y - PLAYER_TARGET_OFFSET, 1, { targetId: player.id });
    }
    return;
  }

  if (input.weaponSlot !== undefined) {
    const next = room.config.weaponSet[input.weaponSlot - 1];
    if (next && next !== player.weapon) {
      player.weapon = next;
      player.ammo = player.ammoByWeapon[next];
      player.charge = 0;
    }
    input.weaponSlot = undefined;
  }

  // Held-weapon ammo slowly regenerates so sustained fire stays viable.
  // Integer grants on a tick cadence keep ammo a clean integer for the HUD.
  const heldMax = WEAPONS[player.weapon].ammo;
  if (room.tick % AMMO_REGEN_INTERVAL_TICKS === 0 && player.ammo < heldMax) {
    player.ammo = Math.min(heldMax, player.ammo + 1);
    player.ammoByWeapon[player.weapon] = player.ammo;
  }

  const modifiers = calculateLimbModifiers(player.limbs);
  const move = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  // M24 feel pass: faster acceleration + a higher top speed (the old 30/tick
  // with 0.78 friction capped ground speed at ~106px/s — slower than air, and
  // the main source of "sticky" controls). Numbers live in MOVE_TUNING so the
  // client and the balance tooling reason over the same values.
  player.vx += move * MOVE_TUNING.accelerate * modifiers.move;
  player.vx *= player.onGround ? MOVE_TUNING.groundFriction : MOVE_TUNING.airFriction;
  player.vx = clamp(player.vx, -MOVE_TUNING.maxSpeed * modifiers.move, MOVE_TUNING.maxSpeed * modifiers.move);
  if (move) player.facing = move as 1 | -1;
  const jumpPressed = input.jump && !room.jumpHeld.get(player.id);
  room.jumpHeld.set(player.id, input.jump);
  if (jumpPressed && player.jumpsUsed < MAX_JUMPS) {
    player.vy = -(player.jumpsUsed === 0 ? MOVE_TUNING.jumpGround : MOVE_TUNING.jumpAir) * modifiers.jump;
    player.jumpsUsed += 1;
    player.onGround = false;
  }

  player.vy += MOVE_TUNING.gravity * dt;
  const oldY = player.y;
  player.x = clamp(player.x + player.vx * dt, PLAYER_HALF_WIDTH, WORLD.width - PLAYER_HALF_WIDTH);
  player.y += player.vy * dt;
  player.onGround = false;

  resolveSolids(player, map.platforms);

  for (const platform of map.platforms) {
    const crossed = oldY + PLAYER_FOOT_OFFSET <= platform.y && player.y + PLAYER_FOOT_OFFSET >= platform.y;
    const canDrop = input.drop && platform.oneWay;
    if (player.vy >= 0 && crossed && !canDrop && player.x > platform.x - PLAYER_HALF_WIDTH && player.x < platform.x + platform.width + PLAYER_HALF_WIDTH) {
      player.y = platform.y - PLAYER_FOOT_OFFSET;
      player.vy = 0;
      player.onGround = true;
      player.jumpsUsed = 0;
    }
  }
  const movers = [...room.hazards.filter((hazard) => hazard.kind === "cargoLift"), ...room.movers];
  for (const surface of movers) {
    const crossed = oldY + PLAYER_FOOT_OFFSET <= surface.y && player.y + PLAYER_FOOT_OFFSET >= surface.y;
    if (player.vy >= 0 && crossed && player.x > surface.x - PLAYER_HALF_WIDTH && player.x < surface.x + surface.width + PLAYER_HALF_WIDTH) {
      player.y = surface.y - PLAYER_FOOT_OFFSET;
      player.vy = surface.vy;
      player.onGround = true;
      player.jumpsUsed = 0;
    }
  }

  if (player.y > WORLD.height + 80) {
    // Fresh respawns get one free rescue instead of an instant re-death loop:
    // bot or player, falling twice in a row right after spawning is a nav
    // failure, not a kill. Teleport back to the spawn pad.
    if (player.invulnerable > 0.9) {
      const index = [...room.players.keys()].indexOf(player.id);
      const spawn = map.spawns[index % 4];
      player.x = spawn.x;
      player.y = spawn.y;
      player.vx = 0;
      player.vy = 0;
      player.jumpsUsed = 0;
    } else {
      loseLife(room, player, player.x, WORLD.height, "fall");
    }
  }
  // Charge weapons accumulate while held and release on the press; everything
  // else keeps the classic hold-to-fire gate.
  const primaryDef = WEAPONS[player.weapon].primary;
  if (primaryDef.chargeMax !== undefined) {
    if (input.primary) {
      player.charge = Math.min(1, (player.charge ?? 0) + dt / primaryDef.chargeMax);
    } else if (player.charge) {
      const released = player.charge;
      player.charge = 0;
      attack(room, player, false, released);
    } else {
      player.charge = 0;
    }
  } else {
    player.charge = 0;
    if (input.primary) attack(room, player, false);
  }
  if (input.secondary) attack(room, player, true);
}
