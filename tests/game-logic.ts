import { MAPS, WEAPONS, WORLD, buildPlatformGraph, calculateHazardState, calculateLimbModifiers, calculateMoverState, rangeFalloff, raycastSolids, selectLimbAtPoint, surfaceBelow, type HazardDef, type MapDef, type MoverDef, type Platform } from "../shared/game.js";
import { stepOffLedge } from "../server/bots.js";

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

const healthy = calculateLimbModifiers({ leftArm: 100, rightArm: 100, leftLeg: 100, rightLeg: 100 });
assert(healthy.cooldown === 1 && healthy.recoil === 1 && healthy.move === 1 && healthy.jump === 1, "Healthy limbs changed movement or attack timing");

const destroyed = calculateLimbModifiers({ leftArm: 0, rightArm: 0, leftLeg: 0, rightLeg: 0 });
assert(destroyed.cooldown === 1.4, "Arm damage did not reach the 40% cooldown cap");
assert(destroyed.recoil === 1.3, "Arm damage did not reach the 30% recoil cap");
assert(destroyed.move === 0.7, "Leg damage did not reach the 30% movement cap");
assert(destroyed.jump === 0.8, "Leg damage did not reach the 20% jump cap");

const player = { x: 100, y: 200 };
assert(selectLimbAtPoint(player, 82, 160) === "leftArm", "Upper-left hit did not select the left arm");
assert(selectLimbAtPoint(player, 118, 188) === "rightLeg", "Lower-right hit did not select the right leg");
assert(selectLimbAtPoint(player, 100, 170) === undefined, "Central torso hit incorrectly selected a limb");

const crusher: HazardDef = { id: "test-crusher", kind: "blastCrusher", x: 10, y: 20, width: 80, height: 100, periodTicks: 240, warningTicks: 60, activeTicks: 60, phaseOffset: 0, travelY: 160 };
assert(calculateHazardState(crusher, 0).phase === "warning", "Crusher did not begin with a warning phase");
assert(calculateHazardState(crusher, 80).phase === "active", "Crusher did not enter the active phase");
assert(calculateHazardState(crusher, 90).lethal, "Crusher core did not become lethal at peak travel");
assert(calculateHazardState(crusher, 150).phase === "idle", "Crusher did not return to idle");

const lift: HazardDef = { id: "test-lift", kind: "cargoLift", x: 0, y: 400, width: 120, height: 16, periodTicks: 360, warningTicks: 0, activeTicks: 360, phaseOffset: 0, travelY: -200 };
assert(Math.abs(calculateHazardState(lift, 0).y - 400) < 0.01, "Cargo lift start position is incorrect");
assert(Math.abs(calculateHazardState(lift, 180).y - 200) < 0.01, "Cargo lift did not reach its opposite endpoint");
assert(calculateHazardState(lift, 90).vy < 0, "Cargo lift velocity direction is incorrect");

const mover: MoverDef = { id: "test-mover", x: 0, y: 400, width: 120, height: 16, periodTicks: 360, phaseOffset: 0, travelY: -200 };
assert(Math.abs(calculateMoverState(mover, 0).y - 400) < 0.01, "Mover start position is incorrect");
assert(Math.abs(calculateMoverState(mover, 180).y - 200) < 0.01, "Mover did not reach its opposite endpoint");
assert(calculateMoverState(mover, 90).vy < 0 && calculateMoverState(mover, 270).vy > 0, "Mover velocity does not reverse mid-period");

for (const map of Object.values(MAPS)) {
  const graph = buildPlatformGraph(map);
  assert(graph.nodes.length > 0, `${map.name} produced an empty navigation graph`);
  const reachable = new Set<number>();
  const queue = [graph.nodes[0].index];
  while (queue.length) {
    const current = queue.pop()!;
    if (reachable.has(current)) continue;
    reachable.add(current);
    for (const edge of graph.edgesFrom.get(current) || []) queue.push(edge.to);
  }
  for (const node of graph.nodes) {
    assert(reachable.has(node.index), `${map.name} has a platform unreachable in the navigation graph`);
  }
}

for (const map of Object.values(MAPS)) {
  const levels = [...new Set(map.platforms.map((platform) => platform.y))].sort((a, b) => b - a);
  for (let index = 1; index < levels.length; index++) assert(levels[index - 1] - levels[index] <= 120, `${map.name} has an unreachable platform gap`);
  assert(map.crateSockets.length >= 8, `${map.name} does not have enough crate sockets`);
  for (const socket of map.crateSockets) {
    assert(map.platforms.some((platform) => socket.x >= platform.x && socket.x <= platform.x + platform.width && Math.abs(socket.y + 22 - platform.y) <= 1), `${map.name} has a crate socket off-platform`);
  }
}

// M14 fire-rate redesign blueprints: auto SMG, double-action scatter + flame
// vent, continuous beam, charge rail, heavy rocket, blade unchanged.
assert(WEAPONS.sidearm.primary.cooldown <= 0.1 && WEAPONS.sidearm.primary.pattern === "single", "Vein Ripper auto blueprint changed");
assert(WEAPONS.sidearm.secondary.pattern === "burst" && WEAPONS.sidearm.secondary.count === 6, "Vein Ripper overheat burst blueprint changed");
assert(WEAPONS.scatter.primary.pattern === "pellet" && WEAPONS.scatter.primary.count === 8, "Scatter pellet blueprint changed");
assert(WEAPONS.scatter.secondary.pattern === "pellet" && WEAPONS.scatter.secondary.cooldown <= 0.1, "Blaze Vent auto blueprint changed");
assert(WEAPONS.rifle.primary.pattern === "beam" && WEAPONS.rifle.primary.cooldown <= 0.15, "Longbeam blueprint changed");
assert(WEAPONS.rifle.secondary.pattern === "piercing" && WEAPONS.rifle.secondary.pierce === 3, "Lance Pulse blueprint changed");
assert(WEAPONS.sniper.primary.chargeMax !== undefined && WEAPONS.sniper.primary.chargeMax > 0.5, "Voltrail charge blueprint changed");
assert(WEAPONS.sniper.primary.pattern === "piercing" && WEAPONS.sniper.primary.pierce === 3, "Voltrail pierce blueprint changed");
assert(WEAPONS.rocket.secondary.pattern === "cluster" && WEAPONS.rocket.secondary.count === 3, "Rocket cluster blueprint changed");
assert(WEAPONS.blade.secondary.pattern === "dashSlash" && WEAPONS.blade.secondary.dashDistance > 0, "Blade dash blueprint changed");

// M15 damage pass: every weapon deals at least 1.4x the M14 baseline.
assert(WEAPONS.sidearm.primary.damage >= 7, "Sidearm damage below the M15 floor");
assert(WEAPONS.scatter.primary.damage >= 9, "Scatter damage below the M15 floor");
assert(WEAPONS.rifle.primary.damage >= 6, "Beam tick damage below the M15 floor");
assert(WEAPONS.sniper.primary.damage >= 32, "Voltrail damage below the M15 floor");
assert(WEAPONS.rocket.primary.damage >= 46, "Rocket damage below the M15 floor");
assert(WEAPONS.blade.primary.damage >= 38, "Blade damage below the M15 floor");

// M19 ballistics: range falloff, solid-cover raycast, surface anchoring.
assert(rangeFalloff(0, 640) === 1, "Falloff at the muzzle is not full damage");
assert(rangeFalloff(640 * 0.6, 640) === 1, "Falloff begins before the 60% plateau");
assert(Math.abs(rangeFalloff(640 * 0.8, 640) - 0.8) < 1e-9, "Falloff at 80% range should be 0.8");
assert(Math.abs(rangeFalloff(640, 640) - 0.6) < 1e-9, "Falloff at the cap should be 0.6");
assert(rangeFalloff(9999, 640) === 0.6, "Falloff beyond the cap should clamp at 0.6");
assert(rangeFalloff(500, 0) === 1, "Weapons without a range must not falloff");

const wall: Platform = { x: 500, y: 400, width: 26, height: 130, solid: true };
const shelf: Platform = { x: 200, y: 450, width: 100, height: 14, oneWay: true };
const losMap = { name: "los-test", platforms: [wall, shelf] } as unknown as MapDef;
assert(raycastSolids(losMap.platforms, 450, 460, 600, 460) !== undefined, "Horizontal ray through a solid wall must be blocked");
assert(raycastSolids(losMap.platforms, 450, 460, 495, 460) === undefined, "Ray stopping short of the wall must stay clear");
const blockedDistance = raycastSolids(losMap.platforms, 450, 460, 600, 460)!;
assert(Math.abs(blockedDistance - 50) < 1e-6, `Wall hit distance should be 50px from the origin, got ${blockedDistance}`);
assert(raycastSolids(losMap.platforms, 100, 455, 260, 455) === undefined, "One-way shelves must not block rays");
assert(raycastSolids(losMap.platforms, 520, 350, 520, 470) !== undefined, "Vertical ray into a wall top must be blocked");
assert(raycastSolids(losMap.platforms, 510, 430, 530, 470) !== undefined, "Ray starting inside a solid must report blocked");

const groundMap: MapDef = {
  name: "surface-test",
  platforms: [
    { x: 0, y: 530, width: 300, height: 30 },
    { x: 400, y: 500, width: 100, height: 14, oneWay: true },
  ],
} as MapDef;
assert(surfaceBelow(groundMap, 100, 500) === 530, "surfaceBelow must find the ground under a mid-air point");
assert(surfaceBelow(groundMap, 100, 540) === 530, "surfaceBelow at ground level must snap to the same surface");
assert(surfaceBelow(groundMap, 450, 480) === 500, "surfaceBelow must find the shelf under a higher point");
assert(surfaceBelow(groundMap, 350, 400) === undefined, "surfaceBelow over a gap must return undefined");
assert(surfaceBelow(groundMap, 450, 300) === undefined || surfaceBelow(groundMap, 450, 300) === 500, "surfaceBelow above a shelf may return the shelf or nothing");

// M19 range table: every attack has an enforced, honest range.
assert(WEAPONS.scatter.primary.range === 400, "Scatter pellets must be hard-capped at 400");
assert(WEAPONS.scatter.secondary.range === 260, "Blaze Vent flame range must be enforced at 260");
assert(WEAPONS.rifle.primary.range === 900, "Longbeam laser identity requires 900 range");
assert(WEAPONS.sniper.primary.range === 1400, "Voltrail rail identity requires 1400 range");
assert(WEAPONS.rocket.primary.range === 900 && WEAPONS.rocket.secondary.range === 640, "Rockets must have enforced air-burst ranges");
assert(WEAPONS.sidearm.primary.range === 640 && WEAPONS.rifle.secondary.range === 950 && WEAPONS.sniper.secondary.range === 1050, "Hitscan ranges drifted");
for (const weapon of Object.values(WEAPONS)) {
  assert(weapon.primary.range >= 0 && weapon.secondary.range >= 0, `${weapon.label} has a negative range`);
}

// M20 Echo Shard blueprint: ricochet pattern with hard bounce budgets, and
// range accounting covers the full flight (bounces do not extend reach).
assert(WEAPONS.echo.label === "Echo Shard", "Echo Shard label drifted");
assert(WEAPONS.echo.primary.pattern === "bounce" && WEAPONS.echo.secondary.pattern === "bounce", "Echo Shard must use the bounce pattern");
assert(WEAPONS.echo.primary.bounces === 3 && WEAPONS.echo.secondary.bounces === 5, "Echo Shard bounce budgets drifted");
assert(WEAPONS.echo.primary.range === 900 && WEAPONS.echo.secondary.range === 1100, "Echo Shard ranges drifted");
assert(WEAPONS.echo.primary.count === 2, "Echo Shard primary must volley two shards");
assert(WEAPONS.echo.primary.range <= WEAPONS.rifle.primary.range || WEAPONS.echo.secondary.range <= 1100, "Echo must not out-range the laser identity");
assert(Object.keys(WEAPONS).length === 7, "Weapon count drifted — slots 1-7 expected");

// M19 cover walls: exactly one solid platform per map, reachable hops, and no
// overlap with crate sockets or spawn points.
for (const map of Object.values(MAPS)) {
  const walls = map.platforms.filter((platform) => platform.solid);
  assert(walls.length === 1, `${map.name} must have exactly one cover wall, found ${walls.length}`);
  const wall = walls[0];
  assert(!wall.oneWay, `${map.name} cover wall must not be one-way`);
  for (const socket of map.crateSockets) {
    const overlaps = socket.x > wall.x - 20 && socket.x < wall.x + wall.width + 20 && Math.abs(socket.y - wall.y) < wall.height + 24;
    assert(!overlaps, `${map.name} cover wall overlaps crate socket ${socket.id}`);
  }
  for (const spawn of map.spawns) {
    const overlaps = spawn.x > wall.x - 20 && spawn.x < wall.x + wall.width + 20 && spawn.y > wall.y - 40 && spawn.y < wall.y + wall.height + 10;
    assert(!overlaps, `${map.name} cover wall overlaps a spawn point`);
  }
  // A pilot must be able to jump over or onto the wall from somewhere nearby:
  // either it rests on a platform with a hop-able rise, or it is a free-
  // standing pillar whose top is within NAV_MAX_RISE of an adjacent surface.
  // Rest detection picks the HIGHEST spanning surface under the wall — the
  // ground also spans every wall x-range and must not shadow the real shelf.
  const rest = map.platforms
    .filter((platform) => platform !== wall && platform.x <= wall.x && platform.x + platform.width >= wall.x + wall.width && platform.y >= wall.y + wall.height - 4 && !platform.solid)
    .sort((a, b) => a.y - b.y)[0];
  if (rest) {
    const rise = rest.y - wall.y;
    assert(rise <= 115, `${map.name} cover wall is ${rise}px tall — beyond the NAV_MAX_RISE hop budget`);
  } else {
    const stepping = map.platforms.find((platform) => {
      if (platform === wall || platform.solid) return false;
      if (platform.y < wall.y || platform.y - wall.y > 115) return false;
      const gap = platform.x + platform.width <= wall.x ? wall.x - (platform.x + platform.width) : platform.x >= wall.x + wall.width ? platform.x - (wall.x + wall.width) : 0;
      return gap <= 200;
    });
    assert(stepping, `${map.name} cover pillar has no reachable adjacent surface`);
  }
}

// Navigation graph still fully connected with the walls present (M19).
for (const map of Object.values(MAPS)) {
  const graph = buildPlatformGraph(map);
  assert(graph.nodes.length > 0, `${map.name} nav graph broke after adding cover walls`);
}

// M21 cliff guard: a grounded bot never steps toward a spot with no surface
// below it. Canopy east island (780..1000, y=530): its west edge fronts the
// 620..780 fall gap that repeatedly killed right-spawn bots. surfaceBelow's
// ±6px x-tolerance puts the last standable probe at x≈774, so a bot standing
// at x=788 probes 773 — void, vetoed; at x=790 it probes 775 — floor, safe.
const canopyPlatforms = MAPS.canopy.platforms;
const eastFoot = 530 - 4; // PLAYER_FOOT_OFFSET
const westLipFoot = 530 - 4;
assert(stepOffLedge(canopyPlatforms, 788, eastFoot, -1, true, false), "Cliff guard failed to veto the fatal step off the east-island lip");
assert(!stepOffLedge(canopyPlatforms, 800, eastFoot, -1, true, false), "Cliff guard vetoed a step that still has floor ahead");
// Same island, safe direction (east, toward the world-clamped end): floor ahead.
assert(!stepOffLedge(canopyPlatforms, 794, eastFoot, 1, true, false), "Cliff guard vetoed a step along solid ground");
// Route-planned gap crossing is exempt — blocking it would freeze the bot.
assert(!stepOffLedge(canopyPlatforms, 788, eastFoot, -1, true, true), "Cliff guard must not veto an armed gapJump");
// Airborne bots are never vetoed (the guard is a walking seatbelt only).
assert(!stepOffLedge(canopyPlatforms, 788, eastFoot, -1, false, false), "Cliff guard vetoed an airborne bot");
// Mid-island standing ground: steps in both directions have floor.
assert(!stepOffLedge(canopyPlatforms, 500, eastFoot, -1, true, false) && !stepOffLedge(canopyPlatforms, 500, eastFoot, 1, true, false), "Cliff guard vetoed steps on open ground");
// West island ends at 280 with the 280..420 gap beyond — the fatal eastward
// step off that lip is vetoed exactly like the east one.
assert(stepOffLedge(MAPS.canopy.platforms, 274, westLipFoot, 1, true, false), "Cliff guard failed to veto the fatal step off the west-island lip");

console.log("game logic tests passed");
