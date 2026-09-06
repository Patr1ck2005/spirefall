import { WEAPONS, rangeFalloff, LIMB_IDS } from "../../shared/game.js";

type Row = { weapon: string; attack: string; near: string; mid: string; far: string; ttkNear: string; ttkMid: string; ttkFar: string };

const rows: Row[] = [];
const killPool = (explosive: boolean) => (explosive ? 200 : 400); // explosive splits x0.5 across 4 limbs

for (const weapon of Object.values(WEAPONS)) {
  for (const slot of ["primary", "secondary"] as const) {
    const def = weapon[slot];
    if (def.range <= 0) continue; // melee handled separately
    const label = `${weapon.label} ${slot === "primary" ? "PRI" : "SEC"}${def.chargeMax ? " (charged)" : ""}`;
    const shot = (distance: number) => def.damage * def.count * rangeFalloff(distance, def.range);
    const dps = (distance: number) => shot(distance) / def.cooldown;
    const ammoDps = (distance: number) => shot(distance) / (def.cooldown + def.ammoCost * (60 / 6)); // regen-limited cycle
    const ttk = (distance: number) => {
      if (def.chargeMax) return `${(def.chargeMax + def.damage / 400).toFixed(2)}s (incl. charge, execution >=0.8)`;
      const pool = killPool(def.explosiveRadius > 0 || def.kind === "explosive");
      return `${(pool / Math.max(1, dps(distance))).toFixed(1)}s`;
    };
    rows.push({
      weapon: label,
      attack: `pat:${def.pattern} cd:${def.cooldown}s dmg:${def.damage}x${def.count} spd:${def.speed || "-"} rng:${def.range} ammo:${def.ammoCost}`,
      near: `${dps(Math.min(60, def.range * 0.3)).toFixed(0)}`,
      mid: `${dps(def.range * 0.6).toFixed(0)} (falloff 1.0)`,
      far: `${dps(def.range * 0.95).toFixed(0)} (falloff ${rangeFalloff(def.range * 0.95, def.range).toFixed(2)})`,
      ttkNear: ttk(def.range * 0.3),
      ttkMid: ttk(def.range * 0.6),
      ttkFar: ttk(def.range * 0.95),
    });
  }
}

for (const row of rows) {
  console.log(`| ${row.weapon} | ${row.attack} | ${row.near} | ${row.mid} | ${row.far} | ${row.ttkMid} | ${row.ttkFar} |`);
}
