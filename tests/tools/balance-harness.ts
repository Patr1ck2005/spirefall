/**
 * M20 balance harness: runs a server-side bot match and dumps the per-weapon
 * stats the authoritative server accumulated (shots / hits / damage / kills).
 *
 * Usage: npx tsx tests/tools/balance-harness.ts [map] [lives] [bots] [skill]
 * Requires a game server on SPIREFALL_WS (default ws://127.0.0.1:8787).
 */
import WebSocket from "ws";

const [, , mapArg, livesArg, botsArg, skillArg, setArg] = process.argv;
const mapId = mapArg || "factory";
const lives = Number(livesArg || 1);
const bots = Number(botsArg || 3);
const botSkill = skillArg || "brutal";
// setArg "echo" restricts the armory to the Echo Shard (sidearm is always
// force-included server-side) so bot handling of the new weapon is observable.
const weaponSet = setArg === "echo" ? ["echo"] : undefined;
const wsBase = process.env.SPIREFALL_WS || "ws://127.0.0.1:8787";
const httpBase = wsBase.replace(/^ws/, "http");

const waitFor = (ws: WebSocket, type: string, timeout = 8000) => new Promise<any>((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`timeout waiting for ${type}`)), timeout);
  const handler = (raw: WebSocket.RawData) => {
    const message = JSON.parse(raw.toString());
    if (message.type !== type) return;
    clearTimeout(timer);
    ws.off("message", handler);
    resolve(message);
  };
  ws.on("message", handler);
});

const host = new WebSocket(wsBase);
await new Promise((resolve, reject) => { host.once("open", resolve); host.once("error", reject); });
host.send(JSON.stringify({ type: "create", name: "BalanceHost" }));
const created = await waitFor(host, "room");
const roomCode = created.room.code as string;
console.log(`room ${roomCode} on ${mapId} — ${bots} ${botSkill} bots, ${lives} lives`);

// Persistent phase tracker: snapshots flow on the same socket for the whole match.
let lastPhase = "lobby";
host.on("message", (raw: WebSocket.RawData) => {
  const message = JSON.parse(raw.toString());
  if (message.type === "snapshot") lastPhase = message.snapshot.phase;
});

host.send(JSON.stringify({ type: "config", patch: { mapId, lives, bots, botSkill, ...(weaponSet ? { weaponSet } : {}) } }));
await waitFor(host, "room");
host.send(JSON.stringify({ type: "start" }));
await waitFor(host, "snapshot");

const startedAt = Date.now();
while (lastPhase === "playing" && Date.now() - startedAt < 420000) {
  await new Promise((resolve) => setTimeout(resolve, 3000));
}
const response = await fetch(`${httpBase}/stats`);
const stats = (await response.json()) as Record<string, { shots: number; hits: number; damage: number; kills: number }>;
console.log(`\n=== weapon stats after ${(Date.now() - startedAt) / 1000}s (phase: ${lastPhase}) ===`);
console.log("| weapon | shots | hits | acc% | damage | kills | dmg/shot |");
console.log("|---|---|---|---|---|---|---|");
for (const [weaponId, entry] of Object.entries(stats).sort((a, b) => b[1].damage - a[1].damage)) {
  const accuracy = entry.shots ? Math.round(100 * entry.hits / entry.shots) : 0;
  console.log(`| ${weaponId} | ${entry.shots} | ${entry.hits} | ${accuracy}% | ${Math.round(entry.damage)} | ${entry.kills} | ${(entry.shots ? entry.damage / entry.shots : 0).toFixed(1)} |`);
}
host.send(JSON.stringify({ type: "return_lobby" }));
host.close();
process.exit(0);
