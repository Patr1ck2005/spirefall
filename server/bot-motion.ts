import { PLAYER_FOOT_OFFSET, PLAYER_HALF_WIDTH, surfaceBelow, type Platform } from "../shared/game.js";

/**
 * M21 cliff guard: given a bot's stance and an ordered horizontal move,
 * should the ordered direction be vetoed? True when a grounded bot is about
 * to step off a ledge — the probe point one half-width+6 ahead has no
 * surface below it. `gapJumpExempt` passes the route planner's deliberate
 * lip crossing through untouched (blocking it would freeze the bot outside
 * its own takeoff window).
 *
 * Lives in its own module (no server.ts import) so test suites can load it
 * without pulling up the full HTTP/WebSocket server.
 */
export function stepOffLedge(
  mapPlatforms: Platform[],
  x: number,
  footY: number,
  heading: -1 | 1,
  onGround: boolean,
  gapJumpExempt: boolean,
): boolean {
  if (!onGround || gapJumpExempt) return false;
  const probeX = x + heading * (PLAYER_HALF_WIDTH + 6);
  return surfaceBelow({ platforms: mapPlatforms }, probeX, footY) === undefined;
}

/** Foot Y for a bot whose player origin is `y` (shared offset contract). */
export const botFootY = (y: number) => y + PLAYER_FOOT_OFFSET;
