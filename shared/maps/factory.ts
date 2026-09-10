// M15 布局个性化：Factory 流水线横向推挤。
import type { MapDef } from "../types.js";

export const FACTORY: MapDef = {
  name: "Factory",
  sector: "FOUNDRY / ASSEMBLY GUT",
  color: 0x27241f,
  accent: 0xf28a38,
  atmosphere: 0x71806b,
  platforms: [
    { x: 0, y: 530, width: 240, height: 30 },
    { x: 380, y: 530, width: 260, height: 30 },
    { x: 780, y: 530, width: 220, height: 30 },
    // M19 掩体墙：西中层货架上的装甲墙，打断 60→220 层直射线；地面层
    // 视线保持通畅（跨图对枪线与既有测试依赖它）。
    { x: 130, y: 178, width: 26, height: 84, solid: true },
    { x: 40, y: 445, width: 150, height: 14, oneWay: true },
    { x: 300, y: 448, width: 170, height: 14, oneWay: true },
    { x: 590, y: 442, width: 160, height: 14, oneWay: true },
    { x: 820, y: 448, width: 140, height: 14, oneWay: true },
    { x: 150, y: 355, width: 190, height: 14, oneWay: true },
    { x: 480, y: 350, width: 200, height: 14, oneWay: true },
    { x: 780, y: 358, width: 160, height: 14, oneWay: true },
    { x: 60, y: 262, width: 160, height: 14, oneWay: true },
    { x: 350, y: 258, width: 170, height: 14, oneWay: true },
    { x: 650, y: 264, width: 150, height: 14, oneWay: true },
    { x: 860, y: 258, width: 110, height: 14, oneWay: true },
    { x: 200, y: 168, width: 160, height: 14, oneWay: true },
    { x: 520, y: 162, width: 180, height: 14, oneWay: true },
    { x: 800, y: 170, width: 130, height: 14, oneWay: true },
    { x: 420, y: 64, width: 200, height: 16, oneWay: true },
  ],
  spawns: [{ x: 110, y: 441 }, { x: 880, y: 444 }, { x: 560, y: 346 }, { x: 270, y: 164 }],
  crateSockets: [
    { id: "factory-ground-west", x: 90, y: 508 }, { id: "factory-ground-mid", x: 500, y: 508 }, { id: "factory-ground-east", x: 880, y: 508 },
    { id: "factory-floor-2-west", x: 230, y: 333 }, { id: "factory-floor-2-east", x: 560, y: 328 },
    { id: "factory-floor-3-mid", x: 420, y: 236 }, { id: "factory-floor-4-east", x: 590, y: 140 },
    { id: "factory-crown", x: 510, y: 42 },
  ],
  props: [
    { id: "factory-barrel-west", x: 200, y: 530 }, { id: "factory-barrel-floor3", x: 300, y: 355 },
    { id: "factory-barrel-floor2", x: 720, y: 264 }, { id: "factory-barrel-floor4", x: 890, y: 258 },
  ],
  hazards: [
    { id: "foundry-belt", kind: "conveyor", x: 380, y: 530, width: 260, height: 16, periodTicks: 1, warningTicks: 0, activeTicks: 1, phaseOffset: 0, force: 95 },
    { id: "foundry-belt-high", kind: "conveyor", x: 480, y: 350, width: 200, height: 14, periodTicks: 1, warningTicks: 0, activeTicks: 1, phaseOffset: 0, force: 85 },
    { id: "foundry-piston-a", kind: "forgePiston", x: 430, y: 218, width: 60, height: 112, periodTicks: 360, warningTicks: 60, activeTicks: 42, phaseOffset: 90, travelY: 170, force: 690, limbDamage: 84 },
    { id: "foundry-piston-b", kind: "forgePiston", x: 690, y: 226, width: 60, height: 112, periodTicks: 360, warningTicks: 60, activeTicks: 42, phaseOffset: 270, travelY: 160, force: 690, limbDamage: 84 },
  ],
  movers: [
    { id: "foundry-shuttle", x: 560, y: 296, width: 100, height: 14, periodTicks: 460, phaseOffset: 200, travelX: -360 },
  ],
};
