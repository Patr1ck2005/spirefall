/**
 * One-off: Voltrail charge + full-charge rail shots. Solo factory, slot 4,
 * hold J ~2.2s (charge saturates at 1.1s) capturing mid-charge and full-charge
 * frames, release, then capture the rail tracer + muzzle blast frame.
 * Run: npx tsx tests/tools/rail-probe.ts
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const browser = await chromium.launch({ headless: true, channel: "chromium", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
mkdirSync("test-results/rail-probe", { recursive: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.addInitScript(() => localStorage.setItem("spirefall-lang", "en"));
await page.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.locator("#name").waitFor({ timeout: 20000 });
await page.locator("#name").fill("RailProbe");
await page.locator("#create").click();
await page.locator("#lobby:not(.hidden)").waitFor({ timeout: 20000 });
await page.locator("#map").selectOption("factory");
await page.locator("#solo-test").click();
await page.locator("#game-wrap:not(.hidden) canvas").waitFor({ timeout: 20000 });
await page.waitForTimeout(3000);
await page.keyboard.press("4");
await page.waitForTimeout(400);
await page.keyboard.down("j");
await page.waitForTimeout(600);
await page.screenshot({ path: "test-results/rail-probe/charge-mid.png" });
await page.waitForTimeout(700);
await page.screenshot({ path: "test-results/rail-probe/charge-full.png" });
await page.keyboard.up("j");
await page.waitForTimeout(90);
await page.screenshot({ path: "test-results/rail-probe/rail-release.png" });
await page.waitForTimeout(160);
await page.screenshot({ path: "test-results/rail-probe/rail-after.png" });
await browser.close();
console.log("saved test-results/rail-probe/*.png");
