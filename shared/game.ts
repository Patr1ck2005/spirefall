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
export type AttackPattern = "single" | "burst" | "pellet" | "piercing" | "cluster" | "slash" | "dashSlash";
export type MatchMode = "match" | "sandbox";
export type LimbId = "leftArm" | "rightArm" | "leftLeg" | "rightLeg";
export type LimbIntegrity = Record<LimbId, number>;
export type HazardKind = "cargoLift" | "blastCrusher" | "conveyor" | "forgePiston";
export type HazardPhase = "idle" | "warning" | "active";
export type CombatEventType = "attack" | "hit" | "explosion" | "dismember" | "death" | "respawn" | "hazard" | "crateSpawn" | "cratePickup";

export type MatchConfig = {
  mapId: MapId;
  lives: 1 | 2 | 3 | 4 | 5;
  crates: boolean;
  weaponSet: WeaponId[];
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
};

export type CrateState = {
  id: number;
  x: number;
  y: number;
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
  visualSeed?: number;
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
  events: CombatEvent[];
  config: MatchConfig;
  winner?: string;
};

export type RoomView = {
  code: string;
  hostId: string;
  phase: ServerSnapshot["phase"];
  mode: MatchMode;
  players: Array<Pick<PlayerState, "id" | "name" | "connected" | "color" | "archetype">>;
  config: MatchConfig;
};

export type Platform = {
  x: number;
  y: number;
  width: number;
  height: number;
  oneWay?: boolean;
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
};

export const MAPS: Record<MapId, MapDef> = {
  canopy: {
    name: "Canopy",
    sector: "CROWN / ALTITUDE 91",
    color: 0x16242a,
    accent: 0x55d6d0,
    atmosphere: 0x99b7bb,
    backgroundAsset: "/assets/environments/canopy.webp",
    platforms: [
      { x: 0, y: 530, width: 1000, height: 30 },
      { x: 40, y: 430, width: 250, height: 16, oneWay: true },
      { x: 710, y: 430, width: 250, height: 16, oneWay: true },
      { x: 280, y: 335, width: 440, height: 16, oneWay: true },
      { x: 55, y: 240, width: 220, height: 16, oneWay: true },
      { x: 725, y: 240, width: 220, height: 16, oneWay: true },
      { x: 360, y: 135, width: 280, height: 16, oneWay: true },
    ],
    spawns: [{ x: 165, y: 426 }, { x: 835, y: 426 }, { x: 430, y: 331 }, { x: 570, y: 331 }],
    crateSockets: [
      { id: "canopy-ground-west", x: 105, y: 508 }, { id: "canopy-ground-east", x: 895, y: 508 },
      { id: "canopy-west-deck", x: 90, y: 408 }, { id: "canopy-east-deck", x: 910, y: 408 },
      { id: "canopy-crossing-west", x: 350, y: 313 }, { id: "canopy-crossing-east", x: 650, y: 313 },
      { id: "canopy-upper-west", x: 120, y: 218 }, { id: "canopy-upper-east", x: 880, y: 218 },
      { id: "canopy-crown", x: 500, y: 113 },
    ],
    hazards: [
      { id: "crown-lift-a", kind: "cargoLift", x: 250, y: 470, width: 130, height: 16, periodTicks: 360, warningTicks: 0, activeTicks: 360, phaseOffset: 0, travelY: -205 },
      { id: "crown-lift-b", kind: "cargoLift", x: 620, y: 265, width: 130, height: 16, periodTicks: 360, warningTicks: 0, activeTicks: 360, phaseOffset: 180, travelY: 205 },
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
      { x: 0, y: 530, width: 1000, height: 30 },
      { x: 40, y: 435, width: 240, height: 16, oneWay: true },
      { x: 720, y: 435, width: 240, height: 16, oneWay: true },
      { x: 300, y: 345, width: 400, height: 16, oneWay: true },
      { x: 80, y: 250, width: 240, height: 16, oneWay: true },
      { x: 680, y: 250, width: 240, height: 16, oneWay: true },
      { x: 390, y: 150, width: 220, height: 16, oneWay: true },
    ],
    spawns: [{ x: 160, y: 431 }, { x: 840, y: 431 }, { x: 430, y: 341 }, { x: 570, y: 341 }],
    crateSockets: [
      { id: "fortress-ground-west", x: 100, y: 508 }, { id: "fortress-ground-east", x: 900, y: 508 },
      { id: "fortress-west-deck", x: 110, y: 413 }, { id: "fortress-east-deck", x: 890, y: 413 },
      { id: "fortress-core-west", x: 360, y: 323 }, { id: "fortress-core-east", x: 640, y: 323 },
      { id: "fortress-upper-west", x: 145, y: 228 }, { id: "fortress-upper-east", x: 855, y: 228 },
      { id: "fortress-crown", x: 500, y: 128 },
    ],
    hazards: [
      { id: "bastion-crusher", kind: "blastCrusher", x: 455, y: 45, width: 90, height: 118, periodTicks: 480, warningTicks: 90, activeTicks: 54, phaseOffset: 45, travelY: 175, force: 620, limbDamage: 62 },
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
      { x: 0, y: 530, width: 270, height: 30 },
      { x: 365, y: 530, width: 270, height: 30 },
      { x: 730, y: 530, width: 270, height: 30 },
      { x: 30, y: 420, width: 250, height: 16, oneWay: true },
      { x: 720, y: 420, width: 250, height: 16, oneWay: true },
      { x: 330, y: 330, width: 340, height: 16, oneWay: true },
      { x: 80, y: 240, width: 220, height: 16, oneWay: true },
      { x: 700, y: 240, width: 220, height: 16, oneWay: true },
      { x: 390, y: 145, width: 220, height: 16, oneWay: true },
    ],
    spawns: [{ x: 150, y: 416 }, { x: 850, y: 416 }, { x: 430, y: 326 }, { x: 570, y: 326 }],
    crateSockets: [
      { id: "factory-ground-west", x: 110, y: 508 }, { id: "factory-ground-mid", x: 500, y: 508 }, { id: "factory-ground-east", x: 890, y: 508 },
      { id: "factory-west-deck", x: 110, y: 398 }, { id: "factory-east-deck", x: 890, y: 398 },
      { id: "factory-assembly-west", x: 390, y: 308 }, { id: "factory-assembly-east", x: 610, y: 308 },
      { id: "factory-upper-west", x: 145, y: 218 }, { id: "factory-upper-east", x: 855, y: 218 },
      { id: "factory-crown", x: 500, y: 123 },
    ],
    hazards: [
      { id: "foundry-belt", kind: "conveyor", x: 365, y: 530, width: 270, height: 16, periodTicks: 1, warningTicks: 0, activeTicks: 1, phaseOffset: 0, force: 95 },
      { id: "foundry-piston", kind: "forgePiston", x: 470, y: 222, width: 60, height: 112, periodTicks: 360, warningTicks: 60, activeTicks: 42, phaseOffset: 90, travelY: 170, force: 690, limbDamage: 72 },
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
};

export type WeaponDef = {
  id: WeaponId;
  label: string;
  ammo: number;
  primary: AttackDef;
  secondary: AttackDef;
  color: number;
};

const atk = (
  kind: AttackKind,
  cooldown: number,
  damage: number,
  knockback: number,
  recoil: number,
  range: number,
  ammoCost: number,
  speed: number,
  spread: number,
  radius: number,
  explosiveRadius = 0,
  pattern: AttackPattern = "single",
  count = 1,
  pierce = 0,
  dashDistance = 0,
  dashSpeed = 0,
): AttackDef => ({ kind, cooldown, damage, knockback, recoil, range, ammoCost, speed, spread, radius, explosiveRadius, pattern, count, pierce, dashDistance, dashSpeed });

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  sidearm: { id: "sidearm", label: "M-12 Needle", ammo: 12, color: 0xd8b45f, primary: atk("hitscan", 0.34, 7, 150, 28, 700, 1, 0, 0.03, 3, 0, "burst", 3), secondary: atk("hitscan", 0.75, 26, 310, 76, 850, 2, 0, 0, 4, 0, "piercing", 1, 2) },
  scatter: { id: "scatter", label: "Breach Scatter", ammo: 6, color: 0x9fc6d1, primary: atk("projectile", 0.72, 6, 95, 70, 0, 1, 760, 0.24, 4, 0, "pellet", 7), secondary: atk("melee", 1.1, 24, 380, 105, 75, 0, 0, 0, 0, 0, "slash") },
  rifle: { id: "rifle", label: "Magline Rifle", ammo: 24, color: 0x75c795, primary: atk("projectile", 0.12, 7, 80, 15, 0, 1, 930, 0.02, 3), secondary: atk("hitscan", 0.9, 30, 300, 70, 900, 4, 0, 0, 4, 0, "piercing", 1, 3) },
  sniper: { id: "sniper", label: "Rail Lance", ammo: 5, color: 0xd797c7, primary: atk("hitscan", 1.0, 52, 430, 120, 1100, 1, 0, 0, 3), secondary: atk("projectile", 1.45, 38, 260, 75, 0, 1, 1050, 0, 5, 0, "piercing", 1, 2) },
  rocket: { id: "rocket", label: "Forge Rocket", ammo: 4, color: 0xe9793d, primary: atk("explosive", 0.9, 34, 280, 110, 0, 1, 520, 0, 7, 80), secondary: atk("explosive", 1.6, 18, 320, 140, 0, 2, 410, 0.12, 8, 68, "cluster", 3) },
  blade: { id: "blade", label: "Cutter Blade", ammo: 999, color: 0xbfcbd0, primary: atk("melee", 0.32, 26, 270, 65, 70, 0, 0, 0, 0, 0, "slash"), secondary: atk("melee", 1.0, 42, 520, 110, 130, 0, 0, 0, 0, 0, "dashSlash", 1, 0, 92, 560) },
};

export const DEFAULT_CONFIG: MatchConfig = {
  mapId: "canopy",
  lives: 3,
  crates: true,
  weaponSet: ["sidearm", "scatter", "rifle", "sniper", "rocket", "blade"],
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
