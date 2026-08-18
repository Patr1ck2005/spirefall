import { createServer } from "node:http";
import { randomInt, randomUUID } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import {
  DEFAULT_CONFIG,
  LIMB_IDS,
  MAPS,
  MAX_JUMPS,
  PLAYER_BODY_HEIGHT,
  PLAYER_FOOT_OFFSET,
  PLAYER_HALF_WIDTH,
  PLAYER_HIT_RADIUS,
  PLAYER_TARGET_OFFSET,
  WEAPONS,
  WORLD,
  calculateHazardState,
  calculateLimbModifiers,
  clamp,
  freshLimbs,
  makePlayer,
  selectLimbAtPoint,
  type ClientInput,
  type CombatEvent,
  type CombatEventType,
  type CrateState,
  type HazardDef,
  type HazardState,
  type LimbId,
  type MatchConfig,
  type MatchMode,
  type PlayerState,
  type ProjectileState,
  type RoomView,
  type ServerSnapshot,
  type WeaponId,
} from "../shared/game.js";

type Client = {
  ws: WebSocket;
  id: string;
  room?: Room;
  token: string;
  input: ClientInput;
  jumpHeld: boolean;
};

type Room = {
  code: string;
  hostId: string;
  clients: Map<string, Client>;
  players: Map<string, PlayerState>;
  tokens: Map<string, string>;
  config: MatchConfig;
  phase: ServerSnapshot["phase"];
  mode: MatchMode;
  tick: number;
  projectiles: ProjectileState[];
  crates: CrateState[];
  hazards: HazardState[];
  events: CombatEvent[];
  nextProjectile: number;
  nextEvent: number;
  reconnectTimers: Map<string, ReturnType<typeof setTimeout>>;
  hazardHits: Map<string, number>;
  winner?: string;
};

const rooms = new Map<string, Room>();
const blankInput = (): ClientInput => ({ seq: 0, left: false, right: false, jump: false, drop: false, primary: false, secondary: false });
const json = (value: unknown) => JSON.stringify(value);
const send = (client: Client, type: string, payload: unknown) => {
  if (client.ws.readyState === WebSocket.OPEN) client.ws.send(json({ type, ...(payload as object) }));
};

const roomView = (room: Room): RoomView => ({
  code: room.code,
  hostId: room.hostId,
  phase: room.phase,
  mode: room.mode,
  config: room.config,
  players: [...room.players.values()].map(({ id, name, connected, color, archetype }) => ({ id, name, connected, color, archetype })),
});

const createCode = () => {
  let value = "";
  do value = randomInt(100000, 999999).toString(); while (rooms.has(value));
  return value;
};

function emitEvent(
  room: Room,
  type: CombatEventType,
  x: number,
  y: number,
  strength: number,
  details: Partial<Omit<CombatEvent, "id" | "tick" | "type" | "x" | "y" | "strength">> = {},
) {
  room.events.push({ id: room.nextEvent++, tick: room.tick, type, x, y, strength, ...details });
  const oldestTick = room.tick - WORLD.tickRate;
  room.events = room.events.filter((event) => event.tick >= oldestTick).slice(-128);
}

function createRoom(client: Client, name: string) {
  client.token = randomUUID();
  const room: Room = {
    code: createCode(),
    hostId: client.id,
    clients: new Map([[client.id, client]]),
    players: new Map(),
    tokens: new Map([[client.id, client.token]]),
    config: structuredClone(DEFAULT_CONFIG),
    phase: "lobby",
    mode: "match",
    tick: 0,
    projectiles: [],
    crates: [],
    hazards: [],
    events: [],
    nextProjectile: 1,
    nextEvent: 1,
    reconnectTimers: new Map(),
    hazardHits: new Map(),
  };
  client.room = room;
  room.players.set(client.id, makePlayer(client.id, name.slice(0, 16) || "Player", 0, room.config));
  rooms.set(room.code, room);
  send(client, "room", { room: roomView(room), token: client.token, selfId: client.id });
}

function joinRoom(client: Client, roomCode: string, name: string) {
  const room = rooms.get(roomCode);
  if (!room) return send(client, "error", { message: "Room not found" });
  if (room.phase !== "lobby") return send(client, "error", { message: "The match has already started" });
  if (room.players.size >= 4) return send(client, "error", { message: "Room is full" });
  client.room = room;
  client.token = randomUUID();
  const player = makePlayer(client.id, name.slice(0, 16) || "Player", room.players.size, room.config);
  room.players.set(client.id, player);
  room.tokens.set(client.id, client.token);
  room.clients.set(client.id, client);
  send(client, "room", { room: roomView(room), token: client.token, selfId: client.id });
  broadcastRoom(room);
}

function broadcastRoom(room: Room) {
  for (const client of room.clients.values()) send(client, "room", { room: roomView(room) });
}

function leave(client: Client) {
  const room = client.room;
  if (!room || room.clients.get(client.id) !== client) return;
  room.clients.delete(client.id);
  const player = room.players.get(client.id);
  if (!player) return;
  player.connected = false;
  const timer = setTimeout(() => {
    if (room.clients.has(client.id)) return;
    room.players.delete(client.id);
    room.tokens.delete(client.id);
    room.reconnectTimers.delete(client.id);
    if (room.hostId === client.id) room.hostId = [...room.players.values()].find((candidate) => candidate.connected)?.id || [...room.players.keys()][0] || "";
    if (room.players.size === 0) rooms.delete(room.code);
    else broadcastRoom(room);
  }, 30000);
  room.reconnectTimers.set(client.id, timer);
  broadcastRoom(room);
}

function reconnect(client: Client, roomCode: string, playerId: string, token: string) {
  const room = rooms.get(roomCode);
  if (!room || room.tokens.get(playerId) !== token || !room.players.has(playerId)) return false;
  const player = room.players.get(playerId)!;
  const timer = room.reconnectTimers.get(playerId);
  if (timer) clearTimeout(timer);
  room.reconnectTimers.delete(playerId);
  client.id = playerId;
  client.room = room;
  client.token = token;
  client.input = blankInput();
  client.jumpHeld = false;
  player.connected = true;
  room.clients.set(playerId, client);
  send(client, "room", { room: roomView(room), token, selfId: playerId });
  broadcastRoom(room);
  return true;
}

function resetPlayer(room: Room, player: PlayerState, index: number) {
  const spawn = MAPS[room.config.mapId].spawns[index % 4];
  player.x = spawn.x;
  player.y = spawn.y;
  player.vx = 0;
  player.vy = 0;
  player.facing = index % 2 ? -1 : 1;
  player.onGround = false;
  player.jumpsUsed = 0;
  player.lives = room.config.lives;
  player.limbs = freshLimbs();
  player.weapon = "sidearm";
  for (const weaponId of Object.keys(WEAPONS) as WeaponId[]) player.ammoByWeapon[weaponId] = WEAPONS[weaponId].ammo;
  player.ammo = player.ammoByWeapon[player.weapon];
  player.connected = true;
  player.primaryCooldown = 0;
  player.secondaryCooldown = 0;
  player.respawnTimer = 0;
  player.hitFlash = 0;
  player.invulnerable = 1.5;
}

const randomBetween = (min: number, max: number) => randomInt(min, max + 1);

function scheduleCrateSpawn(room: Room, crate: CrateState, delayTicks: number) {
  crate.active = false;
  crate.respawnTimer = delayTicks / WORLD.tickRate;
  crate.nextSpawnTick = room.tick + delayTicks;
}

function spawnCrate(room: Room, crate: CrateState) {
  const sockets = MAPS[room.config.mapId].crateSockets;
  const occupied = new Set(room.crates.filter((candidate) => candidate.active && candidate.id !== crate.id).map((candidate) => candidate.socketId));
  const available = sockets.filter((socket) => !occupied.has(socket.id));
  if (!available.length) return;
  const socket = available[randomBetween(0, available.length - 1)];
  crate.socketId = socket.id;
  crate.x = socket.x;
  crate.y = socket.y;
  crate.weapon = room.config.weaponSet[randomBetween(0, room.config.weaponSet.length - 1)];
  crate.active = true;
  crate.respawnTimer = 0;
  crate.nextSpawnTick = 0;
  crate.generation += 1;
  emitEvent(room, "crateSpawn", crate.x, crate.y, 1, { weaponId: crate.weapon, visualSeed: randomBetween(0, 0x7fffffff) });
}

function start(room: Room, mode: MatchMode) {
  const invalidCount = mode === "sandbox" ? room.players.size !== 1 : room.players.size < 2;
  if (room.phase !== "lobby" || invalidCount) return;
  room.phase = "playing";
  room.mode = mode;
  room.winner = undefined;
  room.tick = 0;
  room.projectiles = [];
  room.events = [];
  room.hazardHits.clear();
  [...room.players.values()].forEach((player, index) => resetPlayer(room, player, index));
  room.crates = room.config.crates
    ? [0, 1, 2, 3, 4, 5].map((id) => ({ id, x: 0, y: 0, weapon: "sidearm" as WeaponId, active: false, respawnTimer: 0, socketId: "", generation: 0, nextSpawnTick: id < 3 ? randomBetween(60, 180) : Number.MAX_SAFE_INTEGER }))
    : [];
  room.hazards = MAPS[room.config.mapId].hazards.map((def) => calculateHazardState(def, 0));
  broadcastRoom(room);
}

function returnToLobby(room: Room) {
  room.phase = "lobby";
  room.mode = "match";
  room.winner = undefined;
  room.projectiles = [];
  room.crates = [];
  room.hazards = [];
  room.events = [];
  for (const client of room.clients.values()) {
    client.input = blankInput();
    client.jumpHeld = false;
  }
  broadcastRoom(room);
}

function respawnSandboxPlayer(room: Room, playerId: string) {
  const player = room.players.get(playerId);
  if (!player || room.mode !== "sandbox" || room.phase !== "playing") return;
  loseLife(room, player, player.x, player.y - PLAYER_TARGET_OFFSET, "hazard", false);
}

function setConfig(room: Room, patch: Partial<MatchConfig>) {
  if (room.phase !== "lobby") return;
  const mapId = patch.mapId && patch.mapId in MAPS ? patch.mapId : room.config.mapId;
  const requestedWeapons = patch.weaponSet?.filter((id): id is WeaponId => id in WEAPONS).slice(0, 6);
  if (requestedWeapons && !requestedWeapons.includes("sidearm")) requestedWeapons.unshift("sidearm");
  room.config = {
    ...room.config,
    ...patch,
    mapId,
    lives: clamp(Number(patch.lives ?? room.config.lives), 1, 5) as MatchConfig["lives"],
    weaponSet: requestedWeapons?.length ? requestedWeapons : room.config.weaponSet,
  };
  for (const player of room.players.values()) {
    player.weapon = "sidearm";
    player.ammo = player.ammoByWeapon[player.weapon];
  }
  broadcastRoom(room);
}

function intersectsCircle(a: { x: number; y: number; r: number }, b: { x: number; y: number; r: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y) <= a.r + b.r;
}

function intersectsPlayerRect(player: PlayerState, rect: { x: number; y: number; width: number; height: number }) {
  return player.x + PLAYER_HALF_WIDTH > rect.x && player.x - PLAYER_HALF_WIDTH < rect.x + rect.width && player.y + PLAYER_FOOT_OFFSET > rect.y && player.y - PLAYER_BODY_HEIGHT < rect.y + rect.height;
}

function applyLimbDamage(room: Room, player: PlayerState, limbId: LimbId, amount: number, details: Partial<CombatEvent>) {
  const before = player.limbs[limbId];
  player.limbs[limbId] = clamp(before - amount, 0, 100);
  if (before > 0 && player.limbs[limbId] === 0) emitEvent(room, "dismember", player.x, player.y - PLAYER_TARGET_OFFSET, 1, { targetId: player.id, limbId, actorId: details.actorId, weaponId: details.weaponId });
}

function damage(
  room: Room,
  victim: PlayerState,
  amount: number,
  force: number,
  sourceX: number,
  hitX: number,
  hitY: number,
  details: { actorId?: string; weaponId?: WeaponId; secondary?: boolean; explosive?: boolean } = {},
) {
  if (victim.invulnerable > 0 || victim.respawnTimer > 0) return;
  victim.vx += (victim.x >= sourceX ? 1 : -1) * force;
  victim.vy -= force * 0.42;
  victim.hitFlash = 0.13;
  if (details.explosive) {
    for (const limbId of LIMB_IDS) applyLimbDamage(room, victim, limbId, amount * 0.5, details);
  } else {
    const limbId = selectLimbAtPoint(victim, hitX, hitY);
    if (limbId) applyLimbDamage(room, victim, limbId, amount, details);
  }
  emitEvent(room, "hit", hitX, hitY, clamp(force / 520, 0.2, 1.4), { targetId: victim.id, actorId: details.actorId, weaponId: details.weaponId, secondary: details.secondary, limbId: selectLimbAtPoint(victim, hitX, hitY) });
}

function attack(room: Room, player: PlayerState, secondary: boolean) {
  const weapon = WEAPONS[player.weapon];
  const def = secondary ? weapon.secondary : weapon.primary;
  const cooldownKey = secondary ? "secondaryCooldown" : "primaryCooldown";
  if (player[cooldownKey] > 0 || player.respawnTimer > 0 || player.ammo < def.ammoCost) return;
  const modifiers = calculateLimbModifiers(player.limbs);
  player[cooldownKey] = def.cooldown * modifiers.cooldown;
  player.ammo -= def.ammoCost;
  player.ammoByWeapon[player.weapon] = player.ammo;
  player.vx -= player.facing * def.recoil * modifiers.recoil;
  const originX = player.x + player.facing * 12;
  const originY = player.y - PLAYER_TARGET_OFFSET;
  emitEvent(room, "attack", originX, originY, secondary ? 1 : 0.7, {
    actorId: player.id,
    weaponId: player.weapon,
    secondary,
    pattern: def.pattern,
    direction: player.facing,
    count: def.count,
    visualSeed: randomBetween(0, 0x7fffffff),
  });

  if (def.kind === "melee") {
    if (def.pattern === "dashSlash") {
      player.x = clamp(player.x + player.facing * def.dashDistance, PLAYER_HALF_WIDTH, WORLD.width - PLAYER_HALF_WIDTH);
      player.vx = player.facing * def.dashSpeed;
    }
    for (const other of room.players.values()) {
      const hitX = other.x - player.facing * 10;
      const hitY = other.y - (secondary ? 9 : 15);
      if (other.id !== player.id && intersectsCircle({ x: originX + player.facing * def.range / 2, y: originY, r: def.range / 2 }, { x: other.x, y: other.y - PLAYER_TARGET_OFFSET, r: PLAYER_HIT_RADIUS })) {
        damage(room, other, def.damage, def.knockback, player.x, hitX, hitY, { actorId: player.id, weaponId: player.weapon, secondary });
      }
    }
    return;
  }

  if (def.kind === "hitscan") {
    const shots = def.pattern === "burst" ? def.count : 1;
    for (let shot = 0; shot < shots; shot++) {
      const angle = (shot - (shots - 1) / 2) * def.spread;
      const directionX = Math.cos(angle) * player.facing;
      const directionY = Math.sin(angle);
      const targets = [...room.players.values()]
        .filter((other) => {
          const dx = other.x - originX;
          const dy = other.y - PLAYER_TARGET_OFFSET - originY;
          return other.id !== player.id && directionX * dx + directionY * dy > 0 && Math.abs(dy - Math.tan(angle) * dx) < 16 && Math.abs(dx) < def.range;
        })
        .sort((a, b) => Math.abs(a.x - originX) - Math.abs(b.x - originX));
      const limit = def.pattern === "piercing" ? def.pierce + 1 : 1;
      for (const other of targets.slice(0, limit)) {
        damage(room, other, def.damage, def.knockback, player.x, other.x - player.facing * 7, other.y - PLAYER_TARGET_OFFSET, { actorId: player.id, weaponId: player.weapon, secondary });
      }
    }
    return;
  }

  const count = def.pattern === "pellet" || def.pattern === "cluster" ? def.count : 1;
  for (let index = 0; index < count; index++) {
    const spread = def.pattern === "pellet"
      ? (index - (count - 1) / 2) * (def.spread / Math.max(1, count - 1))
      : def.pattern === "cluster" ? (index - 1) * def.spread : (Math.random() - 0.5) * def.spread;
    room.projectiles.push({
      id: room.nextProjectile++,
      ownerId: player.id,
      weaponId: player.weapon,
      secondary,
      x: originX,
      y: originY,
      vx: Math.cos(spread) * player.facing * def.speed,
      vy: Math.sin(spread) * def.speed,
      radius: def.radius,
      damage: def.damage,
      knockback: def.knockback,
      explosiveRadius: def.explosiveRadius,
      pierceRemaining: def.pierce,
      pattern: def.pattern,
      hitIds: [],
      ttl: 2.4,
    });
  }
}

function loseLife(room: Room, player: PlayerState, x: number, y: number, cause: "fall" | "hazard", emit = true) {
  if (player.respawnTimer > 0) return;
  if (room.mode === "sandbox") player.lives = room.config.lives;
  else player.lives -= 1;
  player.vx = 0;
  player.vy = 0;
  player.jumpsUsed = 0;
  player.respawnTimer = room.mode === "sandbox" || player.lives > 0 ? 1.5 : 2.5;
  if (emit) emitEvent(room, "death", x, y, cause === "hazard" ? 1.35 : 1, { targetId: player.id });
}

function updateHazards(room: Room, previous: HazardState[], dt: number) {
  const defs = MAPS[room.config.mapId].hazards;
  room.hazards = defs.map((def) => calculateHazardState(def, room.tick));
  for (const state of room.hazards) {
    const def = defs.find((candidate) => candidate.id === state.id)!;
    const old = previous.find((candidate) => candidate.id === state.id) || state;
    for (const player of room.players.values()) {
      if (player.respawnTimer > 0) continue;
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
  }
}

function updateRoom(room: Room, dt: number) {
  if (room.phase !== "playing") return;
  room.tick++;
  const map = MAPS[room.config.mapId];
  const previousHazards = room.hazards.map((hazard) => ({ ...hazard }));
  updateHazards(room, previousHazards, dt);

  for (const client of room.clients.values()) {
    const player = room.players.get(client.id);
    if (!player || !player.connected) continue;
    const input = client.input;
    player.primaryCooldown = Math.max(0, player.primaryCooldown - dt);
    player.secondaryCooldown = Math.max(0, player.secondaryCooldown - dt);
    player.invulnerable = Math.max(0, player.invulnerable - dt);
    player.hitFlash = Math.max(0, player.hitFlash - dt);

    if (player.respawnTimer > 0) {
      client.jumpHeld = input.jump;
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
        player.invulnerable = 1.4;
        emitEvent(room, "respawn", player.x, player.y - PLAYER_TARGET_OFFSET, 1, { targetId: player.id });
      }
      continue;
    }

    if (input.weaponSlot !== undefined) {
      const next = room.config.weaponSet[input.weaponSlot - 1];
      if (next && next !== player.weapon) {
        player.weapon = next;
        player.ammo = player.ammoByWeapon[next];
      }
      input.weaponSlot = undefined;
    }

    const modifiers = calculateLimbModifiers(player.limbs);
    const move = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    player.vx += move * 30 * modifiers.move;
    player.vx *= player.onGround ? 0.78 : 0.93;
    player.vx = clamp(player.vx, -338 * modifiers.move, 338 * modifiers.move);
    if (move) player.facing = move as 1 | -1;
    const jumpPressed = input.jump && !client.jumpHeld;
    client.jumpHeld = input.jump;
    if (jumpPressed && player.jumpsUsed < MAX_JUMPS) {
      player.vy = -(player.jumpsUsed === 0 ? 560 : 510) * modifiers.jump;
      player.jumpsUsed += 1;
      player.onGround = false;
    }

    player.vy += 1150 * dt;
    const oldY = player.y;
    player.x = clamp(player.x + player.vx * dt, PLAYER_HALF_WIDTH, WORLD.width - PLAYER_HALF_WIDTH);
    player.y += player.vy * dt;
    player.onGround = false;

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
    for (const lift of room.hazards.filter((hazard) => hazard.kind === "cargoLift")) {
      const crossed = oldY + PLAYER_FOOT_OFFSET <= lift.y && player.y + PLAYER_FOOT_OFFSET >= lift.y;
      if (player.vy >= 0 && crossed && player.x > lift.x - PLAYER_HALF_WIDTH && player.x < lift.x + lift.width + PLAYER_HALF_WIDTH) {
        player.y = lift.y - PLAYER_FOOT_OFFSET;
        player.vy = lift.vy;
        player.onGround = true;
        player.jumpsUsed = 0;
      }
    }

    if (player.y > WORLD.height + 80) loseLife(room, player, player.x, WORLD.height, "fall");
    if (input.primary) attack(room, player, false);
    if (input.secondary) attack(room, player, true);
  }

  for (const crate of room.crates) {
    if (!crate.active) {
      crate.respawnTimer = Math.max(0, (crate.nextSpawnTick - room.tick) / WORLD.tickRate);
      if (room.tick >= crate.nextSpawnTick) spawnCrate(room, crate);
      continue;
    }
    for (const player of room.players.values()) {
      if (player.respawnTimer <= 0 && Math.hypot(player.x - crate.x, player.y - crate.y) < 34) {
        player.weapon = crate.weapon;
        player.ammoByWeapon[player.weapon] = WEAPONS[player.weapon].ammo;
        player.ammo = player.ammoByWeapon[player.weapon];
        crate.active = false;
        crate.nextSpawnTick = room.tick + randomBetween(360, 720);
        crate.respawnTimer = (crate.nextSpawnTick - room.tick) / WORLD.tickRate;
        emitEvent(room, "cratePickup", crate.x, crate.y, 1, { actorId: player.id, weaponId: crate.weapon, visualSeed: randomBetween(0, 0x7fffffff) });
        break;
      }
    }
  }

  for (const projectile of room.projectiles) {
    projectile.x += projectile.vx * dt;
    projectile.y += projectile.vy * dt;
    projectile.vy += 720 * dt;
    projectile.ttl -= dt;
    for (const platform of map.platforms) {
      if (projectile.y > platform.y - 8 && projectile.y < platform.y + platform.height + 8 && projectile.x > platform.x && projectile.x < platform.x + platform.width) projectile.ttl = 0;
    }
    for (const target of room.players.values()) {
      if (target.id === projectile.ownerId || projectile.hitIds.includes(target.id) || target.respawnTimer > 0 || !intersectsCircle({ x: projectile.x, y: projectile.y, r: projectile.radius }, { x: target.x, y: target.y - PLAYER_TARGET_OFFSET, r: PLAYER_HIT_RADIUS })) continue;
      projectile.hitIds.push(target.id);
      damage(room, target, projectile.damage, projectile.knockback, projectile.x - projectile.vx, projectile.x, projectile.y, { actorId: projectile.ownerId, weaponId: projectile.weaponId, secondary: projectile.secondary, explosive: projectile.explosiveRadius > 0 });
      if (projectile.explosiveRadius) {
        emitEvent(room, "explosion", projectile.x, projectile.y, clamp(projectile.explosiveRadius / 90, 0.6, 1.5), { actorId: projectile.ownerId, weaponId: projectile.weaponId, secondary: projectile.secondary });
        for (const nearby of room.players.values()) {
          if (nearby.id === projectile.ownerId || nearby.id === target.id) continue;
          const distance = Math.hypot(nearby.x - projectile.x, nearby.y - projectile.y);
          if (distance < projectile.explosiveRadius) damage(room, nearby, projectile.damage * 0.7, projectile.knockback * 0.7, projectile.x, nearby.x, nearby.y - PLAYER_TARGET_OFFSET, { actorId: projectile.ownerId, weaponId: projectile.weaponId, secondary: projectile.secondary, explosive: true });
        }
      }
      if (projectile.pierceRemaining > 0) projectile.pierceRemaining -= 1;
      else projectile.ttl = 0;
      break;
    }
  }

  room.projectiles = room.projectiles.filter((projectile) => projectile.ttl > 0 && projectile.x > -100 && projectile.x < WORLD.width + 100 && projectile.y < WORLD.height + 150);
  if (room.mode === "match") {
    const alive = [...room.players.values()].filter((player) => player.lives > 0 || player.respawnTimer > 0);
    if (alive.length <= 1) {
      room.phase = "results";
      room.winner = alive[0]?.name;
    }
  }
}

function snapshot(room: Room): ServerSnapshot {
  return {
    serverTick: room.tick,
    phase: room.phase,
    mode: room.mode,
    players: [...room.players.values()].map((player) => ({ ...player, limbs: { ...player.limbs }, ammoByWeapon: { ...player.ammoByWeapon } })),
    projectiles: room.projectiles.map((projectile) => ({ ...projectile })),
    crates: room.crates.map((crate) => ({ ...crate })),
    hazards: room.hazards.map((hazard) => ({ ...hazard })),
    events: room.events.map((event) => ({ ...event })),
    config: room.config,
    winner: room.winner,
  };
}

function broadcastSnapshot(room: Room) {
  for (const client of room.clients.values()) send(client, "snapshot", { snapshot: snapshot(room) });
}

const http = createServer((_request, response) => {
  response.writeHead(200, { "content-type": "text/plain" });
  response.end("Mayhem server is running\n");
});
const wss = new WebSocketServer({ server: http });

wss.on("connection", (ws) => {
  const client: Client = { ws, id: randomUUID(), token: randomUUID(), input: blankInput(), jumpHeld: false };
  ws.on("message", (raw) => {
    let message: any;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return send(client, "error", { message: "Invalid message" });
    }
    if (message.type === "create") createRoom(client, String(message.name || "Player"));
    else if (message.type === "join") {
      if (message.token && message.playerId && reconnect(client, String(message.roomCode), String(message.playerId), String(message.token))) return;
      joinRoom(client, String(message.roomCode), String(message.name || "Player"));
    } else if (message.type === "start" && client.room && client.id === client.room.hostId) start(client.room, "match");
    else if (message.type === "start_sandbox" && client.room && client.id === client.room.hostId) start(client.room, "sandbox");
    else if (message.type === "return_lobby" && client.room && client.room.mode === "sandbox" && client.id === client.room.hostId) returnToLobby(client.room);
    else if (message.type === "sandbox_respawn" && client.room && client.id === client.room.hostId) respawnSandboxPlayer(client.room, client.id);
    else if (message.type === "config" && client.room && client.id === client.room.hostId) setConfig(client.room, message.patch || {});
    else if (message.type === "input" && client.room) client.input = { ...client.input, ...message.input };
    else if (message.type === "restart" && client.room && client.room.phase === "results" && client.id === client.room.hostId) returnToLobby(client.room);
  });
  ws.on("close", () => leave(client));
});

setInterval(() => {
  const dt = 1 / WORLD.tickRate;
  for (const room of rooms.values()) {
    updateRoom(room, dt);
    if (room.phase !== "lobby" && room.tick % (WORLD.tickRate / WORLD.snapshotRate) === 0) broadcastSnapshot(room);
  }
}, 1000 / WORLD.tickRate);

const port = Number(process.env.PORT || 8787);
http.listen(port, "0.0.0.0", () => console.log(`Mayhem server listening on http://0.0.0.0:${port}`));
