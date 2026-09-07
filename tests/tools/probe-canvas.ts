/**
 * CI canvas-mount diagnosis: reproduce the exact browser-smoke multiplayer
 * flow against a running server+vite and report every stage's timing plus
 * any pageerror/console error. Run: npx tsx tests/tools/probe-canvas.ts
 */
import { chromium } from "playwright";
import { launchOptions, webUrl } from "../helpers/runtime.js";

const browser = await chromium.launch(launchOptions());
const hostContext = await browser.newContext({ viewport: { width: 1280, height: 820 } });
const guestContext = await browser.newContext({ viewport: { width: 1280, height: 820 } });
const host = await hostContext.newPage();
const guest = await guestContext.newPage();
const errors: string[] = [];
for (const [name, page] of [["host", host], ["guest", guest]] as const) {
  page.on("pageerror", (error) => errors.push(`[pageerror ${name}] ${error.message.slice(0, 200)}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`[console ${name}] ${m.text().slice(0, 200)}`); });
}
const t = (label: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${label}`);
const t0 = Date.now();

await host.goto(webUrl(), { waitUntil: "domcontentloaded", timeout: 60000 });
t("host loaded");
await host.locator("#name").waitFor({ timeout: 30000 });
await host.locator("#name").fill("Alpha");
await host.locator("#create").click();
await host.locator("#lobby:not(.hidden)").waitFor({ timeout: 30000 });
t("host lobby");
const roomCode = (await host.locator("#room-label").textContent())!.trim();

await guest.goto(webUrl(), { waitUntil: "domcontentloaded", timeout: 60000 });
t("guest loaded");
await guest.locator("#name").waitFor({ timeout: 30000 });
await guest.locator("#name").fill("Bravo");
await guest.locator("#room-code").fill(roomCode);
await guest.locator("#join").click();
await guest.locator("#lobby:not(.hidden)").waitFor({ timeout: 30000 });
t("guest lobby");
await host.locator(".player-slot").nth(1).waitFor({ timeout: 30000 });
t("roster 2 players");

await host.locator("#map").selectOption("fortress");
await host.locator("#lives").selectOption("2");
await host.locator("#start").click();
await host.locator("#game-wrap:not(.hidden) canvas").waitFor({ timeout: 20000 });
t("host canvas");
await guest.locator("#game-wrap:not(.hidden) canvas").waitFor({ timeout: 20000 });
t("guest canvas");
await host.keyboard.down("j");
await host.keyboard.down("k");
await host.waitForTimeout(250);
await host.keyboard.up("j");
await host.keyboard.up("k");
await host.waitForTimeout(500);
const hud = await host.locator("#hud-weapon").textContent();
const phase = await host.locator("#hud-phase").textContent();
t(`hud=${JSON.stringify(hud)} phase=${JSON.stringify(phase)}`);
if (!hud?.includes("AMMO") || !phase?.includes("LIVE")) { console.log("ERRORS:", errors); throw new Error("Combat HUD is missing"); }

await guest.reload({ waitUntil: "domcontentloaded" });
await guest.locator("#game-wrap:not(.hidden) canvas").waitFor({ timeout: 20000 });
t("guest canvas after reload");

const soloContext = await browser.newContext({ viewport: { width: 1280, height: 820 } });
const solo = await soloContext.newPage();
solo.on("pageerror", (error) => errors.push(`[pageerror solo] ${error.message.slice(0, 200)}`));
solo.on("console", (m) => { if (m.type() === "error") errors.push(`[console solo] ${m.text().slice(0, 200)}`); });
await solo.goto(webUrl(), { waitUntil: "domcontentloaded", timeout: 60000 });
t("solo loaded");
await solo.locator("#name").waitFor({ timeout: 30000 });
await solo.locator("#name").fill("Solo");
await solo.locator("#create").click();
await solo.locator("#lobby:not(.hidden)").waitFor({ timeout: 30000 });
t("solo lobby");
await solo.locator("#map").selectOption("factory");
await solo.locator("#solo-test").click();
await solo.locator("#game-wrap:not(.hidden) canvas").waitFor({ timeout: 20000 });
t("solo canvas");
await solo.locator("#hud-phase").filter({ hasText: "SOLO TEST" }).waitFor({ timeout: 15000 });
t("solo phase");
console.log("ERRORS:", errors.length ? errors : "none");
await browser.close();
console.log("CANVAS PROBE PASSED");
