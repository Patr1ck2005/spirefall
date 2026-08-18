import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const browser = await chromium.launch({ headless: true, executablePath: edge });
const contexts = await Promise.all(Array.from({ length: 4 }, () => browser.newContext({ viewport: { width: 1280, height: 820 } })));
const pages = await Promise.all(contexts.map((context) => context.newPage()));

await pages[0].goto("http://127.0.0.1:5173", { waitUntil: "networkidle" });
await pages[0].locator("#name").fill("Load-1");
await pages[0].locator("#create").click();
await pages[0].locator("#lobby:not(.hidden)").waitFor();
const roomCode = (await pages[0].locator("#room-label").textContent())!.trim();

for (let index = 1; index < pages.length; index++) {
  await pages[index].goto("http://127.0.0.1:5173", { waitUntil: "networkidle" });
  await pages[index].locator("#name").fill(`Load-${index + 1}`);
  await pages[index].locator("#room-code").fill(roomCode);
  await pages[index].locator("#join").click();
  await pages[index].locator("#lobby:not(.hidden)").waitFor();
}
await pages[0].locator(".player-slot:not(.empty)").nth(3).waitFor();
await pages[0].locator("#map").selectOption("factory");
await pages[0].locator("#start").click();
await Promise.all(pages.map((page) => page.locator("#game-wrap:not(.hidden) canvas").waitFor({ timeout: 8000 })));

await Promise.all(pages.flatMap((page) => [page.keyboard.down("j"), page.keyboard.down("k")]));
const frameStats = await pages[0].evaluate(`new Promise((resolve) => {
  const deltas = [];
  let previous = performance.now();
  const sample = (now) => {
    deltas.push(now - previous);
    previous = now;
    if (deltas.length < 120) requestAnimationFrame(sample);
    else {
      const stable = deltas.slice(5).sort((a, b) => a - b);
      const averageMs = stable.reduce((sum, value) => sum + value, 0) / stable.length;
      resolve({ averageMs, p95Ms: stable[Math.floor(stable.length * 0.95)], fps: 1000 / averageMs });
    }
  };
  requestAnimationFrame(sample);
})`) as { averageMs: number; p95Ms: number; fps: number };
await Promise.all(pages.flatMap((page) => [page.keyboard.up("j"), page.keyboard.up("k")]));

if (frameStats.fps < 45 || frameStats.p95Ms > 45) {
  throw new Error(`Four-player render performance is below tolerance: ${JSON.stringify(frameStats)}`);
}
await mkdir("test-results", { recursive: true });
await pages[0].screenshot({ path: "test-results/performance-4p.png", fullPage: true });
await browser.close();
console.log(`performance smoke passed: ${frameStats.fps.toFixed(1)} FPS average, ${frameStats.p95Ms.toFixed(1)} ms p95`);
