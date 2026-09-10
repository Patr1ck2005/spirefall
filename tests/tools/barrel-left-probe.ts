/**
 * One-off: barrel close-up + left/right weapon mirroring. The pilot's exact
 * screen position comes from the window.__spireSelf hook (render position),
 * so every crop lands precisely. Run: npx tsx tests/tools/barrel-left-probe.ts
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const browser = await chromium.launch({ headless: true, channel: "chromium", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
mkdirSync("test-results/barrel-left-probe", { recursive: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.addInitScript(() => localStorage.setItem("spirefall-lang", "en"));
await page.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.locator("#name").waitFor({ timeout: 20000 });
await page.locator("#name").fill("BarrelProbe");
await page.locator("#create").click();
await page.locator("#lobby:not(.hidden)").waitFor({ timeout: 20000 });
await page.locator("#map").selectOption("factory");
await page.locator("#solo-test").click();
await page.locator("#game-wrap:not(.hidden) canvas").waitFor({ timeout: 20000 });
await page.waitForTimeout(3200);
await page.screenshot({ path: "test-results/barrel-left-probe/barrel.png" });
// Left-facing weapons: sidearm, scatter, sniper, flame — stay at the spawn
// ledge (walking right crosses the ground gap and drops the pilot).
for (const [slot, name] of [["1", "sidearm"], ["2", "scatter"], ["4", "sniper"], ["8", "flame"]] as const) {
  await page.keyboard.down("a");
  await page.waitForTimeout(240);
  await page.keyboard.up("a");
  await page.keyboard.press(slot);
  await page.waitForTimeout(450);
  await page.screenshot({ path: `test-results/barrel-left-probe/left-${name}.png` });
  const pos = await page.evaluate(() => (window as unknown as { __spireSelf?: { x: number; y: number } }).__spireSelf);
  console.log(`${name}: self at ${pos ? `${Math.round(pos.x)},${Math.round(pos.y)}` : "?"}`);
}
await browser.close();
console.log("saved test-results/barrel-left-probe/*.png");
void writeFileSync;
