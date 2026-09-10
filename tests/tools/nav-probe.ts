// M29 nav probe: host a fortress room with one standard bot and an idle human,
// record the bot's position trail, and report where it stalls. Server-side
// only (ws + snapshots) — no browser needed. Diagnostic tool, not a gate.
// Pass --own to spawn a dedicated debug server (PORT 8799, SPIRE_NAV_DEBUG=1)
// whose [nav] traces print inline; default connects to the hub on 8787.
import { spawn } from "node:child_process";
import WebSocket from "ws";

const OWN = process.argv.includes("--own");
const PORT = OWN ? 8799 : (process.env.SPIRE_PORT || 8787);
const MAP = (process.env.SPIRE_MAP || "fortress") as string;
const ROOM = `NAVPROBE-${Math.random().toString(36).slice(2, 7)}`;

if (OWN) {
  const server = spawn(process.execPath, ["--import", "tsx", "server/server.ts"], {
    cwd: new URL("../../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
    env: { ...process.env, PORT: "8799", SPIRE_NAV_DEBUG: "1" },
    stdio: "inherit",
  });
  process.on("exit", () => server.kill());
  await new Promise((resolve) => setTimeout(resolve, 2500));
}

const state = {
  snapshots: [] as any[],
  room: undefined as any,
  selfId: "",
};
const ws = new WebSocket(`ws://localhost:${PORT}`);
let seq = 1;
const send = (type: string, payload: Record<string, unknown> = {}) => ws.send(JSON.stringify({ type, ...payload }));
const waitFor = (type: string, timeoutMs = 8000) => new Promise<any>((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`timeout waiting ${type}`)), timeoutMs);
  const handler = (raw: WebSocket.RawData) => {
    const message = JSON.parse(raw.toString());
    if (message.type === type) {
      clearTimeout(timer);
      ws.off("message", handler);
      resolve(message);
    }
  };
  ws.on("message", handler);
});
ws.on("message", (raw) => {
  const message = JSON.parse(raw.toString());
  if (message.type === "snapshot") state.snapshots.push(message.snapshot);
  if (message.type === "room") { state.room = message.room; state.selfId = message.selfId; }
});

await new Promise<void>((resolve) => ws.on("open", resolve));
send("create", { name: "NavProbe" });
await waitFor("room");
send("config", { patch: { mapId: MAP, lives: 3, crates: false, bots: 1, botSkill: "standard" } });
await waitFor("room");
send("start");
await waitFor("snapshot");

const started = Date.now();
const trail: Array<{ t: number; x: number; y: number; g: boolean; wx: number; vx: number; lives: number }> = [];
let lastPrint = 0;
let lastLives = 3;
let lipLogs = 0;
while (Date.now() - started < 90_000) {
  const latest = state.snapshots[state.snapshots.length - 1];
  if (latest) {
    const bot = latest.players.find((p: any) => p.isBot);
    const me = latest.players.find((p: any) => !p.isBot);
    if (bot && me) {
      trail.push({ t: latest.serverTick, x: Math.round(bot.x), y: Math.round(bot.y), g: !!bot.onGround, wx: Math.round(me.x), vx: Math.round(bot.vx), lives: bot.lives });
      if (bot.lives < lastLives) {
        console.log(`  BOT DEATH #${lastLives - bot.lives} at t+${Math.round((Date.now() - started) / 1000)}s (lives ${lastLives}→${bot.lives}), last pos (${trail[trail.length - 2]?.x},${trail[trail.length - 2]?.y})`);
        lastLives = bot.lives;
      }
      // Lip-zone forensics: 1-tick log while the bot is near the west lip.
      if (bot.x < 1180 && bot.x > 1020 && lipLogs < 60) {
        lipLogs++;
        console.log(`    lip t=${latest.serverTick} x=${bot.x.toFixed(0)} y=${bot.y.toFixed(0)} vx=${bot.vx.toFixed(0)} g=${bot.onGround ? 1 : 0} lives=${bot.lives}`);
      }
      if (Date.now() - lastPrint > 10_000) {
        lastPrint = Date.now();
        const distance = Math.hypot(bot.x - me.x, bot.y - me.y);
        console.log(`  t+${Math.round((Date.now() - started) / 1000)}s bot=(${Math.round(bot.x)},${Math.round(bot.y)})${bot.onGround ? "g" : "a"} human=(${Math.round(me.x)},${Math.round(me.y)}) dist=${Math.round(distance)} limbTotal=${Object.values(bot.limbs as Record<string, number>).reduce((a, b) => a + b, 0)}/${Object.values(me.limbs as Record<string, number>).reduce((a, b) => a + b, 0)} lives=${bot.lives}`);
      }
      const damaged = Object.values(me.limbs as Record<string, number>).some((v: number) => v < 100);
      if (damaged) { console.log(`  HUMAN DAMAGED at t+${Math.round((Date.now() - started) / 1000)}s — closing.`); break; }
    }
  }
  await sleep(120);
}
send("leave_room");
ws.close();

// Stall forensics: longest run of consecutive samples with |Δx| ≤ 2.
let bestStart = 0;
let bestLen = 0;
let runStart = 0;
let runLen = 0;
for (let i = 1; i < trail.length; i++) {
  if (Math.abs(trail[i].x - trail[i - 1].x) <= 2 && trail[i].g) {
    if (runLen === 0) runStart = i - 1;
    runLen++;
    if (runLen > bestLen) { bestLen = runLen; bestStart = runStart; }
  } else {
    runLen = 0;
  }
}
if (bestLen > 5) {
  const stall = trail.slice(bestStart, bestStart + bestLen + 1);
  const xs = stall.map((s) => s.x);
  console.log(`  STALL: ${bestLen} samples (~${Math.round(bestLen * 0.12)}s) around x=${xs[0]}..${xs[xs.length - 1]} y=${stall[0].y} (tick ${stall[0].t}..${stall[stall.length - 1].t}), human at x=${stall[0].wx}`);
} else {
  console.log(`  no stall >0.7s detected (${trail.length} samples)`);
}
console.log(`  trail head: ${trail.filter((_, i) => i % 10 === 0).map((s) => `${s.x}`).join(" ")}`);
process.exit(0);

function sleep(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }
