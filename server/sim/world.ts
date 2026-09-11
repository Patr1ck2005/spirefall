// M28.5 结构拆分：世界域——武器箱（生成/拾取）、机关（升降/压闸/传送带/活塞）、
// 爆炸桶（重生倒计时/燃烧引信）。
// 依赖方向：world → damage → state（另用 players.intersectsPlayerRect）。
import {
  LIMB_IDS,
  ITEM_TUNING,
  MAPS,
  PLAYER_FOOT_OFFSET,
  PLAYER_HALF_WIDTH,
  PLAYER_TARGET_OFFSET,
  PROP_TUNING,
  WEAPONS,
  WORLD,
  calculateHazardState,
  clamp,
  freshLimbs,
  mobRadius,
  type CrateState,
  type HazardState,
  type PlayerState,
} from "../../shared/game.js";
import { emitEvent, randomBetween, type Room } from "../state.js";
import { applyLimbDamage, damage, damageMob, detonateProp, isEliminated, killMob, loseLife } from "./damage.js";
import { rollItem } from "./items.js";
import { intersectsPlayerRect } from "./players.js";

export function scheduleCrateSpawn(room: Room, crate: CrateState, delayTicks: number) {
  crate.active = false;
  crate.respawnTimer = delayTicks / WORLD.tickRate;
  crate.nextSpawnTick = room.tick + delayTicks;
}

export function spawnCrate(room: Room, crate: CrateState) {
  const sockets = MAPS[room.config.mapId].crateSockets;
  const occupied = new Set(room.crates.filter((candidate) => candidate.active && candidate.id !== crate.id).map((candidate) => candidate.socketId));
  const available = sockets.filter((socket) => !occupied.has(socket.id));
  if (!available.length) return;
  const socket = available[randomBetween(0, available.length - 1)];
  crate.socketId = socket.id;
  crate.x = socket.x;
  crate.y = socket.y;
  // ~1 in 4 spawns is a repair cell: restores limbs instead of swapping guns.
  crate.kind = randomBetween(0, 3) === 0 ? "repair" : "weapon";
  crate.weapon = room.config.weaponSet[randomBetween(0, room.config.weaponSet.length - 1)];
  crate.item = undefined;
  // M32: roughly 1 in 5 spawns is an item crate for the G-slot.
  if (randomBetween(0, 4) === 0) {
    crate.kind = "item";
    crate.item = rollItem();
  }
  crate.active = true;
  crate.respawnTimer = 0;
  crate.nextSpawnTick = 0;
  crate.generation += 1;
  emitEvent(room, "crateSpawn", crate.x, crate.y, 1, { weaponId: crate.weapon, crateKind: crate.kind, itemId: crate.item });
}

export function updateHazards(room: Room, previous: HazardState[], dt: number) {
  const defs = MAPS[room.config.mapId].hazards;
  room.hazards = defs.map((def) => calculateHazardState(def, room.tick));
  for (const state of room.hazards) {
    const def = defs.find((candidate) => candidate.id === state.id)!;
    const old = previous.find((candidate) => candidate.id === state.id) || state;
    for (const player of room.players.values()) {
      if (player.respawnTimer > 0 || isEliminated(room, player)) continue;
      if (state.kind === "cargoLift") {
        const wasStanding = Math.abs(player.y + PLAYER_FOOT_OFFSET - old.y) < 6 && player.x > old.x - PLAYER_HALF_WIDTH && player.x < old.x + old.width + PLAYER_HALF_WIDTH;
        if (wasStanding) {
          player.x += (state.x - old.x);
          player.y += (state.y - old.y);
          player.onGround = true;
        }
        continue;
      }
      if (state.kind === "conveyor") {
        const standing = Math.abs(player.y + PLAYER_FOOT_OFFSET - state.y) < 7 && player.x > state.x - PLAYER_HALF_WIDTH && player.x < state.x + state.width + PLAYER_HALF_WIDTH;
        if (standing) player.x += state.vx * dt;
        continue;
      }
      if (state.phase !== "active" || !intersectsPlayerRect(player, state)) continue;
      const hitKey = `${state.id}:${player.id}`;
      const lastHit = room.hazardHits.get(hitKey) || -1000;
      if (room.tick - lastHit < 30) continue;
      room.hazardHits.set(hitKey, room.tick);
      emitEvent(room, "hazard", player.x, player.y - PLAYER_TARGET_OFFSET, state.lethal ? 1.5 : 1, { targetId: player.id });
      if (state.lethal) {
        for (const limbId of LIMB_IDS) applyLimbDamage(room, player, limbId, 100, {});
        loseLife(room, player, player.x, player.y - PLAYER_TARGET_OFFSET, "hazard");
      } else {
        damage(room, player, def.limbDamage || 45, def.force || 560, state.x + state.width / 2, player.x, player.y - 12, {});
      }
    }
    // M31: lethal crusher/piston zones grind hostile mobs instantly (no drops
    // inside a machine — the pack would be unreachable anyway).
    if (state.phase === "active" && state.lethal) {
      for (const mob of [...room.mobs]) {
        const radius = mobRadius(mob.kind);
        const overlapping = mob.x + radius > state.x && mob.x - radius < state.x + state.width && mob.y + 4 > state.y && mob.y - 20 < state.y + state.height;
        if (!overlapping) continue;
        mob.hp = 0;
        killMob(room, mob, false);
      }
    }
  }
}

export function updateCrates(room: Room) {
  for (const crate of room.crates) {
    if (!crate.active) {
      crate.respawnTimer = Math.max(0, (crate.nextSpawnTick - room.tick) / WORLD.tickRate);
      if (room.tick >= crate.nextSpawnTick) spawnCrate(room, crate);
      continue;
    }
    for (const player of room.players.values()) {
      if (player.respawnTimer <= 0 && Math.hypot(player.x - crate.x, player.y - crate.y) < 34) {
        if (crate.kind === "item") {
          // M32: item crates fill an EMPTY G-slot only — a carried item blocks
          // the pickup so crates stay on the field for the next pilot.
          if (player.item) continue;
          player.item = crate.item;
          if (crate.item === "jetpack") player.jetpackFuel = ITEM_TUNING.jetpack.fuel;
          emitEvent(room, "cratePickup", crate.x, crate.y, 1, { actorId: player.id, crateKind: "item", itemId: crate.item });
        } else if (crate.kind === "repair") {
          player.limbs = freshLimbs();
          emitEvent(room, "cratePickup", crate.x, crate.y, 1, { actorId: player.id, weaponId: crate.weapon, crateKind: crate.kind });
        } else {
          player.weapon = crate.weapon;
          player.ammoByWeapon[player.weapon] = WEAPONS[player.weapon].ammo;
          player.ammo = player.ammoByWeapon[player.weapon];
          emitEvent(room, "cratePickup", crate.x, crate.y, 1, { actorId: player.id, weaponId: crate.weapon, crateKind: crate.kind });
        }
        crate.active = false;
        crate.nextSpawnTick = room.tick + randomBetween(360, 720);
        crate.respawnTimer = (crate.nextSpawnTick - room.tick) / WORLD.tickRate;
        break;
      }
    }
  }
}

// M25 destructible props: respawn scheduling for destroyed barrels. The
// barrels themselves never block movement or shots — they are pure targets.
// M27 Pyre Vent: a burning drum counts down each tick and cooks off at zero
// — the flamethrower's burst tool against clustered cover.
export function updateProps(room: Room, dt: number) {
  for (const prop of room.props) {
    if (!prop.alive) {
      prop.respawnTimer = Math.max(0, (prop.nextSpawnTick - room.tick) / WORLD.tickRate);
      if (room.tick >= prop.nextSpawnTick) {
        prop.alive = true;
        prop.hp = PROP_TUNING.hp;
        prop.respawnTimer = 0;
        prop.generation += 1;
        prop.lastActorId = undefined;
        prop.burning = undefined;
        emitEvent(room, "propSpawn", prop.x, prop.y, 0.8, { propId: prop.id });
      }
      continue;
    }
    if (prop.burning !== undefined && prop.burning > 0) {
      prop.burning = Math.max(0, prop.burning - dt);
      if (prop.burning === 0) {
        detonateProp(room, prop);
      }
    }
  }
}
