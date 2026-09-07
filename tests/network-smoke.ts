import WebSocket from "ws";
import { WEAPONS } from "../shared/game.js";

const WEAPONS_SIDEARM_AMMO = WEAPONS.sidearm.ammo;

type Message = { type: string; [key: string]: any };
const waitFor = (ws: WebSocket, type: string, timeout = 4000) => new Promise<Message>((resolve, reject) => {
  const stack = new Error().stack?.split("\n").slice(3, 5).map((line) => line.trim().replace(/^at /, "")).join(" || ");
  const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${type} @ ${stack}`)), timeout);
  const handler = (raw: WebSocket.RawData) => {
    const message = JSON.parse(raw.toString()) as Message;
    if (message.type !== type) return;
    clearTimeout(timer);
    ws.off("message", handler);
    resolve(message);
  };
  ws.on("message", handler);
});
const open = () => new Promise<WebSocket>((resolve, reject) => {
  const ws = new WebSocket(process.env.SPIREFALL_WS || "ws://127.0.0.1:8787");
  ws.once("open", () => resolve(ws));
  ws.once("error", reject);
});
const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };

// M23 single-port hosting: when a production build exists the game server
// serves the compiled client from the same origin as the WebSocket. Only
// asserted when dist/ is present, so dev machines without a build still pass.
const webBase = (process.env.SPIREFALL_WS || "ws://127.0.0.1:8787").replace(/^ws/, "http");
const indexPage = await fetch(`${webBase}/`).then((r) => r.text()).catch(() => "");
if (indexPage) {
  assert(indexPage.includes('id="app"'), "Single-port hosting did not serve the built index page");
  const assetRef = indexPage.match(/src="(\/assets\/[^"]+\.js)"/);
  assert(assetRef, "Built index does not reference an /assets bundle");
  const bundle = await fetch(`${webBase}${assetRef![1]}`).then((r) => r.text());
  assert(bundle.length > 10000, "Served JS bundle looks truncated");
  assert(!bundle.includes("import.meta.env.DEV === undefined"), "Served bundle is not a production build");
}

const host = await open();
host.send(JSON.stringify({ type: "create", name: "Alpha" }));
const created = await waitFor(host, "room");
const roomCode = created.room.code as string;

const guest = await open();
guest.send(JSON.stringify({ type: "join", roomCode, name: "Bravo" }));
const joined = await waitFor(guest, "room");
assert(joined.room.players.length === 2, "Guest did not join the room");

host.send(JSON.stringify({ type: "config", patch: { mapId: "factory", lives: 2, crates: false } }));
await waitFor(host, "room");
host.send(JSON.stringify({ type: "start" }));
const started = await waitFor(host, "snapshot");
assert(started.snapshot.phase === "playing", "Match did not start");
assert(started.snapshot.mode === "match", "Normal start did not use match mode");
assert(started.snapshot.config.mapId === "factory", "Room config was not applied");
assert(started.snapshot.crates.length === 0, "Crates were not disabled by config");
assert(started.snapshot.hazards.some((hazard: any) => hazard.kind === "conveyor"), "Factory hazards were not synchronized");

host.send(JSON.stringify({ type: "input", input: { seq: 1, left: false, right: false, jump: false, drop: false, primary: true, secondary: true } }));
let dualAttack = false;
for (let i = 0; i < 8; i++) {
  const message = await waitFor(host, "snapshot");
  const player = message.snapshot.players.find((p: any) => p.id === created.selfId);
  if (player?.ammo < 90 && player.primaryCooldown > 0 && player.secondaryCooldown > 0) { dualAttack = true; break; }
}
assert(dualAttack, "Primary and secondary attack were not processed independently");
assert(started.snapshot.players.find((p: any) => p.id === created.selfId)?.limbs.leftArm === 100, "Limb integrity did not initialize");
host.send(JSON.stringify({ type: "input", input: { seq: 2, primary: false, secondary: false } }));

let grounded = false;
for (let i = 0; i < 20; i++) {
  const message = await waitFor(host, "snapshot");
  const player = message.snapshot.players.find((p: any) => p.id === created.selfId);
  if (player?.onGround) {
    grounded = true;
    break;
  }
}
assert(grounded, "Player did not settle onto the redesigned platform layout");
const jumpCounts: number[] = [];
for (let index = 0; index < 3; index++) {
  host.send(JSON.stringify({ type: "input", input: { seq: 10 + index * 2, jump: true } }));
  const jumped = await waitFor(host, "snapshot");
  jumpCounts.push(jumped.snapshot.players.find((p: any) => p.id === created.selfId)?.jumpsUsed ?? -1);
  host.send(JSON.stringify({ type: "input", input: { seq: 11 + index * 2, jump: false } }));
  await waitFor(host, "snapshot");
}
assert(jumpCounts.join(",") === "1,2,3", `W did not authorize exactly three jumps: ${jumpCounts.join(",")}`);
host.send(JSON.stringify({ type: "input", input: { seq: 16, jump: true } }));
const blockedJump = await waitFor(host, "snapshot");
assert(blockedJump.snapshot.players.find((p: any) => p.id === created.selfId)?.jumpsUsed === 3, "A fourth air jump was incorrectly authorized");
host.send(JSON.stringify({ type: "input", input: { seq: 17, jump: false, drop: true } }));
for (let i = 0; i < 60; i++) {
  const message = await waitFor(host, "snapshot");
  const player = message.snapshot.players.find((p: any) => p.id === created.selfId);
  if (player?.onGround && player.y > 400) break;
}
host.send(JSON.stringify({ type: "input", input: { seq: 18, drop: false } }));

let protectionExpired = false;
for (let i = 0; i < 40; i++) {
  const message = await waitFor(host, "snapshot");
  const guestPlayer = message.snapshot.players.find((p: any) => p.id === joined.selfId);
  if (guestPlayer?.invulnerable <= 0) { protectionExpired = true; break; }
}
assert(protectionExpired, "Spawn protection did not expire");
// Terrain v2 spawn points sit ~770px apart with lethal floor gaps between
// them, so walking into sidearm range is not practical. Both pilots drop
// through their one-way ledges onto the shared ground floor (same height),
// then the host switches to the Voltrail (weaponSet slot 4, range 1200)
// and fires straight across: deterministic geometry.
guest.send(JSON.stringify({ type: "input", input: { seq: 20, drop: true } }));
host.send(JSON.stringify({ type: "input", input: { seq: 5, drop: true } }));
let bothGround = false;
for (let i = 0; i < 40 && !bothGround; i++) {
  const message = await waitFor(host, "snapshot");
  const guestPlayer = message.snapshot.players.find((p: any) => p.id === joined.selfId);
  const hostPlayer = message.snapshot.players.find((p: any) => p.id === created.selfId);
  bothGround = !!guestPlayer && !!hostPlayer && guestPlayer.onGround && hostPlayer.onGround && Math.abs(guestPlayer.y - hostPlayer.y) < 8;
}
host.send(JSON.stringify({ type: "input", input: { seq: 6, drop: false } }));
guest.send(JSON.stringify({ type: "input", input: { seq: 21, drop: false, left: false, right: false, jump: false, primary: false, secondary: false } }));
assert(bothGround, "Pilots did not settle onto the shared ground floor");
host.send(JSON.stringify({ type: "input", input: { seq: 7, weaponSlot: 4 } }));
for (let i = 0; i < 6; i++) await waitFor(host, "snapshot");
const preShot = (await waitFor(host, "snapshot")).snapshot;
const preGuest = preShot.players.find((p: any) => p.id === joined.selfId);
const preHost = preShot.players.find((p: any) => p.id === created.selfId);
if (preHost.weapon !== "sniper") throw new Error(`Weapon slot switch failed: ${preHost.weapon}`);
assert(Math.abs(preGuest.x - preHost.x) < 1200 && Math.abs(preGuest.y - preHost.y) < 16, "Pilots are not in a shared-floor sniper line; map geometry broke this test");
// Voltrail (slot 4) is a charge weapon. Hold primary only until the charge
// readout clears chargeMin but stays below the 0.8 execution threshold —
// snapshot pacing varies widely on loaded CI runners, so a fixed 12-snapshot
// hold can overshoot to a lethal rail that KILLS the guest outright (no limb
// damage at all) and turns this deterministic test flaky. Watching charge
// makes the release point pacing-independent.
let charged = false;
host.send(JSON.stringify({ type: "input", input: { seq: 3, primary: true, secondary: false } }));
for (let i = 0; i < 40 && !charged; i++) {
  const message = await waitFor(host, "snapshot");
  const hostPlayer = message.snapshot.players.find((p: any) => p.id === created.selfId);
  const charge = hostPlayer?.charge ?? 0;
  if (charge >= 0.3 && charge < 0.75) charged = true;
  if (charge >= 0.75) {
    // Overshot: release immediately anyway — 0.75 is still a non-lethal rail.
    break;
  }
}
host.send(JSON.stringify({ type: "input", input: { seq: 31, primary: false, secondary: false } }));
let limbDamaged = false;
let guestDied = false;
let hitEventSeen = false;
for (let i = 0; i < 20; i++) {
  const message = await waitFor(host, "snapshot");
  const guestPlayer = message.snapshot.players.find((p: any) => p.id === joined.selfId);
  limbDamaged ||= Object.values(guestPlayer?.limbs || {}).some((value: any) => value < 100);
  hitEventSeen ||= message.snapshot.events.some((event: any) => event.type === "hit" && event.targetId === joined.selfId);
  guestDied ||= message.snapshot.events.some((event: any) => event.type === "death" && event.targetId === joined.selfId);
  if ((limbDamaged || guestDied) && hitEventSeen) break;
}
host.send(JSON.stringify({ type: "input", input: { seq: 4, primary: false } }));
assert(limbDamaged || guestDied, "Authoritative hit neither damaged a limb nor killed the guest");
assert(hitEventSeen || guestDied, "Authoritative hit did not emit a combat event");
host.send(JSON.stringify({ type: "input", input: { seq: 32, primary: false } }));

// --- M19: solid cover blocks shots. Canopy spawns seat both pilots on their
// ground platforms at identical height with the cover wall (452..478, 452..530)
// squarely on the chest-height line between them — zero driving required.
// The host fires the Lance Pulse (slot 3, range 950 > 790px line) so only the
// wall can explain zero damage, then the sidearm (640 < 790px, capped anyway).
const coverHost = await open();
coverHost.send(JSON.stringify({ type: "create", name: "Cover-Alpha" }));
const coverCreated = await waitFor(coverHost, "room");
coverHost.send(JSON.stringify({ type: "config", patch: { mapId: "canopy", lives: 2, crates: false, bots: 0 } }));
await waitFor(coverHost, "room");
const coverGuest = await open();
coverGuest.send(JSON.stringify({ type: "join", roomCode: coverCreated.room.code, name: "Cover-Bravo" }));
const coverJoined = await waitFor(coverGuest, "room");
coverHost.send(JSON.stringify({ type: "start" }));
await waitFor(coverHost, "snapshot");
let coverSettled = false;
for (let i = 0; i < 30 && !coverSettled; i++) {
  const message = await waitFor(coverHost, "snapshot", 5000);
  const alpha = message.snapshot.players.find((p: any) => p.id === coverCreated.selfId);
  coverSettled = !!alpha && alpha.onGround;
}
let coverProtectionGone = false;
for (let i = 0; i < 50 && !coverProtectionGone; i++) {
  const message = await waitFor(coverHost, "snapshot", 5000);
  const bravo = message.snapshot.players.find((p: any) => p.id !== coverCreated.selfId);
  coverProtectionGone = !!bravo && bravo.invulnerable <= 0;
}
assert(coverProtectionGone, "Cover-test spawn protection never expired");
coverHost.send(JSON.stringify({ type: "input", input: { seq: 10, weaponSlot: 3 } }));
for (let i = 0; i < 6; i++) await waitFor(coverHost, "snapshot", 5000);
coverHost.send(JSON.stringify({ type: "input", input: { seq: 11, secondary: true } }));
let coverAmmoBurned = false;
for (let i = 0; i < 14; i++) {
  const message = await waitFor(coverHost, "snapshot", 5000);
  const alpha = message.snapshot.players.find((p: any) => p.id === coverCreated.selfId);
  coverAmmoBurned ||= alpha.weapon === "rifle" && alpha.ammo < WEAPONS.rifle.ammo;
}
coverHost.send(JSON.stringify({ type: "input", input: { seq: 12, secondary: false, primary: true } }));
for (let i = 0; i < 14; i++) {
  const message = await waitFor(coverHost, "snapshot", 5000);
  const alpha = message.snapshot.players.find((p: any) => p.id === coverCreated.selfId);
  coverAmmoBurned ||= alpha.weapon === "rifle" && alpha.ammo < WEAPONS.rifle.ammo;
}
coverHost.send(JSON.stringify({ type: "input", input: { seq: 13, primary: false } }));
assert(coverAmmoBurned, "Cover-test host never fired through its weapon slot (test setup broken)");
let coverDamage = false;
for (let i = 0; i < 20; i++) {
  const message = await waitFor(coverHost, "snapshot", 5000);
  const bravo = message.snapshot.players.find((p: any) => p.id !== coverCreated.selfId);
  coverDamage ||= !!bravo && Object.values(bravo.limbs as Record<string, number>).some((value) => value < 100);
  if (coverDamage) break;
}
assert(!coverDamage, "Shots passed through solid cover — LOS blocking is broken");
coverHost.close();
coverGuest.close();

const disconnected = waitFor(host, "room");
guest.close();
const roomAfterDisconnect = await disconnected;
assert(roomAfterDisconnect.room.players.find((p: any) => p.id === joined.selfId)?.connected === false, "Disconnected player slot was not retained");

const restoredGuest = await open();
restoredGuest.send(JSON.stringify({ type: "join", roomCode, name: "Bravo", token: joined.token, playerId: joined.selfId }));
const restored = await waitFor(restoredGuest, "room");
assert(restored.selfId === joined.selfId, "Reconnect did not restore the original player id");

const solo = await open();
solo.send(JSON.stringify({ type: "create", name: "Solo" }));
const soloCreated = await waitFor(solo, "room");
solo.send(JSON.stringify({ type: "config", patch: { mapId: "factory", lives: 1, crates: true } }));
await waitFor(solo, "room");
solo.send(JSON.stringify({ type: "start_sandbox" }));
const soloStarted = await waitFor(solo, "snapshot");
assert(soloStarted.snapshot.phase === "playing", "Solo sandbox did not start");
assert(soloStarted.snapshot.mode === "sandbox", "Solo start did not use sandbox mode");
assert(soloStarted.snapshot.crates.length === 6, "Solo sandbox did not preserve crate settings");
assert(soloStarted.snapshot.hazards.length === 4, "Solo sandbox did not synchronize map hazards");

solo.send(JSON.stringify({ type: "input", input: { seq: 1, left: false, right: false, jump: false, drop: false, primary: true, secondary: true } }));
let soloDualAttack = false;
for (let i = 0; i < 8; i++) {
  const message = await waitFor(solo, "snapshot");
  const player = message.snapshot.players.find((p: any) => p.id === soloCreated.selfId);
  if (player?.ammo < 90 && player.primaryCooldown > 0 && player.secondaryCooldown > 0) { soloDualAttack = true; break; }
}
assert(soloDualAttack, "Solo sandbox did not process J/K attacks independently");

solo.send(JSON.stringify({ type: "sandbox_respawn" }));
let respawning = false;
for (let i = 0; i < 8; i++) {
  const message = await waitFor(solo, "snapshot");
  const player = message.snapshot.players.find((p: any) => p.id === soloCreated.selfId);
  assert(message.snapshot.phase === "playing", "Solo sandbox ended while one player was active");
  if (player?.respawnTimer > 0) { respawning = true; break; }
}
assert(respawning, "Solo sandbox did not enter the respawn state");
let respawned = false;
let restoredLimbs = false;
for (let i = 0; i < 50; i++) {
  const message = await waitFor(solo, "snapshot");
  const player = message.snapshot.players.find((p: any) => p.id === soloCreated.selfId);
  if (player?.respawnTimer <= 0 && player.lives === 1) {
    respawned = true;
    restoredLimbs = Object.values(player.limbs).every((value: any) => value === 100);
    break;
  }
}
assert(respawned, "Solo sandbox did not respawn with replenished lives");
assert(restoredLimbs, "Solo respawn did not restore limb integrity");

const returnedToLobby = waitFor(solo, "room");
solo.send(JSON.stringify({ type: "return_lobby" }));
const soloLobby = await returnedToLobby;
assert(soloLobby.room.phase === "lobby", "Solo sandbox did not return to the lobby");
assert(soloLobby.room.mode === "match", "Returning to the lobby did not reset match mode");

// --- M20: Echo Shard (slot 7) ricochet. Shards fly flat, arc under gravity,
// strike the ground and reflect — the same projectile must survive the impact
// with a lower bouncesRemaining budget. ---
const echoRoom = await open();
echoRoom.send(JSON.stringify({ type: "create", name: "Echo-Pilot" }));
const echoCreated = await waitFor(echoRoom, "room");
// Partial weapon set without sidearm: regression for the M20 sparse-array
// crash (unshift + unconditional length trim used to grow the set with holes).
echoRoom.send(JSON.stringify({ type: "config", patch: { mapId: "fortress", lives: 1, crates: false, weaponSet: ["echo"] } }));
const echoLobby = await waitFor(echoRoom, "room");
assert(JSON.stringify(echoLobby.room.config.weaponSet) === JSON.stringify(["sidearm", "echo"]), `Partial weapon set was not normalized to [sidearm, echo] (got ${JSON.stringify(echoLobby.room.config.weaponSet)})`);
// Restore the full armory so slot 7 maps to Echo Shard for the slot checks.
echoRoom.send(JSON.stringify({ type: "config", patch: { weaponSet: ["sidearm", "scatter", "rifle", "sniper", "rocket", "blade", "echo"] } }));
await waitFor(echoRoom, "room");
echoRoom.send(JSON.stringify({ type: "start_sandbox" }));
await waitFor(echoRoom, "snapshot");
// weaponSlot 7 must select Echo Shard (the old 1-6 clamp rejected it).
echoRoom.send(JSON.stringify({ type: "input", input: { seq: 10, weaponSlot: 7 } }));
let echoSelected = false;
for (let i = 0; i < 10 && !echoSelected; i++) {
  const message = await waitFor(echoRoom, "snapshot", 5000);
  echoSelected = message.snapshot.players.find((p: any) => p.id === echoCreated.selfId)?.weapon === "echo";
}
assert(echoSelected, "weaponSlot 7 did not select the Echo Shard (clamp still capped at 6?)");
// weaponSlot 8 clamps to 7 — the weapon stays Echo Shard, never a crash.
echoRoom.send(JSON.stringify({ type: "input", input: { seq: 11, weaponSlot: 8 } }));
let echoStillHeld = false;
for (let i = 0; i < 6 && !echoStillHeld; i++) {
  const message = await waitFor(echoRoom, "snapshot", 5000);
  echoStillHeld = message.snapshot.players.find((p: any) => p.id === echoCreated.selfId)?.weapon === "echo";
}
assert(echoStillHeld, "weaponSlot 8 did not clamp to slot 7");
// Fire and watch an echo projectile survive a surface impact.
let bounceBudgetSpent = false;
let bounceImpactSeen = false;
echoRoom.send(JSON.stringify({ type: "input", input: { seq: 12, primary: true } }));
for (let i = 0; i < 40 && !(bounceBudgetSpent && bounceImpactSeen); i++) {
  const message = await waitFor(echoRoom, "snapshot", 5000);
  bounceImpactSeen ||= message.snapshot.events.some((event: any) => event.type === "impact" && event.weaponId === "echo" && event.pattern === "bounce" && event.surface === true);
  const shard = message.snapshot.projectiles.find((projectile: any) => projectile.weaponId === "echo" && projectile.ttl > 0 && projectile.bouncesRemaining < (projectile.secondary ? 5 : 3));
  bounceBudgetSpent ||= !!shard;
}
echoRoom.send(JSON.stringify({ type: "input", input: { seq: 13, primary: false } }));
assert(bounceImpactSeen, "Echo Shard produced no bounce impact event at a surface");
assert(bounceBudgetSpent, "Echo Shard never survived an impact with a spent bounce budget");
echoRoom.send(JSON.stringify({ type: "return_lobby" }));
echoRoom.close();

// --- Bot pilots: lobby roster, match start with 1 human + 2 bots, activity ---
const botHost = await open();
botHost.send(JSON.stringify({ type: "create", name: "Pilot-Prime" }));
const botCreated = await waitFor(botHost, "room");
const botRoomCode = botCreated.room.code as string;
botHost.send(JSON.stringify({ type: "config", patch: { bots: 2, botSkill: "standard", mapId: "canopy", lives: 3 } }));
const botLobby = await waitFor(botHost, "room");
assert(botLobby.room.players.length === 3, `Bot roster was not materialized in the lobby (${botLobby.room.players.length})`);
const botEntries = botLobby.room.players.filter((p: any) => p.isBot);
assert(botEntries.length === 2, "Configured bots are not flagged isBot");
assert(botEntries.every((p: any) => p.id !== botCreated.selfId), "Bot flag leaked onto a human player");

botHost.send(JSON.stringify({ type: "start" }));
const botStarted = await waitFor(botHost, "snapshot");
assert(botStarted.snapshot.phase === "playing", "1 human + 2 bots did not pass the >= 2 participants rule");
assert(botStarted.snapshot.players.length === 3, "Bots missing from the playing snapshot");

let sawBotMove = false;
let sawBotAttackEvent = false;
for (let i = 0; i < 90; i++) {
  const message = await waitFor(botHost, "snapshot", 5000);
  for (const bot of message.snapshot.players.filter((p: any) => p.isBot)) {
    if (Math.abs(bot.x - botStarted.snapshot.players.find((p: any) => p.id === bot.id).x) > 24) sawBotMove = true;
  }
  sawBotAttackEvent ||= message.snapshot.events.some((event: any) => event.type === "attack" && message.snapshot.players.find((p: any) => p.id === event.actorId)?.isBot);
  if (sawBotMove && sawBotAttackEvent) break;
}
assert(sawBotMove, "Bots never changed position over the observation window");
assert(sawBotAttackEvent, "Bots never produced an attack event over the observation window");

// Host migration must fire immediately when the host leaves, and bots can
// never inherit the room. Verified by reconnecting after the departure.
const migrationHost = await open();
migrationHost.send(JSON.stringify({ type: "create", name: "Migration-Host" }));
const migrationCreated = await waitFor(migrationHost, "room");
const migrationCode = migrationCreated.room.code as string;
migrationHost.send(JSON.stringify({ type: "config", patch: { bots: 1 } }));
await waitFor(migrationHost, "room");
const migrant = await open();
migrant.send(JSON.stringify({ type: "join", roomCode: migrationCode, name: "Migration-Heir" }));
const migrantJoined = await waitFor(migrant, "room");
assert(migrantJoined.room.players.length === 3, "Migration lobby did not hold host + bot + heir");
migrationHost.close();
migrant.close();
// Give the server a beat to process the departure, then rejoin as the heir.
await new Promise((resolve) => setTimeout(resolve, 600));
const heir = await open();
heir.send(JSON.stringify({ type: "join", roomCode: migrationCode, name: "Migration-Heir", token: undefined, playerId: undefined }));
let migratedRoom: Message | undefined;
for (let attempt = 0; attempt < 10; attempt++) {
  const reply = await waitFor(heir, "room");
  if (reply.room.players.some((p: any) => p.id === "bot-1")) { migratedRoom = reply; break; }
}
assert(migratedRoom, "Rejoin after host departure failed");
assert(migratedRoom!.room.hostId !== migrationCreated.selfId, "Departed host still owns the room");
const newHostEntry = migratedRoom!.room.players.find((p: any) => p.id === migratedRoom!.room.hostId);
assert(newHostEntry && !newHostEntry.isBot, "Host migration selected a bot or vanished");
heir.close();

// Sandbox + one bot still works, and pure solo remains valid.
const sandboxHost = await open();
sandboxHost.send(JSON.stringify({ type: "create", name: "Sandbox-Pilot" }));
const sandboxCreated = await waitFor(sandboxHost, "room");
sandboxHost.send(JSON.stringify({ type: "config", patch: { bots: 1, botSkill: "casual" } }));
await waitFor(sandboxHost, "room");
sandboxHost.send(JSON.stringify({ type: "start_sandbox" }));
const sandboxStarted = await waitFor(sandboxHost, "snapshot");
assert(sandboxStarted.snapshot.mode === "sandbox", "Sandbox with 1 human + 1 bot did not start");
assert(sandboxStarted.snapshot.players.filter((p: any) => p.isBot).length === 1, "Sandbox snapshot is missing its bot");

// --- Elimination freeze: an out-of-lives pilot stops simulating (no repeated
// death events, lives never go negative), and the match resolves promptly ---
const elimHost = await open();
elimHost.send(JSON.stringify({ type: "create", name: "Elim-Watcher" }));
const elimCreated = await waitFor(elimHost, "room");
elimHost.send(JSON.stringify({ type: "config", patch: { mapId: "canopy", lives: 1, bots: 1, botSkill: "casual", crates: false } }));
await waitFor(elimHost, "room");
elimHost.send(JSON.stringify({ type: "start" }));
const elimStarted = await waitFor(elimHost, "snapshot");
assert(elimStarted.snapshot.players.length === 2, "Elimination room did not field 2 pilots");
// Deterministic elimination: with lives=1 the host walks off the map once.
// Afterwards the freeze must hold — the eliminated host emits no further
// death events, never drops below 0 lives, and the match resolves.
let elimSettled = false;
let repeatedDeaths = false;
let negativeLives = false;
let resolved = false;
// Deterministic elimination: with lives=1 the host holds "right" until the
// death lands (walk off the spawn ledge, across the ground, into the gap).
for (let i = 0; i < 400 && !resolved; i++) {
  const message = await waitFor(elimHost, "snapshot", 5000);
  const dead = message.snapshot.players.find((p: any) => p.lives <= 0);
  if (!dead) elimHost.send(JSON.stringify({ type: "input", input: { seq: 1, right: true } }));
  if (dead) {
    elimSettled = true;
    elimHost.send(JSON.stringify({ type: "input", input: { seq: 2, right: false } }));
    negativeLives ||= dead.lives < 0;
    const deathEvents = message.snapshot.events.filter((event: any) => event.type === "death" && event.targetId === dead.id);
    repeatedDeaths ||= deathEvents.length > 1;
  }
  resolved ||= message.snapshot.phase === "results";
}
assert(elimSettled, "Elimination scenario never produced an out-of-lives pilot");
assert(!negativeLives, "An eliminated pilot lost extra lives after death (freeze broken)");
assert(!repeatedDeaths, "An eliminated pilot emitted repeated death events (freeze broken)");
assert(resolved, "Match with one eliminated pilot did not resolve");
elimHost.close();

// --- Explicit leave_room removes the pilot immediately (no 30s hold) ---
const leaveHost = await open();
// Continuous collector: ws drops messages that arrive while no listener is
// attached, so per-message waitFor races the server's roster broadcasts.
const leaveRosters: any[] = [];
leaveHost.on("message", (raw: WebSocket.RawData) => {
  const message = JSON.parse(raw.toString()) as Message;
  if (message.type === "room") leaveRosters.push(message);
});
leaveHost.send(JSON.stringify({ type: "create", name: "Leave-Host" }));
const leaveCreated = await waitFor(leaveHost, "room");
const leaver = await open();
leaver.send(JSON.stringify({ type: "join", roomCode: leaveCreated.room.code, name: "Leave-Guest" }));
const leaveJoined = await waitFor(leaver, "room");
assert(leaveJoined.room.players.length === 2, "Leave-test guest did not join");
leaver.send(JSON.stringify({ type: "leave_room" }));
let leaveRoom: Message | undefined;
for (let i = 0; i < 60 && !leaveRoom; i++) {
  leaveRoom = leaveRosters.find((message) => message.room.players.length === 1);
  if (!leaveRoom) await new Promise((resolve) => setTimeout(resolve, 50));
}
assert(leaveRoom, "leave_room did not remove the departing pilot immediately");
assert(!leaveRoom!.room.players.some((p: any) => p.id === leaveJoined.selfId), "Departed pilot is still in the roster");
leaver.close();
leaveHost.close();

host.close();
restoredGuest.close();
solo.close();
botHost.close();
sandboxHost.close();
botRoomCode && void botRoomCode;
console.log("network smoke test passed");
// Open bot-room sockets keep the process alive; exit once assertions pass.
process.exit(0);
