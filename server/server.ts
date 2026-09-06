import { createServer } from "node:http";
import { randomInt, randomUUID } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import {
  AMMO_REGEN_INTERVAL_TICKS,
  AMMO_REGEN_PER_SECOND,
  DEFAULT_CONFIG,
  LIMB_IDS,
  MAPS,
  MATCH_TIME_LIMIT_TICKS,
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
  calculateMoverState,
  clamp,
  freshLimbs,
  makePlayer,
  rangeFalloff,
  raycastSolids,
  selectLimbAtPoint,
  type ClientInput,
  type CombatEvent,
  type CombatEventType,
  type CrateState,
  type HazardDef,
  type HazardState,
  type LimbId,
  type MapDef,
  type MatchConfig,
  type MatchMode,
  type MoverState,
  type Platform,
  type PlayerState,
  type ProjectileState,
  type RoomView,
  type ServerSnapshot,
  type WeaponId,
} from "../shared/game.js";
import { BOT_IDS, botNameFor, clampBotCount, clearBotInputs, createBotInput, ensureControllers, getBotInput, updateBots } from "./bots.js";

export type Client = {
  ws: WebSocket;
  id: string;
  room?: Room;
  token: string;
  input: ClientInput;
};

export type Room = {
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
  movers: MoverState[];
  events: CombatEvent[];
  nextProjectile: number;
  nextEvent: number;
  reconnectTimers: Map<string, ReturnType<typeof setTimeout>>;
  hazardHits: Map<string, number>;
  jumpHeld: Map<string, boolean>;
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
  players: [...room.players.values()].map(({ id, name, connected, color, archetype, isBot }) => ({ id, name, connected, color, archetype, isBot })),
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
    movers: [],
    events: [],
    nextProjectile: 1,
    nextEvent: 1,
    reconnectTimers: new Map(),
    hazardHits: new Map(),
    jumpHeld: new Map(),
  };
  client.room = room;
  room.players.set(client.id, makePlayer(client.id, name.slice(0, 16) || "Player", 0, room.config));
  room.jumpHeld.set(client.id, false);
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
  // Deduplicate display names: results screens key off ids, but identical
  // labels would still confuse the roster and winner banner.
  const base = name.slice(0, 16) || "Player";
  const taken = new Set([...room.players.values()].map((player) => player.name));
  let display = base;
  let suffix = 2;
  while (taken.has(display)) display = `${base.slice(0, 13)}#${suffix++}`;
  const player = makePlayer(client.id, display, room.players.size, room.config);
  room.players.set(client.id, player);
  room.jumpHeld.set(client.id, false);
  room.tokens.set(client.id, client.token);
  room.clients.set(client.id, client);
  // An orphaned lobby (every human left before this arrival) adopts the newcomer.
  if (!room.hostId || !room.players.has(room.hostId)) room.hostId = client.id;
  send(client, "room", { room: roomView(room), token: client.token, selfId: client.id });
  broadcastRoom(room);
}

function broadcastRoom(room: Room) {
  for (const client of room.clients.values()) send(client, "room", { room: roomView(room) });
}

function leave(client: Client) {
  const room = client.room;
  if (!room || room.clients.get(client.id) !== client) return;
  removeClient(room, client, false);
}

// Explicit leave (exit button): remove the pilot immediately instead of
// holding the slot for the 30s reconnect window.
function leaveRoom(client: Client) {
  const room = client.room;
  if (!room || room.clients.get(client.id) !== client) return;
  removeClient(room, client, true);
}

function removeClient(room: Room, client: Client, immediate: boolean) {
  room.clients.delete(client.id);
  const player = room.players.get(client.id);
  if (!player) return;
  player.connected = false;
  // Migrate host immediately so the room stays controllable during the
  // 30s reconnect window; a returning former host rejoins as a regular pilot.
  if (room.hostId === client.id) {
    const humanCandidate = [...room.players.values()].find((candidate) => candidate.connected && room.clients.has(candidate.id));
    room.hostId = humanCandidate?.id || "";
    broadcastRoom(room);
  }
  if (immediate) {
    clearTimeout(room.reconnectTimers.get(client.id));
    room.reconnectTimers.delete(client.id);
    room.players.delete(client.id);
    room.tokens.delete(client.id);
    room.jumpHeld.delete(client.id);
    // A room with no connected humans (bots only) is dead weight 鈥?dissolve it.
    if (humanCount(room) === 0) rooms.delete(room.code);
    broadcastRoom(room);
    client.room = undefined;
    return;
  }
  const timer = setTimeout(() => {
    if (room.clients.has(client.id)) return;
    room.players.delete(client.id);
    room.tokens.delete(client.id);
    room.jumpHeld.delete(client.id);
    room.reconnectTimers.delete(client.id);
    if (humanCount(room) === 0) rooms.delete(room.code);
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
  player.connected = true;
  room.clients.set(playerId, client);
  if (!room.hostId || !room.players.has(room.hostId)) room.hostId = playerId;
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
  player.charge = 0;
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
  // ~1 in 4 spawns is a repair cell: restores limbs instead of swapping guns.
  crate.kind = randomBetween(0, 3) === 0 ? "repair" : "weapon";
  crate.weapon = room.config.weaponSet[randomBetween(0, room.config.weaponSet.length - 1)];
  crate.active = true;
  crate.respawnTimer = 0;
  crate.nextSpawnTick = 0;
  crate.generation += 1;
  emitEvent(room, "crateSpawn", crate.x, crate.y, 1, { weaponId: crate.weapon, crateKind: crate.kind });
}

const humanCount = (room: Room) => [...room.players.values()].filter((player) => !player.isBot).length;

function syncBotRoster(room: Room) {
  const humans = humanCount(room);
  const wanted = clampBotCount(room.config.bots, humans);
  for (const botId of BOT_IDS) {
    const slot = Number(botId.slice(4));
    const existing = room.players.get(botId);
    if (slot <= wanted) {
      if (!existing) {
        const bot = makePlayer(botId, botNameFor(slot), slot, room.config);
        bot.isBot = true;
        room.players.set(botId, bot);
        room.jumpHeld.set(botId, false);
      }
    } else if (existing) {
      room.players.delete(botId);
      room.jumpHeld.delete(botId);
    }
  }
  ensureControllers(room);
  clearBotInputs(room);
}

function start(room: Room, mode: MatchMode) {
  if (room.phase !== "lobby") return;
  syncBotRoster(room);
  const humans = humanCount(room);
  const invalid = mode === "sandbox" ? humans !== 1 : room.players.size < 2;
  if (invalid) return;
  room.phase = "playing";
  room.mode = mode;
  room.winner = undefined;
  room.tick = 0;
  room.projectiles = [];
  room.events = [];
  room.hazardHits.clear();
  [...room.players.values()].forEach((player, index) => resetPlayer(room, player, index));
  room.crates = room.config.crates
    ? [0, 1, 2, 3, 4, 5].map((id) => ({ id, x: 0, y: 0, kind: "weapon" as const, weapon: "sidearm" as WeaponId, active: false, respawnTimer: 0, socketId: "", generation: 0, nextSpawnTick: id < 3 ? randomBetween(60, 180) : Number.MAX_SAFE_INTEGER }))
    : [];
  room.hazards = MAPS[room.config.mapId].hazards.map((def) => calculateHazardState(def, 0));
  room.movers = MAPS[room.config.mapId].movers.map((def) => calculateMoverState(def, 0));
  broadcastRoom(room);
}

function returnToLobby(room: Room) {
  room.phase = "lobby";
  room.mode = "match";
  room.winner = undefined;
  room.projectiles = [];
  room.crates = [];
  room.hazards = [];
  room.movers = [];
  room.events = [];
  for (const player of room.players.values()) player.charge = 0;
  for (const client of room.clients.values()) {
    client.input = blankInput();
    room.jumpHeld.set(client.id, false);
  }
  clearBotInputs(room);
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
  if (requestedWeapons && !requestedWeapons.includes("sidearm")) {
    requestedWeapons.unshift("sidearm");
    requestedWeapons.length = 6; // re-trim: sidearm may have pushed the set past 6
  }
  const botSkill = patch.botSkill === "casual" || patch.botSkill === "brutal" ? patch.botSkill : patch.botSkill === "standard" ? patch.botSkill : room.config.botSkill;
  room.config = {
    ...room.config,
    mapId,
    lives: clamp(Number(patch.lives ?? room.config.lives), 1, 5) as MatchConfig["lives"],
    crates: typeof patch.crates === "boolean" ? patch.crates : room.config.crates,
    weaponSet: requestedWeapons?.length ? requestedWeapons : room.config.weaponSet,
    bots: clampBotCount(patch.bots ?? room.config.bots, humanCount(room)),
    botSkill,
  };
  syncBotRoster(room);
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
  details: { actorId?: string; weaponId?: WeaponId; secondary?: boolean; explosive?: boolean; lethal?: boolean } = {},
) {
  if (victim.invulnerable > 0 || victim.respawnTimer > 0 || isEliminated(room, victim)) return;
  victim.vx += (victim.x >= sourceX ? 1 : -1) * force;
  victim.vy -= force * 0.42;
  victim.hitFlash = 0.13;
  if (details.lethal) {
    // Execution shots (full-charge Voltrail) bypass limbs entirely.
    emitEvent(room, "hit", hitX, hitY, 1.4, { targetId: victim.id, actorId: details.actorId, weaponId: details.weaponId, secondary: details.secondary });
    loseLife(room, victim, victim.x, victim.y - PLAYER_TARGET_OFFSET, "shot");
    return;
  }
  if (details.explosive) {
    for (const limbId of LIMB_IDS) applyLimbDamage(room, victim, limbId, amount * 0.5, details);
    // Explosive splash grinds all four limbs evenly 鈥?check for a bleed-out too.
    if (LIMB_IDS.every((limbId) => victim.limbs[limbId] <= 0)) {
      loseLife(room, victim, victim.x, victim.y - PLAYER_TARGET_OFFSET, "shot");
      return;
    }
  } else {
    let limbId = selectLimbAtPoint(victim, hitX, hitY);
    const living = LIMB_IDS.filter((candidate) => victim.limbs[candidate] > 0);
    if (!living.length) {
      // Quad-destroy: a pilot with no intact limbs bleeds out.
      loseLife(room, victim, victim.x, victim.y - PLAYER_TARGET_OFFSET, "shot");
      return;
    }
    // Destroyed-limb hits and head-zone hits (no limb resolved) carry over to
    // a living limb instead of being clamped away 鈥?no invincible stump-tanking.
    if (!limbId || victim.limbs[limbId] <= 0) {
      limbId = living[Math.floor(Math.random() * living.length)];
    }
    applyLimbDamage(room, victim, limbId, amount, details);
    if (LIMB_IDS.every((candidate) => victim.limbs[candidate] <= 0)) {
      loseLife(room, victim, victim.x, victim.y - PLAYER_TARGET_OFFSET, "shot");
      return;
    }
  }
  emitEvent(room, "hit", hitX, hitY, clamp(force / 520, 0.2, 1.4), { targetId: victim.id, actorId: details.actorId, weaponId: details.weaponId, secondary: details.secondary, limbId: selectLimbAtPoint(victim, hitX, hitY) });
}

function attack(room: Room, player: PlayerState, secondary: boolean, chargeFraction = 0) {
  const weapon = WEAPONS[player.weapon];
  const def = secondary ? weapon.secondary : weapon.primary;
  const cooldownKey = secondary ? "secondaryCooldown" : "primaryCooldown";
  if (player[cooldownKey] > 0 || player.respawnTimer > 0 || player.ammo < def.ammoCost) return;
  // Charge releases below the minimum fraction fizzle (stepPlayer owns charge state).
  if (!secondary && def.chargeMax !== undefined && chargeFraction < (def.chargeMin ?? 0.25)) return;
  const chargeScale = !secondary && def.chargeMax !== undefined ? 1 + chargeFraction * 1.6 : 1;
  const modifiers = calculateLimbModifiers(player.limbs);
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

  if (def.kind === "melee") {
    if (def.pattern === "dashSlash") {
      player.x = clamp(player.x + player.facing * def.dashDistance, PLAYER_HALF_WIDTH, WORLD.width - PLAYER_HALF_WIDTH);
      player.vx = player.facing * def.dashSpeed;
      resolveSolids(player, MAPS[room.config.mapId].platforms);
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
    const platforms = MAPS[room.config.mapId].platforms;
    const shots = def.pattern === "burst" ? def.count : 1;
    for (let shot = 0; shot < shots; shot++) {
      const angle = (shot - (shots - 1) / 2) * def.spread;
      const directionX = Math.cos(angle) * player.facing;
      const directionY = Math.sin(angle);
      // M19: the ray stops at the first solid cover — lasers and bullets no
      // longer reach (or damage) anything behind a wall.
      const rayEndX = originX + directionX * range;
      const rayEndY = originY + directionY * range;
      const wallDistance = raycastSolids(platforms, originX, originY, rayEndX, rayEndY) ?? range;
      const targets = [...room.players.values()]
        .map((other) => {
          const dx = other.x - originX;
          const dy = other.y - PLAYER_TARGET_OFFSET - originY;
          const along = directionX * dx + directionY * dy;
          const offset = Math.hypot(dx - directionX * along, dy - directionY * along);
          return { other, along, offset };
        })
        .filter(({ other, along, offset }) => other.id !== player.id && along > 0 && along <= wallDistance && offset < 16)
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
    });
  }
}

// Eliminated players (out of lives in a match) are frozen server-side: no
// physics, no AI inputs, no hazard or projectile interaction, no repeated
// death events. Sandbox mode never eliminates anyone.
const isEliminated = (room: Room, player: PlayerState) => room.mode !== "sandbox" && player.lives <= 0;

function loseLife(room: Room, player: PlayerState, x: number, y: number, cause: "fall" | "hazard" | "shot", emit = true) {
  if (player.respawnTimer > 0 || isEliminated(room, player)) return;
  if (room.mode === "sandbox") player.lives = room.config.lives;
  else player.lives -= 1;
  player.vx = 0;
  player.vy = 0;
  player.jumpsUsed = 0;
  player.charge = 0;
  player.respawnTimer = room.mode === "sandbox" || player.lives > 0 ? 1.5 : 2.5;
  if (emit) emitEvent(room, "death", x, y, cause === "hazard" ? 1.35 : cause === "shot" ? 1.2 : 1, { targetId: player.id });
}

function updateHazards(room: Room, previous: HazardState[], dt: number) {
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
  }
}

function stepPlayer(room: Room, map: MapDef, player: PlayerState, input: ClientInput, dt: number) {
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
  player.vx += move * 30 * modifiers.move;
  player.vx *= player.onGround ? 0.78 : 0.93;
  player.vx = clamp(player.vx, -338 * modifiers.move, 338 * modifiers.move);
  if (move) player.facing = move as 1 | -1;
  const jumpPressed = input.jump && !room.jumpHeld.get(player.id);
  room.jumpHeld.set(player.id, input.jump);
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

// Solid platforms block from every side: push out along the least-penetration
// axis, stop upward motion at ceilings. Solids are thick (>=24px) versus the
// ~10px/tick worst-case knockback displacement, so tunneling is not a concern.
function resolveSolids(player: PlayerState, platforms: Platform[]) {
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

function updateRoom(room: Room, dt: number) {
  if (room.phase !== "playing") return;
  room.tick++;
  const map = MAPS[room.config.mapId];
  const previousHazards = room.hazards.map((hazard) => ({ ...hazard }));
  updateHazards(room, previousHazards, dt);
  room.movers = MAPS[room.config.mapId].movers.map((def) => calculateMoverState(def, room.tick));
  updateBots(room, dt);

  for (const player of room.players.values()) {
    const client = room.clients.get(player.id);
    if (client) {
      if (!player.connected) continue;
      stepPlayer(room, map, player, client.input, dt);
    } else {
      // No socket entry: a bot pilot. Its controller supplies the input.
      const input = getBotInput(room, player);
      if (!input) continue;
      stepPlayer(room, map, player, input, dt);
    }
  }

  for (const crate of room.crates) {
    if (!crate.active) {
      crate.respawnTimer = Math.max(0, (crate.nextSpawnTick - room.tick) / WORLD.tickRate);
      if (room.tick >= crate.nextSpawnTick) spawnCrate(room, crate);
      continue;
    }
    for (const player of room.players.values()) {
      if (player.respawnTimer <= 0 && Math.hypot(player.x - crate.x, player.y - crate.y) < 34) {
        if (crate.kind === "repair") {
          player.limbs = freshLimbs();
        } else {
          player.weapon = crate.weapon;
          player.ammoByWeapon[player.weapon] = WEAPONS[player.weapon].ammo;
          player.ammo = player.ammoByWeapon[player.weapon];
        }
        crate.active = false;
        crate.nextSpawnTick = room.tick + randomBetween(360, 720);
        crate.respawnTimer = (crate.nextSpawnTick - room.tick) / WORLD.tickRate;
        emitEvent(room, "cratePickup", crate.x, crate.y, 1, { actorId: player.id, weaponId: crate.weapon, crateKind: crate.kind });
        break;
      }
    }
  }

  // Explosive splash with M19 radial falloff: ~0.7x damage and knockback at
  // the core tapering to 0.2x at the blast edge. One helper for wall
  // detonations, body detonations and range-cap air bursts.
  const detonate = (projectile: ProjectileState, x: number, y: number, skipId?: string) => {
    emitEvent(room, "explosion", x, y, clamp(projectile.explosiveRadius / 90, 0.6, 1.5), { actorId: projectile.ownerId, weaponId: projectile.weaponId, secondary: projectile.secondary });
    for (const nearby of room.players.values()) {
      if (nearby.id === projectile.ownerId || nearby.id === skipId || nearby.respawnTimer > 0 || isEliminated(room, nearby)) continue;
      const distance = Math.hypot(nearby.x - x, nearby.y - PLAYER_TARGET_OFFSET - y);
      if (distance >= projectile.explosiveRadius) continue;
      const falloff = clamp(0.7 - 0.5 * (distance / projectile.explosiveRadius), 0.2, 0.7);
      damage(room, nearby, projectile.damage * falloff, projectile.knockback * falloff, x, nearby.x, nearby.y - PLAYER_TARGET_OFFSET, { actorId: projectile.ownerId, weaponId: projectile.weaponId, secondary: projectile.secondary, explosive: true });
    }
  };

  for (const projectile of room.projectiles) {
    const attackDef = WEAPONS[projectile.weaponId][projectile.secondary ? "secondary" : "primary"];
    const speed = Math.hypot(projectile.vx, projectile.vy);
    projectile.x += projectile.vx * dt;
    projectile.y += projectile.vy * dt;
    projectile.vy += 720 * dt;
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
    if (!dead) for (const target of room.players.values()) {
      if (target.id === projectile.ownerId || projectile.hitIds.includes(target.id) || target.respawnTimer > 0 || isEliminated(room, target) || !intersectsCircle({ x: projectile.x, y: projectile.y, r: projectile.radius }, { x: target.x, y: target.y - PLAYER_TARGET_OFFSET, r: PLAYER_HIT_RADIUS })) continue;
      projectile.hitIds.push(target.id);
      const travelFalloff = rangeFalloff(projectile.travelled, attackDef.range);
      damage(room, target, projectile.damage * travelFalloff, projectile.knockback, projectile.x - projectile.vx, projectile.x, projectile.y, { actorId: projectile.ownerId, weaponId: projectile.weaponId, secondary: projectile.secondary, explosive: projectile.explosiveRadius > 0 });
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
  if (room.mode === "match") {
    const alive = [...room.players.values()].filter((player) => !isEliminated(room, player) && (player.lives > 0 || player.respawnTimer > 0));
    // Match time limit: any stalemate (camping, unreachable standoff) resolves
    // at 4 minutes 鈥?most lives, then most intact limbs wins. Winner is stored
    // as the player ID: display names are not unique.
    if (room.tick > MATCH_TIME_LIMIT_TICKS && alive.length > 1) {
      room.phase = "results";
      const ranked = [...alive].sort((a, b) => b.lives - a.lives || (LIMB_IDS.reduce((sum, id) => sum + b.limbs[id], 0) - LIMB_IDS.reduce((sum, id) => sum + a.limbs[id], 0)));
      room.winner = ranked[0]?.id;
      broadcastSnapshot(room);
      return;
    }
    if (alive.length <= 1) {
      room.phase = "results";
      room.winner = alive[0]?.id;
      // The tick loop freezes at results, so the periodic broadcast may never
      // fire again 鈥?push the final snapshot explicitly so every client
      // actually sees the results screen.
      broadcastSnapshot(room);
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
    movers: room.movers.map((mover) => ({ ...mover })),
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
  response.end("Spirefall server is running\n");
});
const wss = new WebSocketServer({ server: http });

wss.on("connection", (ws) => {
  const client: Client = { ws, id: randomUUID(), token: randomUUID(), input: blankInput() };
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
    else if (message.type === "input" && client.room) {
      // Whitelist known input fields 鈥?never trust client payloads wholesale.
      const raw = message.input || {};
      client.input = {
        seq: Number(raw.seq) || client.input.seq + 1,
        left: raw.left === true,
        right: raw.right === true,
        jump: raw.jump === true,
        drop: raw.drop === true,
        primary: raw.primary === true,
        secondary: raw.secondary === true,
        weaponSlot: raw.weaponSlot === undefined ? undefined : Math.max(1, Math.min(6, Number(raw.weaponSlot) || 0)) || undefined,
      };
    }
    else if (message.type === "leave_room" && client.room) leaveRoom(client);
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
http.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    console.error(`[Spirefall] Port ${port} is already in use 鈥?probably another Spirefall launcher window is still open.`);
    console.error("[Spirefall] Close that window (or kill the old node process) and start again.");
  } else {
    console.error("[Spirefall] Server error:", error);
  }
  process.exit(1);
});
http.listen(port, "0.0.0.0", () => console.log(`Spirefall server listening on http://0.0.0.0:${port}`));
