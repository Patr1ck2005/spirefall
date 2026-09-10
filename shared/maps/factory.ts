// M15 布局个性化：Factory 流水线横向推挤。
// M29 大地图重排（1500×840，坐标源：docs/MAP_LAYOUT_1500.md §4）：四层货架横带
// 层距恒 105；地面无墙（M19 既有决定：跨图贴地对枪线与既有测试依赖它）；双皮带
// 东推（出口正对 GEAR-B 机槽）+ 双锻压 180° 相位；solid 3 面全在货架层。
// 地面缺口 360..570 / 930..1140 = 坠落出场区，同时是 M33 双齿轮机槽
// （GEAR-A (465,795) / GEAR-B (1035,795) r78，见 §4.9；M33 实装时加 gears 字段）。
// 出生点 L,R,L,R 交替序（理由见 canopy.ts 头注；s5 特意放 R1c——R2b 整条是皮带）。
import type { MapDef } from "../types.js";

export const FACTORY: MapDef = {
  name: "Factory",
  sector: "FOUNDRY / ASSEMBLY GUT",
  color: 0x27241f,
  accent: 0xf28a38,
  atmosphere: 0x71806b,
  platforms: [
    { x: 0, y: 795, width: 360, height: 45 },
    { x: 570, y: 795, width: 360, height: 45 },
    { x: 1140, y: 795, width: 360, height: 45 },
    // M29 货架墙 ×2 + 瞭望垛：破 row2/row3 层间长视线与最高点纯狙击台
    // （垛后探头射击）；地面层保持无墙。
    { x: 310, y: 505, width: 39, height: 80, solid: true },
    { x: 740, y: 400, width: 39, height: 80, solid: true },
    { x: 760, y: 117, width: 34, height: 48, solid: true },
    { x: 45, y: 690, width: 225, height: 21, oneWay: true },
    { x: 435, y: 690, width: 195, height: 21, oneWay: true },
    { x: 960, y: 690, width: 225, height: 21, oneWay: true },
    { x: 1335, y: 690, width: 165, height: 21, oneWay: true },
    { x: 225, y: 585, width: 285, height: 21, oneWay: true },
    { x: 720, y: 585, width: 300, height: 21, oneWay: true },
    { x: 1230, y: 585, width: 210, height: 21, oneWay: true },
    { x: 90, y: 480, width: 240, height: 21, oneWay: true },
    { x: 540, y: 480, width: 255, height: 21, oneWay: true },
    { x: 975, y: 480, width: 240, height: 21, oneWay: true },
    { x: 1330, y: 480, width: 170, height: 21, oneWay: true },
    { x: 300, y: 375, width: 240, height: 21, oneWay: true },
    { x: 780, y: 375, width: 270, height: 21, oneWay: true },
    { x: 1170, y: 375, width: 180, height: 21, oneWay: true },
    { x: 630, y: 270, width: 300, height: 21, oneWay: true },
    { x: 700, y: 165, width: 160, height: 21, oneWay: true },
  ],
  spawns: [
    { x: 120, y: 791 }, { x: 1380, y: 791 },
    { x: 400, y: 371 }, { x: 1000, y: 686 },
    { x: 150, y: 686 }, { x: 1440, y: 686 },
    { x: 780, y: 266 }, { x: 720, y: 161 },
  ],
  crateSockets: [
    { id: "factory-ground-west", x: 240, y: 773 }, { id: "factory-ground-mid", x: 750, y: 773 }, { id: "factory-ground-east", x: 1300, y: 773 },
    { id: "factory-row1-west", x: 120, y: 668 }, { id: "factory-row1-mid", x: 540, y: 668 }, { id: "factory-row1-east", x: 1040, y: 668 },
    { id: "factory-row2-west", x: 250, y: 563 }, { id: "factory-row2-east", x: 880, y: 563 },
    { id: "factory-row3-west", x: 110, y: 458 }, { id: "factory-row3-east", x: 1200, y: 458 },
    { id: "factory-row4-east", x: 900, y: 353 },
    { id: "factory-crown", x: 700, y: 248 }, { id: "factory-perch", x: 730, y: 143 },
  ],
  // M29 barrels: 缺口沿/皮带东端/货架墙东侧/row4 腰部/王冠东端（M25 三约束验算
  // 见 docs/MAP_LAYOUT_1500.md §4.6）。
  props: [
    { id: "factory-barrel-gap-west", x: 330, y: 795 }, { id: "factory-barrel-belt-east", x: 900, y: 795 },
    { id: "factory-barrel-gap-east", x: 1170, y: 795 }, { id: "factory-barrel-shelfwall", x: 380, y: 585 },
    { id: "factory-barrel-row4", x: 1000, y: 375 }, { id: "factory-barrel-crown", x: 900, y: 270 },
  ],
  hazards: [
    // M29 双皮带（节拍/推力沿用基线）：地面与高架都把人往东缺口（GEAR-B 机槽）送。
    { id: "foundry-belt", kind: "conveyor", x: 570, y: 795, width: 360, height: 16, periodTicks: 1, warningTicks: 0, activeTicks: 1, phaseOffset: 0, force: 95 },
    { id: "foundry-belt-high", kind: "conveyor", x: 720, y: 585, width: 300, height: 14, periodTicks: 1, warningTicks: 0, activeTicks: 1, phaseOffset: 0, force: 85 },
    // M29 双锻压（相位 90/270 = 180°，节拍沿用基线）：静置位不与任何货架站位体
    // 重叠（旧版活塞静置穿过 floor-4 台体的缺陷已消除）；活塞柱与 M33 齿轮机槽
    // 柱完全不相交。
    { id: "foundry-piston-a", kind: "forgePiston", x: 690, y: 285, width: 90, height: 150, periodTicks: 360, warningTicks: 60, activeTicks: 42, phaseOffset: 90, travelY: 320, force: 690, limbDamage: 84 },
    { id: "foundry-piston-b", kind: "forgePiston", x: 170, y: 270, width: 90, height: 170, periodTicks: 360, warningTicks: 60, activeTicks: 42, phaseOffset: 270, travelY: 300, force: 690, limbDamage: 84 },
  ],
  movers: [
    // 渡船在 row4(375)/row3(480) 之间的横向走廊穿行（400..1000 @440）——推挤图
    // 里的"逆流"路线；活塞 a 静置底 435 < 440 不相交。
    { id: "foundry-shuttle", x: 1000, y: 440, width: 150, height: 21, periodTicks: 460, phaseOffset: 200, travelX: -600 },
  ],
  // M31 刷怪锚点：地面双死角 + 货架东西背坡 + 王冠西端 + 瞭望台东端
  // （草案 §4 缺 mobSpawns 表，此为按同规范补齐的 6 点）。
  mobSpawns: [
    { x: 40, y: 791 }, { x: 1470, y: 791 },
    { x: 100, y: 476 }, { x: 1470, y: 476 },
    { x: 660, y: 266 }, { x: 830, y: 161 },
  ],
};
