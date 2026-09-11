// M28.5 结构拆分：全局数值常量集中于此（原 shared/game.ts 的常量段）。
// 只放常量，不放类型（types.ts）与逻辑（util.ts / sim.ts）。

import type { MatchConfig } from "./types.js";

export const WORLD = {
  // M29: the arena grew to 1500×840 (×1.5 per axis) so a screen holds only
  // ~44% of the map — the camera now follows the pilot instead of framing the
  // whole arena. Vertical density does NOT scale with the world (jump apex
  // 120px is WORLD-independent); the extra height became 2-3 more storeys per
  // map. Fall/purge thresholds reference WORLD and scale automatically.
  width: 1500,
  height: 840,
  tickRate: 60,
  // M24: 20Hz snapshots put the rendered position up to ~100ms behind the
  // authoritative sim on a lerp-only client — a big part of "bullets miss".
  // 30Hz halves that window for a modest bandwidth cost (~360KB/s at 4 players).
  snapshotRate: 30,
} as const;

// M24b movement tuning — the single place to re-feel motion.
// KEY FACT: the ground top speed is NOT `maxSpeed` — it is the accelerate /
// friction equilibrium, accel·f/(1−f). The old 56·0.76/0.24 ≈ 177px/s meant
// the pilot crawled at half the intended speed (the real "sticky" feel and
// the reason run animations never reached full stride). 96·0.78/0.22 ≈ 340
// makes the equilibrium reach the clamp, with ~160ms to top speed and ~160ms
// to a full stop. Gravity rises to 1600 so the jump arc is tight and heavy
// instead of moon-floaty; jump velocities re-derive apex ≈ 120px (still above
// the maps' 110px level steps + landing margin) and a 62px air jump.
export const MOVE_TUNING = {
  /** Horizontal acceleration per tick while a direction is held. */
  accelerate: 96,
  /** Ground/air top speed clamp (px/s); ground equilibrium ≈ 340 reaches it. */
  maxSpeed: 350,
  /** Per-tick multiplicative ground friction (lower = snappier stops). */
  groundFriction: 0.78,
  /** Per-tick multiplicative air friction. */
  airFriction: 0.93,
  /** Downward acceleration (px/s²) — the arc tightness lever. */
  gravity: 1600,
  /** Jump launch velocities (px/s): ground jump and air jump. */
  jumpGround: 620,
  jumpAir: 445,
} as const;

export const PLAYER_SCALE = 0.5;
export const PLAYER_HALF_WIDTH = 9;
export const PLAYER_FOOT_OFFSET = 4;
export const PLAYER_BODY_HEIGHT = 30;
export const PLAYER_TARGET_OFFSET = 14;
export const PLAYER_HIT_RADIUS = 12;
export const MAX_JUMPS = 3;

// M25 destructible props — explosive barrels. Damage/blast sit inside the M20
// balance band (under rocket primary): a barrel is a hazard you shoot, not a
// better rocket. M27: barrels became the map's landmine-tier threat; M28
// raised both barrel AND rocket (the band assertion still holds: barrel <
// rocket), so barrels actually threaten and rockets feel earned. Cooldowns
// and machine cycles untouched.
export const PROP_TUNING = {
  /** Barrel hit radius (px) — also the visual cylinder half-width. */
  radius: 13,
  /** Damage points before detonation (one scatter volley or two rifle bursts). */
  hp: 30,
  /** Splash damage radius (px). */
  blastRadius: 104,
  /** Core splash damage at the centre, tapering outward (same falloff as rockets). */
  damage: 64,
  /** Knockback at the blast centre. */
  knockback: 360,
  /** Respawn window after detonation (seconds), matching the crate cadence. */
  respawnMin: 6,
  respawnMax: 10,
} as const;

// M24 hit capsule: the authoritative body shape every attack resolves
// against. The old model was a single chest circle (r=12 at PLAYER_TARGET_OFFSET)
// which left the head and legs outside the hit volume — heads-up duels felt
// like bullets phased through people. The capsule axis runs up the body line
// from just under the feet to the neck; total covered shape is roughly 22px
// wide × 44px tall vs the old 24px-diameter circle (~+38% area, placed where
// the sprite actually is).
export const PLAYER_CAPSULE = {
  /** Axis endpoints measured UP from the player foot anchor (y grows down). */
  upBottom: 2,
  upTop: 24,
  /** Capsule radius — horizontal reach close to the sprite silhouette. */
  radius: 11,
} as const;

/** Passive ammo regen per second for every weapon (keeps sustained fire viable). */
export const AMMO_REGEN_PER_SECOND = 6;
/** Tick interval that grants one round at AMMO_REGEN_PER_SECOND (60Hz tick). */
export const AMMO_REGEN_INTERVAL_TICKS = Math.round(WORLD.tickRate / AMMO_REGEN_PER_SECOND);
/** Matches resolve at this game-time limit (4 minutes) regardless of stalemates. */
export const MATCH_TIME_LIMIT_TICKS = WORLD.tickRate * 240;

export const DEFAULT_CONFIG: MatchConfig = {
  mapId: "canopy",
  lives: 3,
  crates: true,
  weaponSet: ["sidearm", "scatter", "rifle", "sniper", "rocket", "blade", "echo", "flame"],
  bots: 0,
  botSkill: "standard",
  // M30: free-for-all by default; the lobby's mode selector switches to 2-4 squads.
  teams: 0,
  // M31: hostile mob waves are opt-in from the lobby toggle.
  mobs: false,
};

// M31 hostile industrial pests. Everything a mob needs lives here so the
// balance dossier and tests reason over one table. Mobs are hostile to every
// pilot (bots included); they do NOT count toward win conditions.
export const MOB_TUNING = {
  /** Concurrent mob cap per room — the wave spawner refuses to exceed it. */
  cap: 10,
  /** Seconds between spawn waves while under the cap. */
  waveInterval: 11,
  /** Seconds of ground telegraph before a mob enters (1s light pillar). */
  telegraph: 1,
  /** Hit points per mob kind. */
  hp: { skitter: 30, gnats: 26, ram: 44 } as Record<string, number>,
  /** Stalk speeds (px/s) per kind. */
  stalkSpeed: { skitter: 110, gnats: 84, ram: 46 } as Record<string, number>,
  /** Dash/charge speeds (px/s) per kind. */
  dashSpeed: { skitter: 330, gnats: 150, ram: 400 } as Record<string, number>,
  /** Contact damage per connect (limb damage points). */
  damage: { skitter: 16, gnats: 7, ram: 22 } as Record<string, number>,
  /** Knockback applied to a pilot on connect (px/s). */
  knockback: 300,
  /** Fraction of incoming knockback a mob keeps (rest bleeds off as mass). */
  knockbackResist: 0.35,
  /** Behaviour windows (seconds) per kind. */
  warnTime: { skitter: 0.6, gnats: 0, ram: 0.5 } as Record<string, number>,
  dashTime: { skitter: 0.45, gnats: 0, ram: 0.6 } as Record<string, number>,
  stunTime: { skitter: 0.5, gnats: 0.4, ram: 0.8 } as Record<string, number>,
  /** Cooldown between connects per mob (seconds). */
  hitCooldown: 0.9,
  /** Mob body radius (px) for hit resolution. */
  radius: { skitter: 12, gnats: 11, ram: 15 } as Record<string, number>,
  /** Repair-pack drop lifetime (seconds) after a mob dies. */
  dropTtl: 8,
  /** Wave weights per kind — crawlers dominate, chargers are rarer. */
  weights: { skitter: 5, gnats: 3, ram: 2 } as Record<string, number>,
} as const;

export const PLAYER_COLORS = [0x56d9d0, 0xf0715d, 0xf0c75e, 0xad80e8] as const;

// M30 squad identity colors. Chosen apart from the four pilot tints so a team
// ring never reads as one pilot's personal color. Index 0 is the FFA slot
// (unused); team 1..4 map to red/blue/green/gold.
export const TEAM_COLORS = [0x000000, 0xe8574f, 0x4f8ae8, 0x53c463, 0xf0c75e] as const;

// Movement budget derived from MOVE_TUNING in this file:
// ground-jump apex ≈ 620²/(2·1600) ≈ 120px, air-jump apex ≈ 445²/(2·1600) ≈ 62px.
// The budget stays at 115 because every map keeps its largest level step ≤ 110
// (the fortress/factory tall shelves), which the ground jump still clears with
// a 10px landing margin; the weak air jump is for finishes and rescues only.
export const NAV_MAX_RISE = 115;
export const NAV_MAX_GAP = 200;
