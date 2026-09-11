// M28.5 结构拆分：房间生命周期域——建/ join/离线/重连、房主迁移、开赛与
// 回大厅、沙盒重生、配置修改。依赖方向：room → damage → state（另用 bots）。
import { randomUUID } from "node:crypto";
import {
  DEFAULT_CONFIG,
  MAPS,
  PLAYER_TARGET_OFFSET,
  PROP_TUNING,
  WEAPONS,
  WORLD,
  calculateHazardState,
  calculateMoverState,
  clamp,
  freshLimbs,
  makePlayer,
  type MatchConfig,
  type MatchMode,
  type PlayerState,
  type WeaponId,
} from "../shared/game.js";
import {
  blankInput,
  createCode,
  humanCount,
  randomBetween,
  rooms,
  send,
  weaponStatsBucket,
  roomView,
  type Client,
  type Room,
} from "./state.js";
import { BOT_IDS, botNameFor, clampBotCount, clearBotInputs, ensureControllers } from "./bots.js";
import { loseLife } from "./sim/damage.js";
import { pickSpawn, rebalanceTeams } from "./sim/teams.js";

export function createRoom(client: Client, name: string) {
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
    props: [],
    hazards: [],
    movers: [],
    events: [],
    nextProjectile: 1,
    nextEvent: 1,
    reconnectTimers: new Map(),
    hazardHits: new Map(),
    jumpHeld: new Map(),
    stats: weaponStatsBucket(),
    mobs: [],
    mobQueue: [],
    drops: [],
    nextMobId: 1,
    nextDropId: 1,
    nextMobWaveTick: 0,
  };
  client.room = room;
  room.players.set(client.id, makePlayer(client.id, name.slice(0, 16) || "Player", 0, room.config));
  room.jumpHeld.set(client.id, false);
  rooms.set(room.code, room);
  send(client, "room", { room: roomView(room), token: client.token, selfId: client.id });
}

export function joinRoom(client: Client, roomCode: string, name: string) {
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
  // M30: squads auto-balance — the newcomer lands on the thinnest squad.
  rebalanceTeams(room);
  send(client, "room", { room: roomView(room), token: client.token, selfId: client.id });
  broadcastRoom(room);
}

export function broadcastRoom(room: Room) {
  for (const client of room.clients.values()) send(client, "room", { room: roomView(room) });
}

export function leave(client: Client) {
  const room = client.room;
  if (!room || room.clients.get(client.id) !== client) return;
  removeClient(room, client, false);
}

// Explicit leave (exit button): remove the pilot immediately instead of
// holding the slot for the 30s reconnect window.
export function leaveRoom(client: Client) {
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
    // A room with no connected humans (bots only) is dead weight — dissolve it.
    if (humanCount(room) === 0) rooms.delete(room.code);
    if (room.phase === "lobby") rebalanceTeams(room);
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
    else {
      if (room.phase === "lobby") rebalanceTeams(room);
      broadcastRoom(room);
    }
  }, 30000);
  room.reconnectTimers.set(client.id, timer);
  broadcastRoom(room);
}

export function reconnect(client: Client, roomCode: string, playerId: string, token: string) {
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
  // M30: squad-aware spawn pick — FFA keeps the M29 contract, teams hold a half.
  const spawn = pickSpawn(room, MAPS[room.config.mapId], player, index);
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

export function start(room: Room, mode: MatchMode) {
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
  // M30: final squad balance over the full roster (bots included); sandbox
  // strips team ids entirely so nothing squad-flavoured can leak into solo.
  rebalanceTeams(room);
  [...room.players.values()].forEach((player, index) => resetPlayer(room, player, index));
  room.crates = room.config.crates
    ? [0, 1, 2, 3, 4, 5].map((id) => ({ id, x: 0, y: 0, kind: "weapon" as const, weapon: "sidearm" as WeaponId, active: false, respawnTimer: 0, socketId: "", generation: 0, nextSpawnTick: id < 3 ? randomBetween(60, 180) : Number.MAX_SAFE_INTEGER }))
    : [];
  // M25 explosive barrels: one authoritative PropState per map def.
  room.props = (MAPS[room.config.mapId].props ?? []).map((def, id) => ({
    id,
    kind: "barrel" as const,
    x: def.x,
    y: def.y,
    hp: PROP_TUNING.hp,
    alive: true,
    respawnTimer: 0,
    generation: 1,
    nextSpawnTick: 0,
  }));
  room.hazards = MAPS[room.config.mapId].hazards.map((def) => calculateHazardState(def, 0));
  room.movers = MAPS[room.config.mapId].movers.map((def) => calculateMoverState(def, 0));
  // M31 hostile mobs: opt-in wave mode. The first wave queues ~5s in so pilots
  // spawn into a quiet read of the arena; the mob module owns later cadence.
  room.mobs = [];
  room.mobQueue = [];
  room.drops = [];
  room.nextMobId = 1;
  room.nextDropId = 1;
  room.nextMobWaveTick = room.config.mobs ? Math.round(WORLD.tickRate * 5) : 0;
  broadcastRoom(room);
}

export function returnToLobby(room: Room) {
  room.phase = "lobby";
  room.mode = "match";
  room.winner = undefined;
  room.projectiles = [];
  room.crates = [];
  room.props = [];
  room.hazards = [];
  room.movers = [];
  room.events = [];
  room.mobs = [];
  room.mobQueue = [];
  room.drops = [];
  room.nextMobWaveTick = 0;
  for (const player of room.players.values()) player.charge = 0;
  for (const client of room.clients.values()) {
    client.input = blankInput();
    room.jumpHeld.set(client.id, false);
  }
  clearBotInputs(room);
  broadcastRoom(room);
}

export function respawnSandboxPlayer(room: Room, playerId: string) {
  const player = room.players.get(playerId);
  if (!player || room.mode !== "sandbox" || room.phase !== "playing") return;
  loseLife(room, player, player.x, player.y - PLAYER_TARGET_OFFSET, "hazard", false);
}

export function setConfig(room: Room, patch: Partial<MatchConfig>) {
  if (room.phase !== "lobby") return;
  const mapId = patch.mapId && patch.mapId in MAPS ? patch.mapId : room.config.mapId;
  const requestedWeapons = patch.weaponSet?.filter((id): id is WeaponId => id in WEAPONS).slice(0, 8);
  if (requestedWeapons && !requestedWeapons.includes("sidearm")) {
    requestedWeapons.unshift("sidearm");
    // Trim ONLY on overflow: setting length on a shorter array would grow it
    // with sparse holes, and every WEAPONS[weaponSet[slot]] reader would crash.
    if (requestedWeapons.length > 8) requestedWeapons.length = 8;
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
    mobs: typeof patch.mobs === "boolean" ? patch.mobs : room.config.mobs,
  };
  syncBotRoster(room);
  for (const player of room.players.values()) {
    player.weapon = "sidearm";
    player.ammo = player.ammoByWeapon[player.weapon];
  }
  broadcastRoom(room);
}

/**
 * M30 squad mode (host-only, lobby-only): switch between FFA (0) and 2-4
 * squads. Anything outside the whitelist falls back to FFA. Squad ids are
 * rebalanced immediately so the lobby roster shows the new split; bots join
 * the balance on the next syncBotRoster (start() rebalances again anyway).
 */
export function setTeams(room: Room, raw: number) {
  if (room.phase !== "lobby") return;
  const teams = raw === 2 || raw === 3 || raw === 4 ? (raw as MatchConfig["teams"]) : 0;
  room.config = { ...room.config, teams };
  syncBotRoster(room);
  rebalanceTeams(room);
  broadcastRoom(room);
}
