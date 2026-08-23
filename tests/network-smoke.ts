import WebSocket from "ws";

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
  const ws = new WebSocket(process.env.MAYHEM_WS || "ws://127.0.0.1:8787");
  ws.once("open", () => resolve(ws));
  ws.once("error", reject);
});
const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };

const host = await open();
host.send(JSON.stringify({ type: "create", name: "Alpha" }));
const created = await waitFor(host, "room");
const roomCode = created.room.code as string;

const guest = await open();
guest.send(JSON.stringify({ type: "join", roomCode, name: "Bravo" }));
const joined = await waitFor(guest, "room");
assert(joined.room.players.length === 2, "Guest did not join the room");

host.send(JSON.stringify({ type: "config", patch: { mapId: "factory", lives: 2, crates: true } }));
await waitFor(host, "room");
host.send(JSON.stringify({ type: "start" }));
const started = await waitFor(host, "snapshot");
assert(started.snapshot.phase === "playing", "Match did not start");
assert(started.snapshot.mode === "match", "Normal start did not use match mode");
assert(started.snapshot.config.mapId === "factory", "Room config was not applied");
assert(started.snapshot.crates.length === 6, "Crates were not created");
assert(started.snapshot.hazards.some((hazard: any) => hazard.kind === "conveyor"), "Factory hazards were not synchronized");

host.send(JSON.stringify({ type: "input", input: { seq: 1, left: false, right: false, jump: false, drop: false, primary: true, secondary: true } }));
let dualAttack = false;
for (let i = 0; i < 8; i++) {
  const message = await waitFor(host, "snapshot");
  const player = message.snapshot.players.find((p: any) => p.id === created.selfId);
  if (player?.ammo === 9 && player.primaryCooldown > 0 && player.secondaryCooldown > 0) { dualAttack = true; break; }
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
guest.send(JSON.stringify({ type: "input", input: { seq: 20, left: false, right: false, jump: false, drop: true, primary: false, secondary: false } }));
for (let i = 0; i < 30; i++) {
  const message = await waitFor(host, "snapshot");
  const player = message.snapshot.players.find((p: any) => p.id === joined.selfId);
  if (player?.onGround && player.y > 500) break;
}
guest.send(JSON.stringify({ type: "input", input: { seq: 21, left: true, drop: false } }));
for (let i = 0; i < 8; i++) await waitFor(host, "snapshot");
guest.send(JSON.stringify({ type: "input", input: { seq: 22, left: false } }));
host.send(JSON.stringify({ type: "input", input: { seq: 3, primary: true, secondary: false } }));
let limbDamaged = false;
let hitEventSeen = false;
for (let i = 0; i < 12; i++) {
  const message = await waitFor(host, "snapshot");
  const guestPlayer = message.snapshot.players.find((p: any) => p.id === joined.selfId);
  limbDamaged ||= Object.values(guestPlayer?.limbs || {}).some((value: any) => value < 100);
  hitEventSeen ||= message.snapshot.events.some((event: any) => event.type === "hit" && event.targetId === joined.selfId);
  if (limbDamaged && hitEventSeen) break;
}
host.send(JSON.stringify({ type: "input", input: { seq: 4, primary: false } }));
assert(limbDamaged, "Authoritative hit did not damage a limb");
assert(hitEventSeen, "Authoritative hit did not emit a combat event");

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
assert(soloStarted.snapshot.hazards.length === 2, "Solo sandbox did not synchronize map hazards");

solo.send(JSON.stringify({ type: "input", input: { seq: 1, left: false, right: false, jump: false, drop: false, primary: true, secondary: true } }));
let soloDualAttack = false;
for (let i = 0; i < 8; i++) {
  const message = await waitFor(solo, "snapshot");
  const player = message.snapshot.players.find((p: any) => p.id === soloCreated.selfId);
  if (player?.ammo === 9 && player.primaryCooldown > 0 && player.secondaryCooldown > 0) { soloDualAttack = true; break; }
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

host.close();
restoredGuest.close();
solo.close();
botHost.close();
sandboxHost.close();
botRoomCode && void botRoomCode;
console.log("network smoke test passed");
// Open bot-room sockets keep the process alive; exit once assertions pass.
process.exit(0);
