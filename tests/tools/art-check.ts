// M25 one-off: capture a zoomed solo-sandbox screenshot of the new pilot art
// on a given map. Usage: npx tsx tests/tools/art-check.ts [canopy|fortress|factory]
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const mapId = (process.argv[2] ?? "canopy") as "canopy" | "fortress" | "factory";
const browser = await chromium.launch({ headless: true, channel: "chromium", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.addInitScript(() => localStorage.setItem("spirefall-lang", "en"));
await page.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.locator("#name").waitFor({ timeout: 20000 });
await page.locator("#name").fill("ArtCheck");
await page.locator("#create").click();
await page.locator("#lobby:not(.hidden)").waitFor({ timeout: 20000 });
await page.locator("#map").selectOption(mapId);
await page.locator("#solo-test").click();
await page.locator("#game-wrap:not(.hidden) canvas").waitFor({ timeout: 20000 });
// Let crates/barrels spawn and the pilot settle.
await page.waitForTimeout(4500);
// A few frames of running so the gait is visible in the capture.
await page.keyboard.down("d");
await page.waitForTimeout(400);
await page.screenshot({ path: `test-results/art-${mapId}-full.png` });
// Zoomed 2x crop around the pilot via the canvas bitmap (canvas is 1300x728
// at RENDER_SCALE 1.3; crop the central 560x420 region and blow it up).
const crop = await page.evaluate(() => {
  const canvas = document.querySelector<HTMLCanvasElement>("#game canvas");
  if (!canvas) return "";
  const out = document.createElement("canvas");
  out.width = 1120;
  out.height = 840;
  const ctx = out.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  const srcW = 560 * (canvas.width / 1300);
  const srcH = 420 * (canvas.width / 1300);
  ctx.drawImage(canvas, canvas.width / 2 - srcW / 2, canvas.height / 2 - srcH / 2, srcW, srcH, 0, 0, 1120, 840);
  return out.toDataURL("image/png");
});
await browser.close();
mkdirSync("test-results", { recursive: true });
writeFileSync(`test-results/art-${mapId}-zoom.png`, Buffer.from(crop.replace(/^data:image\/png;base64,/, ""), "base64"));
console.log(`saved test-results/art-${mapId}-full.png and art-${mapId}-zoom.png`);
