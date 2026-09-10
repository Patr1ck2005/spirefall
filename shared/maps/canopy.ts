// M15 布局个性化：Canopy 左塔右崖开放垂直。
import type { MapDef } from "../types.js";

export const CANOPY: MapDef = {
  name: "Canopy",
  sector: "CROWN / ALTITUDE 91",
  color: 0x16242a,
  accent: 0x49c9b8,
  atmosphere: 0x99b7bb,
  platforms: [
    { x: 0, y: 530, width: 280, height: 30 },
    { x: 420, y: 530, width: 200, height: 30 },
    { x: 780, y: 530, width: 220, height: 30 },
    // M19 掩体墙：打断地面长视线，激光/子弹在此受挡。跳跃 apex≈136px 可越。
    { x: 452, y: 452, width: 26, height: 78, solid: true },
    { x: 30, y: 445, width: 110, height: 14, oneWay: true },
    { x: 150, y: 355, width: 100, height: 14, oneWay: true },
    { x: 60, y: 265, width: 110, height: 14, oneWay: true },
    { x: 190, y: 175, width: 120, height: 14, oneWay: true },
    { x: 330, y: 95, width: 130, height: 14, oneWay: true },
    { x: 560, y: 430, width: 130, height: 14, oneWay: true },
    { x: 800, y: 350, width: 150, height: 14, oneWay: true },
    { x: 600, y: 265, width: 120, height: 14, oneWay: true },
    { x: 420, y: 170, width: 130, height: 14, oneWay: true },
    { x: 350, y: 62, width: 300, height: 16, oneWay: true },
  ],
  spawns: [{ x: 90, y: 526 }, { x: 880, y: 526 }, { x: 470, y: 166 }, { x: 210, y: 171 }],
  crateSockets: [
    { id: "canopy-ground-west", x: 100, y: 508 }, { id: "canopy-ground-mid", x: 500, y: 508 }, { id: "canopy-ground-east", x: 880, y: 508 },
    { id: "canopy-tower-mid", x: 200, y: 333 }, { id: "canopy-tower-high", x: 100, y: 243 },
    { id: "canopy-east-ledge", x: 850, y: 328 }, { id: "canopy-mid-ledge", x: 640, y: 243 },
    { id: "canopy-crown", x: 490, y: 40 },
  ],
  // M25 barrels: mid-map platforms away from spawns (≥80px) and crate sockets.
  // Anchors: (655,430) shuttle ledge / (895,350) east ledge / (115,355) west
  // tower / (420,62) crown approach — all verified on platform surfaces.
  props: [
    { id: "canopy-barrel-mid", x: 655, y: 430 }, { id: "canopy-barrel-east", x: 895, y: 350 },
    { id: "canopy-barrel-tower", x: 160, y: 355 }, { id: "canopy-barrel-crown", x: 420, y: 62 },
  ],
  hazards: [
    { id: "crown-lift-a", kind: "cargoLift", x: 520, y: 470, width: 130, height: 16, periodTicks: 360, warningTicks: 0, activeTicks: 360, phaseOffset: 0, travelY: -205 },
    { id: "crown-lift-b", kind: "cargoLift", x: 810, y: 300, width: 120, height: 16, periodTicks: 360, warningTicks: 0, activeTicks: 360, phaseOffset: 180, travelY: -160 },
  ],
  movers: [
    { id: "canopy-shuttle", x: 560, y: 392, width: 110, height: 14, periodTicks: 420, phaseOffset: 0, travelX: -320 },
  ],
};
