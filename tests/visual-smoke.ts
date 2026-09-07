import { chromium, type Page } from "playwright";
import { mkdir } from "node:fs/promises";
import { launchOptions, webUrl } from "./helpers/runtime.js";
const viewports = [
  { width: 1024, height: 768, name: "1024x768" },
  { width: 1280, height: 820, name: "1280x820" },
  { width: 1440, height: 900, name: "1440x900" },
  { width: 1920, height: 1080, name: "1920x1080" },
] as const;

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

async function assertNoOverflow(page: Page, viewportName: string) {
  const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const viewportWidth = page.viewportSize()!.width;
  assert(pageWidth <= viewportWidth + 1, `${viewportName} creates horizontal page overflow (${pageWidth}px > ${viewportWidth}px)`);
  const issues = await page.evaluate(() => {
    const selectors = "button, input:not([type='checkbox']), select, .player-slot strong, .player-slot small, .weapon-option span:last-child";
    return [...document.querySelectorAll<HTMLElement>(selectors)].flatMap((element) => {
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") return [];
      const rect = element.getBoundingClientRect();
      const clippedText = element.scrollWidth > element.clientWidth + 3 && style.textOverflow !== "ellipsis";
      const outside = rect.left < -1 || rect.right > window.innerWidth + 1;
      return clippedText || outside ? [`${element.tagName.toLowerCase()}#${element.id || element.className}`] : [];
    });
  });
  assert(issues.length === 0, `${viewportName} contains clipped or offscreen controls: ${issues.join(", ")}`);
}

await mkdir("test-results/visual", { recursive: true });
const browser = await chromium.launch(launchOptions());

for (const viewport of viewports) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const page = await context.newPage();
  page.on("pageerror", (error) => console.error(`[pageerror ${viewport.name}]`, error));
  await page.goto(webUrl(), { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.locator("#name").waitFor({ timeout: 30000 });
  await page.screenshot({ path: `test-results/visual/menu-${viewport.name}.png`, fullPage: true });
  await assertNoOverflow(page, `${viewport.name} menu`);

  await page.locator("#name").fill(`QA-${viewport.width}`);
  await page.locator("#create").click();
  await page.locator("#lobby:not(.hidden)").waitFor({ timeout: 30000 });
  await page.screenshot({ path: `test-results/visual/lobby-${viewport.name}.png`, fullPage: true });
  await assertNoOverflow(page, `${viewport.name} lobby`);

  await page.locator("#solo-test").click();
  const canvas = page.locator("#game-wrap:not(.hidden) canvas");
  await canvas.waitFor({ timeout: 20000 });
  await page.waitForTimeout(550);
  const canvasDataLength = await canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL("image/png").length);
  assert(canvasDataLength > 5000, `${viewport.name} canvas appears blank`);
  const layout = await page.evaluate(() => {
    const wrap = document.querySelector<HTMLElement>("#game-wrap")!.getBoundingClientRect();
    const weapon = document.querySelector<HTMLElement>("#hud-weapon")!.getBoundingClientRect();
    const limbs = document.querySelector<HTMLElement>("#hud-limbs")!.getBoundingClientRect();
    const overlaps = !(weapon.right < limbs.left || limbs.right < weapon.left || weapon.bottom < limbs.top || limbs.bottom < weapon.top);
    return { ratio: wrap.width / wrap.height, right: wrap.right, viewport: window.innerWidth, overlaps };
  });
  assert(Math.abs(layout.ratio - 1000 / 560) < 0.02, `${viewport.name} game canvas ratio changed`);
  assert(layout.right <= layout.viewport + 1, `${viewport.name} game canvas exceeds the viewport`);
  assert(!layout.overlaps, `${viewport.name} bottom HUD panels overlap`);
  await page.screenshot({ path: `test-results/visual/game-${viewport.name}.png`, fullPage: true });
  await context.close();
}

await browser.close();
console.log("visual smoke test passed for 4 desktop viewports");
