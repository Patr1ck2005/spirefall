/**
 * M27 visual acceptance gauge: drives a solo session on each map and captures
 * three phases (idle / firing / explosion), then measures the game canvas'
 * average luma and dark-pixel share. Prints a per-map table so fortress
 * brightening and shadow quality can be judged numerically — a tool for the
 * human eye, not a CI gate. Run: npx tsx tests/tools/light-check.ts
 *
 * Fortress acceptance (from the M27 plan): mean luma within ~15% of factory's.
 *
 * NOTE: the game renders through WebGL without preserveDrawingBuffer, so
 * drawImage(canvas) inside the page yields black frames (the M25 lesson).
 * Every sample therefore goes: composited element screenshot → PNG buffer →
 * injected back into the page as a data URL → 2D canvas → ImageData.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const MAPS = ["canopy", "fortress", "factory"] as const;

const browser = await chromium.launch({ headless: true, channel: "chromium", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
mkdirSync("test-results/light-check", { recursive: true });

type LumaSample = { mean: number; dark: number };
type MapReport = { map: string; idle: number; firing: number; explosion: number; dark: number };
const reports: MapReport[] = [];

/** Screenshot the game canvas, measure its luma, optionally save the PNG. */
async function capture(page: import("playwright").Page, path?: string): Promise<LumaSample> {
  const canvas = page.locator("#game canvas");
  const buffer = await canvas.screenshot();
  if (path) writeFileSync(path, buffer);
  const dataUrl = `data:image/png;base64,${buffer.toString("base64")}`;
  return page.evaluate(async (url) => {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("screenshot decode failed"));
      img.src = url;
    });
    const w = 260;
    const h = 146;
    const probe = document.createElement("canvas");
    probe.width = w;
    probe.height = h;
    const ctx = probe.getContext("2d")!;
    ctx.drawImage(img, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    let sum = 0;
    let dark = 0;
    for (let i = 0; i < data.length; i += 4) {
      const l = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      sum += l;
      if (l < 26) dark++;
    }
    return { mean: sum / (data.length / 4), dark: dark / (data.length / 4) };
  }, dataUrl);
}

for (const mapId of MAPS) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.addInitScript(() => localStorage.setItem("spirefall-lang", "en"));
  await page.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.locator("#name").waitFor({ timeout: 20000 });
  await page.locator("#name").fill("LightCheck");
  await page.locator("#create").click();
  await page.locator("#lobby:not(.hidden)").waitFor({ timeout: 20000 });
  await page.locator("#map").selectOption(mapId);
  await page.locator("#solo-test").click();
  await page.locator("#game-wrap:not(.hidden) canvas").waitFor({ timeout: 20000 });
  // Let the veil fade settle (M27 fade ~0.6s) and the pilot land.
  await page.waitForTimeout(3000);

  const idle = await capture(page, `test-results/light-check/${mapId}-idle.png`);

  // Firing: hold primary for a burst, catch a frame mid-fire.
  await page.keyboard.down("j");
  await page.waitForTimeout(650);
  const firing = await capture(page, `test-results/light-check/${mapId}-firing.png`);
  await page.keyboard.up("j");

  // Explosion: fire the rocket slot (weapon 5), poll luma every 120ms for 3s
  // and keep the brightest frame as the blast sample.
  await page.keyboard.press("5");
  await page.waitForTimeout(400);
  let explosion = idle;
  let bestMean = 0;
  await page.keyboard.down("j");
  for (let i = 0; i < 25; i++) {
    await page.waitForTimeout(120);
    const sample = await capture(page, i === 8 ? `test-results/light-check/${mapId}-explosion.png` : undefined);
    if (sample.mean > bestMean) {
      bestMean = sample.mean;
      explosion = sample;
    }
  }
  await page.keyboard.up("j");
  reports.push({ map: mapId, idle: idle.mean, firing: firing.mean, explosion: explosion.mean, dark: idle.dark });
  await page.close();
}

await browser.close();
console.log("map       idle-luma  fire-luma  blast-luma  dark-share(idle)");
for (const r of reports) {
  console.log(`${r.map.padEnd(9)} ${r.idle.toFixed(1).padStart(9)} ${r.firing.toFixed(1).padStart(10)} ${r.explosion.toFixed(1).padStart(11)} ${`${(r.dark * 100).toFixed(1)}%`.padStart(12)}`);
}
const fortress = reports.find((r) => r.map === "fortress")!;
const factory = reports.find((r) => r.map === "factory")!;
const ratio = fortress.idle / factory.idle;
console.log(`\nfortress/factory idle-luma ratio: ${ratio.toFixed(2)} (target ≥ 0.85)`);
console.log(`reports saved under test-results/light-check/`);
