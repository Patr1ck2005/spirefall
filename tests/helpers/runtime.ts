import { existsSync } from "node:fs";

/**
 * Resolve the Chromium-family browser used by the Playwright suites.
 *
 * Priority: SPIREFALL_BROWSER env > a machine-local Edge install > Playwright's
 * own bundled Chromium (undefined lets Playwright resolve it). This keeps the
 * default behavior identical on the dev Windows machine while letting CI run
 * the same suites against the Playwright-managed browser.
 */
export function resolveBrowser(): string | undefined {
  const override = process.env.SPIREFALL_BROWSER;
  if (override) {
    if (!existsSync(override)) throw new Error(`SPIREFALL_BROWSER points to a missing executable: ${override}`);
    return override;
  }
  const candidates =
    process.platform === "win32"
      ? [
          "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
          "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
        ]
      : process.platform === "darwin"
        ? ["/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"]
        : ["/usr/bin/microsoft-edge", "/usr/bin/microsoft-edge-stable", "/usr/bin/microsoft-edge-dev"];
  return candidates.find((candidate) => existsSync(candidate));
}

export const launchOptions = () => ({ headless: true, executablePath: resolveBrowser() }) as const;

/** Web client base URL (vite dev server) with an env override for CI. */
export const webUrl = () => process.env.SPIREFALL_WEB || "http://127.0.0.1:5173";

/** Game server WebSocket endpoint with an env override for CI. */
export const wsEndpoint = () => process.env.SPIREFALL_WS || "ws://127.0.0.1:8787";
