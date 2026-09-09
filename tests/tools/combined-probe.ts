/**
 * One-off: strict line light + left-facing + blade flashbulb — stationary
 * version (walking into gaps killed the pilot and swallowed the shots).
 * Run: npx tsx tests/tools/combined-probe.ts
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const browser = await chromium.launch({ headless: true, channel: "chromium", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
mkdirSync("test-results/combined-probe", { recursive: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.addInitScript(() => localStorage.setItem("spirefall-lang", "en"));
await page.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.locator("#name").waitFor({ timeout: 20000 });
await page.locator("#name").fill("ComboProbe");
await page.locator("#create").click();
await page.locator("#lobby:not(.hidden)").waitFor({ timeout: 20000 });
await page.locator("#map").selectOption("factory");
await page.locator("#solo-test").click();
await page.locator("#game-wrap:not(.hidden) canvas").waitFor({ timeout: 20000 });
await page.waitForTimeout(3200);
// 1) Tap A to face LEFT, hold sidearm fire — weapon mirroring check.
await page.keyboard.down("a");
await page.waitForTimeout(260);
await page.keyboard.up("a");
await page.waitForTimeout(120);
await page.keyboard.down("j");
await page.waitForTimeout(240);
await page.screenshot({ path: "test-results/combined-probe/1-left-sidearm.png" });
await page.keyboard.up("j");
// 2) Rail: face RIGHT, full charge, release — strict line light.
await page.keyboard.down("d");
await page.waitForTimeout(200);
await page.keyboard.up("d");
await page.keyboard.press("4");
await page.waitForTimeout(400);
await page.keyboard.down("j");
await page.waitForTimeout(1500);
await page.keyboard.up("j");
await page.waitForTimeout(80);
await page.screenshot({ path: "test-results/combined-probe/2-rail-line.png" });
await page.waitForTimeout(160);
await page.screenshot({ path: "test-results/combined-probe/3-rail-late.png" });
// 3) Blade dash slash to the right — flashbulb.
await page.keyboard.press("6");
await page.waitForTimeout(450);
await page.keyboard.down("d");
await page.keyboard.down("k");
await page.waitForTimeout(210);
await page.screenshot({ path: "test-results/combined-probe/4-blade-flash.png" });
await page.keyboard.up("k");
await page.keyboard.up("d");
await browser.close();
console.log("saved test-results/combined-probe/*.png");
