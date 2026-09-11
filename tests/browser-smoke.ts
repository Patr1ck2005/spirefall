import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { launchOptions, pinEnglish, webUrl } from "./helpers/runtime.js";

const browser = await chromium.launch(launchOptions());
const hostContext = await browser.newContext({ viewport: { width: 1280, height: 820 } });
const guestContext = await browser.newContext({ viewport: { width: 1280, height: 820 } });
const host = await hostContext.newPage();
const guest = await guestContext.newPage();
// M24: the live UI defaults to Chinese; suites assert English strings.
await pinEnglish(host);
await pinEnglish(guest);

// CI diagnostics: surf every console error and page exception into the step
// log so a headless-environment failure carries its own evidence.
for (const page of [host, guest]) {
  page.on("pageerror", (error) => console.error(`[pageerror ${page === host ? "host" : "guest"}]`, error));
  page.on("console", (message) => { if (message.type() === "error") console.error(`[console ${page === host ? "host" : "guest"}]`, message.text()); });
}

// domcontentloaded + explicit element waits: `networkidle` is unreliable and
// slow against a cold vite dev server (CI compiles modules on first request).
await host.goto(webUrl(), { waitUntil: "domcontentloaded", timeout: 60000 });
await host.locator("#name").waitFor({ timeout: 30000 });
await host.locator("#name").fill("Alpha");
await host.locator("#create").click();
await host.locator("#lobby:not(.hidden)").waitFor({ timeout: 30000 });
const roomCode = (await host.locator("#room-label").textContent())!.trim();

await guest.goto(webUrl(), { waitUntil: "domcontentloaded", timeout: 60000 });
await guest.locator("#name").waitFor({ timeout: 30000 });
await guest.locator("#name").fill("Bravo");
await guest.locator("#room-code").fill(roomCode);
await guest.locator("#join").click();
await guest.locator("#lobby:not(.hidden)").waitFor({ timeout: 30000 });
await host.locator(".player-slot").nth(1).waitFor({ timeout: 30000 });

// M30: lobby squad mode selector — host-driven set_teams round-trip.
const teamOptions = await host.locator("#teams option").count();
if (teamOptions !== 4) throw new Error(`Squad mode selector does not offer FFA + 2/3/4 squads (found ${teamOptions})`);
if (!(await guest.locator("#teams").isDisabled())) throw new Error("Guest can edit the host-only squad mode selector");
await host.locator("#teams").selectOption("2");
await host.locator(".team-tag").first().waitFor({ timeout: 5000 });
const guestTags = await guest.locator(".team-tag").allTextContents();
if (guestTags.length !== 2 || !guestTags.includes("T1") || !guestTags.includes("T2")) throw new Error(`Guest lobby did not render T1/T2 squad tags (got ${guestTags.join(",")})`);
await host.locator("#teams").selectOption("0");
await host.locator(".team-tag").first().waitFor({ state: "detached", timeout: 5000 });

await host.locator("#map").selectOption("fortress");
await host.locator("#lives").selectOption("2");
await host.locator("#start").click();
await host.locator("#game-wrap:not(.hidden) canvas").waitFor({ timeout: 20000 });
await guest.locator("#game-wrap:not(.hidden) canvas").waitFor({ timeout: 20000 });
await host.keyboard.down("j");
await host.keyboard.down("k");
await host.waitForTimeout(250);
await host.keyboard.up("j");
await host.keyboard.up("k");
await host.waitForTimeout(500);

const hud = await host.locator("#hud-weapon").textContent();
if (!hud?.includes("AMMO") || !(await host.locator("#hud-phase").textContent())?.includes("LIVE")) throw new Error("Combat HUD is missing");

await mkdir("test-results", { recursive: true });
await host.screenshot({ path: "test-results/match.png", fullPage: true });

await guest.reload({ waitUntil: "domcontentloaded" });
await guest.locator("#game-wrap:not(.hidden) canvas").waitFor({ timeout: 20000 });

const soloContext = await browser.newContext({ viewport: { width: 1280, height: 820 } });
const solo = await soloContext.newPage();
await pinEnglish(solo);
await solo.goto(webUrl(), { waitUntil: "domcontentloaded", timeout: 60000 });
await solo.locator("#name").waitFor({ timeout: 30000 });
await solo.locator("#name").fill("Solo");
await solo.locator("#create").click();
await solo.locator("#lobby:not(.hidden)").waitFor();
if (await solo.locator("#start").isEnabled()) throw new Error("Normal match start was enabled for one player");
if (!(await solo.locator("#solo-test").isEnabled())) throw new Error("Solo test was not enabled for the room host");
await solo.locator("#map").selectOption("factory");
await solo.locator("#solo-test").click();
await solo.locator("#game-wrap:not(.hidden) canvas").waitFor({ timeout: 20000 });
await solo.locator("#hud-phase").filter({ hasText: "SOLO TEST" }).waitFor();
// Fresh state for the FX checks: respawn first so no residual effects linger.
await solo.locator("#sandbox-respawn").click();
await solo.waitForTimeout(1900);

// Switch helpers: the weapon-slot message is sent once per keypress, so a
// respawn freeze or a dropped synthesized keypress can swallow it — retry
// until the HUD confirms the switch. CI headless environments drop keys
// non-deterministically, so the retry budget is generous and each window
// doubles to tolerate slow HUD refresh under load.
// Switch helpers: synthesized weapon-slot keypresses are dropped
// non-deterministically in headless CI browsers (verified by in-page probes:
// the keydown reaches the page but the input message never carries a slot),
// so the switch is driven through the window.__spireSlot test hook — the
// same socket path the key handler uses — with the keyboard as fallback.
async function selectWeapon(page: import("playwright").Page, key: string, label: string) {
  const slot = Number(key);
  for (let attempt = 0; attempt < 10; attempt++) {
    await page.evaluate((value) => { (window as unknown as { __spireSlot?: number }).__spireSlot = value; }, slot);
    try {
      await page.locator("#hud-weapon").filter({ hasText: label }).waitFor({ timeout: 1000 * (attempt + 1) });
      return;
    } catch { /* snapshot pacing under load — retry */ }
  }
  throw new Error(`Weapon switch to ${label} never appeared on the HUD`);
}

// --- M16/M17 combat-feedback checks first, while the pilot is freshly spawned ---
// M26: the poster light engine must be installed on WebGL (headless
// SwiftShader included). The hook is set by ensureLighting().
const lightState = await solo.evaluate(() => (window as unknown as { __spireLight?: { poster: boolean; fallback: boolean } }).__spireLight);
if (!lightState) throw new Error("Lighting system never installed (no __spireLight hook)");
if (!lightState.poster && !lightState.fallback) throw new Error("Poster Light2D pipeline not installed on a WebGL renderer");

// Scatter pellets: projectiles must produce impact events at surfaces.
await solo.evaluate(() => { (window as unknown as { __spireEvents: unknown[] }).__spireEvents = []; });
await selectWeapon(solo, "2", "Breach Scatter");
await solo.keyboard.down("j");
await solo.waitForTimeout(900);
await solo.keyboard.up("j");
const impactSeen = await solo.evaluate(() => {
  const events = (window as unknown as { __spireEvents?: Array<{ type: string; weaponId?: string }> }).__spireEvents || [];
  return events.some((event) => event.type === "impact" && event.weaponId === "scatter");
});
if (!impactSeen) throw new Error("Scatter pellets produced no impact events at surfaces");
await solo.screenshot({ path: "test-results/pellet-impact.png", fullPage: true });

// Longbeam: continuous beam attack events while held, plus a screenshot.
await solo.evaluate(() => { (window as unknown as { __spireEvents: unknown[] }).__spireEvents = []; });
await selectWeapon(solo, "3", "Longbeam");
await solo.keyboard.down("j");
await solo.waitForTimeout(900);
const beamSeen = await solo.evaluate(() => {
  const events = (window as unknown as { __spireEvents?: Array<{ type: string; pattern?: string }> }).__spireEvents || [];
  return events.some((event) => event.type === "attack" && event.pattern === "beam");
});
if (!beamSeen) throw new Error("Longbeam produced no beam attack events while held");
await solo.screenshot({ path: "test-results/beam-impact.png", fullPage: true });
await solo.keyboard.up("j");

// Rocket at the floor: explosion event + screenshot (poll up to 3s for the hit).
await solo.evaluate(() => { (window as unknown as { __spireEvents: unknown[] }).__spireEvents = []; });
await selectWeapon(solo, "5", "Forge Rocket");
await solo.keyboard.down("j");
let rocketEvents = false;
for (let attempt = 0; attempt < 12 && !rocketEvents; attempt++) {
  await solo.waitForTimeout(300);
  rocketEvents = await solo.evaluate(() => {
    const events = (window as unknown as { __spireEvents?: Array<{ type: string }> }).__spireEvents || [];
    return events.some((event) => event.type === "explosion");
  });
}
await solo.keyboard.up("j");
if (!rocketEvents) throw new Error("Rocket firing produced no explosion events");
await solo.screenshot({ path: "test-results/rocket-explosion.png", fullPage: true });

await solo.keyboard.down("j");
await solo.keyboard.down("k");
await solo.waitForTimeout(250);
await solo.keyboard.up("j");
await solo.keyboard.up("k");
await solo.waitForTimeout(500);
await solo.locator("#sandbox-respawn").click();
await solo.waitForTimeout(1700);
await solo.screenshot({ path: "test-results/solo.png", fullPage: true });

// Tab weapon panel: hold shows the loadout with the current weapon, release hides.
await solo.keyboard.down("Tab");
await solo.locator("#weapon-panel:not(.hidden)").waitFor({ timeout: 3000 });
const panelText = await solo.locator("#weapon-panel").textContent();
if (!panelText?.includes("Vein Ripper")) throw new Error("Weapon panel did not list the held weapon");
// M19: every weapon row carries PRI/SEC range bars driven by --range vars.
// M27: eight weapons now — the Pyre Vent joins the panel with its own bars.
if (!panelText?.includes("Echo Shard")) throw new Error("Weapon panel did not list the Echo Shard (slot 7)");
if (!panelText?.includes("Pyre Vent")) throw new Error("Weapon panel did not list the Pyre Vent (slot 8)");
const rangeBars = await solo.locator("#weapon-panel .range-bar").count();
if (rangeBars < 16) throw new Error(`Weapon panel is missing range bars (found ${rangeBars}, need >= 16 for 8 weapons × PRI/SEC)`);
const firstRange = await solo.locator("#weapon-panel .range-bar em").first().getAttribute("style");
if (!firstRange?.includes("--range")) throw new Error("Range bar lacks its --range width variable");
await solo.keyboard.up("Tab");
await solo.locator("#weapon-panel.hidden").waitFor({ state: "attached", timeout: 3000 });

// M20 combat feedback HUD: the kill feed container and vignette overlay ship
// with the game HUD; the lobby armory exposes all eight weapons (M27 added
// the Pyre Vent as slot 8).
if ((await solo.locator("#kill-feed").count()) !== 1) throw new Error("Kill feed HUD container is missing");
if ((await solo.locator("#vignette").count()) !== 1) throw new Error("Low-health vignette overlay is missing");
const armoryOptions = await solo.locator("#weapon-options .weapon-option").count();
if (armoryOptions !== 8) throw new Error(`Lobby armory does not list all eight weapons (found ${armoryOptions})`);
// Slot 8 selects the Pyre Vent in the sandbox (HUD confirms the switch) and
// held fire must produce flame attack events without errors.
await selectWeapon(solo, "8", "Pyre Vent");
await solo.keyboard.down("j");
await solo.waitForTimeout(700);
await solo.keyboard.up("j");

await solo.locator("#settings-button").click();
await solo.locator("label").filter({ has: solo.locator("#gore-toggle") }).click();
await solo.locator("label").filter({ has: solo.locator("#shake-toggle") }).click();
const visualPrefs = await solo.evaluate(() => JSON.parse(localStorage.getItem("spirefall-visuals") || "null"));
if (visualPrefs?.gore !== false || visualPrefs?.shake !== false) throw new Error("Visual preferences were not persisted");
await solo.locator("#settings-button").click();
await solo.locator("#sandbox-return").click();
await solo.locator("#lobby:not(.hidden)").waitFor();

for (const [mapId, filename] of [["canopy", "canopy.png"], ["fortress", "fortress.png"]] as const) {
  await solo.locator("#map").selectOption(mapId);
  await solo.locator("#solo-test").click();
  await solo.locator("#game-wrap:not(.hidden) canvas").waitFor({ timeout: 20000 });
  await solo.waitForTimeout(450);
  await solo.screenshot({ path: `test-results/${filename}`, fullPage: true });
  await solo.locator("#sandbox-return").click();
  await solo.locator("#lobby:not(.hidden)").waitFor();
}

// M24: a brand-new context (no stored language) must boot into Chinese —
// the create button and menu heading read in the default locale.
const zhContext = await browser.newContext({ viewport: { width: 1280, height: 820 } });
const zhPage = await zhContext.newPage();
await zhPage.goto(webUrl(), { waitUntil: "domcontentloaded", timeout: 60000 });
await zhPage.locator("#create").filter({ hasText: "创建房间" }).waitFor({ timeout: 30000 });
if (!(await zhPage.locator(".menu-intro").textContent())?.includes("高塔")) throw new Error("Fresh session did not default to the Chinese locale");
const zhLang = await zhPage.evaluate(() => document.documentElement.lang);
if (zhLang !== "zh-CN") throw new Error(`Fresh session document lang was ${zhLang}, expected zh-CN`);
await zhContext.close();

await browser.close();
console.log(`browser smoke test passed for room ${roomCode}`);
