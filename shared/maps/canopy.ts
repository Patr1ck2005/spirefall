// M15 布局个性化：Canopy 左塔右崖开放垂直。
// M29 大地图重排（1500×840，坐标源：docs/MAP_LAYOUT_1500.md §2）：左塔六层之字
// 窄塔 + 中东链 + 双货梯；solid 仅 2 面（中岛矮墙 + 东桅杆）——垂直图的视线天然
// 被层板切碎。地面缺口 420..630 / 950..1170 = 坠落出场区。
// 出生点为 L,R,L,R 交替序（与草案的左左右右不同：保证任意人数 FFA 都出生在
// 对角；分队半场切片由 M30 显式实现，不依赖下标奇偶）。
import type { MapDef } from "../types.js";

export const CANOPY: MapDef = {
  name: "Canopy",
  sector: "CROWN / ALTITUDE 91",
  color: 0x16242a,
  accent: 0x49c9b8,
  atmosphere: 0x99b7bb,
  platforms: [
    { x: 0, y: 795, width: 420, height: 45 },
    { x: 630, y: 795, width: 320, height: 45 },
    { x: 1170, y: 795, width: 330, height: 45 },
    // M29 掩体墙（中岛矮墙）：打断西↔东贴地对枪线（胸口线必被截断）；
    // 墙顶 715 可站，兼 G-mid 的掩体与垫脚。
    { x: 700, y: 715, width: 40, height: 80, solid: true },
    { x: 45, y: 690, width: 180, height: 21, oneWay: true },
    { x: 235, y: 590, width: 160, height: 21, oneWay: true },
    { x: 80, y: 485, width: 175, height: 21, oneWay: true },
    { x: 280, y: 380, width: 175, height: 21, oneWay: true },
    { x: 110, y: 275, width: 185, height: 21, oneWay: true },
    { x: 310, y: 170, width: 185, height: 21, oneWay: true },
    { x: 780, y: 690, width: 180, height: 21, oneWay: true },
    { x: 1040, y: 590, width: 170, height: 21, oneWay: true },
    { x: 1240, y: 485, width: 165, height: 21, oneWay: true },
    { x: 1010, y: 380, width: 170, height: 21, oneWay: true },
    { x: 790, y: 275, width: 170, height: 21, oneWay: true },
    { x: 565, y: 170, width: 170, height: 21, oneWay: true },
    { x: 440, y: 88, width: 460, height: 24, oneWay: true },
    // M29 东桅杆：东地面长视线的中点断柱；柱顶是东上升线第一级。
    { x: 1345, y: 695, width: 34, height: 100, solid: true },
  ],
  spawns: [
    { x: 200, y: 791 }, { x: 1300, y: 791 },
    { x: 380, y: 166 }, { x: 800, y: 686 },
    { x: 120, y: 686 }, { x: 1300, y: 481 },
    { x: 500, y: 84 }, { x: 840, y: 271 },
  ],
  crateSockets: [
    { id: "canopy-ground-west", x: 210, y: 773 }, { id: "canopy-ground-mid", x: 750, y: 773 }, { id: "canopy-ground-east", x: 1420, y: 773 },
    { id: "canopy-tower-low", x: 130, y: 668 }, { id: "canopy-tower-mid", x: 150, y: 463 }, { id: "canopy-tower-high", x: 200, y: 253 },
    { id: "canopy-tower-top", x: 380, y: 148 }, { id: "canopy-east-mid", x: 1300, y: 463 }, { id: "canopy-east-high", x: 1080, y: 358 },
    { id: "canopy-crown-west", x: 540, y: 66 }, { id: "canopy-crown-east", x: 800, y: 66 }, { id: "canopy-central-low", x: 800, y: 668 },
  ],
  // M29 barrels: 缺口沿/矮墙侧/塔道咽喉/制高点，全部贴台面且按 M25 三约束验算
  // （docs/MAP_LAYOUT_1500.md §2.6）。
  props: [
    { id: "canopy-barrel-gap-west", x: 390, y: 795 }, { id: "canopy-barrel-wall", x: 800, y: 795 },
    { id: "canopy-barrel-gap-east", x: 1200, y: 795 }, { id: "canopy-barrel-tower", x: 150, y: 275 },
    { id: "canopy-barrel-crown", x: 660, y: 88 }, { id: "canopy-barrel-shuttleledge", x: 1100, y: 590 },
  ],
  hazards: [
    // M29 双货梯（错拍 0/210，两梯永不同顶）：底位 780 直接从地面跳上（离地 15/15），
    // 顶位 590/530 分别接 M2 层 / M3 层下缘。
    { id: "canopy-lift-a", kind: "cargoLift", x: 850, y: 780, width: 170, height: 24, periodTicks: 420, warningTicks: 0, activeTicks: 420, phaseOffset: 0, travelY: -190 },
    { id: "canopy-lift-b", kind: "cargoLift", x: 1170, y: 780, width: 160, height: 24, periodTicks: 420, warningTicks: 0, activeTicks: 420, phaseOffset: 210, travelY: -250 },
  ],
  movers: [
    // 摆动板穿西缺口上空（280..760 @430）= 缺口的第三过法；净空夹在 T4(380)/T3(485) 之间。
    { id: "canopy-shuttle", x: 760, y: 430, width: 165, height: 21, periodTicks: 480, phaseOffset: 0, travelX: -480 },
  ],
  // M31 刷怪锚点：远离交战线的边角（西/东地面死角、双塔背坡、王冠顶角）。
  mobSpawns: [
    { x: 40, y: 791 }, { x: 1460, y: 791 },
    { x: 130, y: 271 }, { x: 1390, y: 481 },
    { x: 470, y: 84 },
  ],
};
