/**
 * One-off: facing-left weapon check + blade dash flashbulb. Solo factory,
 * walk LEFT (pilot faces left), screenshot with sidearm; switch to blade and
 * fire K (dash slash) for the flashbulb frame. Run: npx tsx tests/tools/left-probe.ts
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const browser = await chromium.launch({ headless: true, channel: "chromium", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
mkdirSync("test-results/left-probe", { recursive: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.addInitScript(() => localStorage.setItem("spirefall-lang", "en"));
await page.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.locator("#name").waitFor({ timeout: 20000 });
await page.locator("#name").fill("LeftProbe");
await page.locator("#create").click();
await page.locator("#lobby:not(.hidden)").waitFor({ timeout: 20000 });
await page.locator("#map").selectOption("factory");
await page.locator("#solo-test").click();
await page.locator("#game-wrap:not(.hidden) canvas").waitFor({ timeout: 20000 });
await page.waitForTimeout(3000);
// Face left and fire the sidearm.
await page.keyboard.down("a");
await page.waitForTimeout(350);
await page.keyboard.down("j");
await page.waitForTimeout(240);
await page.screenshot({ path: "test-results/left-probe/left-sidearm.png" });
await page.keyboard.up("j");
await page.keyboard.up("a");
// Blade dash slash toward the left.
await page.keyboard.press("6");
await page.waitForTimeout(400);
await page.keyboard.down("a");
await page.keyboard.down("k");
await page.waitForTimeout(200);
await page.screenshot({ path: "test-results/left-probe/blade-dash.png" });
await page.waitForTimeout(150);
await page.screenshot({ path: "test-results/left-probe/blade-dash2.png" });
await page.keyboard.up("k");
await page.keyboard.up("a");
await browser.close();
console.log("saved test-results/left-probe/*.png");
