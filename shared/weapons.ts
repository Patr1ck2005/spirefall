// M28.5 结构拆分：武器定义表（原 shared/game.ts 的 AttackDef/WeaponDef/WEAPONS 段，
// 类型本体在 types.ts）。数值全部集中在此表，手感调参只动这里。

import type { AttackDef, WeaponDef, WeaponId } from "./types.js";

const atk = (spec: Partial<AttackDef> & Pick<AttackDef, "kind" | "cooldown" | "damage" | "knockback">): AttackDef => ({
  recoil: 0,
  range: 0,
  ammoCost: 1,
  speed: 0,
  spread: 0,
  radius: 3,
  explosiveRadius: 0,
  pattern: "single",
  count: 1,
  pierce: 0,
  dashDistance: 0,
  dashSpeed: 0,
  ...spec,
});

// M14火力重设计：Ripper 全自动冲锋枪 / Breach Scatter + Blaze Vent / Longbeam
// 持续光束 / Voltrail 蓄能磁轨 / Forge Rocket / Cutter Blade。
// M19 射程真实化：projectile 类硬上限首次生效（旧版 range 字段被完全忽略），
// 激光定位超远（Longbeam 900 / Voltrail 1400），散弹收为 CQC。range 超过即
// 消散（火箭空爆），60%-100% 射程段伤害线性衰减至 0.6。
// M20 Echo Shard：几何反弹枪 —— 碎片撞平台按法线反射，可绕过掩体与拐角，
// 奖励对地形/立柱的利用。range 仍是硬上限（含反弹段全部路程）。
// M27 火力上修：全表伤害 +8%~+25%（击杀节奏收紧到四肢毁伤可感的区间），
// 火箭爆炸半径 88→96、桶随之上调（band 断言仍成立）。冷却/射程/散布基线不动。
export const WEAPONS: Record<WeaponId, WeaponDef> = {
  sidearm: {
    id: "sidearm", label: "Vein Ripper", ammo: 90, color: 0xd8b45f,
    primary: atk({ kind: "hitscan", cooldown: 0.09, damage: 11, knockback: 55, recoil: 8, range: 640, spread: 0.045, pattern: "single" }),
    secondary: atk({ kind: "hitscan", cooldown: 0.85, damage: 12, knockback: 95, recoil: 26, range: 700, spread: 0.07, pattern: "burst", count: 6, pierce: 0 }),
  },
  scatter: {
    id: "scatter", label: "Breach Scatter", ammo: 32, color: 0x9fc6d1,
    primary: atk({ kind: "projectile", cooldown: 0.68, damage: 11, knockback: 95, recoil: 85, speed: 780, spread: 0.26, radius: 4, range: 400, pattern: "pellet", count: 8 }),
    secondary: atk({ kind: "projectile", cooldown: 0.08, damage: 5, knockback: 30, recoil: 6, speed: 560, spread: 0.34, radius: 3, range: 260, pattern: "pellet", count: 2 }),
  },
  rifle: {
    id: "rifle", label: "Longbeam", ammo: 90, color: 0x75c795,
    primary: atk({ kind: "hitscan", cooldown: 0.12, damage: 8, knockback: 22, recoil: 4, range: 900, pattern: "beam" }),
    secondary: atk({ kind: "hitscan", cooldown: 0.95, damage: 48, knockback: 320, recoil: 70, range: 950, ammoCost: 3, pattern: "piercing", pierce: 3 }),
  },
  sniper: {
    id: "sniper", label: "Voltrail", ammo: 6, color: 0xd797c7,
    primary: atk({ kind: "hitscan", cooldown: 0.55, damage: 40, knockback: 210, recoil: 60, range: 1400, pattern: "piercing", pierce: 3, chargeMax: 1.1, chargeMin: 0.25 }),
    secondary: atk({ kind: "hitscan", cooldown: 0.85, damage: 44, knockback: 260, recoil: 55, range: 1050, pattern: "piercing", pierce: 1 }),
  },
  rocket: {
    id: "rocket", label: "Forge Rocket", ammo: 5, color: 0xe9793d,
    primary: atk({ kind: "explosive", cooldown: 0.9, damage: 66, knockback: 320, recoil: 110, speed: 520, radius: 7, range: 900, explosiveRadius: 112 }),
    secondary: atk({ kind: "explosive", cooldown: 1.5, damage: 34, knockback: 320, recoil: 130, speed: 420, spread: 0.14, radius: 8, range: 640, explosiveRadius: 84, pattern: "cluster", count: 3, ammoCost: 2 }),
  },
  blade: {
    id: "blade", label: "Cutter Blade", ammo: 999, color: 0xbfcbd0,
    primary: atk({ kind: "melee", cooldown: 0.32, damage: 46, knockback: 270, recoil: 65, range: 70, pattern: "slash" }),
    secondary: atk({ kind: "melee", cooldown: 1.0, damage: 74, knockback: 520, recoil: 110, range: 130, pattern: "dashSlash", dashDistance: 92, dashSpeed: 560 }),
  },
  echo: {
    id: "echo", label: "Echo Shard", ammo: 48, color: 0x7fb8ff,
    primary: atk({ kind: "projectile", cooldown: 0.55, damage: 16, knockback: 70, recoil: 20, speed: 620, radius: 4, range: 900, pattern: "bounce", count: 2, bounces: 3 }),
    secondary: atk({ kind: "projectile", cooldown: 1.1, damage: 42, knockback: 300, recoil: 55, speed: 560, radius: 5, range: 1100, pattern: "bounce", count: 1, bounces: 5, ammoCost: 2 }),
  },
  // M27 Pyre Vent: a pressure-spray flamethrower. Primary is a cone of short-
  // range fuel projectiles (a denser, tighter variant of the scatter pellet
  // geometry) that ignites barrels it touches; secondary is a wide short
  // burst for point-blank panic buttons. Ammo regen keeps the tank topped up.
  flame: {
    id: "flame", label: "Pyre Vent", ammo: 100, color: 0xff7a3c,
    primary: atk({ kind: "projectile", cooldown: 0.045, damage: 6, knockback: 18, recoil: 3, speed: 430, spread: 0.15, radius: 6, range: 230, pattern: "single" }),
    secondary: atk({ kind: "projectile", cooldown: 1.6, damage: 9, knockback: 60, recoil: 45, speed: 340, spread: 0.5, radius: 7, range: 170, pattern: "pellet", count: 8, ammoCost: 8 }),
  },
};
