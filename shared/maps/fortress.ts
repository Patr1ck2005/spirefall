// M15 布局个性化：Fortress 中轴要塞对枪线。
import type { MapDef } from "../types.js";

export const FORTRESS: MapDef = {
  name: "Fortress",
  sector: "BASTION / DEFENSE SPINE",
  color: 0x241f27,
  accent: 0xe4574f,
  atmosphere: 0xa68b7c,
  platforms: [
    { x: 0, y: 530, width: 260, height: 30 },
    { x: 400, y: 530, width: 240, height: 30 },
    { x: 760, y: 530, width: 240, height: 30 },
    // M19 掩体柱：西缺口中的立柱，打断地面穿射线，柱顶可站立兼作垫脚石
    //（货架层间净空 96px 放不下 78px+跳跃的墙，缺口处无顶棚净空无限）。
    { x: 320, y: 460, width: 26, height: 100, solid: true },
    { x: 410, y: 430, width: 220, height: 14, oneWay: true },
    { x: 400, y: 320, width: 240, height: 14, oneWay: true },
    { x: 415, y: 210, width: 210, height: 14, oneWay: true },
    { x: 405, y: 100, width: 230, height: 16, oneWay: true },
    { x: 120, y: 415, width: 120, height: 14, oneWay: true },
    { x: 760, y: 415, width: 120, height: 14, oneWay: true },
    { x: 60, y: 305, width: 120, height: 14, oneWay: true },
    { x: 820, y: 305, width: 120, height: 14, oneWay: true },
    { x: 150, y: 210, width: 120, height: 14, oneWay: true },
    { x: 730, y: 210, width: 120, height: 14, oneWay: true },
    { x: 445, y: 40, width: 150, height: 14, oneWay: true },
  ],
  spawns: [{ x: 170, y: 411 }, { x: 830, y: 411 }, { x: 500, y: 316 }, { x: 520, y: 526 }],
  crateSockets: [
    { id: "fortress-ground-west", x: 100, y: 508 }, { id: "fortress-ground-mid", x: 520, y: 508 }, { id: "fortress-ground-east", x: 880, y: 508 },
    { id: "fortress-wing-low-west", x: 180, y: 393 }, { id: "fortress-wing-low-east", x: 820, y: 393 },
    { id: "fortress-lane-2", x: 520, y: 298 }, { id: "fortress-wing-mid-west", x: 110, y: 283 }, { id: "fortress-wing-mid-east", x: 880, y: 283 },
    { id: "fortress-crown", x: 510, y: 18 },
  ],
  props: [
    { id: "fortress-barrel-west", x: 200, y: 530 }, { id: "fortress-barrel-lane", x: 600, y: 320 },
    { id: "fortress-barrel-east", x: 940, y: 530 }, { id: "fortress-barrel-crown", x: 450, y: 100 },
  ],
  hazards: [
    { id: "bastion-crusher-west", kind: "blastCrusher", x: 180, y: 45, width: 90, height: 118, periodTicks: 480, warningTicks: 90, activeTicks: 54, phaseOffset: 45, travelY: 175, force: 620, limbDamage: 72 },
    { id: "bastion-crusher-east", kind: "blastCrusher", x: 730, y: 45, width: 90, height: 118, periodTicks: 480, warningTicks: 90, activeTicks: 54, phaseOffset: 285, travelY: 175, force: 620, limbDamage: 72 },
  ],
  movers: [
    { id: "bastion-elevator", x: 300, y: 300, width: 100, height: 14, periodTicks: 400, phaseOffset: 0, travelY: -180 },
  ],
};
