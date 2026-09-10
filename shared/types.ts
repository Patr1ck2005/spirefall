// M28.5 结构拆分：全部共享实体/协议类型集中于此。纯类型文件——零运行时代码，
// 不 import 任何模块（类型只在本文件内互相引用）。

/** M25 prop kinds — currently only the explosive barrel. */
export type PropKind = "barrel";

/** Static per-map barrel anchor (centre point, sits on a platform surface). */
export type PropDef = { id: string; x: number; y: number };

/** Authoritative barrel state carried in every snapshot. */
export type PropState = {
  id: number;
  kind: PropKind;
  x: number;
  y: number;
  hp: number;
  alive: boolean;
  /** Seconds until a destroyed barrel respawns (0 while alive). */
  respawnTimer: number;
  /** Bumped on every (re)spawn so clients can fire one-shot spawn effects. */
  generation: number;
  /** Last damager id — attribution for chain kills through the kill feed. */
  lastActorId?: string;
  /** Tick when a destroyed barrel respawns (meaningful while `alive` is false). */
  nextSpawnTick: number;
  /**
   * M27 Pyre Vent: seconds of burn left before the drum cooks off (absent/0
   * while dry). The client draws fire + a light from this state alone.
   */
  burning?: number;
};

export type MapId = "canopy" | "fortress" | "factory";
export type WeaponId = "sidearm" | "scatter" | "rifle" | "sniper" | "rocket" | "blade" | "echo" | "flame";
export type AttackKind = "projectile" | "hitscan" | "melee" | "explosive";
export type AttackPattern = "single" | "burst" | "pellet" | "piercing" | "cluster" | "slash" | "dashSlash" | "beam" | "bounce";
export type MatchMode = "match" | "sandbox";
export type BotSkill = "casual" | "standard" | "brutal";
export type LimbId = "leftArm" | "rightArm" | "leftLeg" | "rightLeg";
export type LimbIntegrity = Record<LimbId, number>;
export type HazardKind = "cargoLift" | "blastCrusher" | "conveyor" | "forgePiston";
export type HazardPhase = "idle" | "warning" | "active";
export type CombatEventType = "attack" | "hit" | "explosion" | "dismember" | "death" | "respawn" | "hazard" | "crateSpawn" | "cratePickup" | "impact" | "propSpawn" | "propDestroy";

export type MatchConfig = {
  mapId: MapId;
  lives: 1 | 2 | 3 | 4 | 5;
  crates: boolean;
  weaponSet: WeaponId[];
  bots: number;
  botSkill: BotSkill;
};

export type ClientInput = {
  seq: number;
  left: boolean;
  right: boolean;
  jump: boolean;
  drop: boolean;
  primary: boolean;
  secondary: boolean;
  weaponSlot?: number;
};

export type PlayerState = {
  id: string;
  name: string;
  archetype: 0 | 1 | 2 | 3;
  isBot?: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  onGround: boolean;
  jumpsUsed: number;
  lives: number;
  weapon: WeaponId;
  ammo: number;
  ammoByWeapon: Record<WeaponId, number>;
  primaryCooldown: number;
  secondaryCooldown: number;
  /** 0-1 while holding a charge attack; absent/0 when not charging. */
  charge?: number;
  invulnerable: number;
  respawnTimer: number;
  hitFlash: number;
  connected: boolean;
  color: number;
  limbs: LimbIntegrity;
};

export type ProjectileState = {
  id: number;
  ownerId: string;
  weaponId: WeaponId;
  secondary: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  knockback: number;
  explosiveRadius: number;
  pierceRemaining: number;
  pattern: AttackPattern;
  hitIds: string[];
  ttl: number;
  /** Muzzle position where the round was fired — origin for range accounting. */
  originX: number;
  originY: number;
  /** Distance travelled from the muzzle; hard range caps kill at `range`. */
  travelled: number;
  /** Echo Shard: remaining ricochets before the shard fizzles (0 = no bounce). */
  bouncesRemaining: number;
};

export type CrateKind = "weapon" | "repair";

export type CrateState = {
  id: number;
  x: number;
  y: number;
  kind: CrateKind;
  weapon: WeaponId;
  active: boolean;
  respawnTimer: number;
  socketId: string;
  generation: number;
  nextSpawnTick: number;
};

export type CrateSocket = {
  id: string;
  x: number;
  y: number;
};

export type HazardDef = {
  id: string;
  kind: HazardKind;
  x: number;
  y: number;
  width: number;
  height: number;
  periodTicks: number;
  warningTicks: number;
  activeTicks: number;
  phaseOffset: number;
  travelX?: number;
  travelY?: number;
  force?: number;
  limbDamage?: number;
};

export type HazardState = {
  id: string;
  kind: HazardKind;
  x: number;
  y: number;
  width: number;
  height: number;
  vx: number;
  vy: number;
  phase: HazardPhase;
  progress: number;
  lethal: boolean;
};

export type CombatEvent = {
  id: number;
  tick: number;
  type: CombatEventType;
  x: number;
  y: number;
  actorId?: string;
  targetId?: string;
  weaponId?: WeaponId;
  secondary?: boolean;
  limbId?: LimbId;
  pattern?: AttackPattern;
  direction?: 1 | -1;
  count?: number;
  /** Charge fraction (0-1) for charge-release attacks. */
  charge?: number;
  /** Crate kind for crateSpawn/cratePickup cues. */
  crateKind?: CrateKind;
  /** M24 floating damage digits: per-victim damage total for hit events. */
  amount?: number;
  /** impact events: true when the round died on a solid surface (stamp a hole),
   *  false for out-of-bounds fizzles and air-bursts (nothing to stamp). */
  surface?: boolean;
  /** M25: which prop the event concerns (propSpawn / propDestroy). */
  propId?: number;
  strength: number;
};

export type ServerSnapshot = {
  serverTick: number;
  phase: "lobby" | "playing" | "results";
  mode: MatchMode;
  players: PlayerState[];
  projectiles: ProjectileState[];
  crates: CrateState[];
  props: PropState[];
  hazards: HazardState[];
  movers: MoverState[];
  events: CombatEvent[];
  config: MatchConfig;
  winner?: string;
};

export type RoomView = {
  code: string;
  hostId: string;
  phase: ServerSnapshot["phase"];
  mode: MatchMode;
  players: Array<Pick<PlayerState, "id" | "name" | "connected" | "color" | "archetype" | "isBot">>;
  config: MatchConfig;
};

export type Platform = {
  x: number;
  y: number;
  width: number;
  height: number;
  oneWay?: boolean;
  solid?: boolean;
};

export type MoverDef = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  periodTicks: number;
  phaseOffset: number;
  travelX?: number;
  travelY?: number;
};

export type MoverState = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  vx: number;
  vy: number;
};

export type MapDef = {
  name: string;
  sector: string;
  color: number;
  accent: number;
  atmosphere: number;
  platforms: Platform[];
  spawns: Array<{ x: number; y: number }>;
  crateSockets: CrateSocket[];
  /** M25 explosive barrels — destructible, server-authoritative. */
  props: PropDef[];
  hazards: HazardDef[];
  movers: MoverDef[];
  /**
   * M29/M31 hostile mob spawn anchors (static map data, not in snapshots):
   * wave spawners pick the anchor farthest from live players, then telegraph
   * before the mob enters. y sits at foot height (platform surface − 4).
   */
  mobSpawns?: Array<{ x: number; y: number }>;
};

export type AttackDef = {
  kind: AttackKind;
  cooldown: number;
  damage: number;
  knockback: number;
  recoil: number;
  range: number;
  ammoCost: number;
  speed: number;
  spread: number;
  radius: number;
  explosiveRadius: number;
  pattern: AttackPattern;
  count: number;
  pierce: number;
  dashDistance: number;
  dashSpeed: number;
  /** Hold-to-charge seconds; when set the attack fires on release, scaled by charge. */
  chargeMax?: number;
  /** Minimum charge fraction (0-1) for the release to count as a shot. */
  chargeMin?: number;
  /** Echo Shard ricochet count: how many platform impacts the shard survives. */
  bounces?: number;
};

export type WeaponDef = {
  id: WeaponId;
  label: string;
  ammo: number;
  primary: AttackDef;
  secondary: AttackDef;
  color: number;
};

export type PlatformNode = {
  index: number;
  platform: Platform;
  left: number;
  right: number;
};

export type NavEdge = {
  from: number;
  to: number;
  kind: "walk" | "drop" | "jump" | "gapJump";
};

export type PlatformGraph = {
  nodes: PlatformNode[];
  edgesFrom: Map<number, NavEdge[]>;
};
