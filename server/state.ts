// M28.5 结构拆分：服务器状态层——Client/Room 类型、房间注册表与纯状态助手
// （事件队列、快照构造、广播发送）。叶子模块：不 import 任何 sim 模块。
import { randomInt, randomUUID } from "node:crypto";
import { WebSocket, WebSocketServer } from "ws";
import type {
  ClientInput,
  CombatEvent,
  CombatEventType,
  CrateState,
  HazardState,
  MatchConfig,
  MatchMode,
  MoverState,
  PlayerState,
  ProjectileState,
  PropState,
  RoomView,
  ServerSnapshot,
} from "../shared/game.js";
import { WORLD } from "../shared/game.js";

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
  props: PropState[];
  hazards: HazardState[];
  movers: MoverState[];
  events: CombatEvent[];
  nextProjectile: number;
  nextEvent: number;
  reconnectTimers: Map<string, ReturnType<typeof setTimeout>>;
  hazardHits: Map<string, number>;
  jumpHeld: Map<string, boolean>;
  winner?: string;
  /** M20 balance instrumentation: per-weapon shots / hits / damage / kills. */
  stats: WeaponStats;
};

export type WeaponStats = Record<string, { shots: number; hits: number; damage: number; kills: number }>;

export const weaponStatsBucket = (): WeaponStats => ({});
export const statsEntry = (stats: WeaponStats, weaponId: string) => (stats[weaponId] ??= { shots: 0, hits: 0, damage: 0, kills: 0 });

export const rooms = new Map<string, Room>();
export const blankInput = (): ClientInput => ({ seq: 0, left: false, right: false, jump: false, drop: false, primary: false, secondary: false });
const json = (value: unknown) => JSON.stringify(value);
export const send = (client: Client, type: string, payload: unknown) => {
  if (client.ws.readyState === WebSocket.OPEN) client.ws.send(json({ type, ...(payload as object) }));
};

export const roomView = (room: Room): RoomView => ({
  code: room.code,
  hostId: room.hostId,
  phase: room.phase,
  mode: room.mode,
  config: room.config,
  players: [...room.players.values()].map(({ id, name, connected, color, archetype, isBot, teamId }) => ({ id, name, connected, color, archetype, isBot, teamId })),
});

export const createCode = () => {
  let value = "";
  do value = randomInt(100000, 999999).toString(); while (rooms.has(value));
  return value;
};

export function emitEvent(
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

export const randomBetween = (min: number, max: number) => randomInt(min, max + 1);

export const humanCount = (room: Room) => [...room.players.values()].filter((player) => !player.isBot).length;

export function snapshot(room: Room): ServerSnapshot {
  return {
    serverTick: room.tick,
    phase: room.phase,
    mode: room.mode,
    players: [...room.players.values()].map((player) => ({ ...player, limbs: { ...player.limbs }, ammoByWeapon: { ...player.ammoByWeapon } })),
    projectiles: room.projectiles.map((projectile) => ({ ...projectile })),
    crates: room.crates.map((crate) => ({ ...crate })),
    props: room.props.map((prop) => ({ ...prop })),
    hazards: room.hazards.map((hazard) => ({ ...hazard })),
    movers: room.movers.map((mover) => ({ ...mover })),
    events: room.events.map((event) => ({ ...event })),
    config: room.config,
    winner: room.winner,
  };
}

export function broadcastSnapshot(room: Room) {
  for (const client of room.clients.values()) send(client, "snapshot", { snapshot: snapshot(room) });
}
