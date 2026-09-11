// M28.5 结构拆分：壳层——HTML 骨架、大厅/结算 DOM、语言与视觉设置、
// 全部 UI 事件监听、消息分发入口。场景本体在 main.ts（ArenaScene）；
// 两者只通过 session 与 net 通讯，无相互 import。
import Phaser from "phaser";
import { sfx } from "./audio";
import { ARCHETYPES, MAP_COPY, colorCss } from "./art";
import { connect, initNet, send } from "./net";
import { portraitDataUrl } from "./portrait";
import { availablePortraits, RENDER_SCALE, session, visualPrefs, VIEW, type ArenaSceneLike, type RoomMessage } from "./session";
import "./style.css";
import { i18n, type I18nKey } from "./i18n";
import type { MapId, WeaponId } from "../shared/game.js";
import { TEAM_COLORS, WEAPONS } from "../shared/game.js";

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
          <section class="settings-column"><div class="section-title"><span>03</span><div><p data-i18n="section03">PARAMETERS</p><h3 data-i18n="matchControl">Match control</h3></div></div><div class="settings"><label><span data-i18n="settingMode">Mode</span><select id="teams"><option value="0" data-i18n="modeFfa">Free-for-all</option><option value="2" data-i18n="modeTeams2">2 squads</option><option value="3" data-i18n="modeTeams3">3 squads</option><option value="4" data-i18n="modeTeams4">4 squads</option></select></label><label><span data-i18n="settingSector">Sector</span><select id="map"><option value="canopy">Canopy</option><option value="fortress">Fortress</option><option value="factory">Factory</option></select></label><label><span data-i18n="settingLives">Lives</span><select id="lives"><option>1</option><option>2</option><option selected>3</option><option>4</option><option>5</option></select></label><label class="toggle"><input id="crates" type="checkbox" checked /><span></span> <i data-i18n="settingCrates" style="font-style:normal">Supply drops</i></label><label class="toggle"><input id="mobs" type="checkbox" /><span></span> <i data-i18n="settingMobs" style="font-style:normal">Hostile mobs</i></label><label><span data-i18n="settingBots">AI pilots</span><select id="bots"><option value="0">Off</option><option value="1">1</option><option value="2">2</option><option value="3">3</option></select></label><label><span data-i18n="settingSkill">Skill</span><select id="bot-skill"><option value="casual">Casual</option><option value="standard" selected>Standard</option><option value="brutal">Brutal</option></select></label></div></section>
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
          <div id="team-panel" class="team-panel hidden"></div>
          <button id="in-match-leave" class="quiet hud-leave" data-i18n="exitMatch">Exit match</button>
        </div>
        <div id="vignette" class="vignette" aria-hidden="true"></div>
        <div id="sandbox-actions" class="game-actions hidden"><button id="sandbox-respawn" data-i18n="sandboxRespawn">Test respawn</button><button id="sandbox-return" data-i18n="sandboxReturn">Return to lobby</button></div>
        <div id="result" class="result hidden"><div class="result-signal"></div><p class="eyebrow" data-i18n="resultEyebrow">Spire resolved</p><h2 id="winner"></h2><p id="result-subtitle">ONE PILOT REMAINS</p><div id="result-ranking" class="hidden"></div><div><button id="restart" class="primary" data-i18n="returnLobby">Return to lobby</button><button id="result-leave" data-i18n="leaveSpire">Leave spire</button></div></div>
      </div>
    </main>
  </section>`;

export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]!));
}

/** Re-apply the current language to every statically tagged element. */
function applyI18n() {
  document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((element) => {
    element.textContent = i18n.t(element.dataset.i18n as I18nKey);
  });
  $("lang-toggle").textContent = i18n.lang() === "zh" ? "EN" : "中";
  // The callsign field swaps only while it still holds a known default.
  const nameInput = $<HTMLInputElement>("name");
  if (nameInput.value === "Player" || nameInput.value === "机师") nameInput.value = i18n.lang() === "zh" ? "机师" : "Player";
}

const status = $("status");
const menu = $("menu");
const lobby = $("lobby");
const gameWrap = $("game-wrap");
const errorText = $("error");

function setStatus(text: string, tone = "") {
  status.textContent = text;
  status.className = `status ${tone}`;
}

function showError(text: string) {
  errorText.textContent = text;
}

const humanCountOf = (players: Array<{ isBot?: boolean }>) => players.filter((player) => !player.isBot).length;

function enterLobby(room: RoomMessage) {
  // Fresh room: drop processed-event ids from any previous room (event ids
  // restart at 1 per room and would be wrongly treated as duplicates).
  if (room.code !== session.currentRoom?.code) session.scene?.clearProcessedEvents();
  session.currentRoom = room;
  menu.classList.add("hidden");
  if (room.phase === "lobby") {
    lobby.classList.remove("hidden");
    gameWrap.classList.add("hidden");
    $("result").classList.add("hidden");
    $("sandbox-actions").classList.add("hidden");
    const rosterKey = room.players.map((player) => player.id).join(",");
    if (session.lastRosterKey && rosterKey !== session.lastRosterKey) {
      const before = new Set(session.lastRosterKey.split(","));
      const after = new Set(room.players.map((player) => player.id));
      const joined = [...after].some((id) => !before.has(id));
      sfx.ui(joined ? "ui:join" : "ui:leave");
    }
    session.lastRosterKey = rosterKey;
  }
  $("room-label").textContent = room.code;
  $<HTMLSelectElement>("teams").value = String(room.config.teams ?? 0);
  $<HTMLSelectElement>("map").value = room.config.mapId;
  $<HTMLSelectElement>("lives").value = String(room.config.lives);
  $<HTMLInputElement>("crates").checked = room.config.crates;
  $<HTMLInputElement>("mobs").checked = room.config.mobs === true;
  $<HTMLSelectElement>("bots").value = String(room.config.bots);
  $<HTMLSelectElement>("bot-skill").value = room.config.botSkill;
  updateMapVisual(room.config.mapId);
  const isHost = session.selfId === room.hostId;
  for (const id of ["teams", "map", "lives", "crates", "mobs", "bots", "bot-skill"]) $<HTMLInputElement | HTMLSelectElement>(id).disabled = !isHost;
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
  const squads = room.config.teams ?? 0;
  const slots = Array.from({ length: 4 }, (_, index) => {
    const player = room.players[index];
    const archetype = ARCHETYPES[player?.archetype ?? index];
    const portraitStyle = availablePortraits.has(player?.archetype ?? index) ? ` style="background-image:url('${portraitDataUrl(player?.archetype ?? index)}')"` : "";
    if (!player) return `<div class="player-slot empty"><span class="slot-number">0${index + 1}</span><div class="pilot-silhouette generated" data-archetype="${index}"${portraitStyle}><i></i></div><div><strong>${i18n.t("openSlot")}</strong><small>${archetype.name}</small></div><em>${i18n.t("waiting")}</em></div>`;
    const accent = colorCss(player.color);
    const statusKey = player.id === room.hostId ? "statusHost" : player.isBot ? "statusBot" : player.connected ? "statusReady" : "statusReconnect";
    // M30: squad tag rides next to the status while a team match is configured.
    const teamTag = squads > 0 && player.teamId ? `<u class="team-tag" style="--team:${colorCss(TEAM_COLORS[player.teamId])}">T${player.teamId}</u>` : "";
    return `<div class="player-slot${player.isBot ? " bot-slot" : ""}" style="--pilot:${accent}"><span class="slot-number">0${index + 1}</span><div class="pilot-silhouette${portraitStyle ? " generated" : ""}" data-archetype="${player.archetype}"${portraitStyle}><i></i></div><div><strong>${escapeHtml(player.name)}</strong><small>${archetype.name} / ${archetype.role}</small></div>${teamTag}<em>${i18n.t(statusKey)}</em></div>`;
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
      session.token = message.token;
      session.selfId = message.selfId || session.selfId;
      session.roomCode = message.room.code;
      localStorage.setItem("spirefall-session", JSON.stringify({ token: session.token, selfId: session.selfId, roomCode: session.roomCode }));
    }
    if (message.room) {
      enterLobby(message.room);
      if (message.room.phase !== "lobby") showGame();
    }
  }
  if (message.type === "snapshot") {
    // Test hook: playwright suites preset window.__spireEvents = [] to observe
    // the combat event stream; the client ignores it otherwise.
    const hook = (window as unknown as { __spireEvents?: import("../shared/game.js").CombatEvent[] }).__spireEvents;
    if (Array.isArray(hook)) {
      hook.push(...message.snapshot.events);
      if (hook.length > 600) hook.splice(0, hook.length - 600);
    }
    // Test hook: headless browsers drop synthesized weapon-slot keypresses
    // non-deterministically, so suites can drive switches directly through
    // window.__spireSlot (consumed and cleared here, one slot per snapshot).
    const slotHook = window as unknown as { __spireSlot?: number };
    if (typeof slotHook.__spireSlot === "number" && session.scene) {
      session.scene.sendInput(slotHook.__spireSlot);
      slotHook.__spireSlot = undefined;
    }
    showGame();
    session.scene?.applySnapshot(message.snapshot);
  }
}

let sceneCtor: (new () => ArenaSceneLike & Phaser.Scene) | undefined;

/** Register the ArenaScene class (main.ts owns it; the shell only instantiates). */
export function provideSceneClass(ctor: (new () => ArenaSceneLike & Phaser.Scene)) {
  sceneCtor = ctor;
}

function showGame() {
  lobby.classList.add("hidden");
  gameWrap.classList.remove("hidden");
  if (!session.scene && !session.gameInstance && sceneCtor) {
    session.gameInstance = new Phaser.Game({
      type: Phaser.AUTO,
      parent: "game",
      // M29: the canvas is FIXED at VIEW×RENDER_SCALE (1300×728) — the camera
      // zoom (set in create()) makes the visible window 1000×560 world units,
      // ~44% of the 1500×840 arena; scrolling reveals the rest.
      width: Math.round(VIEW.width * RENDER_SCALE),
      height: Math.round(VIEW.height * RENDER_SCALE),
      backgroundColor: "#080b0d",
      // M26: the poster light pipeline compiles its uniform array from
      // maxLights — must match POINT_POOL in lighting.ts. M27: 20 so rocket
      // / flame / shard trails get their own point lights.
      render: { antialias: true, pixelArt: false, maxLights: 20 },
      scene: [sceneCtor],
      scale: { mode: Phaser.Scale.NONE },
    });
  }
}

// Exit the room for real: tell the server (immediate slot removal, no 30s
// reconnect hold), clear the saved session so the auto-resume does not pull
// us straight back in, and return to the main menu without a page reload.
function leaveRoom() {
  session.manualConnectionAction = true;
  send("leave_room");
  localStorage.removeItem("spirefall-session");
  session.token = "";
  session.selfId = "";
  session.roomCode = "";
  session.currentRoom = undefined;
  session.scene = undefined;
  session.lastRosterKey = "";
  sfx.ambient(false);
  session.gameInstance?.destroy(true);
  session.gameInstance = undefined;
  showError("");
  lobby.classList.add("hidden");
  gameWrap.classList.add("hidden");
  $("result").classList.add("hidden");
  $("sandbox-actions").classList.add("hidden");
  menu.classList.remove("hidden");
  setStatus(i18n.t("statusLinked"), "good");
}

/**
 * Wire the whole shell: language, rooms, settings, audio unlock, keyboard
 * panel and the network connection. Called once from main.ts with the
 * ArenaScene class (kept out of this module to avoid a circular import).
 */
export function initShell(sceneCtorParam: (new () => ArenaSceneLike & Phaser.Scene)) {
  provideSceneClass(sceneCtorParam);
  applyI18n();

  $("lang-toggle").addEventListener("click", () => {
    i18n.setLang(i18n.lang() === "zh" ? "en" : "zh");
    applyI18n();
    // Retranslate everything that is rebuilt from code on demand.
    if (session.currentRoom) {
      renderPlayers(session.currentRoom);
      updateMapVisual(session.currentRoom.config.mapId);
    }
    session.scene?.refreshLocalizedViews();
  });

  $<HTMLInputElement>("gore-toggle").checked = visualPrefs.gore;
  $<HTMLInputElement>("shake-toggle").checked = visualPrefs.shake;
  $<HTMLInputElement>("digits-toggle").checked = visualPrefs.digits;
  $<HTMLInputElement>("lighting-toggle").checked = visualPrefs.lighting;
  const audioPrefs = sfx.getPrefs();
  $<HTMLInputElement>("sound-toggle").checked = !audioPrefs.muted;
  $<HTMLInputElement>("sound-volume").value = String(Math.round(audioPrefs.volume * 100));

  initNet({
    getName: () => $<HTMLInputElement>("name").value,
    onStatus: setStatus,
    onError: showError,
    onMessage: handleMessage,
  });

  $("create").addEventListener("click", () => {
    session.manualConnectionAction = true;
    showError("");
    sfx.ui("ui:click");
    send("create", { name: $<HTMLInputElement>("name").value });
  });
  $("join").addEventListener("click", () => {
    session.manualConnectionAction = true;
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
  $("copy-code").addEventListener("click", async () => {
    await navigator.clipboard?.writeText(session.roomCode);
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
      session.scene?.setVisualPreferences();
    });
  }
  $("sound-toggle").addEventListener("change", () => {
    sfx.setEnabled($<HTMLInputElement>("sound-toggle").checked);
    sfx.ui("ui:click");
  });
  $("sound-volume").addEventListener("input", () => {
    sfx.setVolume(Number($<HTMLInputElement>("sound-volume").value) / 100);
  });
  for (const id of ["map", "lives", "crates", "mobs", "bots", "bot-skill"]) {
    $(id).addEventListener("change", () => {
      const mapId = $<HTMLSelectElement>("map").value as MapId;
      updateMapVisual(mapId);
      send("config", { patch: { mapId, lives: Number($<HTMLSelectElement>("lives").value), crates: $<HTMLInputElement>("crates").checked, mobs: $<HTMLInputElement>("mobs").checked, bots: Number($<HTMLSelectElement>("bots").value), botSkill: $<HTMLSelectElement>("bot-skill").value } });
    });
  }
  // M30: squad mode rides its own host-only message (not the config patch).
  $("teams").addEventListener("change", () => {
    send("set_teams", { teams: Number($<HTMLSelectElement>("teams").value) });
  });
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
  // Tab weapon panel: hold to inspect the loadout (and, in squad matches, the
  // team standings), release to dismiss.
  const weaponPanel = $("weapon-panel");
  const teamPanel = $("team-panel");
  const syncWeaponPanel = (held: boolean) => {
    const show = held && !gameWrap.classList.contains("hidden") && Boolean(session.scene?.hasSnapshot());
    weaponPanel.classList.toggle("hidden", !show);
    // M30: the squad scoreboard shares the Tab overlay in team matches only —
    // FFA keeps the panel exactly as it was (tests pin the loadout layout).
    const squads = (session.currentRoom?.config.teams ?? 0) > 0 && session.currentRoom?.mode !== "sandbox";
    teamPanel.classList.toggle("hidden", !show || !squads);
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
}
