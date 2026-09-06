export const WORLD = {
  width: 1000,
  height: 560,
  tickRate: 60,
  snapshotRate: 20,
} as const;

export const PLAYER_SCALE = 0.5;
export const PLAYER_HALF_WIDTH = 9;
export const PLAYER_FOOT_OFFSET = 4;
export const PLAYER_BODY_HEIGHT = 30;
export const PLAYER_TARGET_OFFSET = 14;
export const PLAYER_HIT_RADIUS = 12;
export const MAX_JUMPS = 3;

export type MapId = "canopy" | "fortress" | "factory";
export type WeaponId = "sidearm" | "scatter" | "rifle" | "sniper" | "rocket" | "blade";
export type AttackKind = "projectile" | "hitscan" | "melee" | "explosive";
export type AttackPattern = "single" | "burst" | "pellet" | "piercing" | "cluster" | "slash" | "dashSlash" | "beam";
export type MatchMode = "match" | "sandbox";
export type BotSkill = "casual" | "standard" | "brutal";
export type LimbId = "leftArm" | "rightArm" | "leftLeg" | "rightLeg";
export type LimbIntegrity = Record<LimbId, number>;
export type HazardKind = "cargoLift" | "blastCrusher" | "conveyor" | "forgePiston";
export type HazardPhase = "idle" | "warning" | "active";
export type CombatEventType = "attack" | "hit" | "explosion" | "dismember" | "death" | "respawn" | "hazard" | "crateSpawn" | "cratePickup" | "impact";

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
  /** impact events: true when the round died on a solid surface (stamp a hole),
   *  false for out-of-bounds fizzles and air-bursts (nothing to stamp). */
  surface?: boolean;
  strength: number;
};

export type ServerSnapshot = {
  serverTick: number;
  phase: "lobby" | "playing" | "results";
  mode: MatchMode;
  players: PlayerState[];
  projectiles: ProjectileState[];
  crates: CrateState[];
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
  backgroundAsset: string;
  platforms: Platform[];
  spawns: Array<{ x: number; y: number }>;
  crateSockets: CrateSocket[];
  hazards: HazardDef[];
  movers: MoverDef[];
};

export const MAPS: Record<MapId, MapDef> = {
  // M15 布局个性化：Canopy 左塔右崖开放垂直 / Fortress 中轴要塞对枪线 /
  // Factory 流水线横向推挤。三图不再共用骨架；平台数 13-15，吊柱全部移除。
  canopy: {
    name: "Canopy",
    sector: "CROWN / ALTITUDE 91",
    color: 0x16242a,
    accent: 0x49c9b8,
    atmosphere: 0x99b7bb,
    backgroundAsset: "/assets/environments/canopy.webp",
    platforms: [
      { x: 0, y: 530, width: 280, height: 30 },
      { x: 420, y: 530, width: 200, height: 30 },
      { x: 780, y: 530, width: 220, height: 30 },
      // M19 掩体墙：打断地面长视线，激光/子弹在此受挡。跳跃 apex≈136px 可越。
      { x: 452, y: 452, width: 26, height: 78, solid: true },
      { x: 30, y: 445, width: 110, height: 14, oneWay: true },
      { x: 150, y: 355, width: 100, height: 14, oneWay: true },
      { x: 60, y: 265, width: 110, height: 14, oneWay: true },
      { x: 190, y: 175, width: 120, height: 14, oneWay: true },
      { x: 330, y: 95, width: 130, height: 14, oneWay: true },
      { x: 560, y: 430, width: 130, height: 14, oneWay: true },
      { x: 800, y: 350, width: 150, height: 14, oneWay: true },
      { x: 600, y: 265, width: 120, height: 14, oneWay: true },
      { x: 420, y: 170, width: 130, height: 14, oneWay: true },
      { x: 350, y: 62, width: 300, height: 16, oneWay: true },
    ],
    spawns: [{ x: 90, y: 526 }, { x: 880, y: 526 }, { x: 470, y: 166 }, { x: 210, y: 171 }],
    crateSockets: [
      { id: "canopy-ground-west", x: 100, y: 508 }, { id: "canopy-ground-mid", x: 500, y: 508 }, { id: "canopy-ground-east", x: 880, y: 508 },
      { id: "canopy-tower-mid", x: 200, y: 333 }, { id: "canopy-tower-high", x: 100, y: 243 },
      { id: "canopy-east-ledge", x: 850, y: 328 }, { id: "canopy-mid-ledge", x: 640, y: 243 },
      { id: "canopy-crown", x: 490, y: 40 },
    ],
    hazards: [
      { id: "crown-lift-a", kind: "cargoLift", x: 520, y: 470, width: 130, height: 16, periodTicks: 360, warningTicks: 0, activeTicks: 360, phaseOffset: 0, travelY: -205 },
      { id: "crown-lift-b", kind: "cargoLift", x: 810, y: 300, width: 120, height: 16, periodTicks: 360, warningTicks: 0, activeTicks: 360, phaseOffset: 180, travelY: -160 },
    ],
    movers: [
      { id: "canopy-shuttle", x: 560, y: 392, width: 110, height: 14, periodTicks: 420, phaseOffset: 0, travelX: -320 },
    ],
  },
  fortress: {
    name: "Fortress",
    sector: "BASTION / DEFENSE SPINE",
    color: 0x241f27,
    accent: 0xe4574f,
    atmosphere: 0xa68b7c,
    backgroundAsset: "/assets/environments/fortress.webp",
    platforms: [
      { x: 0, y: 530, width: 260, height: 30 },
      { x: 400, y: 530, width: 240, height: 30 },
      { x: 760, y: 530, width: 240, height: 30 },
      // M19 掩体柱：西缺口中的立柱，打断地面穿射线，柱顶可站立兼作垫脚石
      //（货架层间净空 96px 放不下 78px+跳跃的墙，缺口处无顶棚净空无限）。
      { x: 320, y: 460, width: 26, height: 100, solid: true },
      { x: 410, y: 430, width: 220, height: 14, oneWay: true },
      { x: 400, y: 320, width: 240, height: 14, oneWay: true },
      { x: 415, y: 210, width: 210, height: 14, oneWay: true },
      { x: 405, y: 100, width: 230, height: 16, oneWay: true },
      { x: 120, y: 415, width: 120, height: 14, oneWay: true },
      { x: 760, y: 415, width: 120, height: 14, oneWay: true },
      { x: 60, y: 305, width: 120, height: 14, oneWay: true },
      { x: 820, y: 305, width: 120, height: 14, oneWay: true },
      { x: 150, y: 210, width: 120, height: 14, oneWay: true },
      { x: 730, y: 210, width: 120, height: 14, oneWay: true },
      { x: 445, y: 40, width: 150, height: 14, oneWay: true },
    ],
    spawns: [{ x: 170, y: 411 }, { x: 830, y: 411 }, { x: 500, y: 316 }, { x: 520, y: 526 }],
    crateSockets: [
      { id: "fortress-ground-west", x: 100, y: 508 }, { id: "fortress-ground-mid", x: 520, y: 508 }, { id: "fortress-ground-east", x: 880, y: 508 },
      { id: "fortress-wing-low-west", x: 180, y: 393 }, { id: "fortress-wing-low-east", x: 820, y: 393 },
      { id: "fortress-lane-2", x: 520, y: 298 }, { id: "fortress-wing-mid-west", x: 110, y: 283 }, { id: "fortress-wing-mid-east", x: 880, y: 283 },
      { id: "fortress-crown", x: 510, y: 18 },
    ],
    hazards: [
      { id: "bastion-crusher-west", kind: "blastCrusher", x: 180, y: 45, width: 90, height: 118, periodTicks: 480, warningTicks: 90, activeTicks: 54, phaseOffset: 45, travelY: 175, force: 620, limbDamage: 72 },
      { id: "bastion-crusher-east", kind: "blastCrusher", x: 730, y: 45, width: 90, height: 118, periodTicks: 480, warningTicks: 90, activeTicks: 54, phaseOffset: 285, travelY: 175, force: 620, limbDamage: 72 },    ],
    movers: [
      { id: "bastion-elevator", x: 300, y: 300, width: 100, height: 14, periodTicks: 400, phaseOffset: 0, travelY: -180 },
    ],
  },
  factory: {
    name: "Factory",
    sector: "FOUNDRY / ASSEMBLY GUT",
    color: 0x27241f,
    accent: 0xf28a38,
    atmosphere: 0x71806b,
    backgroundAsset: "/assets/environments/factory.webp",
    platforms: [
      { x: 0, y: 530, width: 240, height: 30 },
      { x: 380, y: 530, width: 260, height: 30 },
      { x: 780, y: 530, width: 220, height: 30 },
      // M19 掩体墙：西中层货架上的装甲墙，打断 60→220 层直射线；地面层
      // 视线保持通畅（跨图对枪线与既有测试依赖它）。
      { x: 130, y: 178, width: 26, height: 84, solid: true },
      { x: 40, y: 445, width: 150, height: 14, oneWay: true },
      { x: 300, y: 448, width: 170, height: 14, oneWay: true },
      { x: 590, y: 442, width: 160, height: 14, oneWay: true },
      { x: 820, y: 448, width: 140, height: 14, oneWay: true },
      { x: 150, y: 355, width: 190, height: 14, oneWay: true },
      { x: 480, y: 350, width: 200, height: 14, oneWay: true },
      { x: 780, y: 358, width: 160, height: 14, oneWay: true },
      { x: 60, y: 262, width: 160, height: 14, oneWay: true },
      { x: 350, y: 258, width: 170, height: 14, oneWay: true },
      { x: 650, y: 264, width: 150, height: 14, oneWay: true },
      { x: 860, y: 258, width: 110, height: 14, oneWay: true },
      { x: 200, y: 168, width: 160, height: 14, oneWay: true },
      { x: 520, y: 162, width: 180, height: 14, oneWay: true },
      { x: 800, y: 170, width: 130, height: 14, oneWay: true },
      { x: 420, y: 64, width: 200, height: 16, oneWay: true },
    ],
    spawns: [{ x: 110, y: 441 }, { x: 880, y: 444 }, { x: 560, y: 346 }, { x: 270, y: 164 }],
    crateSockets: [
      { id: "factory-ground-west", x: 90, y: 508 }, { id: "factory-ground-mid", x: 500, y: 508 }, { id: "factory-ground-east", x: 880, y: 508 },
      { id: "factory-floor-2-west", x: 230, y: 333 }, { id: "factory-floor-2-east", x: 560, y: 328 },
      { id: "factory-floor-3-mid", x: 420, y: 236 }, { id: "factory-floor-4-east", x: 590, y: 140 },
      { id: "factory-crown", x: 510, y: 42 },
    ],
    hazards: [
      { id: "foundry-belt", kind: "conveyor", x: 380, y: 530, width: 260, height: 16, periodTicks: 1, warningTicks: 0, activeTicks: 1, phaseOffset: 0, force: 95 },
      { id: "foundry-belt-high", kind: "conveyor", x: 480, y: 350, width: 200, height: 14, periodTicks: 1, warningTicks: 0, activeTicks: 1, phaseOffset: 0, force: 85 },
      { id: "foundry-piston-a", kind: "forgePiston", x: 430, y: 218, width: 60, height: 112, periodTicks: 360, warningTicks: 60, activeTicks: 42, phaseOffset: 90, travelY: 170, force: 690, limbDamage: 84 },
      { id: "foundry-piston-b", kind: "forgePiston", x: 690, y: 226, width: 60, height: 112, periodTicks: 360, warningTicks: 60, activeTicks: 42, phaseOffset: 270, travelY: 160, force: 690, limbDamage: 84 },
    ],
    movers: [
      { id: "foundry-shuttle", x: 560, y: 296, width: 100, height: 14, periodTicks: 460, phaseOffset: 200, travelX: -360 },
    ],
  },
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
};

export type WeaponDef = {
  id: WeaponId;
  label: string;
  ammo: number;
  primary: AttackDef;
  secondary: AttackDef;
  color: number;
};

const atk = (spec: Partial<AttackDef> & Pick<AttackDef, "kind" | "cooldown" | "damage" | "knockback">): AttackDef => ({
  recoil: 0,
  range: 0,
  ammoCost: 1,
  speed: 0,
  spread: 0,
  radius: 3,
  explosiveRadius: 0,
  pattern: "single",
  count: 1,
  pierce: 0,
  dashDistance: 0,
  dashSpeed: 0,
  ...spec,
});

// M14火力重设计：Ripper 全自动冲锋枪 / Breach Scatter + Blaze Vent / Longbeam
// 持续光束 / Voltrail 蓄能磁轨 / Forge Rocket / Cutter Blade。数值全部集中在此表，
// 手感调参只动这里。
// M19 射程真实化：projectile 类硬上限首次生效（旧版 range 字段被完全忽略），
// 激光定位超远（Longbeam 900 / Voltrail 1400），散弹收为 CQC。range 超过即
// 消散（火箭空爆），60%-100% 射程段伤害线性衰减至 0.6。
export const WEAPONS: Record<WeaponId, WeaponDef> = {
  sidearm: {
    id: "sidearm", label: "Vein Ripper", ammo: 90, color: 0xd8b45f,
    primary: atk({ kind: "hitscan", cooldown: 0.09, damage: 9, knockback: 55, recoil: 8, range: 640, spread: 0.045, pattern: "single" }),
    secondary: atk({ kind: "hitscan", cooldown: 0.85, damage: 10, knockback: 95, recoil: 26, range: 700, spread: 0.07, pattern: "burst", count: 6, pierce: 0 }),
  },
  scatter: {
    id: "scatter", label: "Breach Scatter", ammo: 32, color: 0x9fc6d1,
    primary: atk({ kind: "projectile", cooldown: 0.68, damage: 9, knockback: 95, recoil: 85, speed: 780, spread: 0.26, radius: 4, range: 400, pattern: "pellet", count: 8 }),
    secondary: atk({ kind: "projectile", cooldown: 0.08, damage: 4, knockback: 30, recoil: 6, speed: 560, spread: 0.34, radius: 3, range: 260, pattern: "pellet", count: 2 }),
  },
  rifle: {
    id: "rifle", label: "Longbeam", ammo: 90, color: 0x75c795,
    primary: atk({ kind: "hitscan", cooldown: 0.12, damage: 6, knockback: 22, recoil: 4, range: 900, pattern: "beam" }),
    secondary: atk({ kind: "hitscan", cooldown: 0.95, damage: 38, knockback: 320, recoil: 70, range: 950, ammoCost: 3, pattern: "piercing", pierce: 3 }),
  },
  sniper: {
    id: "sniper", label: "Voltrail", ammo: 6, color: 0xd797c7,
    primary: atk({ kind: "hitscan", cooldown: 0.55, damage: 32, knockback: 210, recoil: 60, range: 1400, pattern: "piercing", pierce: 3, chargeMax: 1.1, chargeMin: 0.25 }),
    secondary: atk({ kind: "hitscan", cooldown: 0.85, damage: 35, knockback: 260, recoil: 55, range: 1050, pattern: "piercing", pierce: 1 }),
  },
  rocket: {
    id: "rocket", label: "Forge Rocket", ammo: 5, color: 0xe9793d,
    primary: atk({ kind: "explosive", cooldown: 0.9, damage: 46, knockback: 300, recoil: 110, speed: 520, radius: 7, range: 900, explosiveRadius: 88 }),
    secondary: atk({ kind: "explosive", cooldown: 1.5, damage: 25, knockback: 300, recoil: 130, speed: 420, spread: 0.14, radius: 8, range: 640, explosiveRadius: 70, pattern: "cluster", count: 3, ammoCost: 2 }),
  },
  blade: {
    id: "blade", label: "Cutter Blade", ammo: 999, color: 0xbfcbd0,
    primary: atk({ kind: "melee", cooldown: 0.32, damage: 38, knockback: 270, recoil: 65, range: 70, pattern: "slash" }),
    secondary: atk({ kind: "melee", cooldown: 1.0, damage: 60, knockback: 520, recoil: 110, range: 130, pattern: "dashSlash", dashDistance: 92, dashSpeed: 560 }),
  },
};

/** Passive ammo regen per second for every weapon (keeps sustained fire viable). */
export const AMMO_REGEN_PER_SECOND = 6;
/** Tick interval that grants one round at AMMO_REGEN_PER_SECOND (60Hz tick). */
export const AMMO_REGEN_INTERVAL_TICKS = Math.round(WORLD.tickRate / AMMO_REGEN_PER_SECOND);
/** Matches resolve at this game-time limit (4 minutes) regardless of stalemates. */
export const MATCH_TIME_LIMIT_TICKS = WORLD.tickRate * 240;

export const DEFAULT_CONFIG: MatchConfig = {
  mapId: "canopy",
  lives: 3,
  crates: true,
  weaponSet: ["sidearm", "scatter", "rifle", "sniper", "rocket", "blade"],
  bots: 0,
  botSkill: "standard",
};

export const PLAYER_COLORS = [0x56d9d0, 0xf0715d, 0xf0c75e, 0xad80e8] as const;
export const LIMB_IDS: LimbId[] = ["leftArm", "rightArm", "leftLeg", "rightLeg"];
export const freshLimbs = (): LimbIntegrity => ({ leftArm: 100, rightArm: 100, leftLeg: 100, rightLeg: 100 });
export const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

export const calculateLimbModifiers = (limbs: LimbIntegrity) => {
  const armSeverity = (200 - limbs.leftArm - limbs.rightArm) / 100;
  const legSeverity = (200 - limbs.leftLeg - limbs.rightLeg) / 100;
  return {
    cooldown: 1 + 0.2 * armSeverity,
    recoil: 1 + 0.15 * armSeverity,
    move: 1 - 0.15 * legSeverity,
    jump: 1 - 0.1 * legSeverity,
  };
};

export const selectLimbAtPoint = (player: Pick<PlayerState, "x" | "y">, hitX: number, hitY: number): LimbId | undefined => {
  const localY = hitY - player.y;
  if (Math.abs(hitX - player.x) < 4 && localY < -8 && localY > -34) return undefined;
  const left = hitX < player.x;
  return localY >= -14 ? left ? "leftLeg" : "rightLeg" : left ? "leftArm" : "rightArm";
};

export const calculateHazardState = (def: HazardDef, tick: number): HazardState => {
  if (def.kind === "cargoLift") {
    const angle = ((tick + def.phaseOffset) % def.periodTicks) / def.periodTicks * Math.PI * 2;
    const previousAngle = ((tick - 1 + def.phaseOffset + def.periodTicks) % def.periodTicks) / def.periodTicks * Math.PI * 2;
    const ease = (value: number) => (1 - Math.cos(value)) / 2;
    const x = def.x + (def.travelX || 0) * ease(angle);
    const y = def.y + (def.travelY || 0) * ease(angle);
    const previousX = def.x + (def.travelX || 0) * ease(previousAngle);
    const previousY = def.y + (def.travelY || 0) * ease(previousAngle);
    return { id: def.id, kind: def.kind, x, y, width: def.width, height: def.height, vx: (x - previousX) * WORLD.tickRate, vy: (y - previousY) * WORLD.tickRate, phase: "active", progress: (angle % (Math.PI * 2)) / (Math.PI * 2), lethal: false };
  }
  if (def.kind === "conveyor") {
    return { id: def.id, kind: def.kind, x: def.x, y: def.y, width: def.width, height: def.height, vx: def.force || 0, vy: 0, phase: "active", progress: 1, lethal: false };
  }
  const cycle = (tick + def.phaseOffset) % def.periodTicks;
  const warningEnd = def.warningTicks;
  const activeEnd = warningEnd + def.activeTicks;
  const phase = cycle < warningEnd ? "warning" : cycle < activeEnd ? "active" : "idle";
  const progress = phase === "warning" ? cycle / Math.max(1, warningEnd) : phase === "active" ? (cycle - warningEnd) / Math.max(1, def.activeTicks) : 0;
  const movement = phase === "active" ? Math.sin(progress * Math.PI) : 0;
  const previousProgress = phase === "active" ? Math.max(0, (cycle - warningEnd - 1) / Math.max(1, def.activeTicks)) : 0;
  const previousMovement = phase === "active" ? Math.sin(previousProgress * Math.PI) : 0;
  const x = def.x + (def.travelX || 0) * movement;
  const y = def.y + (def.travelY || 0) * movement;
  return {
    id: def.id,
    kind: def.kind,
    x,
    y,
    width: def.width,
    height: def.height,
    vx: ((def.travelX || 0) * (movement - previousMovement)) * WORLD.tickRate,
    vy: ((def.travelY || 0) * (movement - previousMovement)) * WORLD.tickRate,
    phase,
    progress,
    lethal: phase === "active" && progress > 0.34 && progress < 0.66,
  };
};

export const calculateMoverState = (def: MoverDef, tick: number): MoverState => {
  const angle = ((tick + def.phaseOffset) % def.periodTicks) / def.periodTicks * Math.PI * 2;
  const previousAngle = ((tick - 1 + def.phaseOffset + def.periodTicks) % def.periodTicks) / def.periodTicks * Math.PI * 2;
  const ease = (value: number) => (1 - Math.cos(value)) / 2;
  const x = def.x + (def.travelX || 0) * ease(angle);
  const y = def.y + (def.travelY || 0) * ease(angle);
  const previousX = def.x + (def.travelX || 0) * ease(previousAngle);
  const previousY = def.y + (def.travelY || 0) * ease(previousAngle);
  return { id: def.id, x, y, width: def.width, height: def.height, vx: (x - previousX) * WORLD.tickRate, vy: (y - previousY) * WORLD.tickRate };
};

// Movement budget derived from the authoritative physics in server.ts:
// ground-jump apex ≈ 560²/(2·1150) ≈ 136px, air-jump apex ≈ 510²/(2·1150) ≈ 113px.
export const NAV_MAX_RISE = 115;
export const NAV_MAX_GAP = 200;

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

const surfaceOf = (platform: Platform) => platform.y;

export const buildPlatformGraph = (map: MapDef): PlatformGraph => {
  // Split the ground strip into segments wherever a gap exceeds jump reach,
  // so bots reason about fall zones instead of walking into them blindly.
  const nodes: PlatformNode[] = [];
  for (let index = 0; index < map.platforms.length; index++) {
    const platform = map.platforms[index];
    if (platform.solid) continue;
    const isGround = platform.width >= 240 && !platform.oneWay;
    if (isGround) {
      let start = platform.x;
      while (start < platform.x + platform.width) {
        let segmentEnd = start;
        while (segmentEnd < platform.x + platform.width) {
          const probeX = segmentEnd + 30;
          const covered = map.platforms.some((other) => other !== platform && surfaceOf(other) <= platform.y + platform.height && other.y > platform.y && probeX > other.x - 10 && probeX < other.x + other.width + 10);
          if (covered && segmentEnd + 60 <= platform.x + platform.width) {
            segmentEnd += 60;
            break;
          }
          segmentEnd += 60;
        }
        const end = Math.min(segmentEnd, platform.x + platform.width);
        if (end - start >= 40) nodes.push({ index, platform, left: start, right: end });
        start = end;
      }
    } else {
      nodes.push({ index, platform, left: platform.x, right: platform.x + platform.width });
    }
  }

  const edgesFrom = new Map<number, NavEdge[]>();
  const pushEdge = (from: number, to: number, kind: NavEdge["kind"]) => {
    if (!edgesFrom.has(from)) edgesFrom.set(from, []);
    edgesFrom.get(from)!.push({ from, to, kind });
  };
  for (const node of nodes) {
    const nodeSurface = surfaceOf(node.platform);
    for (const other of nodes) {
      if (other === node) continue;
      const otherSurface = surfaceOf(other.platform);
      const overlap = Math.min(node.right, other.right) - Math.max(node.left, other.left);
      if (overlap > 0 && Math.abs(nodeSurface - otherSurface) < 8) pushEdge(node.index, other.index, "walk");
      else if (overlap > 0 && otherSurface > nodeSurface && otherSurface - nodeSurface < 400) pushEdge(node.index, other.index, "drop");
      else if (otherSurface < nodeSurface && nodeSurface - otherSurface <= NAV_MAX_RISE) {
        const horizontalGap = other.left > node.right ? other.left - node.right : node.left > other.right ? node.left - other.right : 0;
        if (horizontalGap <= NAV_MAX_GAP) pushEdge(node.index, other.index, "jump");
        else if (horizontalGap <= NAV_MAX_GAP + 140 && overlap > -80) pushEdge(node.index, other.index, "jump");
      } else if (Math.abs(nodeSurface - otherSurface) < 8 && overlap <= 0) {
        // Same-height gap hop: level platforms separated by a fall gap (M15
        // layouts lean on these). Bots leapfrog with a running jump.
        const horizontalGap = other.left > node.right ? other.left - node.right : node.left - other.right;
        if (horizontalGap > 0 && horizontalGap <= NAV_MAX_GAP + 40) pushEdge(node.index, other.index, "gapJump");
      }
    }
  }
  return { nodes, edgesFrom };
};

// M19 弹道几何：攻击、bot 感知与客户端视觉共用一份实现，杜绝两套真相。
// 所有函数只读 MapDef/平台数组，可在测试里直接验证。

/**
 * Damage falloff for a hit at `distance` from the muzzle with a weapon whose
 * range is `range`. Full damage out to 60% of range, then linear down to 0.6
 * at the cap; clamped so hits beyond the cap (air-burst splash etc.) floor at
 * 0.6. Knockback never scales with distance.
 */
export const rangeFalloff = (distance: number, range: number): number => {
  if (range <= 0) return 1;
  const fraction = clamp(distance / range, 0, 1);
  if (fraction <= 0.6) return 1;
  return clamp(1 - (fraction - 0.6) / 0.4 * 0.4, 0.6, 1);
};

/**
 * First intersection distance along the segment (x0,y0)->(x1,y1) with the
 * map's solid platforms, or undefined when the line of sight is clear.
 * Only `solid: true` platforms block; one-way ledges are shootable-through.
 */
export const raycastSolids = (
  platforms: Platform[],
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number | undefined => {
  const dx = x1 - x0;
  const dy = y1 - y0;
  if (dx === 0 && dy === 0) return undefined;
  let best: number | undefined;
  for (const platform of platforms) {
    if (!platform.solid) continue;
    // Slab method against the platform rect; also catches a start point
    // already inside a wall.
    let tEnter = 0;
    let tExit = 1;
    if (dx !== 0) {
      const t1 = (platform.x - x0) / dx;
      const t2 = (platform.x + platform.width - x0) / dx;
      tEnter = Math.max(tEnter, Math.min(t1, t2));
      tExit = Math.min(tExit, Math.max(t1, t2));
    } else if (x0 < platform.x || x0 > platform.x + platform.width) continue;
    if (dy !== 0) {
      const t1 = (platform.y - y0) / dy;
      const t2 = (platform.y + platform.height - y0) / dy;
      tEnter = Math.max(tEnter, Math.min(t1, t2));
      tExit = Math.min(tExit, Math.max(t1, t2));
    } else if (y0 < platform.y || y0 > platform.y + platform.height) continue;
    if (tEnter > tExit || tExit < 0 || tEnter > 1) continue;
    const hit = Math.max(0, tEnter);
    if (best === undefined || hit < best) best = hit;
  }
  return best === undefined ? undefined : best * Math.hypot(dx, dy);
};

/**
 * Y coordinate of the nearest standable platform surface strictly below (or
 * at) `y` at horizontal position `x`, or undefined when there is nothing to
 * land on (a fall gap). Drives blood-decal anchoring, gib bounces and bot
 * ground queries with one shared truth.
 */
export const surfaceBelow = (map: MapDef, x: number, y: number): number | undefined => {
  let best: number | undefined;
  for (const platform of map.platforms) {
    if (x < platform.x - 6 || x > platform.x + platform.width + 6) continue;
    if (platform.y < y - 12) continue;
    if (best === undefined || platform.y < best) best = platform.y;
  }
  return best;
};

export const makePlayer = (id: string, name: string, index: number, config: MatchConfig): PlayerState => {
  const spawn = MAPS[config.mapId].spawns[index % MAPS[config.mapId].spawns.length];
  const weapon: WeaponId = "sidearm";
  const ammoByWeapon = Object.fromEntries(
    (Object.keys(WEAPONS) as WeaponId[]).map((weaponId) => [weaponId, WEAPONS[weaponId].ammo]),
  ) as Record<WeaponId, number>;
  return {
    id,
    name,
    archetype: (index % 4) as PlayerState["archetype"],
    x: spawn.x,
    y: spawn.y,
    vx: 0,
    vy: 0,
    facing: index % 2 ? -1 : 1,
    onGround: false,
    jumpsUsed: 0,
    lives: config.lives,
    weapon,
    ammo: ammoByWeapon[weapon],
    ammoByWeapon,
    primaryCooldown: 0,
    secondaryCooldown: 0,
    invulnerable: 1.5,
    respawnTimer: 0,
    hitFlash: 0,
    connected: true,
    color: PLAYER_COLORS[index % PLAYER_COLORS.length],
    limbs: freshLimbs(),
  };
};
