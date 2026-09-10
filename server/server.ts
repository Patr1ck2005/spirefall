// M28.5 结构拆分：网络与进程入口——HTTP 静态托管（单端口 M23）、WebSocket 消息
// 分发、60Hz tick 驱动。模拟本体在 sim/*，房间生命周期在 room.ts，状态层在
// state.ts；本文件只做接线。
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { WORLD } from "../shared/game.js";
import {
  broadcastSnapshot,
  blankInput,
  humanCount,
  rooms,
  send,
  type Client,
  type Room,
  type WeaponStats,
} from "./state.js";
import { createRoom, joinRoom, leave, leaveRoom, reconnect, respawnSandboxPlayer, returnToLobby, setConfig, start } from "./room.js";
import { updateRoom } from "./sim/tick.js";

// Single-port hosting (M23): when a production build exists, the game server
// serves the compiled web client itself — one address carries both the page
// and its same-origin WebSocket. This is what makes LAN and tunnel play a
// single-URL experience; `vite` dev mode on 5173 stays the local workflow.
const webDist = resolve(dirname(fileURLToPath(import.meta.url)), "../dist");
const mimeByExt: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};
const indexHtml = join(webDist, "index.html");

async function serveStatic(pathname: string, response: import("node:http").ServerResponse) {
  // Normalize and pin inside dist/: no traversal out of the build directory.
  const safe = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  let filePath = join(webDist, safe);
  if (!filePath.startsWith(webDist)) {
    response.writeHead(403);
    response.end();
    return;
  }
  if (!existsSync(filePath) || extname(filePath) === "") {
    filePath = indexHtml; // SPA fallback: client-side routing never 404s
  }
  if (!existsSync(filePath)) {
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("Web build missing — run `npm run build` first");
    return;
  }
  const body = await readFile(filePath);
  response.writeHead(200, { "content-type": mimeByExt[extname(filePath)] ?? "application/octet-stream" });
  response.end(body);
}

const http = createServer((request, response) => {
  const pathname = (request.url ?? "/").split("?")[0];
  // M20 balance instrumentation: GET /stats aggregates per-weapon counters
  // across every live room (shots / hits / damage / kills).
  if (pathname === "/stats") {
    const aggregate: WeaponStats = {};
    for (const room of rooms.values()) {
      for (const [weaponId, entry] of Object.entries(room.stats)) {
        const target = (aggregate[weaponId] ??= { shots: 0, hits: 0, damage: 0, kills: 0 });
        target.shots += entry.shots;
        target.hits += entry.hits;
        target.damage += Math.round(entry.damage);
        target.kills += entry.kills;
      }
    }
    response.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*" });
    response.end(JSON.stringify(aggregate));
    return;
  }
  // The compiled client lives in dist/ and references /assets/... paths.
  if (pathname === "/" || pathname.startsWith("/assets/") || pathname === "/vite.svg" || pathname.endsWith(".html")) {
    serveStatic(pathname, response);
    return;
  }
  response.writeHead(200, { "content-type": "text/plain" });
  response.end("Spirefall server is running\n");
});
const wss = new WebSocketServer({ server: http });

wss.on("connection", (ws) => {
  const client: Client = { ws, id: randomUUID(), token: randomUUID(), input: blankInput() };
  ws.on("message", (raw) => {
    let message: any;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return send(client, "error", { message: "Invalid message" });
    }
    if (message.type === "create") createRoom(client, String(message.name || "Player"));
    else if (message.type === "join") {
      if (message.token && message.playerId && reconnect(client, String(message.roomCode), String(message.playerId), String(message.token))) return;
      joinRoom(client, String(message.roomCode), String(message.name || "Player"));
    } else if (message.type === "start" && client.room && client.id === client.room.hostId) start(client.room, "match");
    else if (message.type === "start_sandbox" && client.room && client.id === client.room.hostId) start(client.room, "sandbox");
    else if (message.type === "return_lobby" && client.room && client.room.mode === "sandbox" && client.id === client.room.hostId) returnToLobby(client.room);
    else if (message.type === "sandbox_respawn" && client.room && client.id === client.room.hostId) respawnSandboxPlayer(client.room, client.id);
    else if (message.type === "config" && client.room && client.id === client.room.hostId) setConfig(client.room, message.patch || {});
    else if (message.type === "input" && client.room) {
      // Whitelist known input fields — never trust client payloads wholesale.
      // M24b: weaponSlot is MERGED, not replaced — a plain movement message
      // arriving between a slot keypress and the next tick used to overwrite
      // the pending slot (~50% of presses raced the 33ms input cadence against
      // the 16.7ms tick). An absent field now preserves the pending slot, and
      // stepPlayer still clears it the tick it is consumed.
      const raw = message.input || {};
      const slot = raw.weaponSlot === undefined ? client.input.weaponSlot : Math.max(1, Math.min(8, Number(raw.weaponSlot) || 0)) || undefined;
      client.input = {
        seq: Number(raw.seq) || client.input.seq + 1,
        left: raw.left === true,
        right: raw.right === true,
        jump: raw.jump === true,
        drop: raw.drop === true,
        primary: raw.primary === true,
        secondary: raw.secondary === true,
        weaponSlot: slot,
      };
    }
    else if (message.type === "leave_room" && client.room) leaveRoom(client);
    else if (message.type === "restart" && client.room && client.room.phase === "results" && client.id === client.room.hostId) returnToLobby(client.room);
  });
  ws.on("close", () => leave(client));
});

setInterval(() => {
  const dt = 1 / WORLD.tickRate;
  for (const room of rooms.values()) {
    updateRoom(room, dt);
    if (room.phase !== "lobby" && room.tick % (WORLD.tickRate / WORLD.snapshotRate) === 0) broadcastSnapshot(room);
  }
}, 1000 / WORLD.tickRate);

const port = Number(process.env.PORT || 8787);
http.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    console.error(`[Spirefall] Port ${port} is already in use — probably another Spirefall launcher window is still open.`);
    console.error("[Spirefall] Close that window (or kill the old node process) and start again.");
  } else {
    console.error("[Spirefall] Server error:", error);
  }
  process.exit(1);
});
http.listen(port, "0.0.0.0", () => console.log(`Spirefall server listening on http://0.0.0.0:${port}`));

// Room 域的类型引用归拢：Room/Client 仍在 state.ts（保持单一真相），此处仅
// 标注本文件的实体来源，防止后续改动把它重新拉回服务器入口。
export type { Client, Room } from "./state.js";
