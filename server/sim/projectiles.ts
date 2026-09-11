// M28.5 结构拆分：弹道域——Echo 反弹、每帧弹道步进（扫掠命中/爆炸/引信/越界清理）。
// 依赖方向：projectiles → damage → state。
import {
  PLAYER_TARGET_OFFSET,
  PROP_TUNING,
  WEAPONS,
  WORLD,
  clamp,
  rangeFalloff,
  segmentHitsProp,
  segmentImpactPoint,
  type MapDef,
  type Platform,
  type ProjectileState,
} from "../../shared/game.js";
import { emitEvent, type Room } from "../state.js";
import { damage, damageProp, isEliminated } from "./damage.js";
import { sameTeam } from "./teams.js";

// Echo Shard ricochet: reflect the shard off the struck platform face using
// the pre-move position to pick the axis (both on corner strikes) and push it
// back out of the collision band so the same platform cannot re-trigger on the
// next tick. Returns false when the shard is already fully embedded (fizzle it).
function bounceProjectile(projectile: ProjectileState, platform: Platform, dt: number) {
  const prevX = projectile.x - projectile.vx * dt;
  const prevY = projectile.y - projectile.vy * dt;
  const r = projectile.radius;
  const fromLeft = prevX <= platform.x;
  const fromRight = prevX >= platform.x + platform.width;
  const fromAbove = prevY <= platform.y;
  const fromBelow = prevY >= platform.y + platform.height;
  let bounced = false;
  if ((fromLeft && projectile.vx > 0) || (fromRight && projectile.vx < 0)) {
    projectile.vx = -projectile.vx;
    projectile.x = fromLeft ? platform.x - r - 0.5 : platform.x + platform.width + r + 0.5;
    bounced = true;
  }
  if ((fromAbove && projectile.vy > 0) || (fromBelow && projectile.vy < 0)) {
    projectile.vy = -projectile.vy;
    projectile.y = fromAbove ? platform.y - 8.5 : platform.y + platform.height + 8.5;
    bounced = true;
  }
  if (!bounced) {
    // Fully embedded (spawned inside the band, corner tunneling): flip along
    // the dominant velocity axis and rewind to the pre-move spot.
    if (Math.abs(projectile.vx) >= Math.abs(projectile.vy)) {
      projectile.vx = -projectile.vx;
      projectile.x = prevX;
    } else {
      projectile.vy = -projectile.vy;
      projectile.y = prevY;
    }
    return true;
  }
  return true;
}

export function stepProjectiles(room: Room, map: MapDef, dt: number) {
  // Explosive splash with M19 radial falloff: ~0.7x damage and knockback at
  // the core tapering to 0.2x at the blast edge. One helper for wall
  // detonations, body detonations and range-cap air bursts. M25: rocket
  // blasts also cook barrels at half damage — chain fuel.
  const detonate = (projectile: ProjectileState, x: number, y: number, skipId?: string) => {
    emitEvent(room, "explosion", x, y, clamp(projectile.explosiveRadius / 90, 0.6, 1.5), { actorId: projectile.ownerId, weaponId: projectile.weaponId, secondary: projectile.secondary });
    for (const nearby of room.players.values()) {
      if (nearby.id === projectile.ownerId || nearby.id === skipId || nearby.respawnTimer > 0 || isEliminated(room, nearby)) continue;
      const distance = Math.hypot(nearby.x - x, nearby.y - PLAYER_TARGET_OFFSET - y);
      if (distance >= projectile.explosiveRadius) continue;
      const falloff = clamp(0.7 - 0.5 * (distance / projectile.explosiveRadius), 0.2, 0.7);
      damage(room, nearby, projectile.damage * falloff, projectile.knockback * falloff, x, nearby.x, nearby.y - PLAYER_TARGET_OFFSET, { actorId: projectile.ownerId, weaponId: projectile.weaponId, secondary: projectile.secondary, explosive: true });
    }
    for (const prop of room.props) {
      if (!prop.alive) continue;
      if (Math.hypot(prop.x - x, prop.y - y) >= projectile.explosiveRadius + PROP_TUNING.radius) continue;
      damageProp(room, prop, projectile.damage * 0.5, projectile.ownerId);
    }
  };

  for (const projectile of room.projectiles) {
    const attackDef = WEAPONS[projectile.weaponId][projectile.secondary ? "secondary" : "primary"];
    const speed = Math.hypot(projectile.vx, projectile.vy);
    // M24 swept hit detection: remember this tick's pre-move position so the
    // body test runs against the full flight segment, not the arrival point.
    // A 780px/s pellet moves ~13px per tick — more than the old 12px hit
    // radius — so fast rounds could previously pass clean through a torso.
    const prevX = projectile.x;
    const prevY = projectile.y;
    projectile.x += projectile.vx * dt;
    projectile.y += projectile.vy * dt;
    // M27 ballistics: flame is lighter than air — it RISES as it burns out,
    // everything else keeps the standard 720 sag. The Pyre Vent's arc hugs
    // ledges and licks up over cover instead of dropping short.
    projectile.vy += (projectile.weaponId === "flame" ? -190 : 720) * dt;
    projectile.ttl -= dt;
    // M19 hard range cap: rounds measure travel from the muzzle. Rockets
    // air-burst at the cap; every other round fizzles out mid-flight.
    projectile.travelled += speed * dt;
    if (attackDef.range > 0 && projectile.travelled >= attackDef.range) {
      if (projectile.explosiveRadius) detonate(projectile, projectile.x, projectile.y);
      else emitEvent(room, "impact", projectile.x, projectile.y, 0.4, { weaponId: projectile.weaponId, secondary: projectile.secondary, pattern: projectile.pattern, surface: false });
      projectile.ttl = 0;
      continue;
    }
    let dead = projectile.ttl <= 0;
    if (!dead) for (const platform of map.platforms) {
      if (projectile.y > platform.y - 8 && projectile.y < platform.y + platform.height + 8 && projectile.x > platform.x && projectile.x < platform.x + platform.width) {
        // Echo Shard ricochet: surviving shards reflect and keep flying.
        if (projectile.pattern === "bounce" && projectile.bouncesRemaining > 0) {
          bounceProjectile(projectile, platform, dt);
          projectile.bouncesRemaining -= 1;
          emitEvent(room, "impact", projectile.x, projectile.y, Math.min(0.9, speed / 700), { weaponId: projectile.weaponId, secondary: projectile.secondary, pattern: "bounce", surface: true });
          break;
        }
        if (projectile.explosiveRadius) {
          // Rockets detonate on any surface, not just bodies.
          detonate(projectile, projectile.x, projectile.y);
        } else {
          // Wall hit: surface dust and debris so no round dies silently.
          emitEvent(room, "impact", projectile.x, projectile.y, Math.min(1.2, speed / 700), { weaponId: projectile.weaponId, secondary: projectile.secondary, pattern: projectile.pattern, surface: true });
        }
        dead = true;
        break;
      }
    }
    // M25: swept segment vs barrels — the round's prev→next flight path must
    // miss every live barrel for it to survive the tick. Barrels never block
    // the round's own progress; they just take the damage (and a rocket still
    // detonates normally).
    if (!dead) for (const prop of room.props) {
      if (!prop.alive) continue;
      if (!segmentHitsProp(prop, prevX, prevY, projectile.x, projectile.y, projectile.radius)) continue;
      // M27 Pyre Vent: flame doesn't chip barrels — it LIGHTS them. The drum
      // burns for ~0.8s (visible fire + its own light the whole time), then
      // cooks off through the same detonation path as a shot barrel.
      if (projectile.weaponId === "flame") {
        if (!prop.burning) {
          prop.burning = 0.8;
          prop.lastActorId = projectile.ownerId;
          emitEvent(room, "impact", prop.x, prop.y - 14, 0.6, { weaponId: projectile.weaponId, secondary: projectile.secondary, pattern: projectile.pattern, surface: true });
        }
        if (projectile.pierceRemaining > 0) projectile.pierceRemaining -= 1;
        else dead = true;
        break;
      }
      damageProp(room, prop, projectile.damage, projectile.ownerId);
      if (projectile.explosiveRadius) detonate(projectile, projectile.x, projectile.y);
      else emitEvent(room, "impact", projectile.x, projectile.y, Math.min(1, speed / 700), { weaponId: projectile.weaponId, secondary: projectile.secondary, pattern: projectile.pattern, surface: true });
      if (projectile.pierceRemaining > 0) projectile.pierceRemaining -= 1;
      else dead = true;
      break;
    }
    if (!dead) {
      // M30: rounds resolve owner→squad once per flight step; squadmates are
      // skipped entirely so shots pass THROUGH them instead of being eaten
      // (the old path registered the hit and wasted the round on zero damage).
      const owner = room.players.get(projectile.ownerId);
      for (const target of room.players.values()) {
        if (target.id === projectile.ownerId || projectile.hitIds.includes(target.id) || target.respawnTimer > 0 || isEliminated(room, target)) continue;
        if (sameTeam(room, owner, target)) continue;
        // M24 swept capsule test: the projectile's prev→next segment must miss
        // the whole capsule for the round to pass by. Tunneling is now
        // geometrically impossible regardless of projectile speed.
        const impact = segmentImpactPoint(target, prevX, prevY, projectile.x, projectile.y);
        if (!impact) continue;
        projectile.hitIds.push(target.id);
        const travelFalloff = rangeFalloff(projectile.travelled, attackDef.range);
        damage(room, target, projectile.damage * travelFalloff, projectile.knockback, prevX, impact.x, impact.y, { actorId: projectile.ownerId, weaponId: projectile.weaponId, secondary: projectile.secondary, explosive: projectile.explosiveRadius > 0 });
        if (projectile.explosiveRadius) {
          detonate(projectile, projectile.x, projectile.y, target.id);
        }
        if (projectile.pierceRemaining > 0) projectile.pierceRemaining -= 1;
        else {
          // Non-explosive rounds that die on a body still chip the surface behind it.
          if (!projectile.explosiveRadius) {
            emitEvent(room, "impact", projectile.x, projectile.y, 0.7, { weaponId: projectile.weaponId, secondary: projectile.secondary, pattern: projectile.pattern, surface: true });
          }
          dead = true;
        }
        break;
      }
    }
    if (dead) projectile.ttl = 0;
  }

  // Rounds that fly off the map or expire mid-air: faint fizzle for out-of-bounds.
  for (const projectile of room.projectiles) {
    const leaving = projectile.x <= -100 || projectile.x >= WORLD.width + 100 || projectile.y >= WORLD.height + 150;
    if (leaving && projectile.ttl > 0) {
      emitEvent(room, "impact", projectile.x > 0 && projectile.x < WORLD.width ? projectile.x : Math.max(6, Math.min(WORLD.width - 6, projectile.x)), WORLD.height - 8, 0.4, { weaponId: projectile.weaponId, secondary: projectile.secondary, pattern: projectile.pattern, surface: false });
    }
  }
  room.projectiles = room.projectiles.filter((projectile) => projectile.ttl > 0 && projectile.x > -100 && projectile.x < WORLD.width + 100 && projectile.y < WORLD.height + 150);
}
