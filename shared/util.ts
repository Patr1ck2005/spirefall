// M28.5 结构拆分：shared 层的纯辅助函数——几何（弹道扫掠/射线/落点）、
// 肢体模型（损伤惩罚/命中选肢）、通用标量工具。只依赖 constants 与 types。

import { MOB_TUNING, PLAYER_CAPSULE, PROP_TUNING } from "./constants.js";
import type { LimbId, LimbIntegrity, MapDef, MobKind, Platform, PlayerState, PropState } from "./types.js";

export const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

export const LIMB_IDS: LimbId[] = ["leftArm", "rightArm", "leftLeg", "rightLeg"];
export const freshLimbs = (): LimbIntegrity => ({ leftArm: 100, rightArm: 100, leftLeg: 100, rightLeg: 100 });

/** M31: mob body radius for hit resolution (shared by every combat domain). */
export const mobRadius = (kind: MobKind): number => MOB_TUNING.radius[kind] ?? 12;

// M27 wound model: limb integrity feeds four concrete control penalties. Arm
// damage slows the trigger, deepens recoil AND widens spread (new — accuracy
// is now an arm resource); leg damage drags movement and jump. Two destroyed
// arms = ×1.7 cooldown / ×1.6 recoil / ×1.6 spread, two destroyed legs =
// ×0.4 move (a crawl) / ×0.5 jump. Server-authoritative: bots suffer identically.
export const calculateLimbModifiers = (limbs: LimbIntegrity) => {
  const armSeverity = (200 - limbs.leftArm - limbs.rightArm) / 100;
  const legSeverity = (200 - limbs.leftLeg - limbs.rightLeg) / 100;
  return {
    cooldown: 1 + 0.35 * armSeverity,
    recoil: 1 + 0.3 * armSeverity,
    spread: 1 + 0.3 * armSeverity,
    move: 1 - 0.3 * legSeverity,
    jump: 1 - 0.25 * legSeverity,
  };
};

export const selectLimbAtPoint = (player: Pick<PlayerState, "x" | "y">, hitX: number, hitY: number): LimbId | undefined => {
  const localY = hitY - player.y;
  if (Math.abs(hitX - player.x) < 4 && localY < -8 && localY > -34) return undefined;
  const left = hitX < player.x;
  return localY >= -14 ? left ? "leftLeg" : "rightLeg" : left ? "leftArm" : "rightArm";
};

/**
 * Closest distance between point P and segment AB, plus the parameter t of the
 * closest point on AB. Shared geometry: used for sweep tests and for picking
 * the exact impact point on the flight path (which then feeds limb selection).
 */
export const pointSegmentClosest = (
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): { distance: number; t: number } => {
  const abx = bx - ax;
  const aby = by - ay;
  const lengthSq = abx * abx + aby * aby;
  const t = lengthSq === 0 ? 0 : clampRaw(((px - ax) * abx + (py - ay) * aby) / lengthSq, 0, 1);
  const cx = ax + abx * t;
  const cy = ay + aby * t;
  return { distance: Math.hypot(px - cx, py - cy), t };
};

/**
 * Closest distance between two segments AB and CD (classic clamped solve).
 */
export const segmentSegmentClosest = (
  ax: number, ay: number,
  bx: number, by: number,
  cx: number, cy: number,
  dx: number, dy: number,
): { distance: number; t: number } => {
  const ux = bx - ax;
  const uy = by - ay;
  const vx = dx - cx;
  const vy = dy - cy;
  const wx = ax - cx;
  const wy = ay - cy;
  const a = ux * ux + uy * uy;
  const b = ux * vx + uy * vy;
  const c = vx * vx + vy * vy;
  const d = ux * wx + uy * wy;
  const e = vx * wx + vy * wy;
  const denom = a * c - b * b;
  let s = 0;
  let t = 0;
  if (denom !== 0 && a !== 0 && c !== 0) {
    // Closed-form interior minimum, clamped to both segments.
    s = clampRaw((b * e - c * d) / denom, 0, 1);
  }
  // Two Gauss-Seidel refinement passes handle clamped/edge and degenerate
  // cases; each pass re-projects onto the other segment and converges to
  // well within a pixel at gameplay scales.
  for (let pass = 0; pass < 2; pass++) {
    t = c === 0 ? 0 : clampRaw((b * s + e) / c, 0, 1);
    s = a === 0 ? 0 : clampRaw((b * t - d) / a, 0, 1);
  }
  const p1x = ax + ux * s;
  const p1y = ay + uy * s;
  const p2x = cx + vx * t;
  const p2y = cy + vy * t;
  return { distance: Math.hypot(p1x - p2x, p1y - p2y), t: s };
};

const clampRaw = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

/**
 * Whether the flight segment (x0,y0)->(x1,y1) intersects a player's hit
 * capsule. This is the sweep test: a projectile's per-tick path is a segment
 * (gravity arc is close enough to straight at 60Hz ranges), so fast rounds
 * can no longer tunnel through the body between ticks. `extraRadius` lets
 * callers widen the capsule (e.g. grazing calibration for specific weapons).
 */
export const segmentHitsPlayer = (
  player: Pick<PlayerState, "x" | "y">,
  x0: number, y0: number,
  x1: number, y1: number,
  extraRadius = 0,
): boolean => {
  const ax = x0;
  const ay = y0;
  const bx = x1;
  const by = y1;
  // Capsule axis runs up the body line from the foot anchor.
  const cx = player.x;
  const cyBottom = player.y - PLAYER_CAPSULE.upBottom;
  const cyTop = player.y - PLAYER_CAPSULE.upTop;
  const { distance } = segmentSegmentClosest(ax, ay, bx, by, cx, cyBottom, cx, cyTop);
  return distance <= PLAYER_CAPSULE.radius + extraRadius;
};

/**
 * Closest point on the flight segment to the player's capsule axis — the
 * impact point used for limb selection. Returns undefined when the segment
 * misses the capsule entirely.
 */
export const segmentImpactPoint = (
  player: Pick<PlayerState, "x" | "y">,
  x0: number, y0: number,
  x1: number, y1: number,
): { x: number; y: number } | undefined => {
  if (!segmentHitsPlayer(player, x0, y0, x1, y1)) return undefined;
  const cx = player.x;
  const cyBottom = player.y - PLAYER_CAPSULE.upBottom;
  const cyTop = player.y - PLAYER_CAPSULE.upTop;
  const { t } = segmentSegmentClosest(x0, y0, x1, y1, cx, cyBottom, cx, cyTop);
  return { x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t };
};

/**
 * M25 destructible props: whether a flight segment passes within a barrel's
 * blast-hit radius (barrel radius + extra for sweep). Same swept-segment
 * geometry as the player capsule, but against the prop's centre point.
 */
export const segmentHitsProp = (
  prop: Pick<PropState, "x" | "y">,
  x0: number, y0: number,
  x1: number, y1: number,
  extraRadius = 0,
): boolean => {
  const { distance } = pointSegmentClosest(prop.x, prop.y, x0, y0, x1, y1);
  return distance <= PROP_TUNING.radius + extraRadius;
};

// M19 弹道几何：攻击、bot 感知与客户端视觉共用一份实现，杜绝两套真相。
// 所有函数只读 MapDef/平台数组，可在测试里直接验证。

/**
 * Damage falloff for a hit at `distance` from the muzzle with a weapon whose
 * range is `range`. Full damage out to 60% of range, then linear down to 0.6
 * at the cap; clamped so hits beyond the cap (air-burst splash etc.) floor at
 * 0.6. Knockback never scales with distance.
 */
export const rangeFalloff = (distance: number, range: number): number => {
  if (range <= 0) return 1;
  const fraction = clamp(distance / range, 0, 1);
  if (fraction <= 0.6) return 1;
  return clamp(1 - (fraction - 0.6) / 0.4 * 0.4, 0.6, 1);
};

/**
 * First intersection distance along the segment (x0,y0)->(x1,y1) with the
 * map's solid platforms, or undefined when the line of sight is clear.
 * Only `solid: true` platforms block; one-way ledges are shootable-through.
 */
export const raycastSolids = (
  platforms: Platform[],
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number | undefined => {
  const dx = x1 - x0;
  const dy = y1 - y0;
  if (dx === 0 && dy === 0) return undefined;
  let best: number | undefined;
  for (const platform of platforms) {
    if (!platform.solid) continue;
    // Slab method against the platform rect; also catches a start point
    // already inside a wall.
    let tEnter = 0;
    let tExit = 1;
    if (dx !== 0) {
      const t1 = (platform.x - x0) / dx;
      const t2 = (platform.x + platform.width - x0) / dx;
      tEnter = Math.max(tEnter, Math.min(t1, t2));
      tExit = Math.min(tExit, Math.max(t1, t2));
    } else if (x0 < platform.x || x0 > platform.x + platform.width) continue;
    if (dy !== 0) {
      const t1 = (platform.y - y0) / dy;
      const t2 = (platform.y + platform.height - y0) / dy;
      tEnter = Math.max(tEnter, Math.min(t1, t2));
      tExit = Math.min(tExit, Math.max(t1, t2));
    } else if (y0 < platform.y || y0 > platform.y + platform.height) continue;
    if (tEnter > tExit || tExit < 0 || tEnter > 1) continue;
    const hit = Math.max(0, tEnter);
    if (best === undefined || hit < best) best = hit;
  }
  return best === undefined ? undefined : best * Math.hypot(dx, dy);
};

/**
 * Y coordinate of the nearest standable platform surface strictly below (or
 * at) `y` at horizontal position `x`, or undefined when there is nothing to
 * land on (a fall gap). Drives blood-decal anchoring, gib bounces and bot
 * ground queries with one shared truth.
 */
export const surfaceBelow = (map: Pick<MapDef, "platforms">, x: number, y: number): number | undefined => {
  let best: number | undefined;
  for (const platform of map.platforms) {
    if (x < platform.x - 6 || x > platform.x + platform.width + 6) continue;
    if (platform.y < y - 12) continue;
    if (best === undefined || platform.y < best) best = platform.y;
  }
  return best;
};
