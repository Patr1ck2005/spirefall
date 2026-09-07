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
 */
export function launchOptions() {
  const override = process.env.SPIREFALL_BROWSER;
  if (override) {
    if (!existsSync(override)) throw new Error(`SPIREFALL_BROWSER points to a missing executable: ${override}`);
    return { headless: true, executablePath: override } as const;
  }
  return { headless: true, channel: "chromium" } as const;
}

/** Web client base URL (vite dev server) with an env override for CI. */
export const webUrl = () => process.env.SPIREFALL_WEB || "http://127.0.0.1:5173";

/** Game server WebSocket endpoint with an env override for CI. */
export const wsEndpoint = () => process.env.SPIREFALL_WS || "ws://127.0.0.1:8787";
