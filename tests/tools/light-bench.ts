// M25 one-off: A/B the lighting pass cost inside a solo factory sandbox.
// Measures in-page rAF FPS with lighting on vs off (localStorage preset).
import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true, channel: "chromium", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const measure = async (lighting: boolean) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 820 } });
  const page = await context.newPage();
  await page.addInitScript((value: boolean) => {
    localStorage.setItem("spirefall-lang", "en");
    localStorage.setItem("spirefall-visuals", JSON.stringify({ gore: true, shake: true, digits: true, lighting: value }));
  }, lighting);
  await page.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.locator("#name").waitFor({ timeout: 20000 });
  await page.locator("#name").fill("Bench");
  await page.locator("#create").click();
  await page.locator("#lobby:not(.hidden)").waitFor({ timeout: 20000 });
  await page.locator("#map").selectOption("factory");
  await page.locator("#solo-test").click();
  await page.locator("#game-wrap:not(.hidden) canvas").waitFor({ timeout: 20000 });
  await page.keyboard.down("j");
  await page.keyboard.down("k");
  await page.waitForTimeout(2000);
  const stats = await page.evaluate(`new Promise((resolve) => {
    const deltas = [];
    let previous = performance.now();
    const sample = (now) => {
      deltas.push(now - previous);
      previous = now;
      if (deltas.length < 150) requestAnimationFrame(sample);
      else {
        const stable = deltas.slice(5).sort((a, b) => a - b);
        const average = stable.reduce((sum, value) => sum + value, 0) / stable.length;
        resolve({ fps: 1000 / average, p95: stable[Math.floor(stable.length * 0.95)] });
      }
    };
    requestAnimationFrame(sample);
  })`);
  await page.keyboard.up("j");
  await page.keyboard.up("k");
  await context.close();
  return stats;
};
const on = await measure(true);
const off = await measure(false);
await browser.close();
console.log(`lighting ON : ${on.fps.toFixed(1)} FPS (p95 ${on.p95.toFixed(1)}ms)`);
console.log(`lighting OFF: ${off.fps.toFixed(1)} FPS (p95 ${off.p95.toFixed(1)}ms)`);
console.log(`lighting cost: ${(off.fps - on.fps).toFixed(1)} FPS`);
