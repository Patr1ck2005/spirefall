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
/**
 * M30 squad count: 0 (or absent) keeps the classic free-for-all; 2-4 split the
 * roster into auto-balanced squads with friendly fire off. Sandbox ignores it.
 */
export type TeamCount = 0 | 2 | 3 | 4;
/**
 * M31 hostile industrial pests (server-simulated, hostile to every pilot).
 * Skitter Saw: ground crawler with a telegraphed blade dash; Ion Gnat Swarm:
 * hovering drone swarm drifting toward pilots; Ram Hauler: wheeled charger
 * with a rear-up telegraph.
 */
export type MobKind = "skitter" | "gnats" | "ram";
/** M31 hostile mob behaviour phase (drives client art + telegraph reads). */
export type MobPhase = "stalk" | "warn" | "dash" | "stun";

/**
 * M32 pocket items. One slot per pilot (`PlayerState.item`), consumed by the
 * G use-key: grenades and flashbangs are thrown, medkits restore every limb,
 * the shield is the diffraction device (blocks lasers, splits them into a
 * spectral fan) and the jetpack burns fuel while Shift is held.
 */
export type ItemId = "grenade" | "flashbang" | "medkit" | "shield" | "jetpack";
export type BotSkill = "casual" | "standard" | "brutal";
export type LimbId = "leftArm" | "rightArm" | "leftLeg" | "rightLeg";
export type LimbIntegrity = Record<LimbId, number>;
export type HazardKind = "cargoLift" | "blastCrusher" | "conveyor" | "forgePiston";
export type HazardPhase = "idle" | "warning" | "active";
export type CombatEventType = "attack" | "hit" | "explosion" | "dismember" | "death" | "respawn" | "hazard" | "crateSpawn" | "cratePickup" | "impact" | "propSpawn" | "propDestroy" | "mobSpawn" | "mobDeath" | "itemUse" | "blind" | "shieldReflect" | "jetpack";

export type MatchConfig = {
  mapId: MapId;
  lives: 1 | 2 | 3 | 4 | 5;
  crates: boolean;
  weaponSet: WeaponId[];
  bots: number;
  botSkill: BotSkill;
  /** M30: squad count for team matches; 0/absent = free-for-all. */
  teams?: TeamCount;
  /** M31: hostile mob waves (sandbox included); off by default. */
  mobs?: boolean;
};

/**
 * M31 hostile mob state. One entry per mob; the gnat swarm renders as several
 * bodies client-side but simulates as one. `state` carries the behaviour
 * phase; `warn` (0-1) is the telegraph fill for warn phases.
 */
export type MobState = {
  id: number;
  kind: MobKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  facing: 1 | -1;
  state: MobPhase;
  /** Seconds left in the current dash/stun/warn window (0 while stalking). */
  phaseTimer: number;
  warn?: number;
  targetId?: string;
  /** Seconds of white-flash left after taking a hit (client feedback). */
  hitFlash?: number;
  /** M31: grounded flag for the crawler/charger legs (absent for the swarm). */
  onGround?: boolean;
};

/** M31 limited-time repair pack dropped by a dying mob (whole-limb restore). */
export type MobDrop = {
  id: number;
  x: number;
  y: number;
  /** Seconds until the pack expires (starts at MOB_TUNING.dropTtl). */
  ttl: number;
  /** Bumped when dropped so clients fire one-shot spawn effects. */
  generation: number;
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
  /** M32: G use-key (held; the server edge-detects like jump). */
  useItem?: boolean;
  /** M32: Shift jetpack thrust (held). */
  jetpack?: boolean;
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
  /**
   * M30 squad id (1..teams) in team matches; absent in FFA and sandbox.
   * The pilot keeps `color` as the personal tint — teamId drives rings,
   * feed coloring and the squad scoreboard instead.
   */
  teamId?: number;
  /**
   * M32 pocket item in the single G-slot. The shield lives here while active
   * (duration + charges on the fields below); the jetpack burns jetpackFuel
   * and vanishes when the tank runs dry.
   */
  item?: ItemId;
  /** M32: seconds of whiteout left; 0/absent = clear vision. */
  blind?: number;
  /** M32: initial blind duration, for the eased intensity readout. */
  blindDuration?: number;
  /** M32: 0-1 whiteout strength at burst time (client overlay). */
  blindIntensity?: number;
  /** M32: seconds left on the active diffraction shield. */
  shield?: number;
  /** M32: laser blocks remaining before the shield burns out. */
  shieldCharges?: number;
  /** M32: jetpack fuel seconds (present only while carrying the jetpack). */
  jetpackFuel?: number;
  /** M32: true while the pilot is thrusting (client draws the tail flame). */
  jetpacking?: boolean;
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

/** M32: item crates carry a pocket item instead of a weapon. */
export type CrateKind = "weapon" | "repair" | "item";

export type CrateState = {
  id: number;
  x: number;
  y: number;
  kind: CrateKind;
  weapon: WeaponId;
  /** M32: which pocket item an item crate grants. */
  item?: ItemId;
  active: boolean;
  respawnTimer: number;
  socketId: string;
  generation: number;
  nextSpawnTick: number;
};

/**
 * M32 thrown pocket items (grenade / flashbang): parabolic arc with platform
 * bounces, then a fuse detonation handled by the items domain.
 */
export type ThrowableState = {
  id: number;
  itemId: "grenade" | "flashbang";
  ownerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Seconds until detonation. */
  fuse: number;
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
  /** M31: mob kind for mobSpawn telegraphs and mobDeath deaths. */
  mobKind?: MobKind;
  /** M31: which mob the event concerns (mobSpawn / mobDeath / mob hits). */
  mobId?: number;
  /** M32: which pocket item the event concerns (itemUse/blind/shieldReflect). */
  itemId?: ItemId;
  /**
   * M32 shieldReflect: incoming ray angle (radians) at the block point — the
   * client reconstructs the 7-beam diffraction fan from this + the holder's
   * facing (SHIELD_BEAMS is the shared fan table).
   */
  angle?: number;
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
  /** M31 hostile mobs (empty unless config.mobs is on). */
  mobs: MobState[];
  /** M31 limited-time repair packs dropped by dying mobs. */
  drops: MobDrop[];
  /** M32 thrown pocket items mid-flight. */
  throwables: ThrowableState[];
};

export type RoomView = {
  code: string;
  hostId: string;
  phase: ServerSnapshot["phase"];
  mode: MatchMode;
  players: Array<Pick<PlayerState, "id" | "name" | "connected" | "color" | "archetype" | "isBot" | "teamId">>;
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
