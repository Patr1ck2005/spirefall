import { existsSync } from "node:fs";

/**
 * Resolve the Chromium-family browser used by the Playwright suites.
 *
 * Priority: SPIREFALL_BROWSER env (explicit executable path, e.g. machine
 * Edge on the dev box) > Playwright's own Chromium. When the bundled
 * Chromium is used we pass `channel: "chromium"` so launches run the FULL
 * browser in its new headless mode instead of `chrome-headless-shell` —
 * the shell drops synthesized weapon-slot keypresses (they reach the page
 * but the input messages never carry the slot), which fails the browser
 * suites non-deterministically.
 *
 * CI runners execute as an unprivileged user in a container-like
 * environment where the Chromium sandbox's setuid helper is unavailable;
 * `--no-sandbox` is the standard remedy there (and harmless locally, where
 * the env override path runs a user-level browser install).
 */
export function launchOptions() {
  const override = process.env.SPIREFALL_BROWSER;
  const args = ["--no-sandbox", "--disable-dev-shm-usage"];
  if (override) {
    if (!existsSync(override)) throw new Error(`SPIREFALL_BROWSER points to a missing executable: ${override}`);
    return { headless: true, executablePath: override, args } as const;
  }
  return { headless: true, channel: "chromium", args } as const;
}

/** Web client base URL (vite dev server) with an env override for CI. */
export const webUrl = () => process.env.SPIREFALL_WEB || "http://127.0.0.1:5173";

/** Game server WebSocket endpoint with an env override for CI. */
export const wsEndpoint = () => process.env.SPIREFALL_WS || "ws://127.0.0.1:8787";

/**
 * M24: pin the UI to English before the app boots. The live game defaults to
 * Chinese (per the M24 playtest request); suites assert on English HUD strings,
 * so every browser page must set the persisted language before its first load.
 * Must be awaited before `page.goto`.
 */
export async function pinEnglish(page: import("playwright").Page) {
  await page.addInitScript(() => {
    try { localStorage.setItem("spirefall-lang", "en"); } catch { /* storage optional */ }
  });
}
