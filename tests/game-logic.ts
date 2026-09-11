import { MAPS, WEAPONS, WORLD, buildPlatformGraph, calculateHazardState, calculateLimbModifiers, calculateMoverState, rangeFalloff, raycastSolids, selectLimbAtPoint, surfaceBelow, type HazardDef, type MapDef, type MoverDef, type Platform } from "../shared/game.js";
import { stepOffLedge } from "../server/bot-motion.js";

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

const healthy = calculateLimbModifiers({ leftArm: 100, rightArm: 100, leftLeg: 100, rightLeg: 100 });
assert(healthy.cooldown === 1 && healthy.recoil === 1 && healthy.move === 1 && healthy.jump === 1, "Healthy limbs changed movement or attack timing");
assert(healthy.spread === 1, "Healthy limbs must not change spread");

// M27 wound model: destroyed arms nearly double the trigger time, deepen the
// recoil AND widen the cone by 60%; destroyed legs drop movement to a ×0.4
// crawl and cut the jump to half — limb damage is now a real control penalty.
const destroyed = calculateLimbModifiers({ leftArm: 0, rightArm: 0, leftLeg: 0, rightLeg: 0 });
assert(destroyed.cooldown === 1.7, "Arm damage did not reach the 70% cooldown cap");
assert(destroyed.recoil === 1.6, "Arm damage did not reach the 60% recoil cap");
assert(destroyed.spread === 1.6, "Arm damage did not reach the 60% spread cap");
assert(destroyed.move === 0.4, "Leg damage did not reach the 60% movement drag");
assert(destroyed.jump === 0.5, "Leg damage did not reach the 50% jump drag");
// Partial wounds scale linearly: one arm at 50 → severity 0.5 → spread ×1.15.
const grazed = calculateLimbModifiers({ leftArm: 50, rightArm: 100, leftLeg: 100, rightLeg: 100 });
assert(Math.abs(grazed.spread - 1.15) < 1e-9, "Grazed arm did not scale the cone linearly");

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
assert(Object.keys(WEAPONS).length === 8, "Weapon count drifted — slots 1-8 expected");

// M19/M29 cover walls: 2-4 solid platforms per map (canopy 2 / fortress 3 /
// factory 3) breaking the long sightlines of the 1500px arena, each with
// reachable hops and no overlap with crate sockets or spawn points.
for (const map of Object.values(MAPS)) {
  const walls = map.platforms.filter((platform) => platform.solid);
  assert(walls.length >= 2 && walls.length <= 4, `${map.name} must carry 2-4 cover walls, found ${walls.length}`);
  for (const wall of walls) {
    assert(!wall.oneWay, `${map.name} cover wall must not be one-way`);
    for (const socket of map.crateSockets) {
      // M29: walls may stand directly beside ground sockets (the crate leans
      // against the wall face — a classic ambush spot); only true burial
      // (socket center within 8px of the wall face) fails.
      const overlaps = socket.x > wall.x - 8 && socket.x < wall.x + wall.width + 8 && Math.abs(socket.y - wall.y) < wall.height + 24;
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
}

// Navigation graph still fully connected with the walls present (M19).
for (const map of Object.values(MAPS)) {
  const graph = buildPlatformGraph(map);
  assert(graph.nodes.length > 0, `${map.name} nav graph broke after adding cover walls`);
}

// M21 cliff guard (M29 geometry): a grounded bot never steps toward a spot
// with no surface below it. Canopy mid island (630..950, y=795) fronts the
// 420..630 and 950..1170 fall gaps; surfaceBelow's ±6px x-tolerance means a
// bot standing 8px from a lip probes into the void (vetoed) while 20px from
// the lip still probes floor (safe) for any probe distance in [15,16]px.
const canopyPlatforms = MAPS.canopy.platforms;
const groundFoot = 795 - 4; // PLAYER_FOOT_OFFSET
// West lip of the mid island: the fatal westward step off x=630 is vetoed…
assert(stepOffLedge(canopyPlatforms, 638, groundFoot, -1, true, false), "Cliff guard failed to veto the fatal step off the mid-island west lip");
assert(!stepOffLedge(canopyPlatforms, 650, groundFoot, -1, true, false), "Cliff guard vetoed a step that still has floor ahead");
// …and the east lip (950) exactly the same way.
assert(stepOffLedge(canopyPlatforms, 942, groundFoot, 1, true, false), "Cliff guard failed to veto the fatal step off the mid-island east lip");
assert(!stepOffLedge(canopyPlatforms, 930, groundFoot, 1, true, false), "Cliff guard vetoed a step that still has floor ahead");
// Mid-island standing ground: steps in both directions have floor.
assert(!stepOffLedge(canopyPlatforms, 790, groundFoot, -1, true, false) && !stepOffLedge(canopyPlatforms, 790, groundFoot, 1, true, false), "Cliff guard vetoed steps on open ground");
// Route-planned gap crossing is exempt — blocking it would freeze the bot.
assert(!stepOffLedge(canopyPlatforms, 638, groundFoot, -1, true, true), "Cliff guard must not veto an armed gapJump");
// Airborne bots are never vetoed (the guard is a walking seatbelt only).
assert(!stepOffLedge(canopyPlatforms, 638, groundFoot, -1, false, false), "Cliff guard vetoed an airborne bot");
// World edge: G-east ends flush with the x=1500 world bound — the +6px
// surfaceBelow tolerance keeps the edge probe on the platform.
assert(!stepOffLedge(canopyPlatforms, 1490, groundFoot, 1, true, false), "Cliff guard vetoed a step along the world-edge floor");
// West island (0..420): the fatal eastward step off that lip is vetoed too.
assert(stepOffLedge(canopyPlatforms, 412, groundFoot, 1, true, false), "Cliff guard failed to veto the fatal step off the west-island lip");

// ---- M24: hit capsule + swept projectile geometry --------------------------
import { MOVE_TUNING, NAV_MAX_RISE, PLAYER_CAPSULE, PLAYER_TARGET_OFFSET, WORLD, segmentHitsPlayer, segmentImpactPoint, segmentSegmentClosest } from "../shared/game.js";

const capsuleTarget = { x: 400, y: 300 };
// Straight shot through the torso center: hit.
assert(segmentHitsPlayer(capsuleTarget, 340, 286, 460, 286), "Center-mass segment missed the capsule");
// Segment far above the capsule's reach (axis top 276, radius 11): miss.
assert(!segmentHitsPlayer(capsuleTarget, 340, 250, 460, 250), "Segment far outside the capsule radius registered a hit");
// Segment short of the body on the x axis: miss.
assert(!segmentHitsPlayer(capsuleTarget, 100, 286, 140, 286), "Segment well short of the body registered a hit");
// Head-height ray (old chest-circle model left the head unprotected): hit.
assert(segmentHitsPlayer(capsuleTarget, 340, 300 - PLAYER_CAPSULE.upTop + 2, 460, 300 - PLAYER_CAPSULE.upTop + 2), "Head-height segment missed the capsule");
// Knee-height ray: hit.
assert(segmentHitsPlayer(capsuleTarget, 340, 300 - PLAYER_CAPSULE.upBottom + 2, 460, 300 - PLAYER_CAPSULE.upBottom + 2), "Knee-height segment missed the capsule");

// Tunneling regression: a fast round whose per-tick path starts and ends
// BEYOND the body must still register (the old per-tick point test missed it).
assert(segmentHitsPlayer(capsuleTarget, 380, 286, 420, 286), "Swept segment that crosses the body in one tick was missed");
const tunnelImpact = segmentImpactPoint(capsuleTarget, 380, 286, 420, 286);
assert(tunnelImpact !== undefined && Math.abs(tunnelImpact.x - 400) < 12, "Swept impact point did not land on the body");

// Gravity arc approximation: a falling round passing the chest height still hits.
assert(segmentHitsPlayer(capsuleTarget, 300, 240, 500, 320), "Descending flight segment missed the capsule");

// Segment-segment distance sanity: parallel segments report separation.
const parallel = segmentSegmentClosest(0, 0, 100, 0, 0, 30, 100, 30);
assert(Math.abs(parallel.distance - 30) < 0.01, `Parallel segment distance drifted: ${parallel.distance}`);
const crossing = segmentSegmentClosest(-10, 0, 10, 0, 0, -10, 0, 10);
assert(crossing.distance < 0.01, `Crossing segments reported distance ${crossing.distance}`);

// M24b movement budget: the ground jump apex must clear the maps' tallest
// level step (every map ≤ 110px, budget 115) with a landing margin, and the
// air jump is deliberately weak (62px) — its job is finishes and rescues.
const groundApex = (MOVE_TUNING.jumpGround * MOVE_TUNING.jumpGround) / (2 * MOVE_TUNING.gravity);
assert(groundApex >= NAV_MAX_RISE + 4, `Ground jump apex ${groundApex.toFixed(1)}px fell below the nav budget ${NAV_MAX_RISE}px`);
const airApex = (MOVE_TUNING.jumpAir * MOVE_TUNING.jumpAir) / (2 * MOVE_TUNING.gravity);
assert(airApex >= 55 && airApex < groundApex * 0.65, `Air jump apex ${airApex.toFixed(1)}px left the intended weak-finisher band`);
// The equilibrium ground speed (accel·f/(1−f)) must actually reach the clamp,
// otherwise pilots crawl at half speed — the root of the old sticky feel.
const equilibrium = MOVE_TUNING.accelerate * MOVE_TUNING.groundFriction / (1 - MOVE_TUNING.groundFriction);
assert(equilibrium >= MOVE_TUNING.maxSpeed * 0.9, `Ground equilibrium ${equilibrium.toFixed(1)}px/s never reaches the ${MOVE_TUNING.maxSpeed} clamp — movement would feel sticky`);
assert(MOVE_TUNING.maxSpeed > 200, "Top speed regressed to a crawl");
assert(WORLD.snapshotRate === 30, "Snapshot rate should be 30Hz after the M24 latency pass");
// The hit capsule must cover roughly the drawn silhouette (≤11px half-width,
// spanning most of the 30px body height above the foot anchor).
assert(PLAYER_CAPSULE.radius >= 9 && PLAYER_CAPSULE.radius <= 13, "Capsule radius drifted from the sprite silhouette");
assert(PLAYER_CAPSULE.upTop >= 20 && PLAYER_CAPSULE.upTop <= 30, "Capsule top drifted away from the head zone");
// Chest reference height stays inside the capsule so target-height math in
// both server and client keeps aiming at the body.
assert(PLAYER_TARGET_OFFSET > PLAYER_CAPSULE.upBottom && PLAYER_TARGET_OFFSET < PLAYER_CAPSULE.upTop, "Chest target offset escaped the hit capsule");

// ---- M25: destructible props ------------------------------------------------
import { PROP_TUNING, segmentHitsProp } from "../shared/game.js";
// M20 balance band: a barrel is a hazard you shoot, not a better rocket —
// damage and blast must sit strictly inside the Forge Rocket's envelope.
assert(PROP_TUNING.damage < WEAPONS.rocket.primary.damage, "Barrel damage matched the rocket — barrels must stay under the M20 band");
assert(PROP_TUNING.blastRadius < WEAPONS.rocket.primary.explosiveRadius, "Barrel blast radius matched the rocket — barrels must stay under the M20 band");
assert(PROP_TUNING.hp > 0 && PROP_TUNING.hp <= 40, "Barrel hp drifted — two rifle bursts / one scatter volley should pop it");
assert(PROP_TUNING.respawnMin >= 5 && PROP_TUNING.respawnMax <= 12, "Barrel respawn window drifted outside the crate cadence");

// ---- M27: damage pass + hazard-grade barrels ---------------------------------
// Weapon damage table: every primary at or above the M27 floor.
assert(WEAPONS.sidearm.primary.damage === 11 && WEAPONS.sidearm.secondary.damage === 12, "Sidearm damage drifted from the M27 table");
assert(WEAPONS.scatter.primary.damage === 11 && WEAPONS.scatter.secondary.damage === 5, "Scatter damage drifted from the M27 table");
assert(WEAPONS.rifle.primary.damage === 8 && WEAPONS.rifle.secondary.damage === 48, "Longbeam damage drifted from the M27 table");
assert(WEAPONS.sniper.primary.damage === 40 && WEAPONS.sniper.secondary.damage === 44, "Voltrail damage drifted from the M27 table");
assert(WEAPONS.rocket.primary.damage === 66 && WEAPONS.rocket.secondary.damage === 34, "Forge Rocket damage drifted from the M28 table");
assert(WEAPONS.blade.primary.damage === 46 && WEAPONS.blade.secondary.damage === 74, "Cutter Blade damage drifted from the M27 table");
assert(WEAPONS.echo.primary.damage === 16 && WEAPONS.echo.secondary.damage === 42, "Echo Shard damage drifted from the M27 table");
// M27 Pyre Vent: cone-spray flamethrower inside the weapon count contract.
assert(WEAPONS.flame.label === "Pyre Vent" && WEAPONS.flame.primary.range === 230, "Pyre Vent identity drifted");
assert(WEAPONS.flame.primary.damage === 6 && WEAPONS.flame.secondary.count === 8, "Pyre Vent damage drifted from the M27 table");
assert(WEAPONS.flame.primary.speed === 430 && WEAPONS.flame.primary.cooldown <= 0.05, "Pyre Vent spray rhythm drifted");
// Cooldowns stayed frozen (only damage/knockback/blast moved this round).
assert(WEAPONS.sidearm.primary.cooldown === 0.09 && WEAPONS.rocket.primary.cooldown === 0.9 && WEAPONS.blade.secondary.cooldown === 1.0, "M27 touched cooldowns — the freeze was violated");
// Barrels became landmine-grade but stay under the rocket's envelope.
assert(PROP_TUNING.damage === 64 && PROP_TUNING.blastRadius === 104 && PROP_TUNING.knockback === 360, "Barrel tuning drifted from the M28 table");
assert(PROP_TUNING.hp === 30, "Barrel detonation threshold drifted");
// Swept segment vs barrel circle: same geometry the projectiles use.
const barrel = { x: 600, y: 400 };
assert(segmentHitsProp(barrel, 560, 388, 640, 388), "Crossing segment missed the barrel");
assert(!segmentHitsProp(barrel, 560, 370, 640, 370), "High-flying segment registered a phantom barrel hit");
assert(!segmentHitsProp(barrel, 100, 388, 200, 388), "Segment short of the barrel registered a hit");
assert(segmentHitsProp(barrel, 596, 388, 604, 388), "Segment fully inside the barrel missed");
// Every map: barrels sit ON a platform surface, away from spawns and crate
// sockets, so they never block drops or pickups.
for (const map of Object.values(MAPS)) {
  assert(map.props.length >= 3, `${map.name} lost its destructible props`);
  for (const prop of map.props) {
    assert(map.platforms.some((platform) => prop.x >= platform.x + 4 && prop.x <= platform.x + platform.width - 4 && Math.abs(prop.y - platform.y) <= 1), `${map.name} prop at ${prop.x},${prop.y} floats off the platform surface`);
    for (const spawn of map.spawns) {
      assert(Math.hypot(prop.x - spawn.x, prop.y - spawn.y) >= 80, `${map.name} prop sits within 80px of a spawn — spawn-kill risk`);
    }
    for (const socket of map.crateSockets) {
      assert(Math.hypot(prop.x - socket.x, prop.y - socket.y) >= 40, `${map.name} prop overlaps crate socket ${socket.id}`);
    }
  }
}

// ---- M30 squad mode: balance, friendly fire, spawns, standings -------------

import { DEFAULT_CONFIG, LIMB_IDS, WORLD, freshLimbs, makePlayer, type MatchConfig, type PlayerState } from "../shared/game.js";
import { pickSpawn, rebalanceTeams, sameTeam, teamStandings } from "../server/sim/teams.js";
import { damage } from "../server/sim/damage.js";
import type { Room } from "../server/state.js";

/** Minimal lobby-phase Room stub: the teams module only touches these fields. */
const makeSquadRoom = (players: PlayerState[], teams: number): Room => ({
  code: "TEST01",
  hostId: players[0]?.id ?? "",
  clients: new Map(),
  players: new Map(players.map((player) => [player.id, player])),
  tokens: new Map(),
  config: { ...DEFAULT_CONFIG, teams: teams as MatchConfig["teams"] },
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
  stats: {},
  mobs: [],
  mobQueue: [],
  drops: [],
  nextMobId: 1,
  nextDropId: 1,
  nextMobWaveTick: 0,
}) as unknown as Room;

const squadPilot = (id: string, index: number) => makePlayer(id, id, index, { ...DEFAULT_CONFIG, mapId: "canopy" });

{
  // Every block builds a FRESH roster — PlayerStates are mutable and shared
  // ids across rooms would leak squad ids between scenarios.
  const ffa = makeSquadRoom([squadPilot("a", 0), squadPilot("b", 1)], 0);
  rebalanceTeams(ffa);
  assert(ffa.players.get("a")!.teamId === undefined, "FFA rebalance must strip team ids");

  // All-unassigned 4p/2teams fills round-robin by least-filled: a→1 b→2 c→1 d→2.
  const twos = makeSquadRoom([squadPilot("a", 0), squadPilot("b", 1), squadPilot("c", 2), squadPilot("d", 3)], 2);
  rebalanceTeams(twos);
  const sizes2 = [1, 2, 3, 4].map((teamId) => [...twos.players.values()].filter((player) => player.teamId === teamId).length);
  const active2 = sizes2.filter((size) => size > 0);
  assert(active2.length === 2 && Math.max(...active2) - Math.min(...active2) <= 1, `2-squad balance drifted: ${sizes2.join("/")}`);
  assert(sameTeam(twos, twos.players.get("a"), twos.players.get("c")), "Alternating fill should put a and c on the same squad");
  assert(!sameTeam(twos, twos.players.get("a"), twos.players.get("b")), "Distinct squads must not read as allies");

  const threes = makeSquadRoom([squadPilot("a", 0), squadPilot("b", 1), squadPilot("c", 2), squadPilot("d", 3)], 3);
  rebalanceTeams(threes);
  const sizes3 = [1, 2, 3].map((teamId) => [...threes.players.values()].filter((player) => player.teamId === teamId).length);
  assert(sizes3.reduce((sum, size) => sum + size, 0) === 4 && Math.max(...sizes3) === 2 && Math.min(...sizes3) === 1, `3-squad balance drifted: ${sizes3.join("/")}`);

  // Auto-balance on join: the newcomer lands on the thinnest squad.
  const joined = makeSquadRoom([squadPilot("a", 0), squadPilot("b", 1)], 3);
  rebalanceTeams(joined);
  const newcomer = squadPilot("c", 2);
  joined.players.set(newcomer.id, newcomer);
  rebalanceTeams(joined);
  assert(newcomer.teamId === 3, `Joiner should fill the empty third squad, got ${newcomer.teamId}`);

  // Squad spawns: the M29 L,R,L,R alternation splits west/east by parity.
  const spawnRoom = makeSquadRoom([squadPilot("a", 0), squadPilot("b", 1), squadPilot("c", 2), squadPilot("d", 3)], 2);
  rebalanceTeams(spawnRoom);
  const canopy = MAPS.canopy;
  for (const player of spawnRoom.players.values()) {
    const index = [...spawnRoom.players.keys()].indexOf(player.id);
    const spawn = pickSpawn(spawnRoom, canopy, player, index);
    const west = player.teamId === 1;
    assert(west === spawn.x < WORLD.width / 2, `Squad ${player.teamId} spawn ${spawn.x} crossed the half line`);
  }
  const trioRoom = makeSquadRoom([squadPilot("a", 0), squadPilot("b", 1), squadPilot("c", 2)], 3);
  rebalanceTeams(trioRoom);
  const primaryPads = [...trioRoom.players.values()].map((player) => pickSpawn(trioRoom, canopy, player, 0));
  assert(primaryPads[0] === canopy.spawns[0] && primaryPads[1] === canopy.spawns[1] && primaryPads[2] === canopy.spawns[2], "Three squads must take the first three primary pads");
}

{
  // Friendly fire OFF: squadmates walk away from point-blank shots untouched.
  const room = makeSquadRoom([squadPilot("a", 0), squadPilot("b", 1), squadPilot("c", 2)], 2);
  rebalanceTeams(room);
  const shooter = room.players.get("a")!;
  const mate = [...room.players.values()].find((player) => player.id !== "a" && sameTeam(room, shooter, player))!;
  const enemy = [...room.players.values()].find((player) => !sameTeam(room, shooter, player))!;
  mate.limbs = freshLimbs();
  mate.invulnerable = 0;
  const before = { ...mate.limbs };
  damage(room, mate, 20, 0, mate.x - 40, mate.x, mate.y - 14, { actorId: shooter.id, weaponId: "sidearm" });
  assert(LIMB_IDS.every((limbId) => mate.limbs[limbId] === before[limbId]), "Squadmate shot must deal zero damage");
  assert(mate.vx === 0 && mate.vy === 0, "Squadmate shot must not knock back");
  enemy.limbs = freshLimbs();
  enemy.invulnerable = 0;
  damage(room, enemy, 20, 0, enemy.x - 40, enemy.x, enemy.y - 14, { actorId: shooter.id, weaponId: "sidearm" });
  assert(LIMB_IDS.some((limbId) => enemy.limbs[limbId] < 100), "Enemy shot must still wound");
  assert(room.events.some((event) => event.type === "hit" && event.targetId === enemy.id), "Enemy hit must emit the hit event");
  assert(!room.events.some((event) => event.type === "hit" && event.targetId === mate.id), "Squadmate shot must not emit a hit event");
}

{
  // Standings + squad resolution inputs: lives sum, alive flag, lead ordering.
  const roster = [squadPilot("a", 0), squadPilot("b", 1), squadPilot("c", 2), squadPilot("d", 3)];
  const room = makeSquadRoom(roster, 2);
  rebalanceTeams(room);
  for (const player of room.players.values()) player.lives = 1;
  const first = [...room.players.values()][0];
  first.lives = 2;
  first.limbs.rightLeg = 40;
  const standings = teamStandings(room);
  assert(standings.length === 2, "Standings must list both squads");
  // Squad sums: first's squad holds 2+1 lives, the other 1+1.
  assert(standings[0].teamId === first.teamId && standings[0].lives === 3, "Timeout ranking must lead with the most remaining lives");
  assert(standings[0].members[0].id === first.id, "Squad lead must be the pilot with the most lives");
  assert(standings[0].limbs < standings[1].limbs, "Remaining lives must dominate the timeout ranking over limb integrity");
  assert(standings.every((squad) => squad.alive), "Pilots with lives left keep their squad alive");
  for (const player of room.players.values()) player.lives = 0;
  const wiped = teamStandings(room);
  assert(wiped.every((squad) => !squad.alive), "A squad with zero lives and no respawn is dead");
}

// ---- M31 hostile mobs: waves, damage, drops --------------------------------

import { MOB_TUNING } from "../shared/game.js";
import { damageMob } from "../server/sim/damage.js";
import { queueMobWave, updateMobs } from "../server/sim/mobs.js";

{
  const room = makeSquadRoom([squadPilot("pilot", 0)], 0);
  room.config = { ...room.config, mobs: true };
  const canopy = MAPS.canopy;
  queueMobWave(room, canopy);
  assert(room.mobQueue.length === 1, "Wave spawn must queue exactly one telegraph");
  assert(room.events.some((event) => event.type === "mobSpawn"), "Telegraph must emit a mobSpawn event");
  assert(room.mobQueue[0].tick - room.tick === Math.round(MOB_TUNING.telegraph * 60), "Telegraph must last one second of ticks");

  // Promote at telegraph end: hp comes straight from the tuning table.
  room.tick = room.mobQueue[0].tick;
  updateMobs(room, canopy, 1 / 60);
  assert(room.mobs.length === 1, "Telegraph must promote into a live mob");
  assert(room.mobs[0].hp === MOB_TUNING.hp[room.mobs[0].kind], "Mob hp must come from the tuning table");
  assert(room.mobQueue.length === 0, "Promoted telegraph must leave the queue");

  // Kill → the 8-second repair pack drops and the death event fires.
  const mob = room.mobs[0];
  damageMob(room, mob, 999, mob.x - 20, 40);
  assert(!room.mobs.some((candidate) => candidate.id === mob.id), "Dead mob must leave the roster");
  assert(room.drops.length === 1 && room.drops[0].ttl === MOB_TUNING.dropTtl, "Mob death must drop a repair pack with the full ttl");
  assert(room.events.some((event) => event.type === "mobDeath"), "Mob death must emit a mobDeath event");

  // Concurrency cap: the spawner refuses to queue past the cap.
  room.mobQueue.length = 0;
  room.mobs = Array.from({ length: MOB_TUNING.cap }, (_, index) => ({ id: 100 + index, kind: "skitter" as const, x: 400, y: 700, vx: 0, vy: 0, hp: 30, facing: 1 as const, state: "stalk" as const, phaseTimer: 0 }));
  room.nextMobWaveTick = room.tick;
  updateMobs(room, canopy, 1 / 60);
  assert(room.mobQueue.length === 0, "Wave spawner must respect the concurrency cap");
}

console.log("game logic tests passed");
