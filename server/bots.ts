import {
  LIMB_IDS,
  MAPS,
  WEAPONS,
  buildPlatformGraph,
  calculateHazardState,
  clamp,
  raycastSolids,
  type BotSkill,
  type ClientInput,
  type LimbIntegrity,
  type MapId,
  type PlayerState,
  type PlatformGraph,
  type WeaponId,
} from "../shared/game.js";
import { randomInt } from "node:crypto";
import type { Room } from "./server.js";

const randomBetween = (min: number, max: number) => randomInt(min, max + 1);

// Server-authoritative bot pilots. Bots perceive only public match state with
// a tier-dependent reaction delay; they never read opponent cooldowns, ammo,
// or anything a player could not see.
//
// M19 behavior-layer rewrite: range-band fire control, line-of-sight gating
// against solid cover, vertical realignment, smart weapon switching, threat
// memory, bullet dodging and a wall-stuck hop. All range/LOS math comes from
// the shared contract (WEAPONS, raycastSolids) — no second source of truth.

type Percept = {
  tick: number;
  self: {
    x: number; y: number; vx: number; vy: number; facing: 1 | -1; onGround: boolean;
    limbs: LimbIntegrity; weapon: WeaponId; ammoByWeapon: Record<WeaponId, number>;
  };
  target?: { id: string; x: number; y: number; vx: number; vy: number };
  crate?: { x: number; y: number; weapon: string; kind?: string };
  hazardZones: Array<{ x: number; y: number; width: number; height: number; phase: string; kind: string }>;
  /** Incoming projectiles that will pass near the bot within ~0.5s. */
  incoming: Array<{ x: number; y: number; vx: number; vy: number; distance: number }>;
  /** Chest-to-chest line of sight to the target (solid cover only). */
  losToTarget: boolean;
  targetDistance: number;
};

export type BotTier = {
  decisionEvery: number;
  reactionTicks: number;
  aimNoiseRad: number;
  leadFactor: number;
  fireChance: number;
  mistakeChance: number;
  dodgeHazards: boolean;
  /** Probability of sidestepping an incoming projectile when one is seen. */
  dodgeBullets: number;
};

export const BOT_TIERS: Record<BotSkill, BotTier> = {
  casual: { decisionEvery: 24, reactionTicks: 18, aimNoiseRad: 0.22, leadFactor: 0.2, fireChance: 0.55, mistakeChance: 0.3, dodgeHazards: false, dodgeBullets: 0 },
  standard: { decisionEvery: 12, reactionTicks: 9, aimNoiseRad: 0.11, leadFactor: 0.6, fireChance: 0.8, mistakeChance: 0.08, dodgeHazards: false, dodgeBullets: 0.25 },
  brutal: { decisionEvery: 6, reactionTicks: 4, aimNoiseRad: 0.05, leadFactor: 1.0, fireChance: 0.95, mistakeChance: 0.01, dodgeHazards: true, dodgeBullets: 0.65 },
};

const BOT_NAMES = ["VEK-3", "MOTH", "GRINDL", "HALFJACK", "SPUR", "CINDER-9"] as const;

type Plan = {
  targetId?: string;
  waypointX: number;
  chaseJump: boolean;
  gapJump: boolean;
  descend: boolean;
  dropThrough: boolean;
  hopOver: boolean;
  firePrimary: boolean;
  fireSecondary: boolean;
  /** Weapon slot (1-based) to request this decision cycle; 0 = keep. */
  switchTo: number;
};

type BotController = {
  playerId: string;
  skill: BotSkill;
  tier: BotTier;
  input: ClientInput;
  countdown: number;
  percepts: Percept[];
  plan: Plan;
  jumpPulse: number;
  chargeHold: number;
  stallTicks: number;
  stallAnchorX: number;
  forcedDir: number;
  forcedTicks: number;
  /** Ticks of "moving but not moving" on the ground — the wall-hop trigger. */
  wallStuckTicks: number;
  /** Cooldown (ticks) before the weapon manager may switch again. */
  switchCooldown: number;
  /** Most recent attacker seen in events: { id, tick }. */
  lastAttacker: { id: string; tick: number } | undefined;
};

export type BotRuntime = {
  controllers: Map<string, BotController>;
};

const runtimes = new WeakMap<Room, BotRuntime>();

const runtimeOf = (room: Room): BotRuntime => {
  let runtime = runtimes.get(room);
  if (!runtime) {
    runtime = { controllers: new Map() };
    runtimes.set(room, runtime);
  }
  return runtime;
};

const graphCache = new Map<MapId, PlatformGraph>();
const graphOf = (mapId: MapId): PlatformGraph => {
  let graph = graphCache.get(mapId);
  if (!graph) {
    graph = buildPlatformGraph(MAPS[mapId]);
    graphCache.set(mapId, graph);
  }
  return graph;
};

export const BOT_IDS = ["bot-1", "bot-2", "bot-3"] as const;
export const botNameFor = (slot: number) => BOT_NAMES[(slot - 1) % BOT_NAMES.length];

export function createBotInput(): ClientInput {
  return { seq: 0, left: false, right: false, jump: false, drop: false, primary: false, secondary: false, weaponSlot: undefined };
}

export function ensureControllers(room: Room) {
  const runtime = runtimeOf(room);
  for (const [playerId, controller] of [...runtime.controllers]) {
    if (!room.players.has(playerId)) {
      runtime.controllers.delete(playerId);
      continue;
    }
    // Lobby skill changes must reach already-spawned bots, not only new ones.
    const skill: BotSkill = room.config.botSkill;
    if (controller.skill !== skill) {
      controller.skill = skill;
      controller.tier = BOT_TIERS[skill];
      controller.chargeHold = 0;
    }
  }
  for (const player of room.players.values()) {
    if (!player.isBot || runtime.controllers.has(player.id)) continue;
    const slot = Number(player.id.slice(4)) || runtime.controllers.size + 1;
    const skill: BotSkill = room.config.botSkill;
    runtime.controllers.set(player.id, {
      playerId: player.id,
      skill,
      tier: BOT_TIERS[skill],
      input: createBotInput(),
      countdown: 0,
      percepts: [],
      plan: { waypointX: player.x, chaseJump: false, gapJump: false, descend: false, dropThrough: false, hopOver: false, firePrimary: false, fireSecondary: false, switchTo: 0 },
      jumpPulse: 0,
      chargeHold: 0,
      stallTicks: 0,
      stallAnchorX: player.x,
      forcedDir: 0,
      forcedTicks: 0,
      wallStuckTicks: 0,
      switchCooldown: 0,
      lastAttacker: undefined,
    });
  }
}

function platformUnder(graph: PlatformGraph, x: number, footY: number) {
  let best: { index: number; surface: number } | undefined;
  for (const node of graph.nodes) {
    if (x < node.left || x > node.right) continue;
    const surface = node.platform.y;
    if (surface >= footY - 14 && (!best || surface < best.surface)) best = { index: node.index, surface };
  }
  return best;
}

function nearestNodeIndex(graph: PlatformGraph, x: number, y: number) {
  let bestIndex = graph.nodes[0]?.index ?? 0;
  let bestDistance = Infinity;
  for (const node of graph.nodes) {
    const distance = Math.hypot((node.left + node.right) / 2 - x, node.platform.y - y);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = node.index;
    }
  }
  return bestIndex;
}

function routeTo(graph: PlatformGraph, fromIndex: number, toIndex: number): number[] | undefined {
  if (fromIndex === toIndex) return [];
  const visited = new Set<number>([fromIndex]);
  const parents = new Map<number, number>();
  const queue = [fromIndex];
  while (queue.length) {
    const current = queue.shift()!;
    for (const edge of graph.edgesFrom.get(current) || []) {
      if (visited.has(edge.to)) continue;
      visited.add(edge.to);
      parents.set(edge.to, current);
      if (edge.to === toIndex) {
        const path = [toIndex];
        let step = toIndex;
        while (parents.has(step)) {
          step = parents.get(step)!;
          path.unshift(step);
        }
        return path.slice(1);
      }
      queue.push(edge.to);
    }
  }
  return undefined;
}

/** Preferred engagement band per weapon: [min, max] horizontal distance. */
const ENGAGEMENT_BAND: Record<WeaponId, [number, number]> = {
  blade: [0, 70],
  scatter: [0, 300],
  sidearm: [80, 640],
  rocket: [250, 700],
  rifle: [250, 900],
  sniper: [500, 1400],
};

const bandScore = (weaponId: WeaponId, distance: number): number => {
  const [min, max] = ENGAGEMENT_BAND[weaponId];
  if (distance >= min && distance <= max) return 1;
  if (distance < min) return clamp(distance / Math.max(1, min), 0.15, 1);
  return clamp(max / distance, 0.05, 1);
};

function collectPercept(room: Room, self: PlayerState): Percept {
  let target: Percept["target"];
  let bestScore = Infinity;
  for (const other of room.players.values()) {
    if (other.id === self.id || other.lives <= 0 || other.respawnTimer > 0 || other.connected === false) continue;
    const distance = Math.hypot(other.x - self.x, other.y - self.y);
    if (distance < bestScore) {
      bestScore = distance;
      target = { id: other.id, x: other.x, y: other.y, vx: other.vx, vy: other.vy };
    }
  }
  let crate: Percept["crate"];
  let best = Infinity;
  const hurt = LIMB_IDS.some((limbId) => self.limbs[limbId] < 60);
  for (const candidate of room.crates) {
    if (!candidate.active) continue;
    const distance = Math.hypot(candidate.x - self.x, candidate.y - self.y);
    // Repair cells only register as interesting when damaged (or very close).
    if (candidate.kind === "repair" && !hurt && distance > 150) continue;
    if (distance < best) {
      best = distance;
      crate = { x: candidate.x, y: candidate.y, weapon: candidate.weapon, kind: candidate.kind };
    }
  }
  const hazardZones = room.hazards
    .filter((hazard) => hazard.kind === "blastCrusher" || hazard.kind === "forgePiston")
    .map((hazard) => ({ x: hazard.x, y: hazard.y, width: hazard.width, height: hazard.height, phase: hazard.phase, kind: hazard.kind }));

  // Incoming projectile scan: hostile rounds heading roughly toward the bot
  // and within half a second of arrival. Public state only.
  const incoming: Percept["incoming"] = [];
  for (const projectile of room.projectiles) {
    if (projectile.ownerId === self.id) continue;
    const dx = self.x - projectile.x;
    const dy = self.y - 14 - projectile.y;
    const distance = Math.hypot(dx, dy);
    if (distance > 280) continue;
    const closing = (dx * projectile.vx + dy * projectile.vy) / (Math.hypot(projectile.vx, projectile.vy) * Math.max(1, distance));
    if (closing > 0.6) incoming.push({ x: projectile.x, y: projectile.y, vx: projectile.vx, vy: projectile.vy, distance });
  }

  const map = MAPS[room.config.mapId];
  const chestY = self.y - 14;
  let losToTarget = false;
  let targetDistance = Infinity;
  if (target) {
    targetDistance = Math.hypot(target.x - self.x, target.y - self.y);
    losToTarget = raycastSolids(map.platforms, self.x, chestY, target.x, target.y - 14) === undefined;
  }
  return {
    tick: room.tick,
    self: { x: self.x, y: self.y, vx: self.vx, vy: self.vy, facing: self.facing, onGround: self.onGround, limbs: self.limbs, weapon: self.weapon, ammoByWeapon: self.ammoByWeapon },
    target,
    crate,
    hazardZones,
    incoming,
    losToTarget,
    targetDistance,
  };
}

// ---- Weapon manager -------------------------------------------------------
// Score every usable weapon for the current engagement; ask for the best one
// when it is not held. Usable = present in the match weapon set, enough ammo
// for the attack we would open with, and the band score is not hopeless.

const chooseWeapon = (room: Room, controller: BotController, percept: Percept): number => {
  const mine = room.players.get(controller.playerId)!;
  const weaponSet = room.config.weaponSet;
  const distance = Math.min(percept.targetDistance, 2000);
  let bestSlot = 0;
  let bestScore = 0;
  for (let slot = 0; slot < weaponSet.length; slot++) {
    const weaponId = weaponSet[slot];
    const def = WEAPONS[weaponId];
    const ammo = percept.self.ammoByWeapon[weaponId] ?? 0;
    if (ammo < def.primary.ammoCost) continue;
    let score = bandScore(weaponId, distance);
    // Blade only shines point blank; penalize holding it otherwise.
    if (weaponId === "blade" && distance > 90) score *= 0.2;
    // Sniping feels bad at close range — heavily downweight.
    if (weaponId === "sniper" && distance < 260) score *= 0.3;
    // Prefer keeping the held weapon slightly to avoid flip-flopping.
    if (weaponId === percept.self.weapon) score *= 1.12;
    // Ammo depth: an almost dry gun loses to a loaded one of similar fit.
    score *= 0.7 + 0.3 * clamp(ammo / Math.max(1, def.ammo), 0, 1);
    if (score > bestScore) {
      bestScore = score;
      bestSlot = slot + 1;
    }
  }
  return bestSlot;
};

function decidePlan(room: Room, controller: BotController, percept: Percept) {
  const map = MAPS[room.config.mapId];
  const graph = graphOf(room.config.mapId);
  const tier = controller.tier;
  const self = percept.self;

  // Default drift toward arena center keeps idle bots lively without hunting.
  let goalX = 500;
  let goalY = self.y;
  let wantCrates = false;
  const mine = room.players.get(controller.playerId)!;
  const held = WEAPONS[self.weapon];
  if (mine.ammo < held.ammo * 0.3 || mine.weapon === "sidearm") wantCrates = true;
  // Hurt pilots prioritize repair cells over ammo.
  const hurt = LIMB_IDS.some((limbId) => mine.limbs[limbId] < 60);
  const perceptCrate = percept.crate as (Percept["crate"] & { kind?: string }) | undefined;
  if (perceptCrate?.kind === "repair" && hurt) wantCrates = true;

  // M19: bots that are actually dry cross the map for supplies. Previously
  // they only diverted when a crate happened to be within 260px, so a bot
  // grinding one corner of the map never shopped.
  const dry = mine.ammo <= WEAPONS[mine.weapon].primary.ammoCost * 2;
  const crateReach = perceptCrate?.kind === "repair" && hurt ? 460 : dry ? 1400 : 260;
  if (perceptCrate && wantCrates && Math.hypot(perceptCrate.x - self.x, perceptCrate.y - self.y) < crateReach) {
    goalX = perceptCrate.x;
    goalY = perceptCrate.y;
  } else if (percept.target) {
    // Threat memory: the last pilot that landed a hit recently takes priority
    // over "nearest" when they are still visible in the reaction window.
    const attacker = controller.lastAttacker;
    const avenger = attacker && room.tick - attacker.tick < 120 && attacker.id !== controller.playerId
      ? [...room.players.values()].find((candidate) => candidate.id === attacker.id && candidate.lives > 0 && candidate.respawnTimer <= 0)
      : undefined;
    const pursue = avenger ?? (percept.target ? room.players.get(percept.target.id) : undefined);
    if (pursue) {
      goalX = pursue.x + pursue.vx * 0.25 * tier.leadFactor;
      goalY = pursue.y;
    }
  }

  // Pathfind across platforms toward the goal.
  const fromNode = platformUnder(graph, self.x, self.y + 8);
  const fromIndex = fromNode?.index ?? nearestNodeIndex(graph, self.x, self.y);
  const toIndex = nearestNodeIndex(graph, goalX, goalY);
  const route = routeTo(graph, fromIndex, toIndex);

  const plan: Plan = { waypointX: goalX, chaseJump: false, gapJump: false, descend: false, dropThrough: false, hopOver: false, firePrimary: false, fireSecondary: false, switchTo: 0 };

  if (route && route.length) {
    const nextNode = graph.nodes.find((node) => node.index === route[0])!;
    plan.waypointX = (nextNode.left + nextNode.right) / 2;
    const currentSurface = fromNode?.surface ?? self.y;
    const rising = nextNode.platform.y < currentSurface;
    const below = nextNode.platform.y > currentSurface + 40;
    plan.chaseJump = rising && Math.abs(plan.waypointX - self.x) < 90 && self.onGround !== false;
    plan.descend = below;
    if (below && fromNode) {
      const currentPlatform = graph.nodes.find((node) => node.index === fromNode.index)!.platform;
      const overlaps = self.x > currentPlatform.x && self.x < currentPlatform.x + currentPlatform.width && nextNode.left < currentPlatform.x + currentPlatform.width && nextNode.right > currentPlatform.x;
      if (overlaps) {
        // The shelf below is underfoot: drop through it (S) once aligned.
        plan.dropThrough = true;
      } else {
        // The shelf below is beyond the lip: aim 30px past the lip so the bot
        // actually walks off and falls (falls are free; lingering is a stall).
        const lip = nextNode.right < currentPlatform.x ? currentPlatform.x : currentPlatform.x + currentPlatform.width;
        plan.waypointX = lip + Math.sign(lip - self.x || 1) * 30;
        plan.dropThrough = false;
      }
    } else {
      plan.dropThrough = false;
    }
    // Same-height gap crossing: the route's next platform sits level with the
    // current one but the edges do not touch —hop the gap instead of walking
    // into it (M15 layouts widened horizontal gaps).
    const sameLevel = Math.abs(nextNode.platform.y - currentSurface) < 24;
    if (sameLevel && fromNode) {
      const currentPlatform = graph.nodes.find((node) => node.index === fromNode.index)!.platform;
      const gap = nextNode.left > currentPlatform.x + currentPlatform.width
        ? nextNode.left - (currentPlatform.x + currentPlatform.width)
        : currentPlatform.x - nextNode.right;
      const movingTowardGap = (plan.waypointX > self.x && nextNode.left > currentPlatform.x + currentPlatform.width) || (plan.waypointX < self.x && currentPlatform.x > nextNode.right);
      plan.gapJump = gap > 40 && gap < 220 && movingTowardGap;
    }
  }

  // ---- Fire control (M19) --------------------------------------------------
  // Range band + line of sight + vertical alignment gate every trigger pull.
  if (percept.target) {
    const dx = percept.target.x - self.x;
    const dy = percept.target.y - self.y;
    const distance = Math.abs(dx);
    // Spacing: overlap means a mutual grind-lock —leapfrog over the target
    // instead (movement keeps facing toward it, so both keep firing mid-hop).
    if (distance < 24 && Math.abs(dy) < 40) {
      const toward = Math.sign(dx) || 1;
      plan.waypointX = percept.target.x + toward * 60;
      plan.hopOver = true;
    }

    const hasLos = percept.losToTarget;
    const aligned = Math.abs(dy) < 44;
    // Fire gate is the weapon's true reach — shots beyond `range` are
    // guaranteed misses, so pull the trigger only inside it.
    const inRange = distance <= held.primary.range * 1.02;
    const ranged = held.primary.kind !== "melee";

    // Weapon manager: ask for a better gun when the held one fits poorly.
    if (controller.switchCooldown > 0) controller.switchCooldown -= tier.decisionEvery;
    if (controller.switchCooldown <= 0 && mine.ammo >= 0) {
      const wanted = chooseWeapon(room, controller, percept);
      if (wanted && wanted !== weaponSetSlotOf(room, self.weapon)) {
        plan.switchTo = wanted;
        controller.switchCooldown = 90; // 1.5s anti-flip-flop
      }
    }

    if (ranged && hasLos && aligned && inRange) {
      const flightTime = held.primary.speed > 0 ? distance / held.primary.speed : 0.08;
      const predictedX = percept.target.x + percept.target.vx * flightTime * tier.leadFactor;
      const aimError = (randomInt(-100, 100) / 100) * tier.aimNoiseRad;
      plan.firePrimary = Math.abs(dy) < 64 + aimError * 60 && Math.random() < tier.fireChance;
      plan.fireSecondary = Math.abs(dy) < 70 && distance > 120 && Math.random() < tier.fireChance * 0.5;
    } else if (!ranged) {
      // Melee: close the gap, swing inside reach.
      plan.firePrimary = distance < held.primary.range + 26 && Math.abs(dy) < 34 && Math.random() < tier.fireChance;
      plan.fireSecondary = distance < held.secondary.range + 20 && Math.random() < tier.fireChance * 0.6 && controller.skill !== "casual";
    } else if (hasLos && !aligned && distance < held.primary.range) {
      // Same column, wrong altitude: climb/drop to the target's shelf instead
      // of spraying at air.
      if (dy < 0) plan.chaseJump = plan.chaseJump || (self.onGround && Math.abs(dx) < 90);
      else if (self.onGround) plan.dropThrough = plan.dropThrough || Math.abs(dx) < 60;
    }
    // No LOS: no shooting at walls. The route march (above) already closes
    // distance; re-evaluate once cover is broken.
  }

  // Bullet dodging (tier-gated): sidestep incoming rounds.
  if (percept.incoming.length && Math.random() < tier.dodgeBullets) {
    const nearest = percept.incoming.reduce((best, candidate) => (candidate.distance < best.distance ? candidate : best));
    // Step perpendicular to the projectile's travel; jump if it hugs the ground.
    const side = nearest.vx > 0 ? -1 : 1;
    plan.waypointX = self.x + side * 60;
    if (nearest.y > self.y - 30 && self.onGround && Math.random() < 0.5) plan.hopOver = true;
  }

  // Brutal pilots sidestep crusher/piston strike zones during warnings.
  if (tier.dodgeHazards) {
    for (const zone of percept.hazardZones) {
      if (zone.phase !== "warning") continue;
      const def = map.hazards.find((candidate) => candidate.kind === zone.kind && candidate.width === zone.width);
      if (!def) continue;
      const future = calculateHazardState(def, room.tick + def.warningTicks);
      const insideX = self.x + 10 > future.x && self.x - 10 < future.x + future.width;
      if (insideX) plan.waypointX = self.x < zone.x + zone.width / 2 ? zone.x - 50 : zone.x + zone.width + 50;
    }
  }

  controller.plan = plan;
}

/** 1-based weaponSet slot of the held weapon, or 0 when absent. */
const weaponSetSlotOf = (room: Room, weaponId: WeaponId): number => {
  const slot = room.config.weaponSet.indexOf(weaponId);
  return slot < 0 ? 0 : slot + 1;
};

function executePlan(room: Room, controller: BotController, percept: Percept) {
  const input = controller.input;
  input.seq++;
  input.left = false;
  input.right = false;
  input.jump = false;
  input.drop = false;
  input.primary = false;
  input.secondary = false;
  input.weaponSlot = undefined;

  const self = percept.self;
  const deltaX = controller.plan.waypointX - self.x;
  if (Math.abs(deltaX) > 12) {
    if (deltaX > 0) input.right = true;
    else input.left = true;
  }

  if (controller.jumpPulse > 0) {
    controller.jumpPulse--;
    input.jump = true;
  } else if (controller.plan.chaseJump && self.onGround) {
    controller.jumpPulse = 4;
    controller.plan.chaseJump = false;
  } else if (controller.plan.hopOver && self.onGround && (input.left || input.right)) {
    // Leapfrog: hopping over an overlapping target separates the duel while
    // both pilots keep facing and firing.
    controller.jumpPulse = 3;
    controller.plan.hopOver = false;
  } else if (controller.plan.gapJump && self.onGround) {
    // Running hop at the lip of the gap: jump while still carrying speed.
    const graph = graphOf(room.config.mapId);
    const standing = platformUnder(graph, self.x, self.y + 8);
    if (standing) {
      const currentPlatform = graph.nodes.find((node) => node.index === standing.index)!.platform;
      const heading = Math.sign(controller.plan.waypointX - self.x) || 1;
      const edgeX = heading > 0 ? currentPlatform.x + currentPlatform.width : currentPlatform.x;
      if (Math.abs(edgeX - self.x) < 34) {
        controller.jumpPulse = 3;
        controller.plan.gapJump = false;
      }
    }
  }

  if (controller.plan.dropThrough && self.onGround) {
    input.drop = true;
    input.jump = false;
  }

  // Weapon switch request: one-shot slot pulse consumed by stepPlayer.
  if (controller.plan.switchTo) {
    input.weaponSlot = controller.plan.switchTo;
    controller.plan.switchTo = 0;
  }

  if (percept.target) {
    const shouldFace = percept.target.x > self.x ? 1 : -1;
    const moving = input.right ? 1 : input.left ? -1 : 0;
    if (moving !== -shouldFace) {
      // Charge weapons (Voltrail) hold primary while a shot is planned, then
      // release once the tier's hold budget elapses. M19: never charge into
      // a wall — hold-to-charge also requires line of sight.
      const mine = room.players.get(controller.playerId);
      const chargeMax = WEAPONS[mine?.weapon ?? "sidearm"].primary.chargeMax;
      if (chargeMax !== undefined && controller.plan.firePrimary && percept.losToTarget) {
        controller.chargeHold++;
        const budgetTicks = controller.skill === "brutal" ? Math.ceil(chargeMax * 60) : Math.ceil(chargeMax * 60 * (controller.skill === "standard" ? 0.55 : 0.3));
        if (controller.chargeHold > budgetTicks) controller.chargeHold = 0; // release fired; recharge on later ticks
        input.primary = controller.chargeHold > 0;
      } else {
        controller.chargeHold = 0;
        input.primary = controller.plan.firePrimary;
      }
      input.secondary = controller.plan.fireSecondary;
    }
  }

  // Wall-stuck hop: ordering movement into a solid but not actually moving
  // while grounded for ~0.2s commits to a jump over the obstruction. Faster
  // and more general than the anti-stall watchdog for cover walls.
  const ordering = input.left || input.right;
  if (ordering && self.onGround && Math.abs(self.vx) < 8) controller.wallStuckTicks++;
  else controller.wallStuckTicks = 0;
  if (controller.wallStuckTicks > 12 && controller.jumpPulse <= 0) {
    controller.jumpPulse = 4;
    controller.wallStuckTicks = 0;
  }

  // Anti-stall watchdog: an unreachable target (below the bot, or far away on
  // a stalled nav plan) with no net movement for ~4s commits the bot to a
  // forced 1.5s march toward the target —through cover walls if needed. A
  // blind drop is always recoverable; an eternal stalemate is not.
  const target = percept.target;
  const stuck = target && (target.y > self.y + 80 || Math.abs(target.x - self.x) > 240) && Math.abs(target.y - self.y) < 400;
  if (target && stuck && controller.forcedTicks <= 0) {
    if (Math.abs(self.x - controller.stallAnchorX) < 90) controller.stallTicks++;
    else {
      controller.stallTicks = 0;
      controller.stallAnchorX = self.x;
    }
    if (controller.stallTicks > 240) {
      controller.forcedDir = Math.sign(target.x - self.x) || 1;
      controller.forcedTicks = 90;
      controller.stallTicks = 0;
    }
  } else if (!stuck) {
    controller.stallTicks = 0;
    controller.stallAnchorX = self.x;
  }
  if (controller.forcedTicks > 0) {
    controller.forcedTicks--;
    // No jumping in a forced march: hops keep the bot bouncing vertically on
    // its perch instead of walking off the lip toward the target below.
    input.jump = false;
    if (target && target.y > self.y + 80 && Math.abs(target.x - self.x) < 20 && self.onGround) {
      input.drop = true;
    } else {
      if (controller.forcedDir > 0) input.right = true;
      else input.left = true;
    }
  }
}

export function updateBots(room: Room, dt: number) {
  if (room.phase !== "playing") return;
  void dt;
  const runtime = runtimeOf(room);
  ensureControllers(room);
  for (const player of room.players.values()) {
    if (!player.isBot || player.lives <= 0) continue;
    const controller = runtime.controllers.get(player.id);
    if (!controller) continue;

    // Threat memory from public combat events: anyone who landed a hit on
    // this bot recently is remembered (server-side data, no private state).
    for (const event of room.events) {
      if (event.type === "hit" && event.targetId === player.id && event.actorId && event.actorId !== player.id) {
        controller.lastAttacker = { id: event.actorId, tick: event.tick };
      }
    }

    const percept = collectPercept(room, player);
    controller.percepts.push(percept);
    const dueTick = room.tick - controller.tier.reactionTicks;
    let usableIndex = -1;
    for (let index = 0; index < controller.percepts.length; index++) {
      if (controller.percepts[index].tick <= dueTick) usableIndex = index;
      else break;
    }
    const stale = usableIndex >= 0 ? controller.percepts.slice(0, usableIndex + 1) : [];
    controller.percepts = controller.percepts.slice(usableIndex + 1);
    if (stale.length === 0) continue;
    const actionable = stale[stale.length - 1];

    controller.countdown--;
    if (controller.countdown <= 0) {
      controller.countdown = controller.tier.decisionEvery;
      decidePlan(room, controller, actionable);
    }
    executePlan(room, controller, actionable);
  }
}

export function getBotInput(room: Room, player: PlayerState): ClientInput | undefined {
  const controller = runtimeOf(room).controllers.get(player.id);
  return controller?.input;
}

export function clearBotInputs(room: Room) {
  const runtime = runtimeOf(room);
  for (const controller of runtime.controllers.values()) {
    controller.input = createBotInput();
    controller.percepts = [];
    controller.plan = { waypointX: 500, chaseJump: false, gapJump: false, descend: false, dropThrough: false, hopOver: false, firePrimary: false, fireSecondary: false, switchTo: 0 };
    controller.jumpPulse = 0;
    controller.chargeHold = 0;
    controller.wallStuckTicks = 0;
    controller.switchCooldown = 0;
    controller.lastAttacker = undefined;
  }
}

export const clampBotCount = (requested: number, humanCount: number) => clamp(Math.round(requested) || 0, 0, Math.max(0, 4 - humanCount));
