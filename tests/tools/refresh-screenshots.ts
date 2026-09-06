/**
 * M20 screenshot refresh: drives a solo session through the lobby and every
 * map, plus a live Fortress duel and a four-player load frame, then converts
 * the PNG captures into the JPEG gallery under docs/screenshots/.
 *
 * Requires the game server (8787) and vite (5173) running locally.
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { launchOptions, webUrl } from "../helpers/runtime.js";

await mkdir("test-results/gallery", { recursive: true });
const browser = await chromium.launch(launchOptions());
const context = await browser.newContext({ viewport: { width: 1280, height: 820 } });
const page = await context.newPage();

const capture = async (name: string) => {
  await page.screenshot({ path: `test-results/gallery/${name}.png`, fullPage: true });
  console.log(`captured ${name}`);
};

await page.goto(webUrl(), { waitUntil: "networkidle" });
await capture("menu");

await page.locator("#name").fill("Gallery");
await page.locator("#create").click();
await page.locator("#lobby:not(.hidden)").waitFor();
await capture("lobby");

for (const mapId of ["canopy", "fortress", "factory"] as const) {
  await page.locator("#map").selectOption(mapId);
  await page.locator("#solo-test").click();
  await page.locator("#game-wrap:not(.hidden) canvas").waitFor({ timeout: 8000 });
  await page.waitForTimeout(650);
  await capture(mapId);
  await page.locator("#sandbox-return").click();
  await page.locator("#lobby:not(.hidden)").waitFor();
}

// Live Fortress duel (host + one bot) for the hero match shot. Hold primary
// fire and poll for a kill-feed entry so the frame showcases the M20 combat
// feedback; fall back to a plain combat frame if no feed row appears.
await page.locator("#map").selectOption("fortress");
await page.locator("#bots").selectOption("1");
await page.locator("#bot-skill").selectOption("standard");
await page.locator("#start").click();
await page.locator("#game-wrap:not(.hidden) canvas").waitFor({ timeout: 8000 });
await page.waitForTimeout(2600);
await page.keyboard.down("j");
let feedSeen = false;
for (let attempt = 0; attempt < 150 && !feedSeen; attempt++) {
  await page.waitForTimeout(500);
  feedSeen = (await page.locator("#kill-feed .kill-entry").count()) > 0;
}
await page.waitForTimeout(400);
await capture("match");
await page.keyboard.up("j");

// Four-player load frame on the foundry floor.
await page.locator("#in-match-leave").click();
await page.locator("#menu:not(.hidden)").waitFor();
await page.locator("#name").fill("Gallery");
await page.locator("#create").click();
await page.locator("#lobby:not(.hidden)").waitFor();
await page.locator("#map").selectOption("factory");
await page.locator("#bots").selectOption("3");
await page.locator("#start").click();
await page.locator("#game-wrap:not(.hidden) canvas").waitFor({ timeout: 8000 });
await page.waitForTimeout(2600);
await capture("four-player");

await browser.close();

// PNG -> JPEG via System.Drawing (no extra dependencies).
const psScript = `
Add-Type -AssemblyName System.Drawing
$names = @("menu", "lobby", "canopy", "fortress", "factory", "match", "four-player")
foreach ($name in $names) {
  $src = "test-results/gallery/$name.png"
  $dst = "docs/screenshots/$name.jpg"
  $image = [System.Drawing.Image]::FromFile((Resolve-Path $src))
  $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/jpeg" }
  $params = New-Object System.Drawing.Imaging.EncoderParameters(1)
  $params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]82)
  $image.Save((Join-Path (Get-Location) $dst), $codec, $params)
  $image.Dispose()
  Write-Output "encoded $dst"
}
`;
execFileSync("powershell", ["-NoProfile", "-Command", psScript], { stdio: "inherit" });
console.log("screenshot gallery refreshed");
