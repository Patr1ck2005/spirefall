import { MAPS, WEAPONS, buildPlatformGraph, calculateHazardState, calculateLimbModifiers, calculateMoverState, selectLimbAtPoint, type HazardDef, type MoverDef } from "../shared/game.js";

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

console.log("game logic tests passed");
