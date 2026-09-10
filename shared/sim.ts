// M28.5 结构拆分：服务器/客户端共享的确定性模拟函数——机关状态、移动平台、
// bot 导航图、玩家出厂构造。纯函数、tick 驱动，测试可直接调用。

import { NAV_MAX_GAP, NAV_MAX_RISE, PLAYER_COLORS, WORLD } from "./constants.js";
import { freshLimbs } from "./util.js";
import { WEAPONS } from "./weapons.js";
import { MAPS } from "./maps/index.js";
import type {
  HazardDef,
  HazardState,
  MapDef,
  MatchConfig,
  MoverDef,
  MoverState,
  Platform,
  PlatformGraph,
  PlatformNode,
  NavEdge,
  PlayerState,
  WeaponId,
} from "./types.js";

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
