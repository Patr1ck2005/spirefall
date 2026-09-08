import Phaser from "phaser";
import { sfx } from "./audio";
import {
  LIMB_IDS,
  MAPS,
  MOVE_TUNING,
  PLAYER_TARGET_OFFSET,
  WEAPONS,
  WORLD,
  clamp,
  raycastSolids,
  surfaceBelow,
  type CombatEvent,
  type LimbId,
  type MapId,
  type MatchConfig,
  type PlayerState,
  type ServerSnapshot,
  type WeaponId,
} from "../shared/game";
import {
  ARCHETYPES,
  MAP_COPY,
  MUZZLE_OFFSET,
  PLAYER_HEX,
  colorCss,
  drawCrate,
  drawEnvironment,
  drawHazard,
  drawMover,
  drawPlayer,
  drawProjectile,
  drawProp,
  mixColor,
} from "./art";
import { LightingSystem, type OccluderRect } from "./lighting";
import { buildAllPlates, type PlateSet } from "./sceneplate";
import { installPosterPipeline } from "./posterlight";
import { portraitDataUrl } from "./portrait";
import "./style.css";
import { i18n, type I18nKey } from "./i18n";

// M24 render scale: the game canvas renders at 1.3× the world resolution and
// the camera zooms to match, so every sprite, gun and platform draws 30%
// larger with no physics, collision or balance change. The visible world
// stays exactly 1000×560. Drop this to 1.25/1.2 if low-end GPUs dip under
// the performance floor — it is the single tuning point.
const RENDER_SCALE = 1.3;

type RoomMessage = {
  code: string;
  hostId: string;
  phase: ServerSnapshot["phase"];
  mode: ServerSnapshot["mode"];
  players: Array<{ id: string; name: string; connected: boolean; color: number; archetype: 0 | 1 | 2 | 3; isBot?: boolean }>;
  config: MatchConfig;
};

type FxParticle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: number;
  gravity: number;
  kind: "spark" | "blood" | "smoke" | "energy" | "flash";
};

type Decal = { x: number; y: number; radius: number; alpha: number; rotation: number; dir?: number; scorch?: boolean };
type Gib = { x: number; y: number; vx: number; vy: number; life: number; color: number; limb: LimbId };
type Tracer = { x1: number; y1: number; x2: number; y2: number; life: number; color: number; width: number; core?: number; jitter?: number; thin?: boolean };
type Ring = { x: number; y: number; life: number; maxLife: number; radius: number; color: number; width: number; grow?: number; double?: boolean };
type Hitstop = { remaining: number; scale: number };

const app = document.querySelector<HTMLDivElement>("#app")!;
const weaponOptions = Object.values(WEAPONS).map((weapon, index) => `
  <label class="weapon-option" style="--weapon:${colorCss(weapon.color)}">
    <input type="checkbox" name="weapon" value="${weapon.id}" checked />
    <span class="weapon-index">0${index + 1}</span>
    <i></i>
    <span>${weapon.label}</span>
  </label>`).join("");

// M24: the shell is built once and retranslated in place via [data-i18n] so
// the language toggle never needs a page reload mid-session.
app.innerHTML = `
  <div class="app-backdrop" aria-hidden="true"><div></div><i></i><i></i><i></i></div>
  <section class="shell">
    <header class="command-bar">
      <div class="brand"><span class="brand-mark"><i></i><b>S</b></span><div><p data-i18n="brandTag">BRUTAL ARENA SYSTEM</p><h1>Spirefall</h1></div></div>
      <div class="command-meta"><span id="status" class="status" data-i18n="statusOffline">OFFLINE</span><button id="lang-toggle" class="icon-command" title="语言 / Language">EN</button><button id="settings-button" class="icon-command" title="Visual settings" aria-expanded="false">FX</button></div>
      <div id="visual-settings" class="visual-settings hidden">
        <p class="eyebrow" data-i18n="settingsTitle">Audio &amp; visual</p>
        <label class="toggle"><input id="sound-toggle" type="checkbox" checked /><span></span> <i data-i18n="soundToggle" style="font-style:normal">Sound</i></label>
        <label class="range"><span data-i18n="volume">Volume</span><input id="sound-volume" type="range" min="0" max="100" value="80" /></label>
        <label class="toggle"><input id="gore-toggle" type="checkbox" checked /><span></span> <i data-i18n="goreToggle" style="font-style:normal">Gore</i></label>
        <label class="toggle"><input id="shake-toggle" type="checkbox" checked /><span></span> <i data-i18n="shakeToggle" style="font-style:normal">Camera shake</i></label>
        <label class="toggle"><input id="digits-toggle" type="checkbox" checked /><span></span> <i data-i18n="digitsToggle" style="font-style:normal">Damage numbers</i></label>
        <label class="toggle"><input id="lighting-toggle" type="checkbox" checked /><span></span> <i data-i18n="lightsToggle" style="font-style:normal">Dynamic lighting</i></label>
      </div>
    </header>

    <main>
      <section id="menu" class="menu-screen">
        <div class="menu-intro"><p class="kicker" data-i18n="kicker">NETWORK COMBAT / 01-04 PILOTS</p><h2><span data-i18n="menuTitleA">ENTER THE</span><br><span data-i18n="menuTitleB">SPIRE</span></h2><p data-i18n="menuIntro">Every sector is still alive. Every machine is hostile.</p><div class="signal-line"><i></i><span data-i18n="signalReady">SERVER-LINK READY</span></div></div>
        <div class="access-console">
          <div class="console-head"><span data-i18n="consoleHead">ACCESS NODE 07</span><small data-i18n="consoleSmall">ENCRYPTED LAN</small></div>
          <label class="field" for="name"><span data-i18n="callsign">Pilot callsign</span><input id="name" maxlength="16" value="Player" autocomplete="off" /></label>
          <button id="create" class="primary wide" data-i18n="createRoom">Create room</button>
          <div class="join-divider"><span data-i18n="joinDivider">JOIN ACTIVE SPIRE</span></div>
          <div class="join-row"><input id="room-code" inputmode="numeric" maxlength="6" placeholder="000000" aria-label="Room code" /><button id="join" data-i18n="join">Join</button></div>
          <p id="error" class="error" role="alert"></p>
          <div class="control-strip"><span data-i18n="controlsMove">A/D MOVE</span><span data-i18n="controlsJump">W JUMP</span><span data-i18n="controlsPrimary">J PRIMARY</span><span data-i18n="controlsSecondary">K SECONDARY</span></div>
        </div>
      </section>

      <section id="lobby" class="lobby-screen hidden">
        <div class="lobby-header"><div><p class="eyebrow" data-i18n="activeSpire">Active spire</p><div class="room-code"><strong id="room-label">------</strong><button id="copy-code" data-i18n="copy">Copy</button></div></div><div class="lobby-state"><i></i><span data-i18n="privateSession">PRIVATE LAN SESSION</span></div></div>
        <div class="lobby-console">
          <section class="roster-column"><div class="section-title"><span>01</span><div><p data-i18n="section01">DEPLOYMENT</p><h3 data-i18n="roster">Pilot roster</h3></div></div><div id="players" class="players"></div><p id="lobby-note" class="lobby-note"></p></section>
          <section class="map-column"><div class="section-title"><span>02</span><div><p data-i18n="section02">LOCATION</p><h3 data-i18n="sectorFeed">Sector feed</h3></div></div><div id="map-visual" class="map-visual" data-map="canopy"><div class="map-noise"></div><div class="map-frame"><span id="map-index">SECTOR 01</span><strong id="map-title">THE CROWN</strong><small id="map-brief">Freight lifts drift above the storm line.</small></div></div></section>
          <section class="settings-column"><div class="section-title"><span>03</span><div><p data-i18n="section03">PARAMETERS</p><h3 data-i18n="matchControl">Match control</h3></div></div><div class="settings"><label><span data-i18n="settingSector">Sector</span><select id="map"><option value="canopy">Canopy</option><option value="fortress">Fortress</option><option value="factory">Factory</option></select></label><label><span data-i18n="settingLives">Lives</span><select id="lives"><option>1</option><option>2</option><option selected>3</option><option>4</option><option>5</option></select></label><label class="toggle"><input id="crates" type="checkbox" checked /><span></span> <i data-i18n="settingCrates" style="font-style:normal">Supply drops</i></label><label><span data-i18n="settingBots">AI pilots</span><select id="bots"><option value="0">Off</option><option value="1">1</option><option value="2">2</option><option value="3">3</option></select></label><label><span data-i18n="settingSkill">Skill</span><select id="bot-skill"><option value="casual">Casual</option><option value="standard" selected>Standard</option><option value="brutal">Brutal</option></select></label></div></section>
        </div>
        <section class="loadout-strip"><div class="section-title compact"><span>04</span><div><p data-i18n="section04">ARMORY</p><h3 data-i18n="loadout">Authorized loadout</h3></div></div><div id="weapon-options" class="weapon-options">${weaponOptions}</div></section>
        <div class="lobby-actions"><div><button id="start" class="primary" data-i18n="startMatch">Start match</button><button id="solo-test" data-i18n="soloTest">Solo test</button></div><button id="leave" class="quiet" data-i18n="leaveSpire">Leave spire</button></div>
      </section>

      <div id="game-wrap" class="game-wrap hidden">
        <div id="game"></div>
        <div class="game-hud">
          <div class="hud-top"><div><span id="hud-room"></span><small id="hud-sector"></small></div><div id="hud-phase" class="hud-phase"></div><div id="hud-roster" class="hud-roster"></div></div>
          <div id="kill-feed" class="kill-feed" aria-live="polite"></div>
          <div class="hud-bottom"><div id="hud-weapon" class="hud-weapon"></div><div id="hud-limbs" class="hud-limbs"></div></div>
          <div id="weapon-panel" class="weapon-panel hidden"></div>
          <button id="in-match-leave" class="quiet hud-leave" data-i18n="exitMatch">Exit match</button>
        </div>
        <div id="vignette" class="vignette" aria-hidden="true"></div>
        <div id="sandbox-actions" class="game-actions hidden"><button id="sandbox-respawn" data-i18n="sandboxRespawn">Test respawn</button><button id="sandbox-return" data-i18n="sandboxReturn">Return to lobby</button></div>
        <div id="result" class="result hidden"><div class="result-signal"></div><p class="eyebrow" data-i18n="resultEyebrow">Spire resolved</p><h2 id="winner"></h2><p id="result-subtitle">ONE PILOT REMAINS</p><div><button id="restart" class="primary" data-i18n="returnLobby">Return to lobby</button><button id="result-leave" data-i18n="leaveSpire">Leave spire</button></div></div>
      </div>
    </main>
  </section>`;

/** Re-apply the current language to every statically tagged element. */
const patternZh: Record<string, string> = {
  single: "单发", burst: "连发", pellet: "散射", piercing: "穿透", cluster: "集束",
  slash: "挥砍", dashSlash: "突刺", beam: "光束", bounce: "弹射",
};

function applyI18n() {
  document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((element) => {
    element.textContent = i18n.t(element.dataset.i18n as I18nKey);
  });
  $("lang-toggle").textContent = i18n.lang() === "zh" ? "EN" : "中";
  // The callsign field swaps only while it still holds a known default.
  const nameInput = $<HTMLInputElement>("name");
  if (nameInput.value === "Player" || nameInput.value === "机师") nameInput.value = i18n.lang() === "zh" ? "机师" : "Player";
}

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const status = $("status");
const menu = $("menu");
const lobby = $("lobby");
const gameWrap = $("game-wrap");
const errorText = $("error");

$("lang-toggle").addEventListener("click", () => {
  i18n.setLang(i18n.lang() === "zh" ? "en" : "zh");
  applyI18n();
  // Retranslate everything that is rebuilt from code on demand.
  if (currentRoom) {
    renderPlayers(currentRoom);
    updateMapVisual(currentRoom.config.mapId);
  }
  scene?.refreshLocalizedViews();
});
applyI18n();
let socket: WebSocket | undefined;
let selfId = "";
let token = "";
let roomCode = "";
let currentRoom: RoomMessage | undefined;
let scene: ArenaScene | undefined;
let gameInstance: Phaser.Game | undefined;
let manualConnectionAction = false;
let resumeAttempted = false;
let lastRosterKey = "";
// M26: every slot gets a procedural poster portrait (data URL, no assets).
const availablePortraits = new Set<number>([0, 1, 2, 3]);

const savedVisuals = JSON.parse(localStorage.getItem("spirefall-visuals") || "null");
const visualPrefs = { gore: savedVisuals?.gore !== false, shake: savedVisuals?.shake !== false, digits: savedVisuals?.digits !== false, lighting: savedVisuals?.lighting !== false };
$<HTMLInputElement>("gore-toggle").checked = visualPrefs.gore;
$<HTMLInputElement>("shake-toggle").checked = visualPrefs.shake;
$<HTMLInputElement>("digits-toggle").checked = visualPrefs.digits;
$<HTMLInputElement>("lighting-toggle").checked = visualPrefs.lighting;
const audioPrefs = sfx.getPrefs();
$<HTMLInputElement>("sound-toggle").checked = !audioPrefs.muted;
$<HTMLInputElement>("sound-volume").value = String(Math.round(audioPrefs.volume * 100));

// WebSocket endpoint resolution (M23 single-port hosting):
// - vite dev (port 5173): the server runs separately on :8787.
// - Same-port hosting (server serves dist/ on :8787) or a tunnel: the page
//   and the WebSocket share the origin, so connect to the page's own host.
const isViteDev = location.port === "5173";
const endpoint = `${location.protocol === "https:" ? "wss" : "ws"}://${location.hostname || "localhost"}${isViteDev ? ":8787" : location.port ? `:${location.port}` : ""}`;

function setStatus(text: string, tone = "") {
  status.textContent = text;
  status.className = `status ${tone}`;
}

function showError(text: string) {
  errorText.textContent = text;
}

function connect() {
  if (socket && socket.readyState <= WebSocket.OPEN) return socket;
  socket = new WebSocket(endpoint);
  socket.onopen = () => {
    setStatus(i18n.t("statusLinked"), "good");
    if (!resumeAttempted && !manualConnectionAction) {
      resumeAttempted = true;
      const saved = JSON.parse(localStorage.getItem("spirefall-session") || "null");
      if (saved?.roomCode && saved?.token && saved?.selfId) {
        socket!.send(JSON.stringify({ type: "join", roomCode: saved.roomCode, name: $<HTMLInputElement>("name").value, token: saved.token, playerId: saved.selfId }));
      }
    }
  };
  socket.onclose = () => setStatus(i18n.t("statusLost"), "bad");
  socket.onerror = () => showError(i18n.t("errServerNoAnswer"));
  socket.onmessage = (event) => handleMessage(JSON.parse(event.data));
  return socket;
}

function send(type: string, payload: Record<string, unknown> = {}) {
  const ws = connect();
  const run = () => ws.send(JSON.stringify({ type, ...payload }));
  if (ws.readyState === WebSocket.OPEN) run();
  else ws.addEventListener("open", run, { once: true });
}

const humanCountOf = (players: Array<{ isBot?: boolean }>) => players.filter((player) => !player.isBot).length;

function enterLobby(room: RoomMessage) {
  // Fresh room: drop processed-event ids from any previous room (event ids
  // restart at 1 per room and would be wrongly treated as duplicates).
  if (room.code !== currentRoom?.code) scene?.clearProcessedEvents();
  currentRoom = room;
  menu.classList.add("hidden");
  if (room.phase === "lobby") {
    lobby.classList.remove("hidden");
    gameWrap.classList.add("hidden");
    $("result").classList.add("hidden");
    $("sandbox-actions").classList.add("hidden");
    const rosterKey = room.players.map((player) => player.id).join(",");
    if (lastRosterKey && rosterKey !== lastRosterKey) {
      const before = new Set(lastRosterKey.split(","));
      const after = new Set(room.players.map((player) => player.id));
      const joined = [...after].some((id) => !before.has(id));
      sfx.ui(joined ? "ui:join" : "ui:leave");
    }
    lastRosterKey = rosterKey;
  }
  $("room-label").textContent = room.code;
  $<HTMLSelectElement>("map").value = room.config.mapId;
  $<HTMLSelectElement>("lives").value = String(room.config.lives);
  $<HTMLInputElement>("crates").checked = room.config.crates;
  $<HTMLSelectElement>("bots").value = String(room.config.bots);
  $<HTMLSelectElement>("bot-skill").value = room.config.botSkill;
  updateMapVisual(room.config.mapId);
  const isHost = selfId === room.hostId;
  for (const id of ["map", "lives", "crates", "bots", "bot-skill"]) $<HTMLInputElement | HTMLSelectElement>(id).disabled = !isHost;
  for (const input of document.querySelectorAll<HTMLInputElement>('input[name="weapon"]')) {
    input.checked = room.config.weaponSet.includes(input.value as WeaponId);
    input.disabled = !isHost;
  }
  renderPlayers(room);
  const humans = humanCountOf(room.players);
  $<HTMLButtonElement>("start").disabled = !isHost || room.players.length < 2;
  $<HTMLButtonElement>("solo-test").disabled = !isHost || humans !== 1;
}

function renderPlayers(room: RoomMessage) {
  const slots = Array.from({ length: 4 }, (_, index) => {
    const player = room.players[index];
    const archetype = ARCHETYPES[player?.archetype ?? index];
    const portraitStyle = availablePortraits.has(player?.archetype ?? index) ? ` style="background-image:url('${portraitDataUrl(player?.archetype ?? index)}')"` : "";
    if (!player) return `<div class="player-slot empty"><span class="slot-number">0${index + 1}</span><div class="pilot-silhouette generated" data-archetype="${index}"${portraitStyle}><i></i></div><div><strong>${i18n.t("openSlot")}</strong><small>${archetype.name}</small></div><em>${i18n.t("waiting")}</em></div>`;
    const accent = colorCss(player.color);
    const statusKey = player.id === room.hostId ? "statusHost" : player.isBot ? "statusBot" : player.connected ? "statusReady" : "statusReconnect";
    return `<div class="player-slot${player.isBot ? " bot-slot" : ""}" style="--pilot:${accent}"><span class="slot-number">0${index + 1}</span><div class="pilot-silhouette${portraitStyle ? " generated" : ""}" data-archetype="${player.archetype}"${portraitStyle}><i></i></div><div><strong>${escapeHtml(player.name)}</strong><small>${archetype.name} / ${archetype.role}</small></div><em>${i18n.t(statusKey)}</em></div>`;
  });
  $("players").innerHTML = slots.join("");
  $("lobby-note").textContent = room.players.length >= 2
    ? i18n.t("lobbyLinked", { n: room.players.length })
    : i18n.t("lobbyTransmit");
}

function updateMapVisual(mapId: MapId) {
  // M24: map copy is localized inline — the English sector titles stay as
  // flavor prefixes so both languages keep the console identity.
  const zhCopy: Record<MapId, { index: string; title: string; brief: string }> = {
    canopy: { index: "扇区 01", title: "王冠", brief: "货运电梯漂浮在风暴线上方。" },
    fortress: { index: "扇区 02", title: "堡垒", brief: "装甲闸门守卫着防御脊线。" },
    factory: { index: "扇区 03", title: "锻造厂", brief: "装配线将零件送入底部的熔炉。" },
  };
  const copy = i18n.lang() === "zh" ? zhCopy[mapId] : MAP_COPY[mapId];
  $("map-visual").dataset.map = mapId;
  $("map-index").textContent = copy.index;
  $("map-title").textContent = copy.title;
  $("map-brief").textContent = copy.brief;
}

function handleMessage(message: any) {
  if (message.type === "error") return showError(i18n.serverError(message.message));
  if (message.type === "room") {
    if (message.token) {
      token = message.token;
      selfId = message.selfId || selfId;
      roomCode = message.room.code;
      localStorage.setItem("spirefall-session", JSON.stringify({ token, selfId, roomCode }));
    }
    if (message.room) {
      enterLobby(message.room);
      if (message.room.phase !== "lobby") showGame();
    }
  }
  if (message.type === "snapshot") {
    // Test hook: playwright suites preset window.__spireEvents = [] to observe
    // the combat event stream; the client ignores it otherwise.
    const hook = (window as unknown as { __spireEvents?: CombatEvent[] }).__spireEvents;
    if (Array.isArray(hook)) {
      hook.push(...message.snapshot.events);
      if (hook.length > 600) hook.splice(0, hook.length - 600);
    }
    // Test hook: headless browsers drop synthesized weapon-slot keypresses
    // non-deterministically, so suites can drive switches directly through
    // window.__spireSlot (consumed and cleared here, one slot per snapshot).
    const slotHook = window as unknown as { __spireSlot?: number };
    if (typeof slotHook.__spireSlot === "number" && scene) {
      scene.sendInput(slotHook.__spireSlot);
      slotHook.__spireSlot = undefined;
    }
    showGame();
    scene?.applySnapshot(message.snapshot);
  }
}

function showGame() {
  lobby.classList.add("hidden");
  gameWrap.classList.remove("hidden");
  if (!scene && !gameInstance) {
    gameInstance = new Phaser.Game({
      type: Phaser.AUTO,
      parent: "game",
      // M24: render at RENDER_SCALE × world size; the camera zoom (set in
      // create()) maps the visible area back to the full 1000×560 world.
      width: Math.round(WORLD.width * RENDER_SCALE),
      height: Math.round(WORLD.height * RENDER_SCALE),
      backgroundColor: "#080b0d",
      // M26: the poster light pipeline compiles its uniform array from
      // maxLights — must match POINT_POOL in lighting.ts.
      render: { antialias: true, pixelArt: false, maxLights: 16 },
      scene: [ArenaScene],
      scale: { mode: Phaser.Scale.NONE },
    });
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]!));
}

$("create").addEventListener("click", () => {
  manualConnectionAction = true;
  showError("");
  sfx.ui("ui:click");
  send("create", { name: $<HTMLInputElement>("name").value });
});
$("join").addEventListener("click", () => {
  manualConnectionAction = true;
  showError("");
  sfx.ui("ui:click");
  const saved = JSON.parse(localStorage.getItem("spirefall-session") || "null");
  const requestedCode = $<HTMLInputElement>("room-code").value.trim();
  send("join", { roomCode: requestedCode, name: $<HTMLInputElement>("name").value, token: saved?.roomCode === requestedCode ? saved.token : undefined, playerId: saved?.roomCode === requestedCode ? saved.selfId : undefined });
});
const clickAnd = (handler: () => void) => () => { sfx.ui("ui:click"); handler(); };
$("start").addEventListener("click", clickAnd(() => send("start")));
$("solo-test").addEventListener("click", clickAnd(() => send("start_sandbox")));
$("restart").addEventListener("click", clickAnd(() => send("restart")));
$("sandbox-respawn").addEventListener("click", clickAnd(() => send("sandbox_respawn")));
$("sandbox-return").addEventListener("click", clickAnd(() => send("return_lobby")));
$("result-leave").addEventListener("click", leaveRoom);
$("leave").addEventListener("click", leaveRoom);
$("in-match-leave").addEventListener("click", leaveRoom);

// Exit the room for real: tell the server (immediate slot removal, no 30s
// reconnect hold), clear the saved session so the auto-resume does not pull
// us straight back in, and return to the main menu without a page reload.
function leaveRoom() {
  manualConnectionAction = true;
  send("leave_room");
  localStorage.removeItem("spirefall-session");
  token = "";
  selfId = "";
  roomCode = "";
  currentRoom = undefined;
  scene = undefined;
  lastRosterKey = "";
  sfx.ambient(false);
  gameInstance?.destroy(true);
  gameInstance = undefined;
  showError("");
  lobby.classList.add("hidden");
  gameWrap.classList.add("hidden");
  $("result").classList.add("hidden");
  $("sandbox-actions").classList.add("hidden");
  menu.classList.remove("hidden");
  setStatus(i18n.t("statusLinked"), "good");
}
$("copy-code").addEventListener("click", async () => {
  await navigator.clipboard?.writeText(roomCode);
  $("copy-code").textContent = i18n.t("copied");
  setTimeout(() => $("copy-code").textContent = i18n.t("copy"), 1200);
});
$("settings-button").addEventListener("click", () => {
  const panel = $("visual-settings");
  const open = panel.classList.toggle("hidden") === false;
  $("settings-button").setAttribute("aria-expanded", String(open));
});
for (const id of ["gore-toggle", "shake-toggle", "digits-toggle", "lighting-toggle"]) {
  $(id).addEventListener("change", () => {
    visualPrefs.gore = $<HTMLInputElement>("gore-toggle").checked;
    visualPrefs.shake = $<HTMLInputElement>("shake-toggle").checked;
    visualPrefs.digits = $<HTMLInputElement>("digits-toggle").checked;
    visualPrefs.lighting = $<HTMLInputElement>("lighting-toggle").checked;
    localStorage.setItem("spirefall-visuals", JSON.stringify(visualPrefs));
    scene?.setVisualPreferences();
  });
}
$("sound-toggle").addEventListener("change", () => {
  sfx.setEnabled($<HTMLInputElement>("sound-toggle").checked);
  sfx.ui("ui:click");
});
$("sound-volume").addEventListener("input", () => {
  sfx.setVolume(Number($<HTMLInputElement>("sound-volume").value) / 100);
});
for (const id of ["map", "lives", "crates", "bots", "bot-skill"]) {
  $(id).addEventListener("change", () => {
    const mapId = $<HTMLSelectElement>("map").value as MapId;
    updateMapVisual(mapId);
    send("config", { patch: { mapId, lives: Number($<HTMLSelectElement>("lives").value), crates: $<HTMLInputElement>("crates").checked, bots: Number($<HTMLSelectElement>("bots").value), botSkill: $<HTMLSelectElement>("bot-skill").value } });
  });
}
for (const input of document.querySelectorAll<HTMLInputElement>('input[name="weapon"]')) {
  input.addEventListener("change", () => {
    let weaponSet = [...document.querySelectorAll<HTMLInputElement>('input[name="weapon"]:checked')].map((item) => item.value as WeaponId);
    if (!weaponSet.length) {
      input.checked = true;
      weaponSet = [input.value as WeaponId];
    }
    send("config", { patch: { weaponSet } });
  });
}
connect();
// Tab weapon panel: hold to inspect the loadout, release to dismiss.
const weaponPanel = $("weapon-panel");
const syncWeaponPanel = (held: boolean) => {
  const show = held && !gameWrap.classList.contains("hidden") && Boolean(scene?.hasSnapshot());
  weaponPanel.classList.toggle("hidden", !show);
};
window.addEventListener("keydown", (event) => {
  if (event.key !== "Tab") return;
  event.preventDefault();
  syncWeaponPanel(true);
});
window.addEventListener("keyup", (event) => {
  if (event.key !== "Tab") return;
  event.preventDefault();
  syncWeaponPanel(false);
});
window.addEventListener("blur", () => syncWeaponPanel(false));
for (const [index, archetype] of ARCHETYPES.entries()) {
  // Prime the procedural portrait cache so lobby slots render complete.
  archetype.name;
  portraitDataUrl(index);
}

// First user gesture unlocks the AudioContext; later event-driven sounds can play freely.
const unlockAudio = () => sfx.unlock();
window.addEventListener("pointerdown", unlockAudio);
window.addEventListener("keydown", unlockAudio);

// Physical-key → weapon slot map for Digit row and numpad (IME-proof).
const WeaponSlotCodes: Record<string, number> = {
  Digit1: 1, Digit2: 2, Digit3: 3, Digit4: 4, Digit5: 5, Digit6: 6, Digit7: 7,
  Numpad1: 1, Numpad2: 2, Numpad3: 3, Numpad4: 4, Numpad5: 5, Numpad6: 6, Numpad7: 7,
};

class ArenaScene extends Phaser.Scene {
  private snapshot?: ServerSnapshot;
  private graphics!: Phaser.GameObjects.Graphics;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private lastSent = 0;
  private seq = 0;
  private labels = new Map<string, Phaser.GameObjects.Text>();
  private renderPositions = new Map<string, { x: number; y: number }>();
  // M24: authoritative render samples — snapshot position + velocity + receive
  // time. Rendering extrapolates from these so the scene tracks the server's
  // view of the world instead of lagging a snapshot or two behind it.
  private samples = new Map<string, { x: number; y: number; vx: number; vy: number; at: number }>();
  private particles: FxParticle[] = [];
  private decals: Decal[] = [];
  /** M19: how many entries of `decals` are already painted into decalLayer. */
  private decalPainted = 0;
  private goreFadeTimer = 0;
  private lastSeenTick = 0;
  private gibs: Gib[] = [];
  private tracers: Tracer[] = [];
  private rings: Ring[] = [];
  private hitstop: Hitstop | undefined;
  private lastHitstopAt = 0;
  // M24b: pending weapon-slot request retried until the snapshot confirms it.
  private pendingSlot?: { slot: number; queuedAt: number };
  private processedEvents = new Set<number>();
  // M20 combat feedback: inbound-hit direction arcs around the own pilot,
  // the low-health vignette level, and kill-feed DOM timers.
  private hitMarkers: Array<{ angle: number; life: number }> = [];
  private vignetteLevel = 0;
  private killFeedTimers = new Set<ReturnType<typeof setTimeout>>();
  // M24 animation state: transient per-player fx driven by combat events and
  // snapshot transitions. All client-side; the server protocol is untouched.
  private swings = new Map<string, { t: number; dur: number; secondary: boolean }>();
  private heat = new Map<string, number>();
  private landFx = new Map<string, number>();
  private dashGhosts: Array<{ x: number; y: number; life: number; color: number; soft?: boolean }> = [];
  private lastSpeedGhostAt = 0;
  private prevState = new Map<string, { onGround: boolean; vy: number; jumpsUsed: number }>();
  private digits: Array<{ text: Phaser.GameObjects.Text; life: number }> = [];

  /** Drop processed-event ids when switching rooms (ids restart per room). */
  clearProcessedEvents() {
    this.processedEvents.clear();
    this.lastChargeStep = -1;
    this.lastSeenTick = 0;
    this.resetGore();
    this.clearFeedback();
    this.swings.clear();
    this.heat.clear();
    this.landFx.clear();
    this.dashGhosts = [];
    this.prevState.clear();
    for (const digit of this.digits) {
      digit.life = 0;
      digit.text.setVisible(false);
    }
  }
  private lastChargeStep = -1;
  private plates?: Record<MapId, PlateSet>;
  private lighting?: LightingSystem;
  private lightingMap: MapId | "" = "";
  private decalLayer?: Phaser.GameObjects.RenderTexture;
  private atmosphere: Array<{ x: number; y: number; vx: number; vy: number; kind: "rain" | "dust" | "ember" }> = [];
  private atmosphereMap: MapId | "" = "";

  constructor() {
    super("Arena");
  }

  create() {
    scene = this;
    // M24 render scale: zoom the camera so the visible world is still the
    // full 1000×560 arena while the canvas itself draws 1.3× larger.
    this.cameras.main.setZoom(RENDER_SCALE).centerOn(WORLD.width / 2, WORLD.height / 2);
    this.graphics = this.add.graphics();
    // M26 poster scene plates: procedural albedo + Sobel normal maps for the
    // Light2D pipeline. Built once, synchronously (~a few hundred ms), before
    // the first snapshot arrives.
    this.plates = buildAllPlates(this);
    // M25/M26 cinematic lighting (respects the FX toggle; skipped on Canvas).
    this.ensureLighting();
    this.input.keyboard!.addCapture("TAB");
    this.keys = this.input.keyboard!.addKeys("A,D,W,S,J,K") as unknown as Record<string, Phaser.Input.Keyboard.Key>;
    // M24b: weapon-slot presses go through a pending retry queue. A single
    // fire-and-forget input message used to lose the slot ~half the time
    // (any interleaved movement message overwrote it server-side); the
    // queue keeps carrying the request until a snapshot confirms the switch.
    // Key matching uses event.code (physical Digit keys) so IME/shifted
    // layouts (fullwidth "１"、punctuation) cannot silently swallow presses.
    this.input.keyboard!.on("keydown", (event: KeyboardEvent) => {
      const slot = WeaponSlotCodes[event.code] ?? (event.key >= "1" && event.key <= "7" ? Number(event.key) : 0);
      if (slot) this.queueWeaponSlot(slot);
    });
    this.input.on("wheel", (_pointer: Phaser.Input.Pointer, _objects: unknown[], _dx: number, dy: number) => {
      const mine = this.snapshot?.players.find((player) => player.id === selfId);
      if (!mine || !this.snapshot) return;
      const list = this.snapshot.config.weaponSet;
      const index = list.indexOf(mine.weapon);
      const next = (index + (dy > 0 ? 1 : -1) + list.length) % list.length;
      this.queueWeaponSlot(next + 1);
    });
  }

  /** Create (or recreate) the poster lighting stack. Idempotent. */
  private ensureLighting() {
    if (this.lighting) return;
    if (!visualPrefs.lighting || this.game.renderer.type !== Phaser.WEBGL) return;
    // Bench/diagnostic flag: ?spirefall-lighting=fallback installs the system
    // WITHOUT the engine pipeline — exactly what the governor's
    // PointLights-off tier renders (the verified M25b additive look).
    const forceFallback = new URLSearchParams(location.search).get("spirefall-lighting") === "fallback";
    const pipeline = forceFallback ? undefined : installPosterPipeline(this.game);
    // The plates carry normal maps; route them through the poster light pass.
    if (this.plates && pipeline) {
      for (const set of Object.values(this.plates)) {
        set.background.setPipeline(pipeline);
        set.world.setPipeline(pipeline);
      }
    }
    this.lighting = new LightingSystem(this, pipeline);
    this.lighting.setEnabled(true);
    this.lighting.onStrike = () => sfx.play("thunder", { strength: 0.8 });
    if (this.lightingMap) this.lighting.setMap(this.lightingMap);
    // Test hook: browser-smoke asserts the engine light pass is installed
    // (WebGL only — the Canvas renderer never gets it).
    (window as unknown as { __spireLight?: { poster: boolean; fallback: boolean } }).__spireLight = { poster: !!pipeline, fallback: forceFallback };
  }

  /** Queue a weapon-slot request until a snapshot confirms the switch. */
  private queueWeaponSlot(slot: number) {
    this.pendingSlot = { slot, queuedAt: performance.now() };
    this.sendInput(slot);
  }

  update(time: number, delta: number) {
    if (!this.graphics) return;
    const predicted = this.renderPositions.get(selfId);
    if (predicted && this.keys) {
      // M24b: local input steering on the rendered self — predict at the same
      // equilibrium speed the server physics reaches (accel·f/(1−f), clamped),
      // so the visible pilot and the authority converge instead of tug-of-war.
      const inputVx = ((this.keys.D.isDown ? 1 : 0) - (this.keys.A.isDown ? 1 : 0)) * Math.min(MOVE_TUNING.maxSpeed, MOVE_TUNING.accelerate * MOVE_TUNING.groundFriction / (1 - MOVE_TUNING.groundFriction));
      predicted.x += inputVx * delta / 1000;
    }
    // M26 poster plates are fully static — no parallax nudge (poster style).
    // M24b: speed afterimages — the self pilot leaves faint echoes at full
    // sprint so velocity reads at a glance (budget-capped, subtle alpha).
    const mineNow = this.snapshot?.players.find((player) => player.id === selfId);
    if (predicted && mineNow && Math.abs(mineNow.vx) > 250 && time - this.lastSpeedGhostAt > 90 && this.dashGhosts.length < 12) {
      this.lastSpeedGhostAt = time;
      this.dashGhosts.push({ x: predicted.x, y: predicted.y, life: 0.16, color: mineNow.color, soft: true });
    }
    // Hitstop: brief effect freeze on heavy impacts sells the punch.
    if (this.hitstop) {
      this.hitstop.remaining -= delta;
      if (this.hitstop.remaining <= 0) this.hitstop = undefined;
    }
    this.updateEffects(this.hitstop ? delta / 1000 * this.hitstop.scale : delta / 1000);
    this.lighting?.update(time, delta);
    this.draw(time);
    if (time - this.lastSent > 33) {
      this.sendInput();
      this.lastSent = time;
    }
  }

  private punchHitstop(strength: number) {
    // Storm guard: when the particle pool is saturated, skip the freeze so
    // effects keep draining (hitstop is the first juice we sacrifice).
    if (this.particles.length > 120) return;
    const now = performance.now();
    if (now - this.lastHitstopAt < 350) return;
    this.lastHitstopAt = now;
    this.hitstop = { remaining: 40 + Math.min(60, strength * 45), scale: 0.12 };
  }

  sendInput(slot?: number) {
    if (!selfId) return;
    const keys = this.keys;
    // M24b: a pending slot request rides every input message until confirmed
    // (or 800ms gives up — dead request, e.g. slot outside the match set).
    const carried = this.pendingSlot && performance.now() - this.pendingSlot.queuedAt < 800 ? this.pendingSlot.slot : slot;
    send("input", { input: { seq: ++this.seq, left: keys.A.isDown, right: keys.D.isDown, jump: keys.W.isDown, drop: keys.S.isDown, primary: keys.J.isDown, secondary: keys.K.isDown, weaponSlot: carried } });
  }

  applySnapshot(snapshot: ServerSnapshot) {
    const previousPhase = this.snapshot?.phase;
    const previousMode = this.snapshot?.mode;
    this.snapshot = snapshot;
    if (this.lightingMap !== snapshot.config.mapId) {
      this.lightingMap = snapshot.config.mapId;
      this.lighting?.setMap(snapshot.config.mapId);
    }
    // M24b: settle the pending weapon-slot queue — clear when the switch is
    // confirmed by the authoritative state, or drop stale requests.
    if (this.pendingSlot) {
      const mine = snapshot.players.find((player) => player.id === selfId);
      const wanted = snapshot.config.weaponSet[this.pendingSlot.slot - 1];
      if (mine && wanted && mine.weapon === wanted) this.pendingSlot = undefined;
      else if (performance.now() - this.pendingSlot.queuedAt > 800) this.pendingSlot = undefined;
    }
    // M24: stamp every player's authoritative render sample on each snapshot
    // (position + velocity + receive time). drawPlayerState extrapolates from
    // this so the scene leads with the server's positions, not stale ones.
    const now = performance.now();
    for (const player of snapshot.players) {
      this.samples.set(player.id, { x: player.x, y: player.y, vx: player.vx, vy: player.vy, at: now });
    }
    // M19: a fresh match (phase entry or tick rewind on restart) wipes gore
    // state — blood and bullet holes never carry across matches.
    if (snapshot.phase === "playing" && (previousPhase !== "playing" || snapshot.serverTick < this.lastSeenTick)) this.resetGore();
    this.lastSeenTick = snapshot.serverTick;
    this.processEvents(snapshot.events);
    this.updatePhaseAudio(snapshot, previousPhase, previousMode);
    this.updateHud(snapshot);
    this.refreshWeaponPanel();
    const finished = snapshot.phase === "results";
    $("result").classList.toggle("hidden", !finished);
    $("sandbox-actions").classList.toggle("hidden", snapshot.mode !== "sandbox" || snapshot.phase !== "playing");
    // Winner is a player id — display names are not unique.
    const winnerEntry = snapshot.players.find((player) => player.id === snapshot.winner);
    const subtitle = $("result-subtitle");
    if (winnerEntry?.isBot) {
      subtitle.textContent = i18n.t("defeatedBy", { name: snapshot.winner ? winnerEntry?.name.toUpperCase() ?? "" : "" });
      subtitle.classList.add("defeated");
      $("result").classList.add("bot-victory");
    } else {
      subtitle.textContent = i18n.t("onePilotRemains");
      subtitle.classList.remove("defeated");
      $("result").classList.remove("bot-victory");
    }
    $("winner").textContent = (snapshot.winner && winnerEntry?.name) || i18n.t("noSurvivor");
    $<HTMLButtonElement>("restart").classList.toggle("hidden", selfId !== currentRoom?.hostId);
  }

  /** M24: re-render locale-dependent scene-adjacent DOM (HUD strings, panel). */
  refreshLocalizedViews() {
    if (this.snapshot) {
      this.lastPhaseKey = "";
      this.updateHud(this.snapshot);
      this.refreshWeaponPanel();
    }
  }

  private updatePhaseAudio(snapshot: ServerSnapshot, previousPhase?: string, previousMode?: string) {
    if (snapshot.phase === previousPhase && snapshot.mode === previousMode) return;
    if (snapshot.phase === "playing" && previousPhase !== "playing") {
      sfx.ambient(true);
      if (previousPhase === "lobby" || previousMode === undefined) sfx.ui("ui:start");
    }
    if (snapshot.phase === "results") {
      sfx.ambient(false);
      if (snapshot.mode !== "sandbox" && snapshot.winner) {
        const winnerEntry = snapshot.players.find((player) => player.id === snapshot.winner);
        sfx.ui(winnerEntry?.id === selfId ? "victory" : "defeat");
      }
    }
    if (snapshot.phase === "lobby") sfx.ambient(false);
  }

  private refreshWeaponPanel() {
    const snapshot = this.snapshot;
    const mine = snapshot?.players.find((player) => player.id === selfId);
    const panel = $("weapon-panel");
    if (!snapshot || !mine) return;
    panel.innerHTML = `<p class="panel-hint">${i18n.t("panelHint")}</p>` + snapshot.config.weaponSet.map((weaponId, index) => {
      const weapon = WEAPONS[weaponId];
      const active = weaponId === mine.weapon ? " active" : "";
      const rangeBar = (label: string, range: number) => `<div class="range-bar"><i>${label}</i><em style="--range:${Math.min(100, Math.round(range / WORLD.width * 100))}%"></em></div>`;
      return `<div class="weapon-row${active}" style="--weapon:${colorCss(weapon.color)}"><b>${index + 1}</b><span>${weapon.label}</span><em>${mine.ammoByWeapon[weaponId]}</em><small>${i18n.lang() === "zh" ? `主 ${patternZh[weapon.primary.pattern]}${weapon.primary.count > 1 ? ` ×${weapon.primary.count}` : ""} · 副 ${patternZh[weapon.secondary.pattern]}` : `PRI ${weapon.primary.pattern}${weapon.primary.count > 1 ? ` ×${weapon.primary.count}` : ""} · SEC ${weapon.secondary.pattern}`}</small><div class="range-bars">${rangeBar(i18n.lang() === "zh" ? "主" : "PRI", weapon.primary.range)}${rangeBar(i18n.lang() === "zh" ? "副" : "SEC", weapon.secondary.range)}</div></div>`;
    }).join("");
  }

  hasSnapshot() {
    return Boolean(this.snapshot);
  }

  setVisualPreferences() {
    if (!visualPrefs.gore) this.resetGore();
    // M25: the lighting toggle also needs to work mid-match. When the system
    // never existed (Canvas renderer) there is nothing to re-enable.
    if (this.lighting) this.lighting.setEnabled(visualPrefs.lighting);
    else this.ensureLighting();
  }

  /** M19: gore lifecycle reset — fresh match, room switch, or gore toggle-off. */
  private resetGore() {
    this.decals = [];
    this.decalPainted = 0;
    this.decalLayer?.clear();
    this.gibs = [];
    this.particles = this.particles.filter((particle) => particle.kind !== "blood");
    this.goreFadeTimer = 0;
  }

  private lastRosterHtml = "";
  private lastWeaponHtml = "";
  private lastLimbsHtml = "";
  private lastPhaseKey = "";

  private updateHud(snapshot: ServerSnapshot) {
    const mine = snapshot.players.find((player) => player.id === selfId);
    const map = MAPS[snapshot.config.mapId];
    const phaseKey = snapshot.mode === "sandbox" ? "soloTestHud" : snapshot.phase === "results" ? "spireResolved" : "live";
    $("hud-room").textContent = roomCode ? `${i18n.t("spirePrefix")}${roomCode}` : "";
    $("hud-sector").textContent = map.sector;
    // Rebuild the phase chip when the phase OR language changed.
    const phaseValue = `${phaseKey}:${i18n.lang()}`;
    if (phaseValue !== this.lastPhaseKey) {
      this.lastPhaseKey = phaseValue;
      $("hud-phase").textContent = i18n.t(phaseKey);
    }
    // HUD blocks rebuild only when their content actually changed (names,
    // lives, weapon, cooldown bars). Cuts three innerHTML parses per snapshot
    // during steady-state combat — the biggest remaining main-thread cost.
    const rosterHtml = snapshot.players.map((player) => `<span style="--pilot:${colorCss(player.color)}" class="${player.lives <= 0 ? "out" : ""}"><i></i>${escapeHtml(player.name)}${player.isBot ? " <small>[BOT]</small>" : ""} <b>${player.lives}</b></span>`).join("");
    if (rosterHtml !== this.lastRosterHtml) {
      this.lastRosterHtml = rosterHtml;
      $("hud-roster").innerHTML = rosterHtml;
    }
    if (!mine) return;
    const weapon = WEAPONS[mine.weapon];
    const chargeReadout = weapon.primary.chargeMax !== undefined ? Math.max(0.02, mine.charge ?? 0) : Math.min(1, mine.primaryCooldown / Math.max(0.01, weapon.primary.cooldown));
    const weaponHtml = `<div class="weapon-readout" style="--weapon:${colorCss(weapon.color)}"><span>${weapon.label}</span><strong>${mine.ammo}</strong><small>${i18n.t("ammo")}</small><div><i style="--cool:${chargeReadout.toFixed(2)}">J</i><i style="--cool:${Math.min(1, mine.secondaryCooldown / Math.max(0.01, weapon.secondary.cooldown)).toFixed(2)}">K</i></div></div>`;
    if (weaponHtml !== this.lastWeaponHtml) {
      this.lastWeaponHtml = weaponHtml;
      $("hud-weapon").innerHTML = weaponHtml;
    }
    // Rising charge tone: fire on charge thresholds so it sweeps without spamming.
    if (weapon.primary.chargeMax !== undefined) {
      const charge = mine.charge ?? 0;
      const step = Math.floor(charge * 6);
      if (charge > 0.05 && step !== this.lastChargeStep) {
        this.lastChargeStep = step;
        sfx.charge(charge, mine.weapon);
      }
      this.lastChargeStep = charge > 0.05 ? step : -1;
    } else {
      this.lastChargeStep = -1;
    }
    const limbLabels: Array<[LimbId, string]> = [["leftArm", "LA"], ["rightArm", "RA"], ["leftLeg", "LL"], ["rightLeg", "RL"]];
    const totalIntegrity = LIMB_IDS.reduce((sum, limbId) => sum + mine.limbs[limbId], 0);
    const integrityTone = totalIntegrity > 220 ? "good" : totalIntegrity > 120 ? "warn" : "crit";
    const limbsHtml = `<span>${i18n.t("bodyIntegrity")} <b class="integrity-total ${integrityTone}">${totalIntegrity}/400</b></span><div>${limbLabels.map(([id, label]) => {
      const value = mine.limbs[id];
      const tone = value > 55 ? "good" : value > 30 ? "warn" : value > 0 ? "crit" : "lost";
      return `<i class="${tone}"><b>${label}</b><em><u style="width:${value}%"></u></em></i>`;
    }).join("")}</div>`;
    if (limbsHtml !== this.lastLimbsHtml) {
      this.lastLimbsHtml = limbsHtml;
      $("hud-limbs").innerHTML = limbsHtml;
    }
  }

  private processEvents(events: CombatEvent[]) {
    const mine = this.snapshot?.players.find((player) => player.id === selfId);
    const at = (x: number, y: number) => ({ x, y, mx: mine?.x, my: mine?.y });
    for (const event of events) {
      if (this.processedEvents.has(event.id)) continue;
      this.processedEvents.add(event.id);
      if (this.processedEvents.size > 512) this.processedEvents = new Set([...this.processedEvents].slice(-256));
      const actor = this.snapshot?.players.find((player) => player.id === event.actorId);
      const target = this.snapshot?.players.find((player) => player.id === event.targetId);
      const color = event.weaponId ? WEAPONS[event.weaponId].color : 0xf0a14a;
      if (event.type === "attack") {
        sfx.play(`attack:${event.weaponId}:${event.secondary ? "sec" : "pri"}`, at(event.x, event.y));
        const facing = actor?.facing || 1;
        const charge = event.charge ?? 0;
        // M24 weapon signatures: each gun leaves a transient mark on its
        // holder's draw state when it fires.
        if (actor) {
          if (event.weaponId === "blade") {
            this.swings.set(actor.id, { t: 0, dur: event.pattern === "dashSlash" ? 0.24 : 0.16, secondary: !!event.secondary });
            if (event.pattern === "dashSlash") {
              for (let ghost = 0; ghost < 3; ghost++) {
                this.dashGhosts.push({ x: actor.x - facing * ghost * 16, y: actor.y, life: 0.2 - ghost * 0.03, color: actor.color });
              }
              this.dashGhosts = this.dashGhosts.slice(-18);
            }
          }
          if (event.weaponId === "rifle" && !event.secondary) this.heat.set(actor.id, 1);
        }
        // Muzzle flash anchors to the real gun tip, not the chest center.
        const muzzleX = event.x + facing * Math.max(0, (MUZZLE_OFFSET[event.weaponId!] ?? 12) - 12);
        // M19: hitscan rays stop at solid cover. Client mirrors the server
        // raycast so every beam/tracer ends exactly where the damage ends.
        const weaponDef = WEAPONS[event.weaponId!];
        const trueRange = (pattern: "primary" | "secondary") => {
          const base = weaponDef[pattern].range;
          return Math.min(base, raycastSolids(MAPS[this.snapshot!.config.mapId].platforms, event.x, event.y, event.x + facing * base, event.y) ?? base);
        };
        // Beam: full-range light line refreshed every tick so held fire reads as one continuous lance.
        if (event.pattern === "beam") {
          const range = trueRange("primary");
          this.tracers.push({ x1: muzzleX, y1: event.y, x2: event.x + facing * range, y2: event.y, life: 0.15, color, width: 3.5, core: 1.6, jitter: 1.6 });
          this.spawnBurst(muzzleX + facing * 4, event.y, color, 3, "flash", facing);
          // Beam impact sparks spray ahead of the muzzle along the beam.
          if (Math.random() < 0.6) this.spawnBurst(event.x + facing * (60 + Math.random() * 240), event.y, 0xffefc3, 2, "spark", facing);
          // End-of-beam sparks: the lance chews into whatever stops it.
          this.spawnBurst(event.x + facing * range, event.y, 0xffefc3, 2, "spark", -facing as 1 | -1 | 0);
        } else if (event.weaponId === "sniper" && !event.secondary) {
          // Charged rail: length matches the true 1400×(1+0.25c) reach, capped
          // by cover; full release adds a shock ring and boom.
          const chargedRange = weaponDef.primary.range * (1 + charge * 0.25);
          const railLength = Math.min(chargedRange, raycastSolids(MAPS[this.snapshot!.config.mapId].platforms, event.x, event.y, event.x + facing * chargedRange, event.y) ?? chargedRange);
          const width = 2.5 + charge * 7;
          this.tracers.push({ x1: muzzleX, y1: event.y, x2: event.x + facing * railLength, y2: event.y, life: 0.2 + charge * 0.22, color, width, core: 1.2 + charge * 1.8, jitter: charge * 2.2 });
          this.spawnBurst(muzzleX, event.y, color, 6 + Math.round(charge * 16), "flash", facing);
          if (charge >= 0.95) {
            this.rings.push({ x: event.x, y: event.y, life: 0.5, maxLife: 0.5, radius: 12, color, width: 5, grow: 120, double: true });
            this.spawnBurst(event.x, event.y, 0xffe6f2, 26, "spark", facing);
            this.spawnBurst(event.x, event.y, 0xffe6f2, 8, "flash", 0);
            sfx.railBoom();
            this.shake(1.5, true);
          }
        } else {
          const length = event.pattern === "piercing"
            ? trueRange("secondary")
            : event.pattern === "cluster" ? 44 : event.pattern === "dashSlash" || event.pattern === "slash" ? 34 : event.secondary ? 105 : 72;
          const width = event.pattern === "piercing" ? 4 + charge * 3 : event.pattern === "slash" || event.pattern === "dashSlash" ? 7 : event.secondary ? 5 : 2.5;
          // Bullet-path tracers (single/burst hitscan) draw the real flight
          // line — honest range readout without laser-grade glow.
          const thin = event.pattern === "single" || event.pattern === "burst";
          this.tracers.push({ x1: muzzleX, y1: event.y, x2: muzzleX + facing * length, y2: event.y + (event.pattern === "slash" ? -18 : 0), life: event.pattern === "piercing" ? 0.16 : thin ? 0.07 : 0.12, color, width, thin });
          this.spawnBurst(muzzleX, event.y, color, event.pattern === "piercing" ? 8 : 3, "flash", facing);
          if (event.count) this.spawnBurst(muzzleX, event.y, color, Math.min(18, event.count * 3), event.pattern === "cluster" ? "energy" : "spark", facing);
          if (event.pattern === "slash" || event.pattern === "dashSlash") this.spawnBurst(muzzleX + facing * 24, event.y - 8, color, 14, "energy", facing);
          // M24: rocket launches vent backblast smoke behind the tube.
          if (event.weaponId === "rocket") this.spawnBurst(event.x - facing * 18, event.y + 2, 0x8b9396, 5, "smoke", -facing as 1 | -1 | 0);
          // M24: the sidearm ejects brass with gravity on every shot.
          if (event.weaponId === "sidearm" && !event.secondary) this.spawnBurst(event.x - facing * 2, event.y - 4, 0xe8c56a, 2, "spark", -facing as 1 | -1 | 0, 640);
          // Heavy single shots (scatter pellet volleys, rocket launches) get a muzzle ring.
          if (event.weaponId === "scatter" && !event.secondary) this.rings.push({ x: event.x, y: event.y, life: 0.26, maxLife: 0.26, radius: 8, color, width: 3 });
          if (event.weaponId === "rocket") this.rings.push({ x: event.x, y: event.y, life: 0.3, maxLife: 0.3, radius: 10, color, width: 3 });
        }
        // M25/M26: every muzzle is a light source — beams/rails glow down the
        // line, and heavy rounds spill real light onto the walls behind.
        const muzzleRadius = event.pattern === "beam" ? 120 : event.weaponId === "rocket" ? 110 : event.weaponId === "scatter" ? 95 : 70;
        const muzzleLife = event.pattern === "beam" ? 0.12 : 0.14;
        const muzzlePoint = event.pattern === "beam" || event.weaponId === "rocket" || event.weaponId === "sniper" ? 0.9 : 0;
        this.lighting?.flash(muzzleX, event.y, muzzleRadius, color, 0.55, muzzleLife, undefined, muzzlePoint);
      } else if (event.type === "crateSpawn") {
        sfx.play("crateSpawn", at(event.x, event.y));
        this.spawnBurst(event.x, event.y - 16, color, 18, "energy", 0);
        this.tracers.push({ x1: event.x, y1: event.y - 48, x2: event.x, y2: event.y + 4, life: 0.24, color, width: 3 });
      } else if (event.type === "propSpawn") {
        // Barrel respawn: a soft rust-orange rematerialization.
        sfx.play("crateSpawn", at(event.x, event.y));
        this.spawnBurst(event.x, event.y - 12, 0xd88a4a, 10, "energy", 0);
      } else if (event.type === "propDestroy") {
        // Barrel detonation: bigger layered fireball + a scorched mark.
        sfx.play("explosion", { ...at(event.x, event.y), strength: event.strength, priority: "high" });
        this.spawnBurst(event.x, event.y - 12, 0xfff3d0, 10, "flash", 0);
        this.spawnBurst(event.x, event.y - 12, 0xf06b2f, 40, "energy", 0);
        this.spawnBurst(event.x, event.y - 12, 0xf0a14a, 18, "spark", 0);
        this.spawnBurst(event.x, event.y - 12, 0x343b3b, 20, "smoke", 0);
        this.rings.push({ x: event.x, y: event.y - 12, life: 0.45, maxLife: 0.45, radius: 14, color: 0xf0894a, width: 5, grow: 95, double: true });
        this.lighting?.flash(event.x, event.y - 12, 170, 0xffc27a, 0.7, 0.34, 100, 1.4);
        this.stampScorch(event.x, event.y);
        this.punchHitstop(event.strength);
        this.shake(event.strength, true);
      } else if (event.type === "cratePickup") {
        if (event.crateKind === "repair") {
          sfx.play("repair", at(event.x, event.y));
          // Green restore flash + rings mark a repair cell grab.
          this.spawnBurst(event.x, event.y, 0x4fd07a, 26, "energy", 0);
          this.spawnBurst(event.x, event.y, 0xd8ffe6, 8, "flash", 0);
          this.rings.push({ x: event.x, y: event.y, life: 0.34, maxLife: 0.34, radius: 8, color: 0x4fd07a, width: 3, grow: 55, double: true });
        } else {
          sfx.play("cratePickup", at(event.x, event.y));
          this.spawnBurst(event.x, event.y, color, 20, "spark", 0);
          this.spawnBurst(event.x, event.y - 16, color, 10, "energy", 0);
        }
      } else if (event.type === "impact") {
        // Projectile death on a surface: chips, flash, hole — scaled by speed.
        const isFlame = event.weaponId === "scatter" && event.secondary;
        const isRocket = event.weaponId === "rocket";
        const s = event.strength;
        if (event.surface === false) {
          // M19: mid-air death — range cap or off-map fizzle. No surface to
          // mark: a soft energy dispersal instead of chips or a bullet hole.
          sfx.play("impact", { ...at(event.x, event.y), strength: 0.25 });
          this.spawnBurst(event.x, event.y, color, 5, "energy", 0);
          this.spawnBurst(event.x, event.y, 0xfff3d0, 2, "flash", 0);
          continue;
        }
        if (isFlame) {
          sfx.play("impact", { ...at(event.x, event.y), strength: s });
          this.spawnBurst(event.x, event.y, 0xf06b2f, 8, "energy", 0);
          this.spawnBurst(event.x, event.y, 0xf0a14a, 5, "spark", 0);
          // Lingering embers curl up from the flame splash.
          this.spawnBurst(event.x, event.y - 4, 0xf0873c, 3, "smoke", 0);
        } else if (isRocket) {
          sfx.play("impact", { ...at(event.x, event.y), strength: s });
          this.spawnBurst(event.x, event.y, 0xf0a14a, 10, "spark", 0);
          this.spawnBurst(event.x, event.y, 0xffdca0, 5, "flash", 0);
          this.spawnBurst(event.x, event.y, 0x343b3b, 6, "smoke", 0);
        } else {
          sfx.play("impact", { ...at(event.x, event.y), strength: s });
          this.spawnBurst(event.x, event.y, color, Math.round(5 + s * 9), "spark", 0);
          this.spawnBurst(event.x, event.y, 0xfff3d0, 2, "flash", 0);
          if (s >= 0.55) this.rings.push({ x: event.x, y: event.y, life: 0.2, maxLife: 0.2, radius: 3, color, width: 2, grow: 26 });
        }
        // M19: bullet holes anchor to the surface actually struck, never float.
        if (visualPrefs.gore) {
          const map = this.snapshot && MAPS[this.snapshot.config.mapId];
          const surface = map ? surfaceBelow(map, event.x, event.y + 6) : undefined;
          if (surface !== undefined) this.stampDecal({ x: event.x, y: surface + 1, radius: 1.6 + s * 1.6, alpha: 0.5, rotation: Math.random() * Math.PI, dir: 0 });
        }
      } else if (event.type === "hit") {
        sfx.play("hit", { ...at(event.x, event.y), strength: event.strength, priority: "high" });
        // M24 floating damage digits (FX-toggleable).
        if (event.amount) this.spawnDamageDigit(event.x, event.y, event.amount, event.strength);
        if (visualPrefs.gore) {
          // M19: blood sprays AWAY from the shooter (event carries actorId);
          // unknown shooter degenerates to a radial splash.
          const shooter = this.snapshot?.players.find((player) => player.id === event.actorId);
          const away = shooter && target ? (target.x >= shooter.x ? 1 : -1) as 1 | -1 : 0;
          this.spawnBurst(event.x, event.y, 0x8d151d, Math.round(14 + event.strength * 18), "blood", away);
          this.spawnBurst(event.x, event.y, 0xd42636, Math.round(5 + event.strength * 6), "blood", away);
          this.stampBloodSplash(event.x, event.y, 4 + event.strength * 5, away);
        } else this.spawnBurst(event.x, event.y, 0xe0b66d, 14, "spark", 0);
        this.spawnBurst(event.x, event.y, 0xfff3d0, Math.round(3 + event.strength * 5), "flash", 0);
        if (event.strength >= 0.45) this.rings.push({ x: event.x, y: event.y, life: 0.26, maxLife: 0.26, radius: 5, color: 0xffd9a0, width: 2.5, grow: 40 + event.strength * 40 });
        if (event.strength >= 0.6) this.punchHitstop(event.strength);
        // M25: hits bloom briefly at the impact point.
        this.lighting?.flash(event.x, event.y, 46, 0xfff3d0, 0.3, 0.12);
        this.shake(event.strength, target?.id === selfId);
        // M20: when I am the victim, remember the attacker's bearing so a red
        // arc can pulse around my pilot pointing back at the shooter.
        if (target?.id === selfId && actor && event.actorId !== selfId) {
          const angle = Math.atan2(actor.y - (mine?.y ?? 0), actor.x - (mine?.x ?? 0));
          this.hitMarkers.push({ angle, life: 0.6 });
          if (this.hitMarkers.length > 6) this.hitMarkers = this.hitMarkers.slice(-6);
        }
      } else if (event.type === "explosion") {
        sfx.play("explosion", { ...at(event.x, event.y), strength: event.strength, priority: "high" });
        // Layered fireball: white-hot core flash, orange fireball ring, embers, smoke.
        this.spawnBurst(event.x, event.y, 0xfff3d0, 8, "flash", 0);
        this.spawnBurst(event.x, event.y, 0xf06b2f, 34, "energy", 0);
        this.spawnBurst(event.x, event.y, 0xf0a14a, 14, "spark", 0);
        this.spawnBurst(event.x, event.y, 0x343b3b, 18, "smoke", 0);
        this.rings.push({ x: event.x, y: event.y, life: 0.45, maxLife: 0.45, radius: 14, color: 0xf0894a, width: 5, grow: 90, double: true });
        // M25/M26: explosions blast the darkness open and splash the walls.
        this.lighting?.flash(event.x, event.y, 150, 0xffd9a0, 0.65, 0.3, 90, 1.5);
        this.punchHitstop(event.strength);
        this.shake(event.strength, true);
      } else if (event.type === "dismember") {
        sfx.play("dismember", { ...at(event.x, event.y), priority: "high" });
        if (visualPrefs.gore && event.limbId) {
          this.gibs.push({ x: event.x, y: event.y, vx: (Math.random() - 0.5) * 250, vy: -180 - Math.random() * 120, life: 5, color: target?.color || 0x8d151d, limb: event.limbId });
          this.gibs = this.gibs.slice(-16);
          this.spawnBurst(event.x, event.y, 0x751018, 34, "blood", 0);
          this.spawnBurst(event.x, event.y, 0xa8182a, 8, "flash", 0);
          this.stampBloodSplash(event.x, event.y, 7 + event.strength * 4, 0);
        }
        this.rings.push({ x: event.x, y: event.y, life: 0.3, maxLife: 0.3, radius: 6, color: 0xc22538, width: 3, grow: 60 });
        this.punchHitstop(0.8);
        this.shake(1.2, target?.id === selfId);
      } else if (event.type === "death") {
        sfx.play("death", { ...at(event.x, event.y), priority: "high" });
        this.spawnBurst(event.x, event.y, visualPrefs.gore ? 0x6e0d16 : 0xd7aa56, visualPrefs.gore ? 44 : 26, visualPrefs.gore ? "blood" : "spark", 0);
        if (visualPrefs.gore) this.stampBloodSplash(event.x, event.y, 10, 0);
        this.spawnBurst(event.x, event.y, 0xfff3d0, 10, "flash", 0);
        this.rings.push({ x: event.x, y: event.y, life: 0.55, maxLife: 0.55, radius: 10, color: target?.color || 0xf0a14a, width: 4, grow: 130, double: true });
        // Kill pillar: a vertical light shaft marks the elimination spot.
        this.tracers.push({ x1: event.x, y1: Math.max(0, event.y - 210), x2: event.x, y2: event.y + 26, life: 0.4, color: target?.color || 0xf0a14a, width: 7, core: 2.6 });
        // M25/M26: the death light shaft also lights the area.
        this.lighting?.flash(event.x, event.y - 60, 190, target?.color || 0xf0a14a, 0.5, 0.42, undefined, 1.1);
        this.punchHitstop(1.2);
        this.shake(1.4, true);
        // M20 kill feed: every client sees the attribution row; the killer's
        // own client also gets the rising confirm sting.
        this.addKillFeed(event, target, actor);
        if (event.actorId && event.actorId === selfId) sfx.play("kill", { priority: "high" });
      } else if (event.type === "respawn") {
        sfx.play("respawn", at(event.x, event.y));
        this.spawnBurst(event.x, event.y, target?.color || 0x56d9d0, 32, "energy", 0);
      } else if (event.type === "hazard") {
        sfx.play("hazard", { ...at(event.x, event.y), strength: event.strength });
        this.spawnBurst(event.x, event.y, 0xf09b3d, 28, "spark", 0);
        this.shake(event.strength, target?.id === selfId);
      }
    }
  }

  private spawnBurst(x: number, y: number, color: number, count: number, kind: FxParticle["kind"], direction: number, gravityOverride?: number) {
    // Adaptive density: solo shots keep full juice, particle storms throttle
    // instead of melting the frame budget.
    const pool = this.particles.length;
    const density = pool > 200 ? 0.35 : pool > 140 ? 0.65 : 1;
    const scaled = Math.max(1, Math.round(count * density));
    for (let index = 0; index < scaled && this.particles.length < 170; index++) {
      const angle = direction ? (Math.random() - 0.5) * 1.8 + (direction > 0 ? 0 : Math.PI) : Math.random() * Math.PI * 2;
      const speed = kind === "flash" ? 20 + Math.random() * 60 : 45 + Math.random() * (kind === "smoke" ? 80 : 260);
      const life = kind === "flash" ? 0.1 + Math.random() * 0.08 : kind === "smoke" ? 0.7 + Math.random() * 0.8 : 0.25 + Math.random() * 0.7;
      const size = kind === "flash" ? 7 + Math.random() * 9 : kind === "smoke" ? 8 + Math.random() * 12 : 2 + Math.random() * 4;
      const gravity = gravityOverride ?? (kind === "blood" ? 540 : kind === "spark" ? 260 : kind === "smoke" ? -18 : kind === "flash" ? -30 : 40);
      this.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - (kind === "blood" ? 80 : 0), life, maxLife: life, size, color, gravity, kind });
    }
  }

  private shake(strength: number, important: boolean) {
    if (!visualPrefs.shake || (!important && strength < 0.7)) return;
    const duration = Math.min(250, 100 + strength * 85);
    const intensity = Math.min(0.012, 0.003 + strength * 0.005);
    this.cameras.main.shake(duration, intensity, true);
  }

  /** M24 pooled floating damage digits; big hits render larger and hotter. */
  private spawnDamageDigit(x: number, y: number, amount: number, strength: number) {
    if (!visualPrefs.digits) return;
    let entry = this.digits.find((candidate) => candidate.life <= 0);
    if (!entry) {
      if (this.digits.length >= 24) return;
      const text = this.add.text(0, 0, "", { fontFamily: "Consolas, monospace", fontSize: "13px", fontStyle: "bold", color: "#f5f2e8", stroke: "#06090b", strokeThickness: 3 }).setOrigin(0.5).setDepth(6).setResolution(2);
      entry = { text, life: 0 };
      this.digits.push(entry);
    }
    const execution = strength >= 1.2;
    const heavy = amount >= 20 || execution;
    entry.text.setText(String(amount));
    entry.text.setColor(execution ? "#ff6d5e" : heavy ? "#ffb35c" : "#f5f2e8");
    entry.text.setFontSize(execution ? 17 : heavy ? 14 : 12);
    entry.text.setPosition(x + (Math.random() - 0.5) * 10, y - 8);
    entry.text.setAlpha(1);
    entry.text.setVisible(true);
    entry.life = 0.7;
  }

  private swingStateOf(playerId: string) {
    const swing = this.swings.get(playerId);
    if (!swing) return undefined;
    return { progress: clamp(swing.t / swing.dur, 0, 1), secondary: swing.secondary };
  }

  // M20 kill feed: killer ▸ weapon bar ▸ victim. Hazards and falls arrive
  // without a killer (actorId undefined) and read as "THE SPIRE".
  private addKillFeed(event: CombatEvent, victim?: PlayerState, killer?: PlayerState) {
    const feed = $("kill-feed");
    if (!feed) return;
    const weapon = event.weaponId ? WEAPONS[event.weaponId] : undefined;
    const name = (player?: PlayerState) => player ? `${escapeHtml(player.name)}${player.isBot ? " [BOT]" : ""}` : "—";
    const killerHtml = killer
      ? `<b style="--pilot:${colorCss(killer.color)}">${name(killer)}</b>`
      : `<b class="spire-kill">${i18n.t("spireKill")}</b>`;
    const victimHtml = `<b style="--pilot:${colorCss(victim?.color ?? 0xf0a14a)}">${name(victim)}</b>`;
    const row = document.createElement("div");
    row.className = "kill-entry";
    row.innerHTML = `${killerHtml}<i class="kill-arrow">▸</i>${weapon ? `<i class="kill-weapon" style="--weapon:${colorCss(weapon.color)}" title="${weapon.label}"></i>` : ""}<i class="kill-arrow">▸</i>${victimHtml}`;
    feed.appendChild(row);
    while (feed.childElementCount > 4) feed.firstElementChild?.remove();
    const timer = setTimeout(() => {
      row.classList.add("fading");
      setTimeout(() => {
        row.remove();
        this.killFeedTimers.delete(timer);
      }, 600);
    }, 3400);
    this.killFeedTimers.add(timer);
  }

  private clearFeedback() {
    for (const timer of this.killFeedTimers) clearTimeout(timer);
    this.killFeedTimers.clear();
    $("kill-feed").replaceChildren();
    this.hitMarkers = [];
    this.vignetteLevel = 0;
    this.lastVignetteValue = -1;
  }

  private lastVignetteValue = 0;

  private setVignette(level: number) {
    const vignette = $("vignette");
    if (!vignette) return;
    const next = Math.round(clamp(level, 0, 1) * 100) / 100;
    if (next === this.lastVignetteValue) return;
    this.lastVignetteValue = next;
    vignette.style.setProperty("--vignette", next.toFixed(2));
    vignette.classList.toggle("active", next > 0);
  }

  private updateEffects(dt: number) {
    for (const particle of this.particles) {
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += particle.gravity * dt;
      particle.vx *= 0.985;
    }
    this.particles = this.particles.filter((particle) => particle.life > 0);
    this.gibs = this.gibs.filter((gib) => gib.life > 0);
    // M19: gibs settle on the real platform below, not a hardcoded floor.
    for (const gib of this.gibs) {
      const map = this.snapshot && MAPS[this.snapshot.config.mapId];
      const ground = map ? surfaceBelow(map, gib.x, gib.y) : undefined;
      gib.life -= dt;
      gib.x += gib.vx * dt;
      gib.y += gib.vy * dt;
      gib.vy += 620 * dt;
      if (ground !== undefined && gib.y > ground) {
        gib.y = ground;
        gib.vy *= -0.24;
        gib.vx *= 0.7;
      } else if (gib.y > WORLD.height + 80) {
        gib.life = 0; // fell into a gap — leave the world
      }
    }
    this.gibs = this.gibs.filter((gib) => gib.life > 0);
    this.updateGore(dt);
    for (const tracer of this.tracers) tracer.life -= dt;
    this.tracers = this.tracers.filter((tracer) => tracer.life > 0);
    for (const ring of this.rings) ring.life -= dt;
    this.rings = this.rings.filter((ring) => ring.life > 0);
    for (const marker of this.hitMarkers) marker.life -= dt;
    this.hitMarkers = this.hitMarkers.filter((marker) => marker.life > 0);
    // M24 animation timers: swing arcs, barrel heat, dash ghosts, damage digits.
    for (const [id, swing] of this.swings) {
      swing.t += dt;
      if (swing.t >= swing.dur) this.swings.delete(id);
    }
    for (const [id, value] of this.heat) {
      const next = value - dt * 1.4;
      if (next <= 0) this.heat.delete(id);
      else this.heat.set(id, next);
    }
    for (const ghost of this.dashGhosts) ghost.life -= dt;
    this.dashGhosts = this.dashGhosts.filter((ghost) => ghost.life > 0);
    for (const digit of this.digits) {
      if (digit.life <= 0) continue;
      digit.life -= dt;
      digit.text.y -= 34 * dt;
      digit.text.setAlpha(Math.min(1, digit.life / 0.3));
      if (digit.life <= 0) digit.text.setVisible(false);
    }
    // M20 vignette: drive the red overlay from my total limb integrity.
    const mine = this.snapshot?.players.find((player) => player.id === selfId);
    if (mine) {
      const total = LIMB_IDS.reduce((sum, limbId) => sum + mine.limbs[limbId], 0);
      const severity = total < 150 ? clamp((150 - total) / 150, 0, 1) : 0;
      this.vignetteLevel = severity;
      this.setVignette(severity * (0.55 + 0.25 * Math.sin(performance.now() / 260)));
    } else {
      this.setVignette(0);
    }
  }

  private draw(time: number) {
    const snapshot = this.snapshot;
    if (!snapshot) return;
    const map = MAPS[snapshot.config.mapId];
    // M26: visibility switching for the static plate layers.
    if (this.plates) {
      for (const [mapId, set] of Object.entries(this.plates) as Array<[MapId, PlateSet]>) {
        const show = mapId === snapshot.config.mapId;
        set.background.setVisible(show);
        set.world.setVisible(show);
        set.glow.setVisible(show);
      }
    }
    this.graphics.clear();
    drawEnvironment(this.graphics, snapshot.config.mapId, time, !!this.plates);
    this.drawDecals();
    for (const hazard of snapshot.hazards) drawHazard(this.graphics, hazard, map.accent, time);
    for (const mover of snapshot.movers) drawMover(this.graphics, mover, map.accent, time);
    for (const prop of snapshot.props) if (prop.alive) drawProp(this.graphics, prop, time, this.lighting?.sampleLight(prop.x, prop.y - 12));
    for (const crate of snapshot.crates) if (crate.active) drawCrate(this.graphics, crate.x, crate.y, crate.weapon, time, crate.generation, crate.kind, this.lighting?.sampleLight(crate.x, crate.y));
    for (const projectile of snapshot.projectiles) drawProjectile(this.graphics, projectile, time);
    this.drawDashGhosts();
    this.drawTracers();
    this.drawParticles();
    this.drawHitMarkers();
    this.drawAtmosphere(time);

    const visible = new Set<string>();
    for (const player of snapshot.players) {
      visible.add(player.id);
      this.drawPlayerState(player, time);
    }
    for (const [id, label] of this.labels) label.setVisible(visible.has(id));
    this.drawGibs();
    this.drawForeground(snapshot.config.mapId, time);
    this.drawLighting(snapshot, time);
  }

  /**
   * M25: collect this frame's light emitters and resolve the light pass.
   * Priority order under pool pressure: explosions > muzzle/beam > projectiles
   * > hazard lamps > pulses. Pilots carry no personal lights (M25b).
   */
  private drawLighting(snapshot: ServerSnapshot, time: number) {
    const lighting = this.lighting;
    if (!lighting) return;
    lighting.emitTransients();
    // M25b: pilots carry NO personal lights — the headlamp cone read as a
    // flashlight strapped to the character (hard-edged wedge following the
    // pilot). Characters stay lit by the environment: muzzle flashes,
    // explosions, static rigs and lightning do all the lighting.
    // Projectile glows (skip the cheap tiny pellets under load). Big rounds
    // also pour real Light2D light onto the normal-mapped plates.
    for (const projectile of snapshot.projectiles) {
      const color = WEAPONS[projectile.weaponId].color;
      if (projectile.weaponId === "rocket") {
        lighting.add({ x: projectile.x, y: projectile.y, radius: 70, tint: 0xf0a24a, alpha: 0.5, tier: 0 });
        lighting.addPoint(projectile.x, projectile.y, 90, 0xf0a24a, 0.7, 0);
      } else if (projectile.weaponId === "scatter" && projectile.secondary) {
        lighting.add({ x: projectile.x, y: projectile.y, radius: 56, tint: 0xf06b2f, alpha: 0.45, tier: 1 });
        lighting.addPoint(projectile.x, projectile.y, 70, 0xf06b2f, 0.55, 1);
      } else if (projectile.pattern === "bounce") {
        lighting.add({ x: projectile.x, y: projectile.y, radius: 40, tint: color, alpha: 0.4, tier: 1 });
      } else {
        lighting.add({ x: projectile.x, y: projectile.y, radius: 26, tint: color, alpha: 0.28, tier: 2 });
      }
    }
    // Live crates pulse; hazards announce themselves in light.
    for (const crate of snapshot.crates) {
      if (!crate.active) continue;
      const tint = crate.kind === "repair" ? 0x4fd07a : WEAPONS[crate.weapon].color;
      lighting.add({ x: crate.x, y: crate.y, radius: 40, tint, alpha: 0.3 + Math.sin(time * 0.006) * 0.08, tier: 2 });
    }
    for (const hazard of snapshot.hazards) {
      if (hazard.phase === "warning") lighting.add({ x: hazard.x + hazard.width / 2, y: hazard.y + hazard.height / 2, radius: 90, tint: 0xe0a43c, alpha: 0.3, tier: 1 });
      else if (hazard.phase === "active") lighting.add({ x: hazard.x + hazard.width / 2, y: hazard.y + hazard.height / 2, radius: 110, tint: 0xd84b44, alpha: 0.4, tier: 0 });
    }
    // Occluders: platforms + solids + movers + live barrels + pilots.
    const occluders: OccluderRect[] = MAPS[snapshot.config.mapId].platforms.map((platform) => ({ x: platform.x, y: platform.y, width: platform.width, height: platform.height }));
    for (const mover of snapshot.movers) occluders.push({ x: mover.x, y: mover.y, width: mover.width, height: mover.height });
    for (const prop of snapshot.props) {
      if (!prop.alive) continue;
      occluders.push({ x: prop.x - 9, y: prop.y - 24, width: 18, height: 24 });
      // Damaged barrels light themselves: leaking fire becomes a beacon
      // (additive glow for the flame + a real PointLight so the drum and the
      // wall behind it catch the firelight).
      const fraction = prop.hp / 30;
      if (fraction < 0.6) {
        const intensity = (0.6 - fraction) / 0.6;
        const radius = 34 + intensity * 26;
        lighting.add({ x: prop.x, y: prop.y - 12, radius, tint: 0xf0873c, alpha: 0.3 + intensity * 0.25, tier: 1 });
        lighting.addPoint(prop.x, prop.y - 12, radius * 1.6, 0xf0873c, 0.4 + intensity * 0.5, 1);
      }
    }
    for (const player of snapshot.players) {
      if (player.respawnTimer > 0) continue;
      occluders.push({ x: player.x - 8, y: player.y - 32, width: 16, height: 32 });
    }
    lighting.finish(occluders);
  }

  // M19: gore decals live in `decals` (single source of truth) and are painted
  // into the decalLayer RenderTexture incrementally. Blood anchors to the real
  // platform surface below (surfaceBelow); surface hits anchor at the point.
  private stampBloodSplash(x: number, y: number, radius: number, dir: number) {
    if (!visualPrefs.gore) return;
    const map = this.snapshot && MAPS[this.snapshot.config.mapId];
    const surface = map ? surfaceBelow(map, x, y) : undefined;
    if (surface === undefined) return; // over a fall gap: the blood leaves the world
    const dirSign = dir || (Math.random() < 0.5 ? 1 : -1);
    this.stampDecal({ x, y: surface, radius, alpha: 0.34, rotation: Math.random() * Math.PI, dir: dirSign });
  }

  /**
   * M25: an explosion's scorched footprint — a dark char ellipse plus radial
   * streaks, painted into the same decal layer as blood (fades out the same
   * way, ignores the gore toggle: scorch is property damage, not gore).
   */
  private stampScorch(x: number, y: number) {
    if (!this.snapshot) return;
    const surface = surfaceBelow(MAPS[this.snapshot.config.mapId], x, y);
    if (surface === undefined) return; // blast in the air: nothing to scorch
    this.stampDecal({ x, y: surface + 1, radius: 14, alpha: 0.5, rotation: 0, dir: 0, scorch: true });
  }

  private stampDecal(decal: Decal) {
    if (!visualPrefs.gore) return;
    this.decals.push(decal);
    if (this.decals.length > 220) {
      // Over the budget: drop the oldest and repaint the whole layer once.
      this.decals = this.decals.slice(-200);
      this.rebuildDecalLayer();
      return;
    }
    try {
      this.decalLayer ||= this.add.renderTexture(0, 0, WORLD.width, WORLD.height).setOrigin(0, 0).setDepth(-0.5);
      if (this.decalPainted === this.decals.length - 1) {
        // No backlog: paint immediately for zero-latency feedback.
        const brush = this.make.graphics({ x: 0, y: 0 }, false);
        this.paintDecal(brush, this.decals[this.decals.length - 1]);
        this.decalLayer.draw(brush);
        brush.destroy();
        this.decalPainted = this.decals.length;
      }
    } catch {
      // RenderTexture unavailable: the graphics fallback in drawDecals takes over.
    }
  }

  /** Organic multi-blob blood stain, or a scorched blast mark (M25). */
  private paintDecal(brush: Phaser.GameObjects.Graphics, decal: Decal) {
    const dir = decal.dir ?? 0;
    if (decal.scorch) {
      // Char footprint: wide dark ellipse + radial streaks + a hot ember rim
      // that fades with the decal alpha.
      brush.fillStyle(0x0c0d0e, decal.alpha);
      brush.fillEllipse(decal.x, decal.y, decal.radius * 2.6, decal.radius * 0.85);
      brush.fillStyle(0x1a1512, decal.alpha * 0.9);
      brush.fillEllipse(decal.x, decal.y, decal.radius * 1.8, decal.radius * 0.6);
      for (let streak = 0; streak < 5; streak++) {
        const angle = (streak / 5) * Math.PI * 2 + decal.rotation;
        brush.fillStyle(0x0c0d0e, decal.alpha * 0.7);
        brush.fillCircle(decal.x + Math.cos(angle) * decal.radius * 1.3, decal.y + Math.sin(angle) * decal.radius * 0.4, decal.radius * 0.22);
      }
      brush.fillStyle(0xe0682d, decal.alpha * 0.4);
      brush.fillEllipse(decal.x, decal.y - 0.5, decal.radius * 1.1, decal.radius * 0.3);
      return;
    }
    brush.fillStyle(0x5e0a12, decal.alpha);
    // Main pool: an ellipse lying on the surface, stretched along the spray.
    brush.fillEllipse(decal.x + dir * decal.radius * 0.35, decal.y, decal.radius * 2.4, decal.radius * 0.8);
    // Drag tail pointing away from the impact.
    if (dir) {
      brush.fillStyle(0x5e0a12, decal.alpha * 0.6);
      brush.fillEllipse(decal.x + dir * decal.radius * 1.15, decal.y - decal.radius * 0.1, decal.radius * 1.15, decal.radius * 0.4);
    }
    // 2-3 satellite droplets + a highlight core.
    for (let drop = 0; drop < 3; drop++) {
      const spreadX = (Math.random() - 0.5) * decal.radius * 2.6 + dir * decal.radius * 0.7;
      brush.fillStyle(0x7a1019, decal.alpha * (0.5 + Math.random() * 0.4));
      brush.fillCircle(decal.x + spreadX, decal.y - Math.random() * decal.radius * 0.3, 0.8 + Math.random() * decal.radius * 0.28);
    }
    brush.fillStyle(0x4a0810, decal.alpha * 0.8);
    brush.fillCircle(decal.x, decal.y, decal.radius * 0.3);
  }

  /** Full repaint (fade-out steps and over-budget trims), frame-budgeted. */
  private rebuildDecalLayer() {
    try {
      this.decalLayer ||= this.add.renderTexture(0, 0, WORLD.width, WORLD.height).setOrigin(0, 0).setDepth(-0.5);
      this.decalLayer.clear();
      this.decalPainted = 0;
    } catch {
      this.decalLayer = undefined;
    }
  }

  private updateGore(dt: number) {
    if (!visualPrefs.gore || !this.decals.length) return;
    // Slow fade: every 8s the whole layer repaints at 0.85 alpha; decals
    // below 0.06 fall out. The repaint streams ~30 stamps per frame so a
    // 220-decal rebuild never spikes one frame.
    this.goreFadeTimer += dt;
    if (this.goreFadeTimer < 8) return;
    this.goreFadeTimer = 0;
    this.decals = this.decals
      .map((decal) => ({ ...decal, alpha: decal.alpha * 0.85 }))
      .filter((decal) => decal.alpha >= 0.06);
    this.rebuildDecalLayer();
  }

  /** Stream pending decal paints into the layer (≤30 per frame). */
  private flushDecalPaint() {
    if (!this.decalLayer || this.decalPainted >= this.decals.length) return;
    const brush = this.make.graphics({ x: 0, y: 0 }, false);
    const target = Math.min(this.decals.length, this.decalPainted + 30);
    for (let index = this.decalPainted; index < target; index++) this.paintDecal(brush, this.decals[index]);
    this.decalLayer.draw(brush);
    brush.destroy();
    this.decalPainted = target;
  }

  private drawAtmosphere(time: number) {
    const snapshot = this.snapshot;
    if (!snapshot) return;
    const mapId = snapshot.config.mapId;
    if (this.atmosphereMap !== mapId) {
      this.atmosphereMap = mapId;
      this.atmosphere = [];
      if (mapId === "canopy") {
        for (let index = 0; index < 36; index++) this.atmosphere.push({ x: Math.random() * (WORLD.width + 200), y: Math.random() * WORLD.height, vx: -140, vy: 460, kind: "rain" });
      } else if (mapId === "fortress") {
        for (let index = 0; index < 35; index++) this.atmosphere.push({ x: Math.random() * WORLD.width, y: Math.random() * WORLD.height, vx: 6 + Math.random() * 10, vy: -5 - Math.random() * 9, kind: "dust" });
      } else {
        for (let index = 0; index < 45; index++) this.atmosphere.push({ x: Math.random() * WORLD.width, y: 300 + Math.random() * 260, vx: 8 - Math.random() * 16, vy: -34 - Math.random() * 30, kind: "ember" });
      }
    }
    const dt = 1 / 60;
    // M25: rain splash budget — reuse the particle pool, ≤2 splashes/frame.
    let splashes = 2;
    for (const mote of this.atmosphere) {
      mote.x += mote.vx * dt;
      mote.y += mote.vy * dt;
      if (mote.kind === "rain") {
        if (mote.y > WORLD.height) { mote.y = -10; mote.x = Math.random() * (WORLD.width + 200); }
        if (mote.x < -100) mote.x += WORLD.width + 200;
        // When a drop crosses a platform surface, kick a splash ring.
        if (splashes > 0 && this.snapshot) {
          const surface = surfaceBelow(MAPS[this.snapshot.config.mapId], mote.x, mote.y);
          if (surface !== undefined && mote.y >= surface && mote.y - mote.vy * dt < surface) {
            splashes -= 1;
            this.spawnBurst(mote.x, surface, 0x9fc2c8, 2, "spark", 0, 120);
          }
        }
      } else if (mote.kind === "dust") {
        if (mote.y < 0) mote.y = WORLD.height;
        if (mote.x > WORLD.width) mote.x = 0;
      } else {
        if (mote.y < 260) { mote.y = WORLD.height + 6; mote.x = Math.random() * WORLD.width; }
      }
    }
    for (const mote of this.atmosphere) {
      if (mote.kind === "rain") {
        this.graphics.lineStyle(1, 0x9fc2c8, 0.24);
        this.graphics.lineBetween(mote.x, mote.y, mote.x + mote.vx * 0.03, mote.y + mote.vy * 0.03);
      } else if (mote.kind === "dust") {
        this.graphics.fillStyle(0xb9a98e, 0.09 + Math.sin(time * 0.002 + mote.x) * 0.04);
        this.graphics.fillCircle(mote.x, mote.y, 1.6);
      } else {
        this.graphics.fillStyle(0xf0873c, 0.32 + Math.sin(time * 0.008 + mote.x * 0.7) * 0.22);
        this.graphics.fillCircle(mote.x, mote.y, 1.5 + Math.sin(time * 0.006 + mote.y) * 0.5);
      }
    }
  }

  private drawDecals() {
    // Graphics fallback when RenderTexture is unavailable: draw the same
    // organic shapes straight into the frame. When the layer exists, just
    // stream any pending paints into it.
    if (!visualPrefs.gore) return;
    if (this.decalLayer) {
      this.flushDecalPaint();
      return;
    }
    for (const decal of this.decals) this.paintDecal(this.graphics, decal);
  }

  /** M20: red bearing arcs around my pilot pointing back at recent shooters. */
  private drawHitMarkers() {
    const mine = this.snapshot?.players.find((player) => player.id === selfId);
    if (!mine || !this.hitMarkers.length) return;
    const cx = mine.x;
    const cy = mine.y - PLAYER_TARGET_OFFSET;
    for (const marker of this.hitMarkers) {
      const alpha = Math.min(0.85, marker.life / 0.6 * 0.85);
      const radius = 20 + (0.6 - marker.life) * 26;
      this.graphics.lineStyle(3, 0xe0293c, alpha);
      this.graphics.beginPath();
      this.graphics.arc(cx, cy, radius, marker.angle - 0.5, marker.angle + 0.5);
      this.graphics.strokePath();
      this.graphics.lineStyle(1.2, 0xff6d7d, alpha * 0.8);
      this.graphics.beginPath();
      this.graphics.arc(cx, cy, radius + 4, marker.angle - 0.32, marker.angle + 0.32);
      this.graphics.strokePath();
    }
  }

  /** M24: fading dash afterimages drawn beneath pilots (soft = speed echo). */
  private drawDashGhosts() {
    for (const ghost of this.dashGhosts) {
      const alpha = Math.min(ghost.soft ? 0.12 : 0.4, ghost.life * (ghost.soft ? 1 : 2));
      this.graphics.fillStyle(ghost.color, alpha);
      this.graphics.fillRoundedRect(ghost.x - 8, ghost.y - 30, 16, 30, 3);
    }
  }

  private drawTracers() {
    for (const tracer of this.tracers) {
      // Thin bullet-path tracers: one honest flight line, no glow stack.
      if (tracer.thin) {
        this.graphics.lineStyle(tracer.width, tracer.color, Math.min(0.5, tracer.life * 7));
        this.graphics.lineBetween(tracer.x1, tracer.y1, tracer.x2, tracer.y2);
        continue;
      }
      // Beams and charged rails crackle: jittered segments replace the plain halo pass.
      if (tracer.jitter) {
        const segments = 4;
        const stepX = (tracer.x2 - tracer.x1) / segments;
        for (let index = 0; index < segments; index++) {
          const x1 = tracer.x1 + stepX * index;
          const y1 = tracer.y1 + (Math.random() - 0.5) * tracer.jitter * 4;
          const x2 = tracer.x1 + stepX * (index + 1);
          const y2 = tracer.y1 + (Math.random() - 0.5) * tracer.jitter * 4;
          this.graphics.lineStyle(tracer.width + 7, tracer.color, Math.min(0.22, tracer.life * 1.6));
          this.graphics.lineBetween(x1, y1, x2, y2);
        }
      } else {
        this.graphics.lineStyle(tracer.width + 6, tracer.color, Math.min(0.32, tracer.life * 2));
        this.graphics.lineBetween(tracer.x1, tracer.y1, tracer.x2, tracer.y2);
      }
      this.graphics.lineStyle(tracer.width, tracer.color, Math.min(0.9, tracer.life * 5));
      this.graphics.lineBetween(tracer.x1, tracer.y1, tracer.x2, tracer.y2);
      this.graphics.lineStyle(tracer.core ?? tracer.width * 0.5, 0xffefc3, Math.min(1, tracer.life * 9));
      this.graphics.lineBetween(tracer.x1, tracer.y1, tracer.x2, tracer.y2);
    }
    for (const ring of this.rings) {
      const t = 1 - ring.life / ring.maxLife;
      const eased = 1 - (1 - t) * (1 - t);
      const radius = ring.radius + eased * (ring.grow ?? 46);
      this.graphics.lineStyle(ring.width, ring.color, (1 - t) * 0.85);
      this.graphics.strokeCircle(ring.x, ring.y, radius);
      if (ring.double) {
        this.graphics.lineStyle(Math.max(1, ring.width * 0.5), 0xffefc3, (1 - t) * 0.9);
        this.graphics.strokeCircle(ring.x, ring.y, radius * 0.72);
      }
    }
  }

  private drawParticles() {
    for (const particle of this.particles) {
      const alpha = Math.max(0, particle.life / particle.maxLife);
      if (particle.kind === "smoke") {
        this.graphics.fillStyle(particle.color, alpha * 0.18);
        this.graphics.fillCircle(particle.x, particle.y, particle.size * (1.4 - alpha * 0.4));
      } else if (particle.kind === "spark") {
        this.graphics.lineStyle(Math.max(1, particle.size / 2), particle.color, alpha);
        this.graphics.lineBetween(particle.x, particle.y, particle.x - particle.vx * 0.025, particle.y - particle.vy * 0.025);
      } else if (particle.kind === "flash") {
        // Hot core with a soft halo reads as a muzzle/explosion flash.
        this.graphics.fillStyle(particle.color, alpha * 0.28);
        this.graphics.fillCircle(particle.x, particle.y, particle.size * (2.4 - alpha) + 2);
        this.graphics.fillStyle(0xfffdf5, alpha * 0.95);
        this.graphics.fillCircle(particle.x, particle.y, particle.size * alpha * 0.7 + 1);
      } else {
        this.graphics.fillStyle(particle.color, alpha * 0.9);
        this.graphics.fillCircle(particle.x, particle.y, particle.size * alpha + 1);
      }
    }
  }

  private drawGibs() {
    if (!visualPrefs.gore) return;
    for (const gib of this.gibs) {
      this.graphics.lineStyle(7, 0x24292b, Math.min(1, gib.life));
      this.graphics.lineBetween(gib.x - 5, gib.y, gib.x + 5, gib.y + 4);
      this.graphics.lineStyle(2, gib.color, Math.min(1, gib.life));
      this.graphics.lineBetween(gib.x - 4, gib.y - 1, gib.x + 4, gib.y + 3);
      this.graphics.fillStyle(0x6d0c14, 0.8);
      this.graphics.fillCircle(gib.x - 5, gib.y, 3);
    }
  }

  private drawPlayerState(player: PlayerState, time: number) {
    // M24 extrapolation + interpolation: render at "snapshot position +
    // velocity × elapsed" (clamped to 120ms), blended toward the raw value.
    // The visible pilot stands where the server says combat is happening,
    // which is what makes shots land where the crosshair already was.
    let position = this.renderPositions.get(player.id);
    if (!position) {
      position = { x: player.x, y: player.y };
      this.renderPositions.set(player.id, position);
    }
    const sample = this.samples.get(player.id);
    const elapsed = sample ? Math.min(120, Math.max(0, performance.now() - sample.at)) / 1000 : 0;
    const rawX = sample ? sample.x + sample.vx * elapsed : player.x;
    const rawY = sample ? sample.y + sample.vy * elapsed : player.y;
    const blend = player.id === selfId ? 0.52 : 0.34;
    position.x = Phaser.Math.Linear(position.x, rawX, blend);
    position.y = Phaser.Math.Linear(position.y, rawY, blend);
    // M24 jump/land feel: watch ground transitions. A hard landing (falling
    // fast) squashes the silhouette, kicks up dust and thuds; jumping
    // stretches it briefly and whooshes.
    const prev = this.prevState.get(player.id);
    const landed = prev && !prev.onGround && player.onGround;
    const fellHard = landed && (prev?.vy ?? 0) > 350;
    if (landed && fellHard) {
      this.landFx.set(player.id, 0.16);
      this.spawnBurst(position.x, player.y, 0x9aa4a4, 6, "smoke", 0);
      const selfRender = this.renderPositions.get(selfId);
      sfx.play("land", { x: position.x, y: player.y, mx: selfRender?.x, my: selfRender?.y, strength: 0.5 });
    }
    if (prev && player.jumpsUsed > prev.jumpsUsed) {
      const selfRender = this.renderPositions.get(selfId);
      sfx.play("jump", { x: position.x, y: player.y, mx: selfRender?.x, my: selfRender?.y, strength: 0.3 });
    }
    this.prevState.set(player.id, { onGround: player.onGround, vy: player.vy, jumpsUsed: player.jumpsUsed });
    let squash = 1;
    const landTimer = this.landFx.get(player.id);
    if (landTimer !== undefined) {
      // M24b two-stage recovery: deep squash at impact, fast initial rebound,
      // gentle settle (power curve on the remaining timer).
      squash = 1 - 0.18 * Math.pow(landTimer / 0.16, 1.5);
      const next = landTimer - 1 / 60;
      if (next <= 0) this.landFx.delete(player.id);
      else this.landFx.set(player.id, next);
    } else if (!player.onGround && player.vy < -120) {
      squash = 1.08;
    }
    let label = this.labels.get(player.id);
    if (!label) {
      label = this.add.text(0, 0, "", { fontFamily: "Arial, sans-serif", fontSize: "13px", fontStyle: "bold", color: "#eef2e9", stroke: "#06090b", strokeThickness: 4 }).setOrigin(0.5).setDepth(5).setResolution(2);
      this.labels.set(player.id, label);
    }
    label.setText(`${player.name.toUpperCase()}  ${player.lives}`).setPosition(position.x, position.y - 54).setVisible(player.respawnTimer <= 0);
    if (player.respawnTimer > 0) return;
    // M24: swing/heat state rides along to the art layer. M26: the sampled
    // key light drives rim + armor response — the pilot reacts to the room.
    const swing = this.swingStateOf(player.id);
    drawPlayer(this.graphics, player, position.x, position.y, time, player.id === selfId, {
      squash,
      swing,
      dashSlash: swing?.secondary && swing.progress < 0.8,
    }, this.lighting?.sampleLight(position.x, position.y - 30));
    // M24: overhead integrity bar — total limb pool, color shifts to amber/red
    // as limbs grind down. Hidden at full health to keep the scene clean.
    const totalIntegrity = LIMB_IDS.reduce((sum, limbId) => sum + player.limbs[limbId], 0);
    if (totalIntegrity < 400) {
      const barWidth = 26;
      const barHeight = 3.5;
      const barX = position.x - barWidth / 2;
      const barY = position.y - 63;
      const fraction = totalIntegrity / 400;
      const barColor = fraction > 0.55 ? 0x56d9d0 : fraction > 0.3 ? 0xe0a43c : 0xd84b44;
      this.graphics.fillStyle(0x050708, 0.8);
      this.graphics.fillRect(barX - 1, barY - 1, barWidth + 2, barHeight + 2);
      this.graphics.fillStyle(barColor, 0.95);
      this.graphics.fillRect(barX, barY, barWidth * fraction, barHeight);
      if (player.id === selfId) {
        this.graphics.lineStyle(1, 0xf2f5ed, 0.55);
        this.graphics.strokeRect(barX - 1, barY - 1, barWidth + 2, barHeight + 2);
      }
    }
    if ((player.charge ?? 0) > 0.02) {
      const charge = player.charge!;
      const cx = position.x;
      const cy = position.y - 40;
      this.graphics.lineStyle(3.5, 0x1c2325, 0.9);
      this.graphics.beginPath();
      this.graphics.arc(cx, cy, 11, Math.PI * 0.75, Math.PI * 2.25);
      this.graphics.strokePath();
      this.graphics.lineStyle(3.5, charge >= 1 ? 0xffe6f2 : 0xd797c7, 0.95);
      this.graphics.beginPath();
      this.graphics.arc(cx, cy, 11, Math.PI * 0.75, Math.PI * 0.75 + Math.PI * 1.5 * charge);
      this.graphics.strokePath();
    }
  }

  private drawForeground(mapId: MapId, time: number) {
    this.graphics.fillStyle(0x050708, 0.2);
    if (mapId === "canopy") {
      this.graphics.fillRect(0, 545, 1000, 15);
      this.graphics.lineStyle(2, 0x9cb6b7, 0.1);
      for (let x = -40; x < 1000; x += 80) this.graphics.lineBetween(x + (time * 0.01) % 80, 540, x + 80 + (time * 0.01) % 80, 515);
    } else if (mapId === "fortress") {
      this.graphics.fillRect(0, 0, 12, 560);
      this.graphics.fillRect(988, 0, 12, 560);
    } else {
      this.graphics.fillStyle(0x050806, 0.28);
      this.graphics.fillEllipse(500 + Math.sin(time * 0.0008) * 80, 570, 780, 70);
      // M25: steam vents along the assembly gut — periodic cosmetic jets.
      for (const [ventX, phase] of [[120, 0], [470, 2.1], [880, 4.2]] as const) {
        const cycle = ((time * 0.001 + phase) % 6) / 6;
        if (cycle > 0.72) {
          const jet = Math.sin((cycle - 0.72) / 0.28 * Math.PI);
          this.graphics.fillStyle(0x8fa39b, 0.14 * jet);
          this.graphics.fillEllipse(ventX + Math.sin(time * 0.003 + ventX) * 6, 470 - jet * 40, 26 + jet * 14, 60 + jet * 40);
        }
        this.graphics.fillStyle(0x39434a, 0.9);
        this.graphics.fillRect(ventX - 9, 444, 18, 4);
      }
    }
  }
}
