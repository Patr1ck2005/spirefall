import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const browser = await chromium.launch({ headless: true, executablePath: edge });
const hostContext = await browser.newContext({ viewport: { width: 1280, height: 820 } });
const guestContext = await browser.newContext({ viewport: { width: 1280, height: 820 } });
const host = await hostContext.newPage();
const guest = await guestContext.newPage();

await host.goto("http://127.0.0.1:5173", { waitUntil: "networkidle" });
await host.locator("#name").fill("Alpha");
await host.locator("#create").click();
await host.locator("#lobby:not(.hidden)").waitFor();
const roomCode = (await host.locator("#room-label").textContent())!.trim();

await guest.goto("http://127.0.0.1:5173", { waitUntil: "networkidle" });
await guest.locator("#name").fill("Bravo");
await guest.locator("#room-code").fill(roomCode);
await guest.locator("#join").click();
await guest.locator("#lobby:not(.hidden)").waitFor();
await host.locator(".player-slot").nth(1).waitFor();

await host.locator("#map").selectOption("fortress");
await host.locator("#lives").selectOption("2");
await host.locator("#start").click();
await host.locator("#game-wrap:not(.hidden) canvas").waitFor({ timeout: 8000 });
await guest.locator("#game-wrap:not(.hidden) canvas").waitFor({ timeout: 8000 });
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

await guest.reload({ waitUntil: "networkidle" });
await guest.locator("#game-wrap:not(.hidden) canvas").waitFor({ timeout: 8000 });

const soloContext = await browser.newContext({ viewport: { width: 1280, height: 820 } });
const solo = await soloContext.newPage();
await solo.goto("http://127.0.0.1:5173", { waitUntil: "networkidle" });
await solo.locator("#name").fill("Solo");
await solo.locator("#create").click();
await solo.locator("#lobby:not(.hidden)").waitFor();
if (await solo.locator("#start").isEnabled()) throw new Error("Normal match start was enabled for one player");
if (!(await solo.locator("#solo-test").isEnabled())) throw new Error("Solo test was not enabled for the room host");
await solo.locator("#map").selectOption("factory");
await solo.locator("#solo-test").click();
await solo.locator("#game-wrap:not(.hidden) canvas").waitFor({ timeout: 8000 });
await solo.locator("#hud-phase").filter({ hasText: "SOLO TEST" }).waitFor();
// Fresh state for the FX checks: respawn first so no residual effects linger.
await solo.locator("#sandbox-respawn").click();
await solo.waitForTimeout(1900);

// Switch helpers: the weapon-slot message is sent once per keypress, so a
// respawn freeze can swallow it — retry until the HUD confirms the switch.
async function selectWeapon(page: import("playwright").Page, key: string, label: string) {
  for (let attempt = 0; attempt < 5; attempt++) {
    await page.keyboard.press(key);
    try {
      await page.locator("#hud-weapon").filter({ hasText: label }).waitFor({ timeout: 1500 });
      return;
    } catch { /* swallowed by a respawn freeze — retry */ }
  }
  throw new Error(`Weapon switch to ${label} never appeared on the HUD`);
}

// --- M16/M17 combat-feedback checks first, while the pilot is freshly spawned ---
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
const rangeBars = await solo.locator("#weapon-panel .range-bar").count();
if (rangeBars < 12) throw new Error(`Weapon panel is missing range bars (found ${rangeBars}, need >= 12 for 6 weapons × PRI/SEC)`);
const firstRange = await solo.locator("#weapon-panel .range-bar em").first().getAttribute("style");
if (!firstRange?.includes("--range")) throw new Error("Range bar lacks its --range width variable");
await solo.keyboard.up("Tab");
await solo.locator("#weapon-panel.hidden").waitFor({ state: "attached", timeout: 3000 });

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
  await solo.locator("#game-wrap:not(.hidden) canvas").waitFor({ timeout: 8000 });
  await solo.waitForTimeout(450);
  await solo.screenshot({ path: `test-results/${filename}`, fullPage: true });
  await solo.locator("#sandbox-return").click();
  await solo.locator("#lobby:not(.hidden)").waitFor();
}

await browser.close();
console.log(`browser smoke test passed for room ${roomCode}`);
