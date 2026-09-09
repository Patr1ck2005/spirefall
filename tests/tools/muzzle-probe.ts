/**
 * One-off M27b visual probe: solo factory, hold fire at the cover wall and
 * capture (1) the firing frame zoomed around the pilot and (2) a couple of
 * late frames. Also grabs the muzzle-area crop via canvas drawImage probe.
 * Run: npx tsx tests/tools/muzzle-probe.ts
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const browser = await chromium.launch({ headless: true, channel: "chromium", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
mkdirSync("test-results/muzzle-probe", { recursive: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.addInitScript(() => localStorage.setItem("spirefall-lang", "en"));
await page.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.locator("#name").waitFor({ timeout: 20000 });
await page.locator("#name").fill("MuzzleProbe");
await page.locator("#create").click();
await page.locator("#lobby:not(.hidden)").waitFor({ timeout: 20000 });
await page.locator("#map").selectOption("factory");
await page.locator("#solo-test").click();
await page.locator("#game-wrap:not(.hidden) canvas").waitFor({ timeout: 20000 });
await page.waitForTimeout(3200);
// Walk right a bit so the pilot stands near mid-field, then hold fire.
await page.keyboard.down("d");
await page.waitForTimeout(600);
await page.keyboard.up("d");
await page.keyboard.down("j");
await page.waitForTimeout(240);
await page.screenshot({ path: "test-results/muzzle-probe/firing-early.png" });
await page.waitForTimeout(400);
await page.screenshot({ path: "test-results/muzzle-probe/firing-mid.png" });
// A rocket for a big blast + strong shadows.
await page.keyboard.up("j");
await page.keyboard.press("5");
await page.waitForTimeout(400);
await page.keyboard.down("j");
await page.waitForTimeout(500);
await page.screenshot({ path: "test-results/muzzle-probe/blast.png" });
await page.keyboard.up("j");
await browser.close();
console.log("saved test-results/muzzle-probe/*.png");
void writeFileSync;
